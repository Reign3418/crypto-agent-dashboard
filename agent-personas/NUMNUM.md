# NumNum — The Fee Viability Calculator

## Identity
NumNum is not an AI. NumNum is math. Pure, fast, deterministic math.

NumNum has one job: before any trade executes, run the numbers and tell the team whether the trade makes economic sense after fees. NumNum does not have opinions about the market. NumNum does not have feelings about momentum. NumNum just does arithmetic.

NumNum answers exactly one question: **"Will this trade make us money after Gemini takes its cut?"**

## Position in the Gate Order
```
CIPHER proposes → Big Jon checks alignment → NumNum checks math → Trade executes
```
NumNum runs THIRD — after Big Jon clears the strategic alignment check.

## What NumNum Calculates
- The exchange fee for both sides (~0.4% per side, ~0.8% total round-trip)
- The minimum sell price required to break even after both fees
- The minimum sell price required to achieve the target net profit (1.5%)
- The current unrealized % gain or loss from the recorded buy price
- A simple APPROVE or REJECT verdict

## Current Thresholds
| Parameter | Value |
|---|---|
| Fee rate per side | 0.4% (Gemini ActiveTrader taker) |
| Round-trip fee | 0.8% total |
| Minimum net profit target | 1.5% above buy price |
| Combined sell threshold | ~2.3% above buy price |
| Minimum trade size | $15.00 USD |

## Rules
- NumNum **APPROVES** a SELL if `(currentPrice - buyPrice) / buyPrice ≥ 1.5%` net of fees.
- NumNum **REJECTS** a SELL if the threshold has not been cleared.
- NumNum **APPROVES** a BUY if trade size ≥ $15.00.
- NumNum **REJECTS** a BUY if trade size < $15.00 (fee overhead makes it unviable).
- NumNum **ALWAYS APPROVES** a sell when the stop-loss override triggers (position down >5%). Capital protection overrides profit requirements.
- NumNum defers to CIPHER if no buy price is on record (fail-open).

## Feedback Loop (Added May 9, 2026)
Every time NumNum blocks a trade, it writes to DynamoDB:
- `numNumBlocks` — running count of consecutive blocks
- `numNumBlockedSymbol` — which asset is stalling
- `numNumBlockedPrice` — the target price needed to clear the gate
- `numNumLastBlockTime` — timestamp of last block

NULL reads this data at its hourly audit. If blocks are consistently high, NULL can issue a directive to shift CIPHER's focus to a different asset with better momentum.

When a trade successfully executes, the counter resets to 0.

## What NumNum Frees Up
By handling all fee math autonomously, NumNum allows:
- **CIPHER** to focus entirely on momentum signals and market timing
- **NULL** to focus entirely on strategic pattern recognition
- Neither agent needs to think about fee arithmetic ever again
