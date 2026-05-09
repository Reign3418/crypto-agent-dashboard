# DOZER — Chief Accounting Officer / Back-Office Operator
## BASTION Multi-Agent Trading System

---

## Identity

**Name:** Dozer  
**Role:** Chief Accounting Officer / Back-Office Operator  
**Named after:** Dozer from The Matrix — Tank's brother. Born free. Never jacked in. He ran the ship's systems while Tank ran the comms. Dozer kept the Nebuchadnezzar functional so the crew could fight without worrying about whether the hull was intact.  
**Model:** None — **Dozer uses no AI. Pure deterministic math.**  
**Cadence:** Every 15 minutes via cron.js

Dozer does not trade. Dozer does not strategize. Dozer does not give orders. Dozer **keeps the books** so everyone else has accurate numbers to work from.

---

## Position in the Architecture

```
BASTION — Two Rings

COMBAT RING:
  TANK (12h) → NULL (1h) → CIPHER (5min) → Big Jon → NumNum

BACK OFFICE RING:
  DOZER (15min) → feeds clean accounting data → TANK reads it every 12h
```

Dozer is **parallel to the command chain, not in it.** He has no authority over CIPHER, NULL, Big Jon, or NumNum. He reports to Tank by writing verified data that Tank reads in every 12-hour assessment.

---

## What Dozer Owns

### 1. Capital Balance Reconciliation
Every 15 minutes, Dozer answers these questions with math, not AI:

| Field | What It Means |
|---|---|
| `liquidUSD` | Cash available to trade right now |
| `totalDeployed` | Cost basis of all open positions |
| `netRealizedPL` | Net profit/loss on all fully closed trade pairs |
| `unrealizedPL` | Current paper gain/loss on open positions |
| `netPosition` | The real scorecard: realized + unrealized |
| `liquidityStatus` | ADEQUATE / LOW / CRITICAL |

### 2. Clean Trade Pair Ledger (FIFO)
Dozer matches every buy to its corresponding sell using First-In-First-Out accounting. Each matched pair records:
- Symbol, cost basis, proceeds, fees, gross P&L, net P&L, won/lost

This is the only accurate source of realized P&L in the system. The Deep Dive AI cannot be trusted to do this correctly. Dozer can.

### 3. Running Performance Score
Updated every 15 minutes from actual closed trade pairs:
- Win rate, win count, loss count
- Average net profit per closed trade
- Fee drag (fees as % of gross realized gains)
- Current streak (consecutive wins or losses)
- Best and worst closed trade

### 4. Concentration Risk
Every 15 minutes: what % of deployed capital is in each asset?
- `> 70%` in one asset → HIGH risk flag
- `> 50%` in one asset → ELEVATED risk flag
- Else → OK

### 5. External Anomaly Registry
If a sell appears with no matching buy, Dozer registers it as an external anomaly:
- Symbol, USD value, timestamp, note
- **Excluded from all P&L calculations**
- Reported to Tank but not flagged as an error

### 6. Liquidity Monitoring
- `< $5 USD liquid` → CRITICAL alert logged to activity feed
- `< $15 USD liquid` → LOW alert logged to activity feed
- Normal → logged silently

---

## What Dozer Writes

```javascript
settings.dozerReport = {
  timestamp:          // ISO string
  tradesAnalyzed:     // number of log entries scanned
  closedPairs:        // array of fully matched buy→sell pairs
  capitalBalance:     // { liquidUSD, totalDeployed, netRealizedPL, unrealizedPL, netPosition, ... }
  performance:        // { winRate, avgNetPerTrade, feeDrag, currentStreak, bestTrade, worstTrade, ... }
  concentrationRisk:  // { LINK: { pct, status }, SOL: { pct, status }, ... }
  externalAnomalies:  // sells with no matching buy
  liquidityStatus:    // 'ADEQUATE' | 'LOW' | 'CRITICAL'
  capitalRisk:        // 'LOW' | 'MEDIUM' | 'HIGH'
}
```

---

## What Dozer Does NOT Do

- Does not call any AI (no Gemini API calls)
- Does not issue directives to any agent
- Does not block or approve trades
- Does not interact with the exchange API directly
- Does not set the mission directive (that's Tank)

---

## Dashboard

Dozer's data appears on the **🎯 Tank** tab in the **DOZER — VERIFIED ACCOUNTING** panel. Updated every time the page refreshes (60-second interval). Shows:
- Capital balance grid (5 key numbers)
- Performance scorecard (win rate, avg net, fee drag, streak)
- Concentration risk badges per asset
- Reconciliation note

---

## Why "No AI"?

Financial accounting must be deterministic. If an AI calculates your P&L, you can't audit the answer. You can't prove it to anyone. You can't trust it when the numbers look wrong.

Dozer's FIFO algorithm always produces the same answer for the same inputs. Every number is traceable. Every pair is documented. Tank, NULL, and CIPHER can trust Dozer's numbers because Dozer doesn't guess.

> *"The math doesn't lie. The AI might."* — Dozer's mandate
