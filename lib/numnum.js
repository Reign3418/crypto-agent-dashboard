/**
 * NumNum — The Fee Viability Calculator
 *
 * Pure math. No AI. No tokens. No hallucinations.
 * NumNum answers one question before every trade:
 * "Will this make us money after Gemini takes its cut?"
 *
 * This frees CIPHER from fee math so it can focus on momentum.
 * This frees NULL from fee analysis so it can focus on strategy.
 */

const GEMINI_FEE_RATE      = 0.004;  // 0.4% per side (ActiveTrader taker rate)
const ROUND_TRIP_FEE_RATE  = GEMINI_FEE_RATE * 2;  // 0.8% total for buy + sell
const MIN_PROFIT_TARGET    = 0.015;  // 1.5% minimum net gain above fee drag
const MIN_TRADE_SIZE_USD   = 15.00;  // Minimum trade size for fee efficiency

/**
 * Run NumNum's viability check before executing a trade.
 *
 * @param {string} side         - 'buy' or 'sell'
 * @param {number} usdAmount    - The proposed USD trade size
 * @param {number} currentPrice - The live market price of the asset
 * @param {number|null} buyPrice - The recorded fill price from openPositions (null if no position)
 *
 * @returns {{
 *   approved: boolean,
 *   reason: string,
 *   currentPctFromBuy: number|null,
 *   breakEvenPrice: number|null,
 *   targetSellPrice: number|null,
 *   feeDragPct: number
 * }}
 */
export function runNumNum({ side, usdAmount, currentPrice, buyPrice }) {
  const feeDragPct = ROUND_TRIP_FEE_RATE * 100; // expressed as %

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
    // For buys, calculate the minimum sell price needed to profit on exit
    const breakEvenPrice   = currentPrice * (1 + ROUND_TRIP_FEE_RATE);
    const targetSellPrice  = currentPrice * (1 + ROUND_TRIP_FEE_RATE + MIN_PROFIT_TARGET);
    return {
      approved: true,
      reason: `NumNum APPROVE: $${usdAmount.toFixed(2)} buy is fee-efficient. Must sell above $${targetSellPrice.toFixed(4)} to clear 1.5% net target.`,
      currentPctFromBuy: null,
      breakEvenPrice: parseFloat(breakEvenPrice.toFixed(6)),
      targetSellPrice: parseFloat(targetSellPrice.toFixed(6)),
      feeDragPct,
    };
  }

  // ── SELL CHECK ────────────────────────────────────────────────────────────
  if (side === 'sell') {
    // If we have no recorded buy price, we can't run the math — approve cautiously
    if (!buyPrice || buyPrice <= 0) {
      return {
        approved: true,
        reason: `NumNum APPROVE (no buy price on record — deferring to CIPHER judgment).`,
        currentPctFromBuy: null,
        breakEvenPrice: null,
        targetSellPrice: null,
        feeDragPct,
      };
    }

    const currentPctFromBuy = ((currentPrice - buyPrice) / buyPrice) * 100;
    const breakEvenPrice    = buyPrice * (1 + ROUND_TRIP_FEE_RATE);
    const targetSellPrice   = buyPrice * (1 + ROUND_TRIP_FEE_RATE + MIN_PROFIT_TARGET);
    const netProfitPct      = currentPctFromBuy - (feeDragPct);

    // Allow if the net gain clears the target, OR if it's a stop-loss (price dropped >5%)
    const isStopLoss = currentPctFromBuy < -5.0;
    const isProfitable = netProfitPct >= (MIN_PROFIT_TARGET * 100);

    if (isStopLoss) {
      return {
        approved: true,
        reason: `NumNum APPROVE (STOP-LOSS override): Position is down ${currentPctFromBuy.toFixed(2)}%. Exiting to prevent further loss takes priority over profit threshold.`,
        currentPctFromBuy: parseFloat(currentPctFromBuy.toFixed(4)),
        breakEvenPrice: parseFloat(breakEvenPrice.toFixed(6)),
        targetSellPrice: parseFloat(targetSellPrice.toFixed(6)),
        feeDragPct,
      };
    }

    if (isProfitable) {
      return {
        approved: true,
        reason: `NumNum APPROVE: Position is up ${currentPctFromBuy.toFixed(2)}% gross. Net after fees: ~${netProfitPct.toFixed(2)}%. Clears 1.5% target. ✅`,
        currentPctFromBuy: parseFloat(currentPctFromBuy.toFixed(4)),
        breakEvenPrice: parseFloat(breakEvenPrice.toFixed(6)),
        targetSellPrice: parseFloat(targetSellPrice.toFixed(6)),
        feeDragPct,
      };
    }

    return {
      approved: false,
      reason: `NumNum REJECT: Position is only up ${currentPctFromBuy.toFixed(2)}% gross. Net after fees: ~${netProfitPct.toFixed(2)}%. Needs to reach $${targetSellPrice.toFixed(4)} (${(ROUND_TRIP_FEE_RATE * 100 + MIN_PROFIT_TARGET * 100).toFixed(1)}% above buy) before selling. HOLD.`,
      currentPctFromBuy: parseFloat(currentPctFromBuy.toFixed(4)),
      breakEvenPrice: parseFloat(breakEvenPrice.toFixed(6)),
      targetSellPrice: parseFloat(targetSellPrice.toFixed(6)),
      feeDragPct,
    };
  }

  // Fallback for any other action
  return { approved: true, reason: 'NumNum: Non-trade action, no check required.', feeDragPct };
}
