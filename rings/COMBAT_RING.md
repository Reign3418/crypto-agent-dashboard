# COMBAT RING
## BASTION Multi-Agent Trading System

> *"I know kung fu." — The information goes in. The agent acts on it. That's the whole game.*

---

## Ring Mandate

The Combat Ring is responsible for **market intelligence, strategic direction, and trade execution.** Every decision that touches the exchange runs through this ring.

The ring operates as a strict chain of command — no agent executes out of sequence, no agent can override an agent above it, and no agent has authority it hasn't been explicitly given.

**Agents in this ring:** TANK · NULL · CIPHER · BIG JON · NUMNUM

---

## Ring Architecture

```
TANK  (every 12 hours)
│  Chief of Operations. Owns the mission. Sees all time. Reads Dozer's books.
│
└── NULL  (every 1 hour + reactive on any asset >3% move)
│      Strategic Commander. Translates Tank's frame into hourly tactics.
│
└── CIPHER  (every 5 minutes)
│      Tactical Execution. Reads mission + directive. Proposes the trade.
│
└── BIG JON  (every trade attempt)
│      Conflict Referee. Spirit-of-directive alignment check.
│
└── NUMNUM  (every trade attempt)
       Fee Math Gate. Deterministic arithmetic. No AI. Cannot be overridden.
```

---

## Internal Gate Order

Every trade goes through this exact sequence. No exceptions.

```
1. CIPHER runs market analysis and proposes: buy / sell / hold / complete / fail

2. [REACTIVE CHECK] — Did any asset move >3% since NULL last spoke?
     YES + >15min since last NULL run → fire immediate NULL refresh
     coachNotes updated before trade evaluation continues

3. BIG JON alignment check
     Evaluates SPIRIT of NULL's directive, not literal text
     TRUE conflict → trade BLOCKED, warning logged (autopilot stays ON)
     Aligned → proceed

4. NUMNUM fee math gate
     Projected net < 2.3% after fees → BLOCKED, numNumBlocks incremented
     Clears threshold → trade proceeds

5. Trade executes
     Cost basis written to openPositions
     numNumBlocks reset to 0
```

---

## External Interfaces

### What This Ring Reads FROM Other Rings
| Source | Field | Used By |
|---|---|---|
| Back Office Ring (Dozer) | `dozerReport` | TANK — reads capital balance and performance score |
| Back Office Ring (Dozer) | `concentrationRisk` | TANK — factors into agent health assessment |

### What This Ring Writes FOR Other Rings
| Field | Written By | Used By |
|---|---|---|
| `missionDirective` | TANK | CIPHER (execution context), NULL (strategic frame) |
| `tankReports` | TANK | TankView dashboard, future Intelligence Ring agents |
| `coachNotes` | NULL | CIPHER (tactical directive), Dozer (context) |
| `openPositions` | CIPHER (via trade.js) | Dozer (cost basis for FIFO pairs) |
| `numNumBlocks` | NUMNUM | NULL (stall intelligence), TANK (health assessment) |

---

## Agent Profiles

---

### TANK — Chief of Operations
**Named after:** Tank from The Matrix — the operator who never goes into the simulation but sees every feed and keeps the mission viable.
**Model:** `gemini-2.5-flash`
**Cadence:** Every 12 hours (AM + PM)
**File:** `api/tank.js`

**Identity:** Tank does not trade. Does not issue hourly tactics. Does not go into the trenches. Tank stands above the battlefield with full visibility across all time and all agents, and asks the only question that matters: *is the system still viable?*

**Reads:**
- `dozerReport` — Dozer's verified capital balance and performance score
- `missionDirective`, `missionCompletions`, `missionStartTime`
- `openPositions`, `numNumBlocks`, `numNumBlockedSymbol`
- `coachNotes` — NULL's last directive
- `cognitiveRollups`, `macroLedgers` — AI memory chains
- `tankReports` — own previous reports (continuity)
- Last 720 log entries (12h window)

**Writes:**
```json
{
  "timestamp": "ISO string",
  "period": "AM | PM",
  "missionDirective": "New mission CIPHER will execute",
  "missionRationale": "trades/day × avg net = achievable target",
  "missionChanged": true | false,
  "previousMission": "Old directive if changed",
  "agentHealth": {
    "cipher": "HEALTHY | MONITOR | CRITICAL — reason",
    "null": "HEALTHY | MONITOR | CRITICAL — reason",
    "bigJon": "HEALTHY | MONITOR | CRITICAL — reason",
    "numNum": "HEALTHY | MONITOR | CRITICAL — reason"
  },
  "systemHealth": "STABLE | CAUTION | CRITICAL",
  "capitalRisk": "LOW | MEDIUM | HIGH",
  "briefing": "2-3 plain English sentences for the human operator",
  "nextRunAt": "ISO string"
}
```

**Mission Directive Rules:**
| Rule | Detail |
|---|---|
| Tank owns the goal | The human no longer sets `missionDirective`. Tank does. |
| Capital first | No goal may risk the fund's survival. Protect capital is the hard floor. |
| Base on demonstrated pace | `trades/day × avg net = achievable`. Aim for pace × 1.5. |
| Be specific | Good: "3 profitable closed trades over 7 days." Bad: "Make money." |
| Replace stale goals | Mission never completed in >3 days → Tank MUST set a new one. |
| Don't lower bar infinitely | Never set a goal so easy it stops driving quality. |

**Agent Health Assessment:**
| Agent | HEALTHY | MONITOR | CRITICAL |
|---|---|---|---|
| CIPHER | Active trades, 0 fail decisions, no stop-losses | Reduced activity, holding long | Fail decision issued / stop-loss fired |
| NULL | Issuing directives hourly | Timestamp stale (>2h) | No directives issuing |
| Big Jon | <2 conflicts per 12h | >2 conflicts | Blocking every trade |
| NumNum | Blocking bad math | >10 blocks in 12h | Not functioning |

**Does NOT:**
- Trade
- Issue hourly tactics
- Override the hard stop-loss
- Disable any agent
- Interact with the exchange API

**Dashboard:** 🎯 Tank tab — last two 12h briefings always visible, auto-refreshes every 60s.

---

### NULL — Strategic Commander
**Identity:** Calm, strategic, data-driven. Thinks in hours, not minutes. Never goes into the trenches.
**Model:** `gemini-2.5-flash`
**Cadence:** Every 60 minutes (cron) + immediately on any asset >3% move (reactive trigger)
**File:** `api/null-commander.js`

**Mandate:** Observe CIPHER's last hour of behavior. Issue one concise tactical directive aligned with Tank's strategic frame. Never trade directly.

**Reads (every cycle):**
- Tank's latest `tankReports` entry — 12h strategic frame
- Last 60 minutes of CIPHER's activity logs
- `openPositions` — current holdings
- `missionDirective` — Tank-set goal
- `coachNotes` — own previous directive
- `macroLedgers` — long-term context
- NumNum stall intelligence (`numNumBlocks`, `numNumBlockedSymbol`, `numNumBlockedPrice`)

**Writes:** `coachNotes` in this exact format:
```
[NULL Strategic Command - HH:MM UTC]: <one to two sentences of direct tactical instruction for CIPHER.>
```

**Three-question framework (fee math excluded — that's NumNum):**
1. Is there a clear momentum winner in the last hour?
2. Is CIPHER overtrading / churning? (>3 trades, no directional conviction)
3. Is the portfolio positioned correctly given Tank's frame and NumNum stall data?

**Guardrails — NULL MAY ONLY instruct CIPHER about:**
- Asset focus
- Trade frequency
- Momentum signals
- Hold / resume signals

**NULL MAY NOT:**
- Instruct CIPHER to execute a specific trade amount
- Bypass the ALLOWED_ASSETS guardrail
- Disable the Emergency Stop
- Override NumNum

---

### CIPHER — Tactical Execution Engine
**Identity:** Elite autonomous fund manager. Reads everything, executes with precision.
**Model:** `gemini-2.5-flash`
**Cadence:** Every 5 minutes (cron)
**File:** `api/scout.js`

**Context on every cycle:**
- Tank's 12h operational briefing
- Tank-set mission directive
- NULL's tactical directive (`coachNotes`)
- Live market data (top movers, bid/ask spreads)
- Live news feed (cross-referenced with price action)
- Hourly cognitive rollup (recent post-mortem memory)
- Macro trend ledger (12h/24h context)
- Open positions with cost basis
- Last 5 log entries (neural feedback loop)

**Allowed assets:** `BTC, ETH, SOL, XRP, LINK, DOGE, LTC, AVAX, BCH`

**Decisions:**
```json
{
  "decision": "buy" | "sell" | "hold" | "complete" | "fail",
  "symbol": "LINK",
  "amount": 30.00,
  "fundingSource": "USD",
  "reasoning": "One sentence explanation.",
  "optimizationSuggestion": "Only if decision is complete."
}
```

**Hardcoded guardrails (cannot be overridden by NULL or Tank):**
- Maximum 2 open positions at any time
- 5% hard stop-loss on all positions — triggers panic sell regardless of autopilot state
- `decision: "fail"` triggers emergency halt and disables autopilot

**Does NOT:**
- Calculate fee viability (NumNum)
- Determine NULL alignment (Big Jon)
- Set strategy (NULL)
- Trade outside the approved asset list

---

### BIG JON — Conflict Referee
**Named after:** John McCarthy — the gold standard UFC referee.
**Model:** `gemini-2.5-flash` (single inference call per trade attempt)
**Cadence:** Every trade attempt
**File:** `api/scout.js` (inline, runs before NumNum)

**Identity:** Not a fighter. Not a strategist. Not a mathematician. Big Jon only cares about one thing: *are CIPHER and NULL saying the same thing right now?*

**Key design principle — SPIRIT, not LETTER:**
NULL issues directives once per hour. Markets move in minutes. Big Jon evaluates the *intent* of NULL's directive, not its literal text. If NULL said "chase momentum" and LINK has stalled but BTC is surging, a BUY BTC may align with NULL's intent even if NULL specifically mentioned LINK.

**True conflicts Big Jon blocks:**
- NULL said HOLD → CIPHER is trading anyway
- NULL said avoid a specific asset → CIPHER is buying that exact asset with no momentum justification
- NULL said raise profit thresholds → CIPHER is selling at a clear loss with no tactical reason

**NOT conflicts:**
- CIPHER trading a different asset than NULL mentioned IF that asset now has stronger momentum
- CIPHER HOLDing when NULL said to trade (holding is always safe)

**Gate position:** Runs SECOND — after CIPHER proposes, before NumNum runs math.

**Critical rule:** Big Jon NEVER disables autopilot on a conflict. He logs a warning and blocks the single trade. Autopilot only halts if CIPHER issues `decision: "fail"`.

**Fail-safe:** If Big Jon himself errors (technical failure), the trade is allowed through. Fail-open, not fail-closed.

---

### NUMNUM — Fee Math Gate
**Identity:** Pure deterministic math. No AI. No opinions. No exceptions.
**Cadence:** Every trade attempt
**File:** `lib/numnum.js`

**Mandate:** Before any trade executes, verify the projected net return clears fees + minimum profit threshold. NumNum answers one question: *"Will this trade make money after Gemini takes its cut?"*

**Current thresholds:**
| Parameter | Value |
|---|---|
| Fee rate per side | 0.4% (Gemini ActiveTrader taker) |
| Round-trip fee | 0.8% total |
| Minimum net profit target | 1.5% above buy price |
| Combined sell threshold | ~2.3% above buy price |
| Minimum trade size | $15.00 USD |

**Rules:**
- APPROVE SELL if `(currentPrice - buyPrice) / buyPrice ≥ 1.5%` net of fees
- REJECT SELL if threshold not cleared
- APPROVE BUY if trade size ≥ $15.00
- REJECT BUY if trade size < $15.00
- ALWAYS APPROVE sell when 5% hard stop-loss triggers (capital protection overrides profit requirement)
- DEFER to CIPHER if no buy price on record (fail-open)

**NumNum stall feedback loop:**
Every block writes to DynamoDB:
- `numNumBlocks` — consecutive block count
- `numNumBlockedSymbol` — which asset is stalling
- `numNumBlockedPrice` — target price needed to clear the gate
- `numNumLastBlockTime` — timestamp

NULL reads this every hour. Tank reads it every 12h. High block counts trigger directive adjustments (shift focus to different asset).

On successful trade execution: counter resets to 0.

**Does NOT:**
- Make market judgments
- Set strategy
- Interact with the exchange API
- Override the hard stop-loss (hardcoded bypass-proof)

---

## Ring-Level Rules

1. **No agent executes out of gate order.** The sequence is Tank → NULL → CIPHER → Big Jon → NumNum. No shortcuts.
2. **No agent disables another agent's core function.** NULL cannot turn off NumNum. Tank cannot bypass Big Jon. Big Jon cannot disable autopilot.
3. **The hard stop-loss is inviolable.** It runs outside the AI decision loop. No agent can disable it.
4. **Fail-safe direction is always ALLOW, not BLOCK.** If a gate malfunctions (Big Jon errors, NumNum fails), the trade proceeds. The risk of a single bad trade is lower than the risk of the system freezing.
5. **Tank's capital mandate is the floor.** No agent may take action that risks fund survival.
6. **Spirit over letter.** When in doubt about a directive's meaning, evaluate intent, not literal text.

---

## Operational Procedures

### Adding a New Combat Ring Agent
1. Write the agent file in `api/`
2. Add it to this ring doc under **Agent Profiles** with full role, reads, writes, guardrails
3. Update the **Internal Gate Order** to show where it fits in the sequence
4. Update `AGENT.md`'s architecture file table
5. Update `api/cron.js` if a new cadence is needed

### Changing an Existing Agent's Logic
1. Update the agent's code file
2. Update this ring doc — specifically the agent's profile section
3. Update the **Internal Gate Order** if the gate sequence changes
4. Commit: `git add rings/ && git commit -m "Combat Ring: [agent] — [what changed]"`

### Retiring a Combat Ring Agent
1. Archive the agent file (don't delete — keep for reference)
2. Remove from **Agent Profiles** in this doc
3. Remove from the gate order diagram
4. Update `AGENT.md` and `whitepaper.md`

---

## 📌 Pinned Future Enhancements

> These are design ideas that have been deliberately deferred — not forgotten. Do not implement without revisiting the rationale first.

---

### 1. Smart DCA — Allow Adding to Green Positions
**Pinned:** 2026-05-11
**Context:** The current `CHURN PREVENTION` guardrail in `lib/trade.js` blocks ALL buys when 2 positions are held — including buying more of an asset already in the portfolio (DCA). With $51 total capital and 2 open positions, any remaining liquid USD is completely locked out of deployment.

**Current behavior:**
```
openPositions >= 2 → ALL buys blocked, including add-to-existing
```

**Proposed evolution:**
```
New unique positions: max 2 (unchanged)
Adding to an EXISTING position: allowed IF that position is currently ABOVE buy price (green)
Adding to a LOSING position (below buy price): still blocked — no averaging down
```

**Why deferred:** At early account size (~$50), doubling into any position is high-risk. The flat block is the safer default until the system has a proven win rate and the team has confidence in CIPHER's entry timing. Revisit when account is >$200 and win rate >50%.

**Implementation note:** The check lives in `lib/trade.js` lines ~29-38. Change from counting `openPositions >= 2` to counting `newUniquePositions` (assets NOT already in `settings.openPositions`). Add a secondary check: if the asset IS already held, allow only if `currentPrice > buyPrice`.
