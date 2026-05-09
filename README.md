# BASTION — Autonomous Multi-Agent Crypto Trading System

## What This Is
BASTION is a fully autonomous, serverless multi-agent trading system built on Vercel + AWS DynamoDB. It operates 24/7 without any browser, laptop, or human required to stay active.

The system manages a small crypto portfolio across 9 core assets using a four-agent architecture: a strategic commander, a tactical trader, a conflict referee, and a fee math calculator.

---

## The Team

| Agent | Role | Runs |
|---|---|---|
| **NULL** | Strategic Commander — issues hourly directives | Every 60 min |
| **CIPHER** | Tactical Sniper — reads markets, executes trades | Every 5 min |
| **Big Jon** | Conflict Referee — blocks misaligned trades | Every trade attempt |
| **NumNum** | Fee Math Gate — blocks unprofitable trades | Every trade attempt |

For full details on each agent see `/agent-personas/`.

---

## Architecture

```
Vercel Cron (every 5 min)
    └── api/cron.js
        ├── api/scout.js (CIPHER + Big Jon + NumNum)
        ├── api/null-commander.js (NULL — runs hourly)
        ├── api/rollup.js (Deep Dive audit — on demand)
        └── lib/numnum.js (pure fee math — no AI)

AWS DynamoDB
    └── settings table (openPositions, coachNotes, numNumBlocks, etc.)
    └── logs table (all activity feed entries)
```

---

## Trade Gate Order

Every buy or sell clears four gates before capital moves:

```
1. CIPHER proposes (buy/sell/hold)
2. Big Jon — CIPHER/NULL alignment check
3. NumNum — fee viability math check
4. executeTrade() — Gemini Exchange API
```

---

## Key Rules

- **Add USD only.** Never buy crypto manually on the same Gemini account. CIPHER will inherit unprotected positions with no cost basis and may sell them unexpectedly.
- **The system never needs to be "turned off."** It runs autonomously on Vercel infrastructure. Shutdown means closing a work session, not stopping the website.
- **To resume monitoring:** Open the dashboard, check the Activity Feed and NULL Command Center tab.

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
- Max 2 open positions at any time
- 5% hard stop-loss on all positions (runs even when autopilot is off)
- Min trade size $15.00 (NumNum enforced)
- Min net profit 1.5% above buy price before selling (NumNum enforced)
