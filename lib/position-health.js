/**
 * lib/position-health.js — Scout's Inward Eye
 *
 * Checks every open position every 5 minutes.
 * Pure deterministic logic — no AI, no hallucinations.
 *
 * Returns an array of PositionHealthReport objects, one per open position:
 * {
 *   symbol, signal, holdHours, unrealizedPct,
 *   candleTrend, newsSentiment, dowBias,
 *   reason, exitUrgency, checkedAt
 * }
 *
 * signal:      'hold' | 'watch' | 'exit'
 * exitUrgency: 'none' | 'watch' | 'urgent'
 */

/** Compute how many hours a position has been held */
function holdHours(buyTime) {
  if (!buyTime) return 0;
  return (Date.now() - new Date(buyTime).getTime()) / (1000 * 60 * 60);
}

/** Determine candle trend from last N 5m candles */
function candleTrend(candles5m) {
  if (!candles5m || candles5m.length < 4) return 'unknown';
  // Look at last 4 closes vs opens
  const recent = candles5m.slice(-4);
  const greenCount = recent.filter(c => c.close >= c.open).length;
  if (greenCount >= 3) return 'recovering';
  if (greenCount <= 1) return 'declining';
  return 'stabilizing';
}

/** Scan news headlines for sentiment toward a symbol */
function newsSentiment(symbol, liveNews) {
  if (!liveNews || liveNews.length === 0) return 'neutral';
  const sym = symbol.toLowerCase();
  const relevant = liveNews.filter(n => {
    const text = ((n.title || '') + ' ' + (n.summary || '')).toLowerCase();
    return text.includes(sym) || text.includes('crypto') || text.includes('bitcoin');
  });
  if (relevant.length === 0) return 'neutral';

  const negWords = ['crash', 'drop', 'ban', 'sell', 'bear', 'plunge', 'fear', 'hack', 'collapse', 'warning', 'risk'];
  const posWords = ['surge', 'rally', 'buy', 'bull', 'adoption', 'partnership', 'gain', 'breakout', 'ath', 'pump'];

  let negScore = 0;
  let posScore = 0;
  for (const n of relevant) {
    const text = ((n.title || '') + ' ' + (n.summary || '')).toLowerCase();
    negScore += negWords.filter(w => text.includes(w)).length;
    posScore += posWords.filter(w => text.includes(w)).length;
  }

  if (posScore > negScore + 1) return 'positive';
  if (negScore > posScore + 1) return 'negative';
  return 'neutral';
}

/** Get today's DOW bias for a symbol (avg % change) */
function getDowBias(symbol, dowReport) {
  if (!dowReport?.assets?.[symbol]) return null;
  const today = new Date().getUTCDay();
  return dowReport.assets[symbol].byDow?.[today]?.avgChangePct ?? null;
}

/**
 * Main export — check all open positions.
 *
 * @param {object} openPositions  — settings.openPositions
 * @param {Array}  moversWithCandles — from Scout's already-fetched candle data
 * @param {Array}  liveNews        — from news.js
 * @param {object} dowReport       — settings.dowReport
 * @returns {Array<PositionHealthReport>}
 */
export function checkPositionHealth(openPositions, moversWithCandles, liveNews, dowReport) {
  if (!openPositions || Object.keys(openPositions).length === 0) return [];

  const reports = [];
  const candleMap = {};
  for (const m of (moversWithCandles || [])) {
    candleMap[m.displaySymbol?.toUpperCase()] = m.candles || [];
  }

  for (const [sym, pos] of Object.entries(openPositions)) {
    const symbol    = sym.toUpperCase();
    const buyPrice  = parseFloat(pos.buyPrice || 0);
    const currPrice = parseFloat(pos.currentPrice || pos.buyPrice || 0);
    const heldHours = holdHours(pos.buyTime || pos.boughtAt);
    const unrealPct = buyPrice > 0 ? ((currPrice - buyPrice) / buyPrice) * 100 : 0;
    const trend     = candleTrend(candleMap[symbol]);
    const sentiment = newsSentiment(symbol, liveNews);
    const dowBias   = getDowBias(symbol, dowReport);

    // ── Signal logic ─────────────────────────────────────────────────────────
    let signal      = 'hold';
    let exitUrgency = 'none';
    const reasons   = [];

    // Hard exit triggers
    if (unrealPct <= -4.0) {
      signal = 'exit'; exitUrgency = 'urgent';
      reasons.push(`Down ${unrealPct.toFixed(2)}% — approaching stop-loss, exit proactively.`);
    } else if (trend === 'declining' && sentiment === 'negative') {
      signal = 'exit'; exitUrgency = 'urgent';
      reasons.push('Candles declining + negative news — momentum against position.');
    } else if (trend === 'declining' && heldHours > 12) {
      signal = 'exit'; exitUrgency = 'urgent';
      reasons.push(`Held ${heldHours.toFixed(1)}h with declining candles — stale position.`);
    }

    // Watch triggers (soft warnings)
    else if (trend === 'declining' && sentiment === 'neutral') {
      signal = 'watch'; exitUrgency = 'watch';
      reasons.push('Candles declining but news neutral — monitor closely.');
    } else if (unrealPct <= -2.5 && trend !== 'recovering') {
      signal = 'watch'; exitUrgency = 'watch';
      reasons.push(`Down ${unrealPct.toFixed(2)}% with no recovery signal yet.`);
    } else if (heldHours > 8 && unrealPct < 0) {
      signal = 'watch'; exitUrgency = 'watch';
      reasons.push(`Held ${heldHours.toFixed(1)}h still negative — consider exit on next bounce.`);
    }

    // Hold confirmations
    else {
      reasons.push(`Trend: ${trend}. News: ${sentiment}.`);
      if (dowBias !== null && dowBias > 0) {
        reasons.push(`DOW bias positive today (+${dowBias}% avg).`);
      }
      if (unrealPct > 0) {
        reasons.push(`Position up ${unrealPct.toFixed(2)}% — let it run.`);
      }
      if (heldHours < 2) {
        reasons.push('Early in hold — give it time to develop.');
      }
    }

    reports.push({
      symbol,
      signal,
      exitUrgency,
      holdHours:    Math.round(heldHours * 10) / 10,
      unrealizedPct: Math.round(unrealPct * 100) / 100,
      candleTrend:  trend,
      newsSentiment: sentiment,
      dowBias,
      reason: reasons.join(' '),
      checkedAt: new Date().toISOString(),
    });
  }

  return reports;
}

/**
 * Condensed string for injection into Tank/CIPHER prompts.
 */
export function positionHealthSummary(reports) {
  if (!reports || reports.length === 0) return 'No open positions.';
  return reports.map(r =>
    `${r.symbol}: ${r.signal.toUpperCase()} [urgency:${r.exitUrgency}] | held ${r.holdHours}h | ${r.unrealizedPct > 0 ? '+' : ''}${r.unrealizedPct}% unrealized | ${r.reason}`
  ).join('\n');
}
