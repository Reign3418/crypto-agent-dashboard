/**
 * lib/fee-calculator.js — CIPHER Unified Fee & P&L Calculator
 *
 * Adapted from the BASTION 001 fee architecture fix (cipher-fee-hotfix.js).
 * ESM rewrite — no require(), no filesystem, works in Vercel serverless.
 *
 * Eliminates two legacy fee bugs:
 *   Path A: CIPHER parsed "Fee: 0 USD" log strings and thought fees = $0.
 *   Path B: CIPHER used 49.3% historical fee drag as a per-trade rate.
 *
 * Verified Gemini taker rate: 0.4% flat (confirmed across 435+ trades).
 *
 * Usage:
 *   import { calculateNetPnL, isTradeViable } from '../lib/fee-calculator.js';
 *   const pnl = calculateNetPnL({ symbol, side, usdAmount, fillPrice, targetExitPrice });
 *   if (pnl.isViable) { ... execute ... }
 */

// ── Constants ──────────────────────────────────────────────────────────────────
export const GEMINI_TAKER_RATE    = 0.004;  // 0.4% — verified across 435+ trades
export const DEFAULT_PROFIT_FLOOR = 2.5;    // % minimum net gain to execute

// ── Utility ────────────────────────────────────────────────────────────────────
function r4(n) { return Math.round(n * 10000) / 10000; }  // round to 4 decimal places

/**
 * Single source of truth for all fee and P&L calculations.
 *
 * Replaces BOTH legacy paths:
 *   - Path A (zero fee from log parsing)
 *   - Path B (49.3% historical drag as per-trade rate)
 *
 * Always uses 0.4% Gemini taker rate, applied to both entry AND exit notional.
 *
 * @param {object} trade
 *   @param {string}  trade.symbol          e.g. 'XRP'
 *   @param {string}  trade.side            'buy' | 'sell'
 *   @param {number}  trade.usdAmount       notional USD deployed (> 0)
 *   @param {number}  trade.fillPrice       actual entry fill price per unit (> 0)
 *   @param {number}  trade.targetExitPrice expected exit price per unit (> 0)
 * @param {object} [opts]
 *   @param {number}  [opts.minProfitPct=2.5]  viability floor in %
 *   @param {number}  [opts.feeRate=0.004]      override fee rate (for future use)
 *
 * @returns {{
 *   grossPnL: number,
 *   entryFee: number,
 *   exitFee: number,
 *   totalFees: number,
 *   netPnL: number,
 *   profitPct: number,
 *   isViable: boolean,
 *   feeRate: number,
 *   minProfitPct: number,
 *   blockReason: string|null
 * }}
 */
export function calculateNetPnL(trade, opts = {}) {
  const { symbol, side, usdAmount, fillPrice, targetExitPrice } = trade;
  const feeRate     = opts.feeRate      ?? GEMINI_TAKER_RATE;
  const minProfitPct = opts.minProfitPct ?? DEFAULT_PROFIT_FLOOR;

  // ── Input guards ──────────────────────────────────────────────────────────────
  if (!symbol || typeof symbol !== 'string')          throw new TypeError('calculateNetPnL: symbol required');
  if (!['buy','sell'].includes(side))                 throw new TypeError(`calculateNetPnL: side must be buy|sell, got "${side}"`);
  if (!Number.isFinite(usdAmount)  || usdAmount <= 0) throw new RangeError('calculateNetPnL: usdAmount must be > 0');
  if (!Number.isFinite(fillPrice)  || fillPrice <= 0) throw new RangeError('calculateNetPnL: fillPrice must be > 0');
  if (!Number.isFinite(targetExitPrice) || targetExitPrice <= 0) throw new RangeError('calculateNetPnL: targetExitPrice must be > 0');

  // ── Gross P&L from price movement ─────────────────────────────────────────────
  // BUY  (long):  profit if exit > entry  → (exit/entry - 1) * notional
  // SELL (short): profit if exit < entry  → (1 - exit/entry) * notional
  const priceRatio = targetExitPrice / fillPrice;
  const grossPnL = side === 'buy'
    ? usdAmount * (priceRatio - 1)
    : usdAmount * (1 - priceRatio);

  // ── Round-trip fees: entry + exit ─────────────────────────────────────────────
  // Exit notional = entry + grossPnL (position value at target)
  const entryFee = usdAmount * feeRate;
  const exitFee  = (usdAmount + grossPnL) * feeRate;
  const totalFees = entryFee + exitFee;

  // ── Net result ────────────────────────────────────────────────────────────────
  const netPnL    = grossPnL - totalFees;
  const profitPct = (netPnL / usdAmount) * 100;
  const isViable  = netPnL > 0 && profitPct >= minProfitPct;

  let blockReason = null;
  if (!isViable) {
    if (netPnL <= 0) {
      blockReason = `netPnL $${r4(netPnL)} ≤ 0 after $${r4(totalFees)} fees (${(feeRate*200).toFixed(2)}% round-trip)`;
    } else {
      blockReason = `profit ${r4(profitPct)}% below ${minProfitPct}% floor`;
    }
  }

  return {
    grossPnL:     r4(grossPnL),
    entryFee:     r4(entryFee),
    exitFee:      r4(exitFee),
    totalFees:    r4(totalFees),
    netPnL:       r4(netPnL),
    profitPct:    r4(profitPct),
    isViable,
    feeRate,
    minProfitPct,
    blockReason,
  };
}

/**
 * Quick viability check — returns true/false.
 * Convenience wrapper around calculateNetPnL.
 */
export function isTradeViable(trade, opts = {}) {
  try {
    return calculateNetPnL(trade, opts).isViable;
  } catch {
    return false;
  }
}

/**
 * Detect if a string contains legacy fee bug signatures (Path A or Path B).
 * Used by Tank/NULL to flag stale directives that reference phantom fees.
 *
 * @param {string} text
 * @returns {{ hasLegacyPath: boolean, paths: string[] }}
 */
export function detectLegacyFeePaths(text) {
  if (typeof text !== 'string') return { hasLegacyPath: false, paths: [] };
  const paths = [];
  if (/49\.3/.test(text))                                paths.push('PATH_B: 49.3% historical drag');
  if (/fee\s*drag/i.test(text) && /49/.test(text))       paths.push('PATH_B: fee drag % used as per-trade rate');
  if (/Fee:\s*\$?0\s*USD/i.test(text))                   paths.push('PATH_A: zero fee from raw log parsing');
  if (/totalFees\s*\/\s*totalGrossProfit/i.test(text))   paths.push('PATH_B: historical aggregate as per-trade cost');
  return { hasLegacyPath: paths.length > 0, paths };
}

/**
 * Break-even price — the minimum exit price for a trade to cover fees and hit the floor.
 * Useful for CIPHER to know exactly what price target is needed before proposing a trade.
 *
 * @param {object} trade  { side, usdAmount, fillPrice }
 * @param {object} [opts] { minProfitPct, feeRate }
 * @returns {number} Minimum exit price in USD
 */
export function breakEvenPrice(trade, opts = {}) {
  const { side, usdAmount, fillPrice } = trade;
  const feeRate      = opts.feeRate      ?? GEMINI_TAKER_RATE;
  const minProfitPct = opts.minProfitPct ?? DEFAULT_PROFIT_FLOOR;

  // Net target: netPnL = grossPnL - totalFees >= (minProfitPct/100) * usdAmount
  // grossPnL = usdAmount * (exitRatio - 1)  [buy side]
  // exitFee  = (usdAmount + grossPnL) * feeRate
  // entryFee = usdAmount * feeRate
  //
  // Solve for exitRatio (buy):
  //   netPnL >= minNet
  //   usdAmount*(R-1) - usdAmount*feeRate - (usdAmount*(R-1)+usdAmount)*feeRate >= minNet
  //   usdAmount*(R-1)*(1-feeRate) - usdAmount*feeRate*(1+1) >= minNet
  //   Actually: rearranging the full formula:
  //   grossPnL*(1-feeRate) - entryFee >= minNet
  //   usdAmount*(R-1)*(1-feeRate) >= minNet + entryFee
  //   R-1 >= (minNet + entryFee) / (usdAmount*(1-feeRate))
  //   R >= 1 + (minNet + entryFee) / (usdAmount*(1-feeRate))

  const minNet   = (minProfitPct / 100) * usdAmount;
  const entryFee = usdAmount * feeRate;

  if (side === 'buy') {
    const ratio = 1 + (minNet + entryFee) / (usdAmount * (1 - feeRate));
    return r4(fillPrice * ratio);
  } else {
    // Short: profit if exit < entry, sell first, buy back lower
    const ratio = 1 - (minNet + entryFee) / (usdAmount * (1 - feeRate));
    return r4(fillPrice * ratio);
  }
}
