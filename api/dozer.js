/**
 * DOZER — Chief Accounting Officer / Back-Office Operator
 * BASTION Multi-Agent Trading System
 *
 * Named after Dozer from The Matrix — Tank's brother. Born free. Never jacked in.
 * He kept the Nebuchadnezzar running while Tank ran comms.
 * Dozer keeps the books. He does not trade. He does not strategize.
 * He makes sure everyone else has accurate numbers to work from.
 *
 * NO AI. Pure deterministic math. Dozer calls no LLM.
 *
 * Dozer owns:
 *   1. Capital balance reconciliation (deployed + liquid + realized + unrealized)
 *   2. Clean trade pair ledger (FIFO buy→sell matching per coin)
 *   3. Running performance score (win rate, avg net, streak, fee drag)
 *   4. Concentration risk assessment (% of deployed capital per asset)
 *   5. External anomaly registry (sells with no matching buy)
 *
 * Cadence: Every 15 minutes via cron.js
 * Writes to: settings.dozerReport (DynamoDB)
 * Read by: Tank (12h briefing), TankView (dashboard display)
 */

import { getSettings, updateSettings, logAction } from '../lib/db.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE = process.env.DYNAMODB_TABLE_NAME || 'CryptoAgentLogs';

// ─── Log scanner ────────────────────────────────────────────────────────────
async function scanAllTradeLogs(activeEraEpoch = '0') {
  let allLogs = [];
  let lastKey;
  // sk is stored as a String in DynamoDB (written as timestamp.toString()).
  // Must pass a String here — DynamoDB will reject a Number against a String key.
  const epochStr = String(activeEraEpoch || '0');
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk AND sk >= :epoch',
      ExpressionAttributeValues: { ':pk': 'AGENT_LOG', ':epoch': epochStr },
      ExclusiveStartKey: lastKey,
    }));
    allLogs = allLogs.concat(res.Items || []);
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  return allLogs.sort((a, b) => parseInt(a.sk) - parseInt(b.sk)); // oldest first
}


// ─── Parse individual trade events ───────────────────────────────────────────
function parseTrades(logs) {
  const trades = [];
  for (const log of logs) {
    const text = log.action || '';
    if (!text.includes('✅ Trade Executed:')) continue;

    const isBuy  = text.includes('BUY ');
    const isSell = text.includes('SELL ');
    if (!isBuy && !isSell) continue;

    const amountMatch = text.match(/(?:BUY|SELL)\s+([\d.]+)\s+([A-Z]+)\s+for/);
    const usdMatch    = text.match(/for ~\$([\d.]+)/);
    const feeMatch    = text.match(/Fee:\s+\$([\d.]+)/);
    const fillMatch   = text.match(/Fill:\s+\$([\d.]+)/);

    const amount    = amountMatch ? parseFloat(amountMatch[1]) : 0;
    const symbol    = amountMatch ? amountMatch[2] : 'UNKNOWN';
    const usdValue  = usdMatch    ? parseFloat(usdMatch[1])    : 0;
    const fee       = feeMatch    ? parseFloat(feeMatch[1])    : usdValue * 0.004;
    const fillPrice = fillMatch   ? parseFloat(fillMatch[1])   : (amount > 0 ? usdValue / amount : 0);

    trades.push({
      ts:        parseInt(log.sk),
      side:      isBuy ? 'buy' : 'sell',
      symbol,
      amount,
      usdValue,
      fee,
      fillPrice,
    });
  }
  return trades;
}

// ─── FIFO trade pair matching ─────────────────────────────────────────────────
// Returns: { pairs, openBuys, externalSells }
function buildTradePairs(trades) {
  const buyQueues    = {}; // symbol → [{amount, usdValue, fee, fillPrice, ts}]
  const pairs        = []; // fully matched buy→sell pairs
  const externalSells = []; // sells with no matching buy
  const openBuys     = {}; // unmatched buys (open positions)

  for (const trade of trades) {
    const sym = trade.symbol;

    if (trade.side === 'buy') {
      if (!buyQueues[sym]) buyQueues[sym] = [];
      buyQueues[sym].push({ ...trade });

    } else {
      // sell — match against FIFO buys
      if (!buyQueues[sym] || buyQueues[sym].length === 0) {
        externalSells.push({
          symbol: sym,
          usdValue: trade.usdValue,
          fee: trade.fee,
          ts: trade.ts,
          note: 'Sell with no recorded buy — externally acquired asset.',
        });
        continue;
      }

      let sellRemaining = trade.amount;
      let sellProceeds  = trade.usdValue;
      let sellFee       = trade.fee;
      let matchedCost   = 0;
      let matchedFees   = 0;

      while (sellRemaining > 0 && buyQueues[sym].length > 0) {
        const buy = buyQueues[sym][0];
        const matchedAmount = Math.min(sellRemaining, buy.amount);
        const costFraction  = (matchedAmount / buy.amount) * buy.usdValue;
        const feeFraction   = (matchedAmount / buy.amount) * buy.fee;

        matchedCost  += costFraction;
        matchedFees  += feeFraction;
        sellRemaining -= matchedAmount;
        buy.amount   -= matchedAmount;
        buy.usdValue -= costFraction;
        buy.fee      -= feeFraction;

        if (buy.amount < 0.0001) buyQueues[sym].shift(); // buy fully consumed
      }

      const grossPL = sellProceeds - matchedCost;
      const netPL   = grossPL - sellFee - matchedFees;

      pairs.push({
        symbol:      sym,
        buyTs:       trades.find(t => t.side === 'buy' && t.symbol === sym)?.ts || 0,
        sellTs:      trade.ts,
        costBasis:   parseFloat(matchedCost.toFixed(4)),
        proceeds:    parseFloat(sellProceeds.toFixed(4)),
        fees:        parseFloat((sellFee + matchedFees).toFixed(4)),
        grossPL:     parseFloat(grossPL.toFixed(4)),
        netPL:       parseFloat(netPL.toFixed(4)),
        won:         netPL > 0,
      });
    }
  }

  // Remaining unmatched buys = open positions
  for (const [sym, queue] of Object.entries(buyQueues)) {
    if (queue.length > 0) {
      const totalCost   = queue.reduce((s, b) => s + b.usdValue, 0);
      const totalAmount = queue.reduce((s, b) => s + b.amount, 0);
      openBuys[sym] = {
        symbol:      sym,
        amount:      parseFloat(totalAmount.toFixed(6)),
        costBasis:   parseFloat(totalCost.toFixed(4)),
        avgBuyPrice: totalAmount > 0 ? parseFloat((totalCost / totalAmount).toFixed(4)) : 0,
      };
    }
  }

  return { pairs, openBuys, externalSells };
}

// ─── Performance score ────────────────────────────────────────────────────────
function buildPerformanceScore(pairs) {
  if (pairs.length === 0) {
    return {
      totalClosedTrades: 0, winCount: 0, lossCount: 0,
      winRate: '0%', avgNetPerTrade: 0, grossRealizedPL: 0,
      netRealizedPL: 0, totalFeesPaid: 0, feeDrag: '0%',
      bestTrade: null, worstTrade: null,
      currentStreak: { type: 'none', count: 0 },
    };
  }

  const wins   = pairs.filter(p => p.won);
  const losses = pairs.filter(p => !p.won);
  const totalFees     = pairs.reduce((s, p) => s + p.fees, 0);
  const grossRealized = pairs.reduce((s, p) => s + p.grossPL, 0);
  const netRealized   = pairs.reduce((s, p) => s + p.netPL, 0);
  const avgNet        = netRealized / pairs.length;

  // Best and worst closed trades
  const sorted = [...pairs].sort((a, b) => b.netPL - a.netPL);
  const best  = sorted[0];
  const worst = sorted[sorted.length - 1];

  // Current streak (most recent trades first)
  const recent = [...pairs].sort((a, b) => b.sellTs - a.sellTs);
  let streakType  = recent[0]?.won ? 'win' : 'loss';
  let streakCount = 0;
  for (const p of recent) {
    if ((p.won && streakType === 'win') || (!p.won && streakType === 'loss')) streakCount++;
    else break;
  }

  const feeDrag = grossRealized !== 0
    ? ((totalFees / Math.abs(grossRealized)) * 100).toFixed(1) + '%'
    : '—';

  return {
    totalClosedTrades: pairs.length,
    winCount:          wins.length,
    lossCount:         losses.length,
    winRate:           ((wins.length / pairs.length) * 100).toFixed(1) + '%',
    avgNetPerTrade:    parseFloat(avgNet.toFixed(4)),
    grossRealizedPL:   parseFloat(grossRealized.toFixed(4)),
    netRealizedPL:     parseFloat(netRealized.toFixed(4)),
    totalFeesPaid:     parseFloat(totalFees.toFixed(4)),
    feeDrag,
    bestTrade:  best  ? { symbol: best.symbol,  netPL: best.netPL  } : null,
    worstTrade: worst ? { symbol: worst.symbol, netPL: worst.netPL } : null,
    currentStreak: { type: streakType, count: streakCount },
  };
}

// ─── Concentration risk ───────────────────────────────────────────────────────
function buildConcentrationRisk(openPositions) {
  const positions = Object.entries(openPositions || {});
  if (positions.length === 0) return {};

  const totalDeployed = positions.reduce((s, [, p]) => s + (p.costBasisUsd || 0), 0);
  const risk = {};

  for (const [sym, pos] of positions) {
    const pct = totalDeployed > 0 ? (pos.costBasisUsd / totalDeployed) * 100 : 0;
    risk[sym] = {
      costBasis: parseFloat((pos.costBasisUsd || 0).toFixed(2)),
      pct:       parseFloat(pct.toFixed(1)),
      status:    pct > 70 ? 'HIGH' : pct > 50 ? 'ELEVATED' : 'OK',
    };
  }
  return risk;
}

// ─── Main Dozer run ───────────────────────────────────────────────────────────
export async function runDozer() {
  const settings = await getSettings();
  const activeEraEpoch = settings.activeEraEpoch || '0';

  // 1. Scan all trade logs
  const allLogs = await scanAllTradeLogs(activeEraEpoch);

  // 2. Parse trade events
  const trades = parseTrades(allLogs);

  // 3. Build FIFO trade pairs
  const { pairs, openBuys, externalSells } = buildTradePairs(trades);

  // 4. Performance score
  const performance = buildPerformanceScore(pairs);

  // 5. Live balances for liquid USD and open position values
  let liquidUSD = 0;
  let openPositionsLive = settings.openPositions || {};
  try {
    const { getPortfolioBalances } = await import('./trade.js');
    const balances = await getPortfolioBalances();
    liquidUSD = parseFloat((balances['USD']?.notional || balances['GUSD']?.notional || 0).toFixed(2));
  } catch (e) {
    // non-fatal — use 0 if exchange unreachable
  }

  // 6. Capital balance
  const totalDeployed    = Object.values(openPositionsLive).reduce((s, p) => s + (p.costBasisUsd || 0), 0);
  const totalUnrealized  = Object.values(openPositionsLive).reduce((s, p) => s + (p.unrealizedPlUsd || 0), 0);
  const totalFees        = trades.reduce((s, t) => s + t.fee, 0);
  const externalValue    = externalSells.reduce((s, e) => s + e.usdValue, 0);

  const capitalBalance = {
    liquidUSD:        liquidUSD,
    totalDeployed:    parseFloat(totalDeployed.toFixed(2)),
    grossRealizedPL:  parseFloat(performance.grossRealizedPL.toFixed(2)),
    netRealizedPL:    parseFloat(performance.netRealizedPL.toFixed(2)),
    totalFeesPaid:    parseFloat(totalFees.toFixed(4)),
    unrealizedPL:     parseFloat(totalUnrealized.toFixed(2)),
    netPosition:      parseFloat((performance.netRealizedPL + totalUnrealized).toFixed(2)),
    externalSellTotal: parseFloat(externalValue.toFixed(2)),
    reconciliationNote: externalSells.length > 0
      ? `${externalSells.length} externally-acquired asset(s) detected (${externalSells.map(e => e.symbol).join(', ')}). Excluded from P&L.`
      : 'All trades reconcile cleanly.',
  };

  // 7. Concentration risk
  const concentrationRisk = buildConcentrationRisk(openPositionsLive);

  // 8. Liquidity + capital risk flags
  const liquidityStatus = liquidUSD < 5  ? 'CRITICAL'
                        : liquidUSD < 15 ? 'LOW'
                        : 'ADEQUATE';

  const highConcentration = Object.values(concentrationRisk).some(r => r.status === 'HIGH');
  const capitalRisk = liquidityStatus === 'CRITICAL' ? 'HIGH'
                    : highConcentration               ? 'MEDIUM'
                    : 'LOW';

  // 9. Build report
  const report = {
    timestamp:       new Date().toISOString(),
    tradesAnalyzed:  allLogs.length,
    closedPairs:     pairs,
    capitalBalance,
    performance,
    concentrationRisk,
    externalAnomalies: externalSells,
    liquidityStatus,
    capitalRisk,
  };

  // 10. Write to DynamoDB
  await updateSettings({ dozerReport: report });

  // 11. Log summary to activity feed
  const streakLabel = performance.currentStreak.count > 0
    ? `${performance.currentStreak.count}-${performance.currentStreak.type} streak`
    : 'no streak';

  await logAction(
    `📊 [DOZER] Books reconciled — Deployed: $${capitalBalance.totalDeployed.toFixed(2)} | Liquid: $${liquidUSD.toFixed(2)} | Net P&L: $${capitalBalance.netPosition.toFixed(2)} | Win rate: ${performance.winCount}/${performance.totalClosedTrades} (${performance.winRate}) | ${streakLabel} | Liquidity: ${liquidityStatus}`,
    false
  );

  if (externalSells.length > 0) {
    await logAction(`📊 [DOZER] External anomaly detected: ${externalSells.map(e => `${e.symbol} sell $${e.usdValue}`).join(', ')} — excluded from P&L.`);
  }

  if (liquidityStatus !== 'ADEQUATE') {
    await logAction(`⚠️ [DOZER] Liquidity alert: $${liquidUSD.toFixed(2)} USD available — status: ${liquidityStatus}`, true);
  }

  if (highConcentration) {
    const highAssets = Object.entries(concentrationRisk)
      .filter(([, r]) => r.status === 'HIGH')
      .map(([sym, r]) => `${sym} ${r.pct}%`)
      .join(', ');
    await logAction(`⚠️ [DOZER] Concentration risk: ${highAssets} of deployed capital in one asset.`);
  }

  return report;
}

// ─── HTTP handler for direct invocation ────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const report = await runDozer();
    return res.status(200).json({ ok: true, report });
  } catch (e) {
    console.error('[Dozer Error]:', e);
    await logAction(`❌ [DOZER] Error: ${e.message}`);
    return res.status(500).json({ error: e.message });
  }
}
