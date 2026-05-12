# CIPHER — Multi-Agent Trading System
## Master Operations Document

> **Era:** CIPHER | **Version:** 2.0 | **Architecture:** Autonomous Multi-Agent System (MAS)
> **Infrastructure:** Vercel Serverless + AWS DynamoDB + Gemini Exchange API

---

## The Team — Two Rings

### 📰 Intelligence Ring
*The agents that build the market narrative.*

| Agent | File | Role | Cycle |
|---|---|---|---|
| **KENT** | `api/kent.js` | Chief Market Analyst — watches the news, maps catalysts, sets the analytical lens depth | Every 30 min (cron) |

### ⚔️ Combat Ring
*The agents that fight on the battlefield.*

| Agent | File | Role | Cycle |
|---|---|---|---|
| **TANK** | `api/tank.js` | Chief of Operations — owns the mission directive, assesses system health, writes the 3h briefing | Every 3h (tank-cron) |
| **NULL** | `api/null-commander.js` | Strategic Commander — reads Tank's frame, issues hourly tactical directives to CIPHER | Every 60 min (cron) + reactive on >3% market movers |
| **CIPHER** | `api/scout.js` | Tactical Execution — reads markets, reads mission + NULL directive, proposes trades | Every 5 min (cron) |
| **Big Jon** | `api/scout.js` (inline) | Conflict Referee — checks CIPHER's intent against NULL's directive (spirit, not literal text) | Every trade attempt |
| **NumNum** | `lib/numnum.js` | Fee Math Gate — deterministic fee arithmetic viability check | Every trade attempt |

### 🏢 Back Office Ring
*The agents that keep the ship running.*

| Agent | File | Role | Cycle |
|---|---|---|---|
| **DOZER** | `api/dozer.js` | Chief Accounting Officer — FIFO trade pairs, capital reconciliation, performance score, concentration risk | Every 15 min (cron) |
| **CIPHER AUDIT** | `api/rollup.js` | Audit AI — human-initiated Deep Dive financial forensics | On demand |

---

## Command Chain

```
TANK  (every 12h)
│  Chief of Operations. Owns the mission directive. Sees everything across all time.
│  Writes: missionDirective, missionSetBy, missionSetAt, tankReports
│
└── NULL  (every 1h, + reactive on any asset >3% move in 1h)
│      Strategic Commander. Translates Tank's frame into hourly tactics.
│      Writes: coachNotes
│
└── CIPHER  (every 5min)
│      Tactical Execution. Reads mission (Tank-set) + directive (NULL-set).
│      Proposes: buy / sell / hold / complete / fail
│
└── BIG JON  (per trade attempt)
│      Spirit-of-directive alignment check. Does NOT kill autopilot on conflict.
│      Blocks trade only if CIPHER fundamentally violates NULL's INTENT.
│
└── NUMNUM  (per trade attempt)
       Deterministic fee math. No AI. Cannot be overridden.
       Writes: numNumBlocks, numNumBlockedSymbol, numNumBlockedPrice

═══════════════════════════════════════════════════════════
DOZER  (every 15min) ← parallel track, not in the combat chain
       Pure math. No AI. Feeds clean accounting data to Tank.
       Writes: dozerReport
```

---

## Gate Order (Every Trade Attempt)

```
CIPHER proposes action (buy / sell / hold)
        ↓
[NULL Reactive Check] — did any asset move >3% since NULL last spoke?
   → YES + >15min since last NULL run: trigger immediate NULL refresh
   → coachNotes updated with fresh market context
        ↓
Big Jon alignment check
   → Evaluates SPIRIT of NULL's directive (not literal text)
   → TRUE conflict (NULL said HOLD, CIPHER trading): BLOCK trade, log warning
   → Aligned: proceed
        ↓
NumNum fee math gate
   → Projected net < 2.3% after fees: BLOCK, increment numNumBlocks
   → Clears threshold: execute trade
        ↓
Trade executes → cost basis written to openPositions
```

---

## ⚙️ Cadence Reference

| Cadence | What Runs |
|---|---|
| Every 5 min | CIPHER scout mission (tactical trading) |
| Every 15 min | **DOZER** (accounting reconciliation) + Mission Progress assessment |
| Every 30 min | **KENT** (news gathering and intelligence briefing) |
| Every 60 min | Cognitive Rollup + **NULL** strategic command |
| Every 3 hrs | Macro Trend Ledger + **TANK** (Chief of Operations) |
| Every 24 hrs | 24H Macro Ledger |
| On demand | CIPHER AUDIT Deep Dive (human-initiated) |

---

## 🟢 STARTUP SEQUENCE
*Run this when resuming the system after downtime or a new session.*

### 1. Verify the system is live
- Navigate to https://crypto-agent-dashboard.vercel.app
- Confirm `🚀 CIPHER Core Autopilot is ON` appears in recent logs (Terminal tab)
- Check the 🎯 Tank tab — confirm a Tank report exists and shows system health

### 2. Check Tank's current mission
- Open the 🎯 Tank tab
- Read Tank's latest briefing — this is your operational sitrep
- Confirm mission directive is Tank-set (`missionSetBy: "Tank"`)
- If it says `missionSetBy: "Human"`, Tank hasn't run yet — it will on the next 12h mark

### 3. Check Dozer's accounting panel (bottom of Tank tab)
- Confirm `LIQUID USD`, `DEPLOYED`, `NET POSITION` are displaying
- Check `LIQUIDITY STATUS` — if LOW or CRITICAL, review before leaving the system unattended
- Check `CONCENTRATION RISK` — flag any HIGH readings

### 4. Verify NULL is active
- Open the 🧠 NULL tab — confirm a directive was issued in the last 60 min
- If NULL is silent, check activity logs for errors

### 5. Confirm trade pipeline is healthy
Look for these log lines in the activity feed:
```
🚀 CIPHER Core Autopilot is ON
🥊 Big Jon: CIPHER & NULL are aligned...
🔢 NumNum: [verdict]
🧠 [NULL] Strategic command issued...
📊 [DOZER] Books reconciled...
🎯 [TANK AM/PM REPORT]...
```

---

## 🔴 SHUTDOWN SEQUENCE
*"Shut it down" = close out the session cleanly. The website STAYS RUNNING — it is fully autonomous.*

### What shutdown is NOT:
- Do NOT toggle autopilot OFF (the system trades 24/7)
- Do NOT stop the Vercel deployment
- Do NOT kill any processes — there are none running locally

### What shutdown IS:
A session wrap-up to capture everything that happened so the next session starts clean.

**Step 1: Update relevant agent persona files**
Only update files for agents whose logic actually changed this session:
- `agent-personas/CIPHER.md` — prompt changes, guardrail changes, allowed asset changes
- `agent-personas/NULL.md` — directive format changes, new data fed in
- `agent-personas/BIGJON.md` — conflict logic changes
- `agent-personas/NUMNUM.md` — fee threshold changes
- `agent-personas/TANK.md` — mission rule changes, new data Tank reads
- `agent-personas/DOZER.md` — new accounting fields, logic changes

**Step 2: Update AGENT.md**
Capture the current architecture snapshot — what changed this session.

**Step 3: Update README.md**
High-level summary of the current system state.

**Step 4: Commit all MD files**
```bash
git add agent-personas/ README.md AGENT.md whitepaper.md
git commit -m "Session wrap: [date] — [brief summary of what changed]"
git push
```

**Step 5: Optional — leave context in coachNotes**
If Tank hasn't run recently and you want NULL to have context for the next cycle, you can write a manual note via the dashboard settings. Tank will overwrite it on its next 12h run.

---

## Capital Rules

> **The #1 rule:** Deposit USD. Let the team deploy it.

- **NEVER buy crypto manually** on the Gemini exchange. CIPHER will inherit an unprotected position with no cost basis recorded — it won't know your entry price and stop-loss cannot protect you.
- **If you ever buy manually by mistake:** immediately register the trade via the admin endpoint with the fill price, symbol, and amount. CIPHER and Dozer must know about it before the next 5-minute cycle.
- The system is designed for: **USD deposits → Tank sets the goal → CIPHER deploys → Dozer tracks it → Tank reports it.**

---

## Key Database Fields (DynamoDB `settings`)

### Combat Ring
| Field | Owner | Purpose |
|---|---|---|
| `autopilotEnabled` | Human / CIPHER | true/false — CIPHER's trading switch |
| `missionDirective` | **Tank** | The active mission CIPHER is executing |
| `missionSetBy` | **Tank** | "Tank" or "Human" — who set the mission |
| `missionSetAt` | **Tank** | Timestamp of last mission update |
| `missionCompletions` | CIPHER | Count of successful mission completions |
| `coachNotes` | **NULL** | NULL's current tactical directive to CIPHER |
| `openPositions` | CIPHER | Map of held assets with buyPrice, amount, timestamp |
| `numNumBlocks` | NumNum | Count of consecutive fee-gate rejections |
| `numNumBlockedSymbol` | NumNum | Asset currently being blocked |
| `numNumBlockedPrice` | NumNum | Target price needed to clear the gate |

### Intelligence Chains
| Field | Owner | Purpose |
|---|---|---|
| `cognitiveRollups` | Rollup AI | Array of hourly post-mortems (last 24) |
| `macroLedgers` | Rollup AI | 12h and 24h trend analysis |
| `tankReports` | **Tank** | Array of 12h briefings (last 10) |

### Back Office Ring
| Field | Owner | Purpose |
|---|---|---|
| `dozerReport` | **Dozer** | Full accounting snapshot: capital balance, FIFO pairs, performance score, concentration risk |

### Scheduling Timestamps
| Field | Purpose |
|---|---|
| `lastMissionTime` | Tracks 15-min Dozer + mission window |
| `lastRollupTime` | Tracks 60-min cognitive rollup |
| `lastNullTime` | Tracks 60-min NULL command |
| `last12HTime` | Tracks 12h macro ledger + Tank run |
| `last24HTime` | Tracks 24h macro ledger |

---

## Architecture Files

### Combat Ring
| File | Purpose |
|---|---|
| `api/scout.js` | CIPHER + Big Jon + NumNum gate + NULL reactive trigger |
| `api/null-commander.js` | NULL hourly audit + directive write |
| `api/tank.js` | Tank 12h assessment + mission ownership |
| `api/cron.js` | Master orchestrator (5min, 15min, 60min, 12hr, 24hr) |
| `lib/numnum.js` | Pure fee math — no AI, no tokens |

### Back Office Ring
| File | Purpose |
|---|---|
| `api/dozer.js` | Deterministic FIFO accounting — no AI |
| `api/rollup.js` | Deep Dive audit + portfolio snapshots + cognitive rollups |
| `lib/db.js` | DynamoDB read/write layer + getDeepDiveAnalysis |
| `lib/trade.js` | Gemini Exchange API execution + cost basis write |

### Frontend
| File | Purpose |
|---|---|
| `src/components/TankView.jsx` | 🎯 Tank tab — always-on briefings + Dozer accounting panel |
| `src/components/NullCommandCenter.jsx` | 🧠 NULL tab UI |
| `src/components/TerminalView.jsx` | 🖥️ Terminal — live portfolio + scout feed |
| `src/components/ActivityLog.jsx` | 📋 Logs — filtered, newest-first log viewer |
| `src/App.jsx` | Tab navigation (Terminal → Tank → NULL → Strategy → Logs) |

### Agent Personas
| File | Agent |
|---|---|
| `agent-personas/TANK.md` | Tank — Chief of Operations |
| `agent-personas/CIPHER.md` | CIPHER — Tactical Execution |
| `agent-personas/NULL.md` | NULL — Strategic Commander |
| `agent-personas/BIGJON.md` | Big Jon — Conflict Referee |
| `agent-personas/NUMNUM.md` | NumNum — Fee Math Gate |
| `agent-personas/DOZER.md` | Dozer — Chief Accounting Officer |
| `whitepaper.md` | CIPHER System Whitepaper — full design reference |

---

## Emergency Procedures

### Autopilot won't disable
- The Emergency Stop button (top right of dashboard) halts CIPHER immediately
- If CIPHER is in the middle of a trade, the trade will complete before stopping

### Stop-loss isn't triggering
- The 5% hard stop-loss runs every 5 minutes inside the cron, outside the AI decision loop
- It cannot be disabled by any agent
- If you believe a position should have been sold: check Dozer's concentration risk panel and verify the drop % manually

### Tank's mission seems wrong
- Tank sets the mission autonomously — if it seems off, review Tank's rationale in the Tank tab
- You can still override by writing directly to `missionDirective` in DynamoDB settings
- Tank will re-evaluate and may update it again on its next 12h run

### Dozer shows discrepancy
- If Dozer's `NET POSITION` doesn't match your expectation, check `externalAnomalies`
- Any sell with no matching buy shows up there — these are excluded from P&L by design
- The reconciliation note at the bottom of the Dozer panel explains what Dozer found
- Note: `DEPLOYED` and `UNREALIZED P&L` are computed by Dozer from `amount × buyPrice` and live exchange notional values — they are NOT stored fields in `openPositions`. `trade.js` only writes `{ amount, buyPrice, highWaterMark, timestamp }`.

---

## 🐛 Session Bug Fix Log

| Date | Bug | Fix | File |
|---|---|---|---|
| 2026-05-11 | Dozer `Deployed: $0.00` — read non-existent `costBasisUsd` field | Computes `amount × buyPrice` | `dozer.js` |
| 2026-05-11 | Dozer `Unrealized P&L: $0.00` — read non-existent `unrealizedPlUsd` field | Fetches live notional from exchange, subtracts cost basis | `dozer.js` |
| 2026-05-11 | Dozer `Concentration: 0%` — divided by `$0` totalDeployed | Same root fix as deployed | `dozer.js` |
| 2026-05-11 | Protocol panel: no Reject button for pending protocols | Added red Reject button for `pending` + `needs_more_data` | `StrategyPanel.jsx` |
| 2026-05-11 | Tank AI wrote impossible mission dollar amounts (`$10 max` vs `$15 min`) | Tank pre-computes real bounds and injects into prompt before AI call | `tank.js` |
| 2026-05-11 | NULL "maintain your current LTC position" → CIPHER declared MISSION ACCOMPLISHED | Position language guardrail added to NULL prompt | `null-commander.js` |
| 2026-05-11 | CIPHER declaring MISSION ACCOMPLISHED just from holding an existing position | Hard rule: `complete` only valid if NEW trade placed this cycle | `scout.js` |
| 2026-05-11 | `trade.js` hardcoded `toFixed(6)` — Gemini rejected orders with wrong precision | Dynamic tick-size lookup via `/v1/symbols/details` | `trade.js` |
| 2026-05-11 | Concentration check used deployed-only as denominator (first trade = 100% → blocked) | Fixed denominator to total available capital | `scout.js` |

---

## 🏦 Current Era Status (updated 2026-05-11)

**Era:** CIPHER | **Status:** OPERATIONAL — Live Trading Active

| Field | Value |
|---|---|
| Open Positions | LTC (0.25471 @ $58.78), XRP (10.17 @ $1.4747) |
| Total Deployed | ~$30.00 |
| Liquid USD | ~$20.73 |
| Total Fees Paid | $0.1199 |
| Closed Trades | 0 (first sells pending 2.5% profit target) |
| Active Mission | Achieve one profitable closed trade pair |
| System Health | STABLE — guardrails active, all agents operational |



