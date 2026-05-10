/**
 * Momentum — Deterministic Entry Quality Filter
 *
 * Uses Gemini's public candles API to validate two timeframes before a BUY:
 *   5-minute  MA — short-term momentum
 *   15-minute MA — medium-term momentum
 *
 * A BUY is only approved when the current price is above the MA on BOTH
 * timeframes. This prevents entering trades into downtrending assets.
 *
 * No AI. No tokens. No prompts. Pure math.
 */

const CANDLE_BASE = 'https://api.gemini.com/v2/candles';
const CLOSE_IDX   = 4; // [timestamp, open, high, low, CLOSE, volume]
const MA_PERIODS  = 10; // 10-period simple MA for both timeframes

/**
 * Check whether an asset has confirmed momentum on 5m and 15m timeframes.
 * Non-fatal — if the API is unavailable, returns approved:true so trading
 * is never blocked by a network blip.
 *
 * @param {string} symbol - e.g. 'LINK', 'BTC'
 * @returns {{ approved, score, shortTrend, medTrend, shortPct, medPct, reason }}
 */
export async function checkEntryMomentum(symbol) {
  const pair = `${symbol.toLowerCase()}usd`;

  try {
    const [res5m, res15m] = await Promise.all([
      fetch(`${CANDLE_BASE}/${pair}/5m`),
      fetch(`${CANDLE_BASE}/${pair}/15m`),
    ]);

    if (!res5m.ok || !res15m.ok) {
      return {
        approved: true, score: null,
        reason: 'Momentum API unavailable — entry check skipped (non-fatal)',
      };
    }

    // Gemini returns newest-first arrays: [timestamp, open, high, low, close, volume]
    const candles5m  = await res5m.json();
    const candles15m = await res15m.json();

    const closes5m  = candles5m.slice(0, MA_PERIODS).map(c => c[CLOSE_IDX]).filter(v => v > 0);
    const closes15m = candles15m.slice(0, MA_PERIODS).map(c => c[CLOSE_IDX]).filter(v => v > 0);

    if (closes5m.length < 5 || closes15m.length < 5) {
      return {
        approved: true, score: null,
        reason: 'Insufficient candle data — entry check skipped (non-fatal)',
      };
    }

    const ma5m  = closes5m.reduce((a, b) => a + b, 0) / closes5m.length;
    const ma15m = closes15m.reduce((a, b) => a + b, 0) / closes15m.length;

    // Most recent close is index 0 (newest first)
    const current5m  = closes5m[0];
    const current15m = closes15m[0];

    const shortBullish = current5m  > ma5m;
    const medBullish   = current15m > ma15m;

    const shortPct = +((current5m  - ma5m)  / ma5m  * 100).toFixed(3);
    const medPct   = +((current15m - ma15m) / ma15m * 100).toFixed(3);

    const score = (shortBullish ? 1 : 0) + (medBullish ? 1 : 0); // 0, 1, or 2

    const shortLabel = shortBullish
      ? `5m ↑ +${shortPct}% above MA`
      : `5m ↓ ${shortPct}% below MA`;
    const medLabel = medBullish
      ? `15m ↑ +${medPct}% above MA`
      : `15m ↓ ${medPct}% below MA`;

    return {
      approved:    score >= 2,      // BOTH timeframes must be bullish
      score,
      shortTrend:  shortBullish ? 'UP' : 'DOWN',
      medTrend:    medBullish   ? 'UP' : 'DOWN',
      shortPct,
      medPct,
      ma5m:        parseFloat(ma5m.toFixed(4)),
      ma15m:       parseFloat(ma15m.toFixed(4)),
      current:     parseFloat(current5m.toFixed(4)),
      reason: score >= 2
        ? `Momentum confirmed ✅ — ${shortLabel} | ${medLabel}`
        : `Momentum insufficient ⛔ — ${shortLabel} | ${medLabel} (need both ↑)`,
    };

  } catch (e) {
    // Never block a trade due to a network/parse error in this check
    return {
      approved: true, score: null,
      reason: `Momentum check error: ${e.message} — skipping (non-fatal)`,
    };
  }
}
