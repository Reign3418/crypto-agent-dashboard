/**
 * Fee Analysis — Full transaction fee ledger across all DynamoDB history.
 *
 * Scans EVERY log entry (no era filter — complete all-time history).
 * Extracts each trade's fee, side, symbol, size, fill price, and timestamp.
 * Returns a structured JSON report you can download and analyze.
 *
 * GET /api/fee-analysis          → full JSON report
 * GET /api/fee-analysis?download=1 → same JSON as a .json file download
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const ddb   = DynamoDBDocumentClient.from(client);
const TABLE = process.env.DYNAMODB_TABLE_NAME || 'CryptoAgentLogs';

// ── Scan ALL agent logs — no era limit, full history ────────────────────────
async function scanAllLogs() {
  let allLogs = [];
  let lastKey;

  do {
    const res = await ddb.send(new QueryCommand({
      TableName:                 TABLE,
      KeyConditionExpression:    'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'AGENT_LOG' },
      ExclusiveStartKey:         lastKey,
    }));
    allLogs = allLogs.concat(res.Items || []);
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  return allLogs.sort((a, b) => parseInt(a.sk) - parseInt(b.sk)); // oldest first
}

// ── Parse one trade log line into a structured record ───────────────────────
function parseTradeLine(log) {
  const text = log.action || '';
  if (!text.includes('✅ Trade Executed:')) return null;

  const isBuy  = text.includes(' BUY ');
  const isSell = text.includes(' SELL ');
  if (!isBuy && !isSell) return null;

  // e.g. "BUY 0.12345678 LTC for ~$14.97"
  const amtMatch  = text.match(/(?:BUY|SELL)\s+([\d.]+)\s+([A-Z]+)\s+for/);
  const usdMatch  = text.match(/for ~\$([\d.]+)/);
  const feeMatch  = text.match(/Fee:\s+\$?([\d.]+)/);   // handles both "Fee: $0.06" and "Fee: 0.0400 USD"
  const fillMatch = text.match(/Fill:\s+\$([\d.]+)/);

  const coinAmount = amtMatch  ? parseFloat(amtMatch[1])  : null;
  const symbol     = amtMatch  ? amtMatch[2]               : 'UNKNOWN';
  const usdAmount  = usdMatch  ? parseFloat(usdMatch[1])  : 0;
  const fillPrice  = fillMatch ? parseFloat(fillMatch[1]) : (coinAmount > 0 ? usdAmount / coinAmount : 0);

  // Fee: use explicit log value, fall back to 0.4% estimate for old logs
  let fee = feeMatch ? parseFloat(feeMatch[1]) : 0;
  const feeEstimated = !feeMatch && usdAmount > 0;
  if (feeEstimated) fee = parseFloat((usdAmount * 0.004).toFixed(4));

  const ts = parseInt(log.sk);

  return {
    timestamp:      new Date(ts).toISOString(),
    epochMs:        ts,
    side:           isBuy ? 'buy' : 'sell',
    symbol,
    usdAmount:      parseFloat(usdAmount.toFixed(4)),
    coinAmount:     coinAmount !== null ? parseFloat(coinAmount.toFixed(8)) : null,
    fillPrice:      parseFloat(fillPrice.toFixed(4)),
    fee:            parseFloat(fee.toFixed(4)),
    feeEstimated,           // true = no explicit fee in log, used 0.4% estimate
    feePct:         usdAmount > 0 ? parseFloat(((fee / usdAmount) * 100).toFixed(4)) : 0,
    rawLog:         text,
  };
}

// ── Build per-symbol summary ─────────────────────────────────────────────────
function buildSymbolSummary(trades) {
  const bySymbol = {};

  for (const t of trades) {
    if (!bySymbol[t.symbol]) {
      bySymbol[t.symbol] = {
        symbol:      t.symbol,
        totalTrades: 0,
        buys:        0,
        sells:       0,
        buyVolumeUSD:  0,
        sellVolumeUSD: 0,
        totalFees:     0,
        avgFeePerTrade: 0,
        avgFeePct:     0,
        feePcts:       [],   // for median calc
      };
    }
    const s = bySymbol[t.symbol];
    s.totalTrades++;
    s.totalFees    += t.fee;
    s.feePcts.push(t.feePct);
    if (t.side === 'buy')  { s.buys++;  s.buyVolumeUSD  += t.usdAmount; }
    if (t.side === 'sell') { s.sells++; s.sellVolumeUSD += t.usdAmount; }
  }

  for (const s of Object.values(bySymbol)) {
    s.totalFees     = parseFloat(s.totalFees.toFixed(4));
    s.buyVolumeUSD  = parseFloat(s.buyVolumeUSD.toFixed(4));
    s.sellVolumeUSD = parseFloat(s.sellVolumeUSD.toFixed(4));
    s.avgFeePerTrade = parseFloat((s.totalFees / s.totalTrades).toFixed(4));
    s.avgFeePct = parseFloat((s.feePcts.reduce((a, b) => a + b, 0) / s.feePcts.length).toFixed(4));
    const sorted = [...s.feePcts].sort((a, b) => a - b);
    s.medianFeePct = parseFloat(sorted[Math.floor(sorted.length / 2)].toFixed(4));
    delete s.feePcts; // remove raw array from output
  }

  return Object.values(bySymbol).sort((a, b) => b.totalFees - a.totalFees);
}

// ── Build hourly fee buckets (spot where fees spike) ────────────────────────
function buildHourlyBuckets(trades) {
  const buckets = {};
  for (const t of trades) {
    const hour = t.timestamp.slice(0, 13) + ':00:00Z'; // e.g. "2026-05-17T14:00:00Z"
    if (!buckets[hour]) buckets[hour] = { hour, trades: 0, fees: 0, buys: 0, sells: 0 };
    buckets[hour].trades++;
    buckets[hour].fees   += t.fee;
    if (t.side === 'buy')  buckets[hour].buys++;
    if (t.side === 'sell') buckets[hour].sells++;
  }
  return Object.values(buckets)
    .map(b => ({ ...b, fees: parseFloat(b.fees.toFixed(4)) }))
    .sort((a, b) => a.hour.localeCompare(b.hour));
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'GET only' });

  try {
    const allLogs = await scanAllLogs();

    // Parse every trade log line
    const trades = allLogs
      .map(parseTradeLine)
      .filter(Boolean);

    if (trades.length === 0) {
      return res.status(200).json({ message: 'No trade logs found.', totalLogsScanned: allLogs.length });
    }

    // ── Aggregate stats ─────────────────────────────────────────────────────
    const totalFees      = trades.reduce((s, t) => s + t.fee, 0);
    const totalBuyFees   = trades.filter(t => t.side === 'buy') .reduce((s, t) => s + t.fee, 0);
    const totalSellFees  = trades.filter(t => t.side === 'sell').reduce((s, t) => s + t.fee, 0);
    const totalVolume    = trades.reduce((s, t) => s + t.usdAmount, 0);
    const avgFeePerTrade = totalFees / trades.length;
    const avgFeePct      = trades.reduce((s, t) => s + t.feePct, 0) / trades.length;
    const estimatedCount = trades.filter(t => t.feeEstimated).length;

    const report = {
      generatedAt:    new Date().toISOString(),
      meta: {
        totalLogsScanned:  allLogs.length,
        totalTradesFound:  trades.length,
        totalBuys:         trades.filter(t => t.side === 'buy').length,
        totalSells:        trades.filter(t => t.side === 'sell').length,
        feesWithExactData: trades.length - estimatedCount,
        feesEstimated:     estimatedCount,
        note: estimatedCount > 0
          ? `${estimatedCount} trade(s) had no explicit fee in logs — 0.4% Gemini taker rate was used as estimate.`
          : 'All fees pulled from explicit log entries.',
      },
      summary: {
        totalFeesUSD:    parseFloat(totalFees.toFixed(4)),
        totalFeesCents:  Math.round(totalFees * 100),
        totalBuyFeesUSD: parseFloat(totalBuyFees.toFixed(4)),
        totalSellFeesUSD: parseFloat(totalSellFees.toFixed(4)),
        totalVolumeUSD:  parseFloat(totalVolume.toFixed(2)),
        feesAsPctOfVolume: parseFloat(((totalFees / totalVolume) * 100).toFixed(4)),
        avgFeePerTradeUSD: parseFloat(avgFeePerTrade.toFixed(4)),
        avgFeePct:       parseFloat(avgFeePct.toFixed(4)),
        firstTrade:      trades[0]?.timestamp,
        lastTrade:       trades[trades.length - 1]?.timestamp,
      },
      bySymbol:  buildSymbolSummary(trades),
      byHour:    buildHourlyBuckets(trades),
      allTrades: trades, // every single transaction with its fee
    };

    // ── Download mode — serve as .json file ──────────────────────────────────
    if (req.query.download === '1') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="cipher-fee-ledger-${new Date().toISOString().slice(0,10)}.json"`);
      return res.status(200).send(JSON.stringify(report, null, 2));
    }

    return res.status(200).json(report);

  } catch (err) {
    console.error('[Fee Analysis Error]:', err);
    return res.status(500).json({ error: err.message });
  }
}
