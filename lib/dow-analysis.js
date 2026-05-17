/**
 * lib/dow-analysis.js — Day-of-Week Intelligence Engine
 * Owned by Scout (data collection). Read by Tank (posture decisions).
 *
 * Fetches 90 days of 1-day candles from Gemini public API (no auth required).
 * Groups by day of week (0=Sun … 6=Sat) and computes:
 *   - avgChangePct  : average (close-open)/open % per DOW
 *   - winRate       : % of days that closed green
 *   - avgVolume     : average daily volume
 *   - avgHighWick   : average (high-close)/open % → upside exploration
 *   - avgLowWick    : average (open-low)/open % → downside risk
 *   - bestDay       : best single-day % gain
 *   - worstDay      : worst single-day % loss
 *   - sampleCount   : # of occurrences in data window
 *
 * Returns: { symbol, generatedAt, byDow: { 0..6: { ...stats } }, postureSummary: string }
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const CORE_ASSETS = [
  'btcusd', 'ethusd', 'solusd', 'xrpusd',
  'linkusd', 'dogeusd', 'ltcusd', 'avaxusd', 'bchusd',
];

/** Fetch up to 90 days of 1-day candles from Gemini public API */
async function fetchDailyCandles(symbol) {
  try {
    // Gemini v2 candles — 1day resolution, returns up to 500 candles newest-first
    const res = await fetch(`https://api.gemini.com/v2/candles/${symbol}/1day`);
    if (!res.ok) return [];
    const raw = await res.json();
    // raw: [[ts_ms, open, high, low, close, volume], ...]  — newest first
    // Take last 90 trading days (crypto is 7d/week, so 90 candles ≈ 90 days)
    return raw.slice(0, 90).map(([ts, open, high, low, close, volume]) => ({
      ts,        // epoch ms
      open:   parseFloat(open),
      high:   parseFloat(high),
      low:    parseFloat(low),
      close:  parseFloat(close),
      volume: parseFloat(volume),
      dow:    new Date(ts).getUTCDay(), // 0=Sun … 6=Sat
    }));
  } catch {
    return [];
  }
}

/** Round to 2 decimal places */
function r2(n) { return Math.round(n * 100) / 100; }

/** Compute per-DOW stats from a candle array */
function computeDowStats(candles) {
  // Group candles by DOW
  const groups = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const c of candles) {
    if (c.open > 0) groups[c.dow].push(c);
  }

  const byDow = {};
  for (let d = 0; d <= 6; d++) {
    const g = groups[d];
    if (g.length === 0) {
      byDow[d] = { day: DAY_NAMES[d], sampleCount: 0, avgChangePct: 0, winRate: 0, avgVolume: 0, avgHighWick: 0, avgLowWick: 0, bestDay: 0, worstDay: 0 };
      continue;
    }

    const changePcts  = g.map(c => ((c.close - c.open) / c.open) * 100);
    const highWicks   = g.map(c => ((c.high  - c.close) / c.open) * 100); // upside wick above close
    const lowWicks    = g.map(c => ((c.open  - c.low)   / c.open) * 100); // downside wick below open
    const volumes     = g.map(c => c.volume);
    const greenDays   = changePcts.filter(p => p > 0).length;

    byDow[d] = {
      day:           DAY_NAMES[d],
      sampleCount:   g.length,
      avgChangePct:  r2(changePcts.reduce((s, v) => s + v, 0) / g.length),
      winRate:       r2((greenDays / g.length) * 100),
      avgVolume:     r2(volumes.reduce((s, v) => s + v, 0) / g.length),
      avgHighWick:   r2(highWicks.reduce((s, v) => s + v, 0) / g.length),
      avgLowWick:    r2(lowWicks.reduce((s, v) => s + v, 0) / g.length),
      bestDay:       r2(Math.max(...changePcts)),
      worstDay:      r2(Math.min(...changePcts)),
    };
  }
  return byDow;
}

/**
 * Generate posture summary string for Tank consumption.
 * Highlights highest-gain day, lowest-volume day, best entry window.
 */
function generatePostureSummary(byDow) {
  const days = Object.entries(byDow)
    .filter(([, s]) => s.sampleCount >= 5)
    .map(([d, s]) => ({ d: parseInt(d), ...s }));

  if (days.length === 0) return 'Insufficient data for DOW posture.';

  const bestDay    = days.sort((a, b) => b.avgChangePct - a.avgChangePct)[0];
  const worstDay   = days.sort((a, b) => a.avgChangePct - b.avgChangePct)[0];
  const lowestVol  = days.sort((a, b) => a.avgVolume - b.avgVolume)[0];
  const highestWin = days.sort((a, b) => b.winRate - a.winRate)[0];

  return [
    `Best avg gain: ${bestDay.day} (+${bestDay.avgChangePct}%, ${bestDay.winRate}% win rate).`,
    `Worst avg: ${worstDay.day} (${worstDay.avgChangePct}%, ${worstDay.winRate}% win rate).`,
    `Lowest volume: ${lowestVol.day} — widest spreads, avoid large entries.`,
    `Highest consistency: ${highestWin.day} (${highestWin.winRate}% green closes in 90d window).`,
  ].join(' ');
}

/**
 * Build the full DOW report for all 9 core assets.
 * Called from Scout. Cached for 24h in DynamoDB settings.
 *
 * @returns {object} { generatedAt, assets: { BTC: { byDow, postureSummary }, ... } }
 */
export async function buildDowReport() {
  const generatedAt = new Date().toISOString();
  const assets = {};

  // Fetch all in parallel — Gemini public API, no rate concerns
  await Promise.all(
    CORE_ASSETS.map(async (sym) => {
      const candles = await fetchDailyCandles(sym);
      if (candles.length < 7) return; // not enough data
      const byDow = computeDowStats(candles);
      const postureSummary = generatePostureSummary(byDow);
      const displaySymbol = sym.replace('usd', '').toUpperCase();
      assets[displaySymbol] = { byDow, postureSummary, sampleDays: candles.length };
    })
  );

  return { generatedAt, assets };
}

/**
 * Condensed Tank-readable summary across all assets for the given DOW.
 * e.g. getTodaysDowIntel(report) → "Today is Tuesday. Historically the strongest day:
 * XRP +2.3% avg (68% win), LINK +1.8% avg (65% win). Elevate conviction on breakout buys."
 */
export function getTodaysDowIntel(report) {
  if (!report?.assets) return null;
  const today = new Date().getUTCDay();
  const dayName = DAY_NAMES[today];

  const assetLines = [];
  for (const [sym, data] of Object.entries(report.assets)) {
    const s = data.byDow?.[today];
    if (!s || s.sampleCount < 5) continue;
    const trend = s.avgChangePct > 0.5 ? '📈' : s.avgChangePct < -0.5 ? '📉' : '➡️';
    assetLines.push(
      `${trend} ${sym}: avg ${s.avgChangePct > 0 ? '+' : ''}${s.avgChangePct}% | ${s.winRate}% green | vol avg ${s.avgVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    );
  }

  // Overall DOW posture
  const allStats = Object.values(report.assets)
    .map(d => d.byDow?.[today])
    .filter(Boolean);
  const avgOfAvgs = allStats.length
    ? r2(allStats.reduce((s, v) => s + v.avgChangePct, 0) / allStats.length)
    : 0;
  const posture = avgOfAvgs > 1.0
    ? 'ELEVATED CONVICTION — historically a strong up day. Full size eligible on confirmed breakouts.'
    : avgOfAvgs < -0.5
    ? 'CAUTION — historically weak. Reduce size. Tighten stops. Prefer cash.'
    : avgOfAvgs < 0.3 && today === 0  // Sunday
    ? 'LOW VOLUME DAY — spreads widen, liquidity thins. Cap position size at 50%.'
    : 'NEUTRAL — no strong seasonal bias today. Standard sizing applies.';

  return {
    today,
    dayName,
    posture,
    avgMarketChangePct: avgOfAvgs,
    assetLines,
    summary: `Today is ${dayName}. Market DOW bias: ${posture} (90d avg across all assets: ${avgOfAvgs > 0 ? '+' : ''}${avgOfAvgs}%)\n${assetLines.join('\n')}`,
  };
}
