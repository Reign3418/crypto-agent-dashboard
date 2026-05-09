# BASTION — Multi-Agent Trading System
## Master Operations Document

> **Era:** Bastion | **Architecture:** Autonomous Multi-Agent System (MAS) | **Infra:** Vercel Serverless + AWS DynamoDB

---

## The Team

| Agent | File | Role | Cycle |
|---|---|---|---|
| **CIPHER** | `api/scout.js` | Tactical Sniper — reads markets, executes trades | Every 5 min (cron) |
| **NULL** | `api/null-commander.js` | Strategic Commander — issues directives via coachNotes | Every 60 min (cron) |
| **Big Jon** | `api/scout.js` (inline) | Conflict Referee — blocks trades when CIPHER/NULL are out of sync | Every trade attempt |
| **NumNum** | `lib/numnum.js` | Fee Math Gate — arithmetic-only viability check | Every trade attempt |
| **BASTION** | `api/rollup.js` | Audit AI — Deep Dive capital preservation analysis | On demand |

---

## Gate Order (Every Trade Attempt)

```
CIPHER proposes action (buy/sell/hold)
        ↓
Big Jon checks: Is CIPHER aligned with NULL's directive?
   → Conflict detected: AUTO-STOP, autopilot disabled
   → Aligned: "Let's get it on!"
        ↓
NumNum checks: Does the math clear after fees?
   → REJECT: block count incremented in DB, CIPHER stands down
   → APPROVE: trade executes, block count resets to 0
        ↓
NumNum block count feeds into NULL's next hourly audit
```

---

## 🟢 STARTUP SEQUENCE
*Run this when resuming the system after downtime or a new session.*

### 1. Verify the system is live
- Navigate to https://crypto-agent-dashboard.vercel.app
- Check the Activity Feed — confirm `🚀 CIPHER Core Autopilot is ON` appears in recent logs
- Check the NULL Command Center tab — confirm NULL has issued a directive in the last 60 min

### 2. Check open positions
- Run the Deep Dive Audit (Dashboard → Analyze button)
- Confirm `openPositions` reflects what's actually on the Gemini exchange
- **If positions are missing:** A manual trade may have occurred outside the system. Do NOT buy crypto manually — add USD and let the team deploy it.

### 3. Confirm agent health
Look for these log lines — if any are absent, the system may need a redeploy:
```
🚀 CIPHER Core Autopilot is ON
🥊 Big Jon: CIPHER & NULL are aligned...
🔢 NumNum: [verdict]
🧠 [NULL] Strategic command issued...
```

### 4. Check NumNum block count
- If `numNumBlocks` is high (10+), NULL knows about it and is factoring it into its next directive
- This is normal behavior — means the market hasn't reached the exit threshold yet

---

## 🔴 SHUTDOWN SEQUENCE
*"Shut it down" = close out the session cleanly. The website STAYS RUNNING — it is autonomous.*

### What shutdown is NOT:
- Do NOT toggle autopilot OFF (the system should keep trading 24/7)
- Do NOT stop the Vercel deployment
- Do NOT kill any processes — there are none running locally

### What shutdown IS:
A session wrap-up to capture everything that happened so the next session starts clean.

**Step 1: Update CIPHER.md**
Document any changes to CIPHER's core prompt, guardrails, or allowed asset list.

**Step 2: Update NULL.md**
Document any changes to NULL's decision framework or the data it receives (e.g., NumNum block count feed added today).

**Step 3: Update BIGJON.md**
Document any changes to the conflict detection logic or gate ordering.

**Step 4: Update NUMNUM.md**
Document any changes to fee thresholds, minimum trade sizes, or stop-loss override logic.

**Step 5: Update README.md**
Capture the current architecture snapshot — what changed this session.

**Step 6: Commit all MD files**
```bash
git add agent-personas/ README.md AGENT.md
git commit -m "Session wrap: update all agent docs - [date]"
git push
```

**Step 7: Leave a note in coachNotes (optional)**
If you want NULL to know context for its next audit (e.g., "just added NumNum feedback loop, monitor first few cycles"), you can manually write a note in the DynamoDB settings via the dashboard.

---

## Capital Rules

> **The #1 rule:** Add USD to the account. Let the team deploy it.

- NEVER buy crypto manually on the Gemini exchange. CIPHER will inherit an unprotected position with no buy price — it won't know your cost basis and may sell immediately.
- If you ever buy manually by mistake: immediately tell the AI assistant the fill price so it can register the position before CIPHER's next 5-minute cycle.
- The system is designed for USD deposits → autonomous deployment by CIPHER.

---

## Key Database Fields (DynamoDB `settings`)

| Field | Purpose |
|---|---|
| `autopilotEnabled` | true/false — CIPHER's trading switch |
| `coachNotes` | NULL's current directive to CIPHER |
| `openPositions` | Map of held assets with buyPrice, amount, timestamp |
| `missionDirective` | The active mission CIPHER is executing |
| `numNumBlocks` | Count of consecutive NumNum rejections |
| `numNumBlockedSymbol` | Which asset NumNum is blocking |
| `numNumBlockedPrice` | Target price needed to clear NumNum |
| `portfolioHistory` | 28-day array of portfolio value snapshots |

---

## Architecture Files

| File | Purpose |
|---|---|
| `api/scout.js` | CIPHER + Big Jon + NumNum gate |
| `api/null-commander.js` | NULL hourly audit + directive write |
| `api/cron.js` | Vercel serverless scheduler (5min, 15min, 60min, 12hr, 24hr tasks) |
| `api/rollup.js` | Deep Dive audit + portfolio snapshots |
| `lib/db.js` | DynamoDB read/write layer + getDeepDiveAnalysis |
| `lib/trade.js` | Gemini Exchange API execution + cost basis write |
| `lib/numnum.js` | Pure fee math — no AI, no tokens |
| `lib/evaluator.js` | Strategy evaluation engine |
| `src/components/NullCommandCenter.jsx` | NULL tab UI |
