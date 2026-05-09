# BACK OFFICE RING
## BASTION Multi-Agent Trading System

> *"I never went to the other side. I was born free."* — Dozer, The Matrix

---

## Ring Mandate

The Back Office Ring is responsible for **financial integrity, capital accounting, and forensic audit.** No agent in this ring touches the exchange. No agent in this ring issues directives to the Combat Ring. This ring exists to make sure everyone else has accurate numbers to work from.

**Agents in this ring:** DOZER · BASTION AI (Deep Dive)

---

## Ring Architecture

```
DOZER  (every 15 minutes — automated, always-on)
│  Chief Accounting Officer
│  Pure deterministic math. No AI.
│  Writes verified accounting data → TANK reads it every 12h
│
BASTION AI  (on demand — human-initiated)
   Deep Dive forensic audit
   AI-assisted financial review and capital analysis
```

Note: BASTION AI is not on a cron schedule. It runs when the human operator requests a deep dive analysis via the dashboard.

---

## External Interfaces

### What This Ring Reads FROM Other Rings
| Source | Field | Used By |
|---|---|---|
| Combat Ring (CIPHER via trade.js) | `openPositions` | DOZER — cost basis for FIFO pair matching |
| DynamoDB (all log entries) | `AGENT_LOG` table | DOZER — full trade log scan |
| Combat Ring (settings) | `missionDirective`, `activeEraEpoch` | DOZER and BASTION AI — audit context |

### What This Ring Writes FOR Other Rings
| Field | Written By | Used By |
|---|---|---|
| `dozerReport` | DOZER | TANK — reads capital balance and performance score every 12h |
| Activity log entries | DOZER | Human operator (via Logs tab), all agents reading logs |

---

## Agent Profiles

---

### DOZER — Chief Accounting Officer
**Named after:** Dozer from The Matrix — Tank's brother. Born free. Never jacked in. He ran the ship's systems while Tank ran the comms. Kept the Nebuchadnezzar functional so the crew could fight without worrying about whether the hull was intact.
**Model:** None — **no AI. Pure deterministic math.**
**Cadence:** Every 15 minutes via cron.js
**File:** `api/dozer.js`

**Identity:** Dozer does not trade. Does not strategize. Does not give orders. Dozer keeps the books so everyone else has accurate numbers to work from. Dozer is the only agent in BASTION whose output can be fully audited by a human with a spreadsheet.

> *"The math doesn't lie. The AI might."* — Dozer's mandate

**What Dozer Does:**

**1. Capital Balance Reconciliation**
Every 15 minutes, Dozer answers these questions with math:
| Field | What It Means |
|---|---|
| `liquidUSD` | Cash available to trade right now |
| `totalDeployed` | Cost basis of all open positions |
| `netRealizedPL` | Net P&L on all fully closed trade pairs |
| `unrealizedPL` | Current paper gain/loss on open positions |
| `netPosition` | The real scorecard: realized + unrealized |
| `liquidityStatus` | ADEQUATE / LOW / CRITICAL |

**2. FIFO Trade Pair Ledger**
Matches every buy to its corresponding sell using First-In-First-Out accounting. Each matched pair records: symbol, cost basis, proceeds, fees, gross P&L, net P&L, won/lost.

This is the only accurate source of realized P&L in the system. No AI is trusted with this math.

**3. Running Performance Score**
Updated every 15 minutes from actual closed trade pairs:
- Win rate (win count / total closed)
- Average net profit per closed trade
- Fee drag (fees as % of gross realized gains)
- Current streak (consecutive wins or losses)
- Best and worst closed trade by net P&L

**4. Concentration Risk**
What % of deployed capital is in each asset?
- `> 70%` in one asset → HIGH risk flag + activity log alert
- `> 50%` in one asset → ELEVATED risk flag
- Else → OK

**5. External Anomaly Registry**
If a sell appears with no matching buy, Dozer registers it:
- Symbol, USD value, timestamp, note
- Excluded from all P&L calculations
- Reported in `dozerReport.externalAnomalies`
- Never flagged as a system error

**6. Liquidity Monitoring**
- `< $5 USD liquid` → CRITICAL — logged to activity feed with highlight
- `< $15 USD liquid` → LOW — logged to activity feed
- Normal → logged silently (still appears in Dozer's 15min summary line)

**Reads (every cycle):**
- All `AGENT_LOG` entries since `activeEraEpoch` (full log scan, paginated)
- `openPositions` — for current position values and cost basis
- Live portfolio balances from exchange API (for liquid USD)
- `activeEraEpoch` — to scope the accounting period correctly

**Writes:**
```javascript
settings.dozerReport = {
  timestamp:            // ISO string
  tradesAnalyzed:       // number of log entries scanned
  closedPairs: [{       // array of fully matched buy→sell pairs
    symbol, buyTs, sellTs,
    costBasis, proceeds, fees,
    grossPL, netPL, won
  }],
  capitalBalance: {
    liquidUSD,
    totalDeployed,
    grossRealizedPL,
    netRealizedPL,
    totalFeesPaid,
    unrealizedPL,
    netPosition,
    externalSellTotal,
    reconciliationNote
  },
  performance: {
    totalClosedTrades, winCount, lossCount,
    winRate, avgNetPerTrade,
    grossRealizedPL, netRealizedPL, totalFeesPaid,
    feeDrag, bestTrade, worstTrade,
    currentStreak: { type, count }
  },
  concentrationRisk: {
    [symbol]: { costBasis, pct, status }
  },
  externalAnomalies: [{ symbol, usdValue, fee, ts, note }],
  liquidityStatus,      // 'ADEQUATE' | 'LOW' | 'CRITICAL'
  capitalRisk           // 'LOW' | 'MEDIUM' | 'HIGH'
}
```

**Activity log entries Dozer writes:**
- `📊 [DOZER] Books reconciled — Deployed: $X | Liquid: $X | Net P&L: $X | Win rate: X/X | streak | Liquidity: STATUS`
- `⚠️ [DOZER] Liquidity alert: $X available — status: LOW/CRITICAL` (on low liquidity)
- `⚠️ [DOZER] Concentration risk: SYMBOL X% — HIGH` (on high concentration)
- `📊 [DOZER] External anomaly: SYMBOL sell $X — excluded from P&L` (on external sells)

**Does NOT:**
- Call any AI (no Gemini API calls)
- Issue directives to any agent
- Block or approve trades
- Set the mission directive
- Interact with the exchange API to execute trades

**Dashboard:** 🎯 Tank tab → DOZER — VERIFIED ACCOUNTING panel
- Capital balance grid (5 key numbers with color-coded status)
- Performance scorecard (win rate, avg net, fee drag, streak)
- Concentration risk badges per asset
- Reconciliation note
- Auto-refreshes every 60 seconds

---

### BASTION AI — Deep Dive Forensic Auditor
**Identity:** The on-demand analytical intelligence layer. Not a continuous agent. Runs when the human needs a full financial review.
**Model:** `gemini-2.5-flash`
**Cadence:** On demand (human-initiated via dashboard or API call)
**File:** `api/rollup.js` (also handles cognitive rollups and macro ledgers)

**Mandate:** Synthesize the full trade history into a readable audit report. Flag anomalies. Identify strategic improvements. Produce a plain-language assessment of fund health.

**What BASTION AI Reads:**
- Full output of `getDeepDiveAnalysis()` from `lib/db.js` — the complete trade statistics
- `openPositions` — current holdings with cost basis and live price
- `coinStats` — per-coin buy/sell volumes and fees
- `_systemNote` — accounting rules to follow (including external anomaly handling)

**Output:** A natural language audit report returned to the human via the dashboard.

**Critical accounting rules BASTION AI must follow:**
- Do NOT calculate realized P&L from sells with `buyVol = 0` — these are externally acquired assets. Flag them explicitly but exclude from P&L.
- Do NOT flag `totalBuys > totalSells` as an error when `openPositions` is not empty.
- Do NOT recommend "enhanced capital tracking" — Dozer handles that. Recommend strategic improvements only.

**Also runs:**
- **Cognitive Rollup** (every 60 min) — CIPHER's hourly post-mortem, written to `cognitiveRollups`
- **12H Macro Ledger** — 12-hour trend synthesis, written to `macroLedgers`
- **24H Macro Ledger** — daily trend synthesis
- **Mission Progress** (every 15 min) — checks if CIPHER has completed the current mission

---

## Ring-Level Rules

1. **No Back Office agent touches the exchange.** Dozer calls the exchange API read-only (to get portfolio balances). Neither agent executes trades.
2. **Dozer's math is never overridden by AI.** If Dozer's P&L contradicts what an AI agent reports, Dozer is right. Dozer's FIFO algorithm is deterministic and auditable.
3. **External anomalies are logged, not fixed.** If a sell has no matching buy, Dozer registers it and moves on. It does not attempt to reconstruct the missing buy or estimate a cost basis.
4. **BASTION AI must never overestimate realized gains.** Better to under-report than to show phantom profit that causes overconfident trading.
5. **This ring is read-only to the Combat Ring.** Dozer's reports flow up to Tank. Tank may change the mission based on what it reads. But Dozer never writes to `coachNotes`, never writes to CIPHER's context directly.

---

## Operational Procedures

### Adding a New Back Office Agent
1. Write the agent file in `api/`
2. Add it to this ring doc under **Agent Profiles** with full role, reads, writes, rules
3. Update the **External Interfaces** table — what does the new agent read, what does it write for other rings?
4. Update `AGENT.md`'s architecture file table
5. Update `api/cron.js` if a new cadence is needed

### Adding a New Accounting Metric to Dozer
1. Add the calculation to `api/dozer.js` in the appropriate section
2. Update the **"Writes"** schema in this doc
3. Update the TankView dashboard component if the metric should display on the Tank tab
4. If Tank should factor it into health assessments, update the Tank prompt in `api/tank.js`

### Changing Audit Rules (BASTION AI)
1. Update `_systemNote` in `lib/db.js` — this travels with the raw data to every AI audit call
2. Update the **Critical accounting rules** section in this doc
3. Test with a full Deep Dive run to confirm the AI follows the updated rule

### Retiring a Back Office Agent
1. Archive the agent file
2. Remove from **Agent Profiles** in this doc
3. Update **External Interfaces** to remove its reads/writes
4. Update `AGENT.md` and `whitepaper.md`
