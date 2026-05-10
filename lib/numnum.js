/**
 * NumNum — The Fee Viability Calculator
 *
 * Pure math. No AI. No tokens. No hallucinations.
 * NumNum answers one question before every trade:
 * "Will this make us money after Gemini takes its cut?"
 *
 * Thresholds are set by TANK every 12 hours based on Dozer's verified
 * performance data. NumNum executes the math — Tank calibrates the gate.
 */

const GEMINI_FEE_RATE      = 0.004;  // 0.4% per side (ActiveTrader taker rate)
const ROUND_TRIP_FEE_RATE  = GEMINI_FEE_RATE * 2;  // 0.8% total for buy + sell
const DEFAULT_PROFIT_TARGET = 0.015; // 1.5% — Tank overrides this each cycle
const DEFAULT_STOP_LOSS_PCT = 5.0;   // 5.0% — Tank overrides based on capital risk
const MIN_TRADE_SIZE_USD    = 15.00; // Minimum trade size for fee efficiency

/**
 * Run NumNum's viability check before executing a trade.
 *
 * @param {string} side           - 'buy' or 'sell'
 * @param {number} usdAmount      - The proposed USD trade size
 * @param {number} currentPrice   - The live market price of the asset
 * @param {number|null} buyPrice  - The recorded fill price from openPositions
 * @param {number|null} numNumFloor    - Tank-calibrated min profit % (e.g. 2.0 = 2%)
 * @param {number|null} numNumStopLoss - Tank-calibrated stop-loss % (e.g. 7.0 = 7%)
 */
export function runNumNum({ side, usdAmount, currentPrice, buyPrice, numNumFloor, numNumStopLoss }) {
  // Use Tank-calibrated thresholds if available, fall back to defaults
  const minProfitPct = numNumFloor != null ? parseFloat(numNumFloor) : DEFAULT_PROFIT_TARGET * 100;
  const stopLossPct  = numNumStopLoss != null ? parseFloat(numNumStopLoss) : DEFAULT_STOP_LOSS_PCT;
  const minProfitDec = minProfitPct / 100;
  const feeDragPct   = ROUND_TRIP_FEE_RATE * 100; // always 0.8% — fixed by Gemini

  const calibrationNote = numNumFloor != null
    ? ` [Tank floor: ${minProfitPct.toFixed(1)}% | stop: ${stopLossPct.toFixed(1)}%]`
    : ` [default floor: ${minProfitPct.toFixed(1)}%]`;

  // ── BUY CHECK ─────────────────────────────────────────────────────────────
  if (side === 'buy') {
    if (usdAmount < MIN_TRADE_SIZE_USD) {
      return {
        approved: false,
        reason: `NumNum REJECT: Trade size $${usdAmount.toFixed(2)} is below the $${MIN_TRADE_SIZE_USD} minimum. Fee overhead makes this trade unviable.`,
        currentPctFromBuy: null,
        breakEvenPrice: null,
        targetSellPrice: null,
        feeDragPct,
      };
    }
    const breakEvenPrice  = currentPrice * (1 + ROUND_TRIP_FEE_RATE);
    const targetSellPrice = currentPrice * (1 + ROUND_TRIP_FEE_RATE + minProfitDec);
    return {
      approved: true,
      reason: `NumNum APPROVE: $${usdAmount.toFixed(2)} buy is fee-efficient. Must sell above $${targetSellPrice.toFixed(4)} to clear ${minProfitPct.toFixed(1)}% net target.${calibrationNote}`,
      currentPctFromBuy: null,
      breakEvenPrice: parseFloat(breakEvenPrice.toFixed(6)),
      targetSellPrice: parseFloat(targetSellPrice.toFixed(6)),
      feeDragPct,
    };
  }

  // ── SELL CHECK ────────────────────────────────────────────────────────────
  if (side === 'sell') {
    if (!buyPrice || buyPrice <= 0) {
      return {
        approved: true,
        reason: `NumNum APPROVE (no buy price on record — deferring to CIPHER judgment).${calibrationNote}`,
        currentPctFromBuy: null,
        breakEvenPrice: null,
        targetSellPrice: null,
        feeDragPct,
      };
    }

    const currentPctFromBuy = ((currentPrice - buyPrice) / buyPrice) * 100;
    const breakEvenPrice    = buyPrice * (1 + ROUND_TRIP_FEE_RATE);
    const targetSellPrice   = buyPrice * (1 + ROUND_TRIP_FEE_RATE + minProfitDec);
    const netProfitPct      = currentPctFromBuy - feeDragPct;

    const isStopLoss   = currentPctFromBuy < -stopLossPct;
    const isProfitable = netProfitPct >= minProfitPct;

    if (isStopLoss) {
      return {
        approved: true,
        reason: `NumNum APPROVE (STOP-LOSS override): Position is down ${currentPctFromBuy.toFixed(2)}% — past the ${stopLossPct.toFixed(1)}% threshold. Exiting to prevent further loss.${calibrationNote}`,
        currentPctFromBuy: parseFloat(currentPctFromBuy.toFixed(4)),
        breakEvenPrice: parseFloat(breakEvenPrice.toFixed(6)),
        targetSellPrice: parseFloat(targetSellPrice.toFixed(6)),
        feeDragPct,
      };
    }

    if (isProfitable) {
      return {
        approved: true,
        reason: `NumNum APPROVE: Position is up ${currentPctFromBuy.toFixed(2)}% gross. Net after fees: ~${netProfitPct.toFixed(2)}%. Clears ${minProfitPct.toFixed(1)}% target. ✅${calibrationNote}`,
        currentPctFromBuy: parseFloat(currentPctFromBuy.toFixed(4)),
        breakEvenPrice: parseFloat(breakEvenPrice.toFixed(6)),
        targetSellPrice: parseFloat(targetSellPrice.toFixed(6)),
        feeDragPct,
      };
    }

    return {
      approved: false,
      reason: `NumNum REJECT: Position is only up ${currentPctFromBuy.toFixed(2)}% gross. Net after fees: ~${netProfitPct.toFixed(2)}%. Needs $${targetSellPrice.toFixed(4)} (${(ROUND_TRIP_FEE_RATE * 100 + minProfitPct).toFixed(1)}% above buy). HOLD.${calibrationNote}`,
      currentPctFromBuy: parseFloat(currentPctFromBuy.toFixed(4)),
      breakEvenPrice: parseFloat(breakEvenPrice.toFixed(6)),
      targetSellPrice: parseFloat(targetSellPrice.toFixed(6)),
      feeDragPct,
    };
  }

  return { approved: true, reason: 'NumNum: Non-trade action, no check required.', feeDragPct };
}

}
