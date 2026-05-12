# BASTION — Autonomous Multi-Agent Crypto Trading System

## What This Is
BASTION is a fully autonomous, serverless multi-agent trading system built on Vercel + AWS DynamoDB. It operates 24/7 without any browser, laptop, or human required to stay active.

The system manages a live crypto portfolio across 9 core assets using a seven-agent architecture across three rings: an Intelligence Ring (news/narrative), a Combat Ring (strategy/execution), and a Back Office Ring (accounting/audit).

---

## The Team

### 📰 Intelligence Ring
| Agent | Role | Runs |
|---|---|---|
| **KENT** | Chief Market Analyst — builds news narrative, determines analytical lens depth | Every 30 min |

### ⚔️ Combat Ring
| Agent | Role | Runs |
|---|---|---|
| **TANK** | Chief of Operations — owns the mission directive, assesses system health | Every 3 hrs |
| **NULL** | Strategic Commander — issues tactical directives based on Tank's frame | Every 60 min + reactive on >3% move |
| **CIPHER** | Tactical Execution — reads markets, proposes trades | Every 5 min |
| **Big Jon** | Conflict Referee — blocks misaligned trades | Every trade attempt |
| **NumNum** | Fee Math Gate — blocks unprofitable trades | Every trade attempt |

### 🏢 Back Office Ring
| Agent | Role | Runs |
|---|---|---|
| **DOZER** | Chief Accounting Officer — FIFO P&L, capital reconciliation, concentration risk | Every 15 min |
| **BASTION AI** | Deep Dive Forensic Auditor — full financial review on demand | Human-initiated |

For full details on each agent see `rings/INTELLIGENCE_RING.md`, `rings/COMBAT_RING.md`, and `rings/BACKOFFICE_RING.md`.

---

## Architecture

```
Vercel Cron (every 5 min)
    └── api/cron.js
        ├── api/kent.js       (KENT — runs every 30m)
        ├── api/scout.js      (CIPHER + Big Jon + NumNum)
        ├── api/null-commander.js  (NULL — runs hourly + reactive)
        ├── api/tank.js       (TANK — runs every 3h)
        ├── api/dozer.js      (DOZER — runs every 15min)
        └── api/rollup.js     (Cognitive rollup, macro ledgers, BASTION audit)

AWS DynamoDB
    └── settings table (openPositions, coachNotes, missionDirective, dozerReport, etc.)
    └── logs table (all activity feed entries, partitioned by AGENT_LOG pk + epoch sk)
```

---

## Trade Gate Order

Every buy or sell clears four gates before capital moves:

```
1. CIPHER proposes (buy / sell / hold / complete / fail)
2. [REACTIVE] NULL refreshes if any asset moved >3% in last 15min
3. Big Jon — CIPHER/NULL spirit-of-directive alignment check
4. NumNum — fee viability math check (~2.3% net threshold)
5. executeTrade() — Gemini Exchange API
```

---

## Key Rules

- **Add USD only.** Never buy crypto manually on the same Gemini account. CIPHER inherits unprotected positions with no cost basis and may sell them at unexpected times.
- **The system never needs to be "turned off."** It runs autonomously on Vercel. Shutdown means closing a work session, not stopping the website.
- **To resume monitoring:** Open the dashboard, check the Activity Feed, Tank tab, and NULL Command Center.
- **Command hierarchy:** Tank → NULL → CIPHER. Higher authority always wins.
- **Truth hierarchy:** Live Exchange Balances → Dozer FIFO ledger.

---

## Live Dashboard
https://crypto-agent-dashboard.vercel.app

---

## Session Operations
See `AGENT.md` for the full startup and shutdown sequence.

---

## Allowed Trading Assets
BTC, ETH, SOL, XRP, LINK, DOGE, LTC, AVAX, BCH

## Hardcoded Guardrails
- Max 2 open positions at any time (new unique assets only)
- 5% hard stop-loss on all positions (runs even when autopilot is off)
- Min trade size $15.00 (NumNum enforced)
- Min net profit ~2.3% above buy price before selling (NumNum enforced — covers 0.4% fee each side + 1.5% profit floor)
- Dynamic tick-size precision per asset (Gemini API lookup — prevents "Invalid quantity" errors)
