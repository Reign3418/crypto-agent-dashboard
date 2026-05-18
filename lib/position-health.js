/**
 * lib/position-health.js — Scout's Inward Eye
 *
 * Style-aware position health check. Runs every 5 minutes.
 * Pure deterministic logic — no AI, no hallucinations.
 *
 * Supported tradingStyles and their patience levels:
 *   scalp      → tightest stops, exit as soon as profit clears fees
 *   day_trade  → force exit after 20h regardless of health (UTC day rule)
 *   swing      → patient hours to 2 days
 *   position   → very patient, only exit on severe breakdown
 *   hodl       → exit disabled (only hard stop-loss can close, widened to 15%)
 *   dca        → exit disabled (accumulation mode — health only tracks avg cost)
 */

function holdHours(buyTime) {
  if (!buyTime) return 0;
  return (Date.now() - new Date(buyTime).getTime()) / (1000 * 60 * 60);
}

function candleTrend(candles5m) {
  if (!candles5m || candles5m.length < 4) return 'unknown';
  const recent = candles5m.slice(-4);
  const greenCount = recent.filter(c => parseFloat(c.close) >= parseFloat(c.open)).length;
  if (greenCount >= 3) return 'recovering';
  if (greenCount <= 1) return 'declining';
  return 'stabilizing';
}

function newsSentiment(symbol, liveNews) {
  if (!liveNews || liveNews.length === 0) return 'neutral';
  const sym = symbol.toLowerCase();
  const relevant = liveNews.filter(n => {
    const text = ((n.title || '') + ' ' + (n.summary || '')).toLowerCase();
    return text.includes(sym) || text.includes('crypto') || text.includes('bitcoin');
  });
  if (relevant.length === 0) return 'neutral';
  const negWords = ['crash','drop','ban','sell','bear','plunge','fear','hack','collapse','warning','risk','lawsuit','sec','fraud'];
  const posWords = ['surge','rally','buy','bull','adoption','partnership','gain','breakout','ath','pump','etf','approved','upgrade'];
  let neg = 0, pos = 0;
  for (const n of relevant) {
    const text = ((n.title || '') + ' ' + (n.summary || '')).toLowerCase();
    neg += negWords.filter(w => text.includes(w)).length;
    pos += posWords.filter(w => text.includes(w)).length;
  }
  if (pos > neg + 1) return 'positive';
  if (neg > pos + 1) return 'negative';
  return 'neutral';
}

function getDowBias(symbol, dowReport) {
  if (!dowReport?.assets?.[symbol]) return null;
  const today = new Date().getUTCDay();
  return dowReport.assets[symbol].byDow?.[today]?.avgChangePct ?? null;
}

/** Style-specific configuration */
const STYLE_CONFIG = {
  scalp: {
    hardExitPct:   -1.5,   // exit fast if down > 1.5%
    watchPct:      -0.8,
    maxHoldHours:   2,     // if held > 2h, force watch
    description:   'Scalp: tightest stops, exit as soon as profit clears fees.',
  },
  day_trade: {
    hardExitPct:   -3.0,
    watchPct:      -1.5,
    maxHoldHours:  20,     // UTC midnight rule — force exit after 20h
    description:   'Day Trade: all positions must close within the UTC day.',
  },
  swing: {
    hardExitPct:   -4.0,
    watchPct:      -2.5,
    maxHoldHours:  48,
    description:   'Swing: patient hours to 2 days. Hold through normal dips.',
  },
  position: {
    hardExitPct:   -8.0,
    watchPct:      -5.0,
    maxHoldHours:  336,    // 14 days before we even watch
    description:   'Position: macro focus, ignores short-term noise.',
  },
  hodl: {
    hardExitPct:   -99,    // only stop-loss can close (widened to 15% in Tank)
    watchPct:      -99,
    maxHoldHours:  999999,
    description:   'HODL: exit disabled. Only hard stop-loss (15%) can close this position.',
    exitDisabled:  true,
  },
  dca: {
    hardExitPct:   -99,
    watchPct:      -99,
    maxHoldHours:  999999,
    description:   'DCA: accumulation mode. Health tracks avg cost only — never signals exit.',
    exitDisabled:  true,
  },
};

/**
 * Check all open positions for health signals.
 *
 * @param {object} openPositions
 * @param {Array}  moversWithCandles  — from Scout's candle fetch
 * @param {Array}  liveNews
 * @param {object} dowReport
 * @param {string} tradingStyle       — Tank's declared style
 * @returns {Array<PositionHealthReport>}
 */
export function checkPositionHealth(
  openPositions,
  moversWithCandles,
  liveNews,
  dowReport,
  tradingStyle = 'swing'
) {
  if (!openPositions || Object.keys(openPositions).length === 0) return [];

  const style = STYLE_CONFIG[tradingStyle] || STYLE_CONFIG.swing;
  const candleMap = {};
  for (const m of (moversWithCandles || [])) {
    candleMap[(m.displaySymbol || '').toUpperCase()] = m.candles || [];
  }

  const reports = [];

  for (const [sym, pos] of Object.entries(openPositions)) {
    const symbol     = sym.toUpperCase();
    const buyPrice   = parseFloat(pos.buyPrice || 0);
    const currPrice  = parseFloat(pos.currentPrice || pos.buyPrice || 0);
    const heldHours  = holdHours(pos.buyTime || pos.boughtAt);
    const unrealPct  = buyPrice > 0 ? ((currPrice - buyPrice) / buyPrice) * 100 : 0;
    const trend      = candleTrend(candleMap[symbol]);
    const sentiment  = newsSentiment(symbol, liveNews);
    const dowBias    = getDowBias(symbol, dowReport);

    // ── Style-gated: HODL and DCA never exit from health check ─────────────
    if (style.exitDisabled) {
      reports.push({
        symbol, signal: 'hold', exitUrgency: 'none',
        holdHours: Math.round(heldHours * 10) / 10,
        unrealizedPct: Math.round(unrealPct * 100) / 100,
        candleTrend: trend, newsSentiment: sentiment, dowBias,
        reason: `${style.description} P&L: ${unrealPct >= 0 ? '+' : ''}${unrealPct.toFixed(2)}% | avg cost basis maintained.`,
        checkedAt: new Date().toISOString(), tradingStyle,
      });
      continue;
    }

    // ── Day trade: UTC midnight hard close rule ─────────────────────────────
    if (tradingStyle === 'day_trade' && heldHours >= style.maxHoldHours) {
      reports.push({
        symbol, signal: 'exit', exitUrgency: 'urgent',
        holdHours: Math.round(heldHours * 10) / 10,
        unrealizedPct: Math.round(unrealPct * 100) / 100,
        candleTrend: trend, newsSentiment: sentiment, dowBias,
        reason: `DAY TRADE RULE: held ${heldHours.toFixed(1)}h — must close before UTC midnight. Exit now regardless of P&L.`,
        checkedAt: new Date().toISOString(), tradingStyle,
      });
      continue;
    }

    // ── Standard signal logic ───────────────────────────────────────────────
    let signal      = 'hold';
    let exitUrgency = 'none';
    const reasons   = [];

    // Hard exits
    if (unrealPct <= style.hardExitPct) {
      signal = 'exit'; exitUrgency = 'urgent';
      reasons.push(`Down ${unrealPct.toFixed(2)}% — past style threshold (${style.hardExitPct}%). Exit proactively.`);
    } else if (trend === 'declining' && sentiment === 'negative') {
      signal = 'exit'; exitUrgency = 'urgent';
      reasons.push('Candles declining + negative news — momentum strongly against position.');
    } else if (tradingStyle === 'scalp' && heldHours > style.maxHoldHours && unrealPct < 0) {
      signal = 'exit'; exitUrgency = 'urgent';
      reasons.push(`Scalp held ${heldHours.toFixed(1)}h with no profit — this is no longer a scalp. Exit.`);
    }
    // Watch triggers
    else if (unrealPct <= style.watchPct) {
      signal = 'watch'; exitUrgency = 'watch';
      reasons.push(`Down ${unrealPct.toFixed(2)}% — approaching style threshold.`);
    } else if (trend === 'declining' && sentiment === 'neutral') {
      signal = 'watch'; exitUrgency = 'watch';
      reasons.push('Candles declining, news neutral — monitor closely.');
    } else if (tradingStyle !== 'position' && heldHours > style.maxHoldHours * 0.75 && unrealPct < 0) {
      signal = 'watch'; exitUrgency = 'watch';
      reasons.push(`Held ${heldHours.toFixed(1)}h (${Math.round(heldHours / style.maxHoldHours * 100)}% of max) still negative.`);
    }
    // Hold confirmations
    else {
      reasons.push(`${style.description.split(':')[0]} hold confirmed.`);
      reasons.push(`Trend: ${trend}. News: ${sentiment}.`);
      if (dowBias !== null && dowBias > 0) reasons.push(`DOW bias: +${dowBias}% avg today.`);
      if (unrealPct > 0)   reasons.push(`Up ${unrealPct.toFixed(2)}% — let it run.`);
      if (heldHours < style.maxHoldHours * 0.1) reasons.push(`Early in hold — give it time.`);
    }

    reports.push({
      symbol, signal, exitUrgency,
      holdHours: Math.round(heldHours * 10) / 10,
      unrealizedPct: Math.round(unrealPct * 100) / 100,
      candleTrend: trend, newsSentiment: sentiment, dowBias,
      reason: reasons.join(' '),
      checkedAt: new Date().toISOString(), tradingStyle,
      styleConfig: { hardExitPct: style.hardExitPct, maxHoldHours: style.maxHoldHours },
    });
  }

  return reports;
}

export function positionHealthSummary(reports) {
  if (!reports || reports.length === 0) return 'No open positions.';
  return reports.map(r =>
    `${r.symbol} [${(r.tradingStyle || 'swing').toUpperCase()}]: ${r.signal.toUpperCase()} urgency:${r.exitUrgency} | held ${r.holdHours}h | ${r.unrealizedPct >= 0 ? '+' : ''}${r.unrealizedPct}% | ${r.reason}`
  ).join('\n');
}

/** Export style config for other modules (Tank prompt, Architecture tab) */
export const TRADING_STYLES = {
  scalp:      { label: 'Scalp',         color: '#f97316', holdRange: 'Sec–60min',  target: '0.8–2%',   description: 'Capture tiny moves, exit fast. Requires high volume and bull regime.' },
  day_trade:  { label: 'Day Trade',     color: '#f59e0b', holdRange: '1h–20h',     target: '2–6%',     description: 'All positions close within the UTC day. No overnight exposure.' },
  swing:      { label: 'Swing',         color: '#3b82f6', holdRange: 'Hours–2d',   target: '3–10%',    description: 'Catch multi-hour swings. Default for small capital and bear/ranging regimes.' },
  position:   { label: 'Position',      color: '#8b5cf6', holdRange: 'Days–weeks', target: '10–30%+',  description: 'Macro trend focus. Ignores daily noise. For strong conviction assets.' },
  hodl:       { label: 'HODL',          color: '#22c55e', holdRange: 'Indefinite', target: '100%+',    description: 'Hold On for Dear Life. Only hard stop-loss (15%) can close. Long-term thesis.' },
  dca:        { label: 'DCA',           color: '#06b6d4', holdRange: 'Accumulate', target: 'Avg cost', description: 'Buy fixed $ at fixed intervals regardless of price. No technical analysis needed.' },
  // Not supported — documented honestly
  hft:        { label: 'HFT',           color: '#475569', supported: false, reason: 'Requires sub-second execution. Our 5-minute cadence cannot compete with HFT infrastructure. Note: CIPHER itself is an algorithmic system — we ARE the algo at swing/day scale.' },
  arbitrage:  { label: 'Arbitrage',     color: '#475569', supported: false, reason: 'Requires simultaneous multi-exchange connections. We are single-exchange (Gemini). Price gaps close in milliseconds — our latency is too high.' },
};
