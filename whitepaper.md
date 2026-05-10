# CIPHER
## Autonomous Multi-Agent Crypto Trading System
### System Whitepaper — v2.0

> *"I know what you're thinking, 'cause right now I'm thinking the same thing. Actually, I've been thinking it ever since I got here: Why oh why didn't I take the BLUE pill?"*
> — Cypher, The Matrix
>
> *We took the red pill. We built the system that never sleeps.*

---

## 1. Overview

**CIPHER** is a fully autonomous, multi-agent crypto trading system built on a deterministic-first philosophy: financial decisions must be mathematically verifiable, while strategic intelligence is delegated to a structured hierarchy of AI agents.

The system manages a live crypto portfolio through a 5-minute trading cycle, supervised by a 6-agent team operating across two purpose-built rings:

- **The Combat Ring** — agents that strategize and execute trades
- **The Back Office Ring** — agents that keep the books clean and the ship operational

CIPHER runs 24 hours a day, 7 days a week, without human intervention. The human operator's only required action is depositing USD. The team handles everything else.

---

## 2. The Problem CIPHER Solves

Autonomous trading systems typically fail in one of three ways:

1. **They're black boxes.** A single AI makes all decisions with no audit trail. When it loses money, nobody knows why.
2. **They're math-blind.** LLMs are asked to calculate fees, P&L, and thresholds — and they guess. Badly.
3. **They have no institutional memory.** Each cycle starts fresh. The system can repeat the same losing pattern 50 times because nothing is tracking the streak.

CIPHER solves all three:
- Every decision is logged, attributed to a specific agent, and auditable
- All financial math is handled by deterministic modules — no AI token ever touches a fee calculation
- A persistent hierarchy of AI memory (5min → 1hr → 12hr) ensures the team learns from history

---

## 3. Architecture — The Two Rings

### 3.1 The Combat Ring

```
TANK  (every 12 hours)
├── Chief of Operations
├── Owns the mission directive autonomously
├── Assesses all agent health
└── Writes the 12h operational briefing

NULL  (every 1 hour, + reactive on any asset >3% move)
├── Strategic Commander
├── Reads Tank's frame and CIPHER's last hour
└── Issues tactical directive to CIPHER

CIPHER  (every 5 minutes)
├── Tactical Execution Engine
├── Reads mission (Tank-set) + directive (NULL-set)
└── Proposes: buy / sell / hold / complete / fail

BIG JON  (every trade attempt)
├── Conflict Referee
├── Evaluates SPIRIT of NULL's directive, not literal text
└── Blocks trades that fundamentally violate strategic intent

NUMNUM  (every trade attempt)
├── Fee Math Gate
├── Deterministic arithmetic — no AI
└── Enforces minimum 2.3% net profit threshold after all fees
```

### 3.2 The Back Office Ring

```
DOZER  (every 15 minutes)
├── Chief Accounting Officer
├── FIFO trade pair matching → realized P&L
├── Capital reconciliation (deployed + liquid + unrealized)
├── Running performance score (win rate, avg net, fee drag, streak)
├── Concentration risk monitoring (% of capital per asset)
└── Writes verified data → Tank reads it every 12h

CIPHER AUDIT  (on demand)
└── Deep Dive forensic audit — human-initiated financial review
```

### 3.3 The Information Flow

```
DOZER writes dozerReport every 15 min
         ↓
TANK reads dozerReport every 12h
TANK writes missionDirective + tankReports
         ↓
NULL reads tankReports every 1h (+ on reactive trigger)
NULL writes coachNotes
         ↓
CIPHER reads missionDirective + coachNotes every 5min
CIPHER proposes action
         ↓
BIG JON checks spirit of directive
         ↓
NUMNUM checks fee math
         ↓
Trade executes → cost basis written → Dozer reconciles on next 15min tick
```

---

## 4. Agent Profiles

### TANK — Chief of Operations
**Named after:** Tank from The Matrix — the operator who never went into the simulation but saw every feed and kept the mission viable.

**Mandate:** Protect capital. Set achievable missions. See the full picture across all time.

**Authority:** Tank owns the mission directive. He is the only agent that can change what the team is working toward. Tank cannot be overridden by NULL or CIPHER. Tank's mission can be overridden by the human operator directly if needed.

**Guardrails:**
- Every goal must be grounded in demonstrated trade pace math
- Goals must protect capital — Tank may never set a goal that requires gambling
- If a mission has run >3 days with 0 completions, Tank must set a new goal

---

### NULL — Strategic Commander
**Identity:** Calm, strategic, data-driven. Thinks in hours, not minutes.

**Mandate:** Observe CIPHER's last hour of behavior. Issue one concise tactical directive that aligns with Tank's strategic frame. Never trade directly.

**Key constraint:** NULL may only instruct CIPHER about: asset focus, trade frequency, momentum signals, hold/resume signals. NULL may not instruct CIPHER to execute a specific trade amount or bypass the asset guardrail.

**Reactive trigger:** If any core asset moves >3% in an hour, NULL fires immediately before the next trade check — regardless of scheduled timing.

---

### CIPHER — Tactical Execution Engine
**Identity:** Elite autonomous fund manager. Reads everything, executes with precision.

**Context on every cycle:**
- Tank's 12h operational briefing
- Tank-set mission directive
- NULL's tactical directive (coachNotes)
- Live market data (top movers, bid/ask spreads)
- Live news feed (cross-referenced with price action)
- Hourly cognitive rollup (recent post-mortem)
- Macro trend ledger (12h/24h context)
- Open positions with cost basis
- Last 5 minutes of activity (neural feedback loop)

**Decisions:** buy / sell / hold / complete (mission success) / fail (mission collapse)

---

### Big Jon — Conflict Referee
**Identity:** The referee that keeps CIPHER and NULL aligned.

**Key design decision:** Big Jon evaluates the **intent** of NULL's directive, not its literal text. If NULL said "chase momentum" and LINK has stalled but BTC is surging, Big Jon recognizes that buying BTC aligns with the spirit of the directive — even if NULL specifically mentioned LINK.

**True conflicts Big Jon blocks:**
- NULL said HOLD → CIPHER is trading anyway
- NULL said avoid an asset → CIPHER is buying that exact asset with no momentum justification
- NULL said raise profit thresholds → CIPHER is selling at a clear loss with no tactical reason

**Big Jon never disables autopilot.** Autopilot only halts if CIPHER issues a `fail` decision (genuine mission collapse).

---

### NumNum — Fee Math Gate
**Identity:** The pure mathematician. The only agent that has never been wrong.

**Mandate:** Ensure no trade executes unless the projected net return exceeds fees + minimum profit threshold (2.3% of trade value). No AI. No reasoning. Just math.

**Block tracking:** Every consecutive NumNum block is written to DynamoDB. NULL reads the block count in every hourly audit. If NumNum has blocked an asset 10+ times, NULL knows the market hasn't moved to the exit threshold and can direct CIPHER to shift focus.

---

### Dozer — Chief Accounting Officer
**Named after:** Dozer from The Matrix — Tank's brother. Born free, never jacked in. He ran the ship's systems so the crew could fight.

**Mandate:** Keep the books. Make sure everyone else has accurate numbers to work from.

**No AI. Pure math.** Dozer's FIFO algorithm always produces the same answer for the same inputs. Every number is traceable. Every trade pair is documented.

**What Dozer owns:**
- Capital balance (liquid + deployed + realized + unrealized)
- FIFO trade pairs (buy→sell matching with realized P&L per pair)
- Running performance score (win rate, avg net, fee drag, streak)
- Concentration risk (% of capital per asset, flags HIGH/ELEVATED)
- External anomaly registry (sells with no matching buy — excluded from P&L)
- Liquidity monitoring (CRITICAL < $5, LOW < $15)

---

## 5. Design Philosophy

### 5.1 Deterministic Math, AI Strategy
The most important architectural decision in CIPHER: **financial math is never delegated to an LLM.**

LLMs are probabilistic. They reason about numbers rather than computing them. For fee calculations, P&L reconciliation, and trade viability — this is unacceptable. A 0.1% error in fee math can turn a profitable trade into a losing one.

CIPHER assigns math to deterministic modules (NumNum, Dozer) and reserves AI for what AI does well: pattern recognition, strategic adaptation, and plain-language synthesis.

### 5.2 Spirit Over Letter
Big Jon's upgrade to spirit-of-directive reasoning is one of the most important design decisions in CIPHER v2. An agent that checks the literal text of a directive will fail the moment markets move faster than the directive's refresh rate (60 minutes).

By asking "what did NULL *intend*?" rather than "what did NULL *say*?", Big Jon allows the team to respond to fast-moving market conditions without requiring an immediate NULL refresh on every trade.

The reactive NULL trigger (fires on >3% movers) provides the backup: if conditions change dramatically, NULL refreshes automatically anyway.

### 5.3 No Agent Has Unchecked Authority
Every agent in CIPHER is bounded:

| Agent | Bounded by |
|---|---|
| CIPHER | Big Jon (alignment) + NumNum (math) + Tank (mission) + NULL (tactics) |
| NULL | Tank (strategic frame) + cannot execute trades |
| Big Jon | Cannot disable autopilot, cannot override NumNum |
| NumNum | Cannot override the hard stop-loss, cannot make strategic calls |
| Tank | Cannot trade, cannot override the stop-loss, cannot disable any agent |
| Dozer | Read-only to the rest of the system — cannot influence any decision |

The hard stop-loss (5% drop from buy price) runs outside the AI decision loop entirely. No agent can disable it. It is the system's floor.

### 5.4 Olympic Rings — The Scalability Model
CIPHER is designed as interconnected rings of specialized teams, not a monolithic system. Each ring is self-contained:

- **Combat Ring** handles market intelligence and execution
- **Back Office Ring** handles accounting and forensics

Additional rings can be added without disrupting existing ones. Planned future rings:
- **Intelligence Ring** — market regime detection, opportunity cost analysis (the Oracle agent)
- **Risk Ring** — position sizing, drawdown limits, volatility-adjusted thresholds

---

## 6. Infrastructure

| Component | Service | Purpose |
|---|---|---|
| Serverless functions | Vercel | Hosts all API endpoints including the cron orchestrator |
| Database | AWS DynamoDB | Persists all system state (settings, logs, reports) |
| Exchange | Gemini API | Live market data and trade execution |
| AI models | Google Gemini 2.5 Flash | Powers CIPHER, NULL, Tank, Big Jon |
| Frontend | React + Vite | Dashboard served as static site |

**Key property:** No local processes. CIPHER runs entirely on cloud infrastructure. The human operator does not need to have any software running. The system operates 24/7 without a local machine.

---

## 7. The Dashboard

| Tab | What You See |
|---|---|
| 🖥️ Terminal | Live portfolio, CIPHER's last scout report, open positions |
| 🎯 Tank | Tank's two most recent 12h briefings + Dozer's live accounting panel |
| 🧠 NULL | NULL's current directive, last hour of intelligence |
| ⚡ Strategy | Strategy evaluation panel |
| 📋 Logs | Full activity feed — filterable by level, newest-first, pause/resume |

**The Tank tab is always-on.** No buttons to generate a report — Tank's briefings are always there when you open the page. Dozer's accounting numbers update every 60 seconds automatically.

---

## 8. Capital Rules (Non-Negotiable)

1. **Deposit USD only.** Never buy crypto on the exchange manually.
2. **If you buy manually by mistake:** register the position immediately via the admin endpoint before CIPHER's next 5-minute cycle. Provide symbol, amount, and fill price.
3. **Dozer tracks everything.** Any sell with no matching buy becomes an external anomaly in Dozer's report — excluded from P&L and flagged for the human.
4. **Tank sets the goal.** The human no longer writes the mission directive. Tank does, based on demonstrated trade pace and the capital preservation mandate.

---

## 9. Current Performance Snapshot
*(Updated: CIPHER Era, Day 9)*

| Metric | Value |
|---|---|
| Era | CIPHER |
| Total trades executed | 15 |
| Open positions | LINK, SOL |
| Active agents | 6 (Tank, NULL, CIPHER, Big Jon, NumNum, Dozer) |
| System rings | 2 (Combat + Back Office) |
| Autonomous since | Day 1 of CIPHER era |

---

## 10. The Name

**CIPHER** — *a projecting part of a fortification; a well-fortified position.*

The system does not seek spectacular gains at the cost of survival. It holds its position, defends capital, and advances methodically. Every gate, every agent, every review cycle is a wall. The fund survives because the walls hold.

> *"I know you're out there. I can feel you now. I know that you're afraid... you're afraid of us. You're afraid of change."*
> — Neo, The Matrix
>
> The market is afraid of CIPHER. Or it should be.

---

*CIPHER Whitepaper v2.0 — CIPHER Era*
*Architecture designed and built in collaboration with Antigravity AI*

