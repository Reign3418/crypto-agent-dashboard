import createKimiClient from '../lib/ai-client.js';
import { getSettings, updateSettings, logAction, getRecentLogs } from '../lib/db.js';
import { getTodaysDowIntel } from '../lib/dow-analysis.js';

/**
 * TANK — Chief of Operations
 * Runs every 3 hours via tank-cron.js (dedicated cron) and cron.js (fallback).
 *
 * Tank's mandate:
 *   1. Assess system health across all agents
 *   2. Set the mission directive based on demonstrated performance
 *   3. Write a plain-language briefing for the human operator
 *   4. Calibrate the full operating envelope: trade sizes, aggression, market regime
 *
 * Tank's only capital rule: PROTECT CAPITAL.
 * Tank sets ambitious-but-achievable goals grounded in real trade math.
 * Tank does NOT execute trades. Tank does NOT issue hourly tactics (that's NULL).
 * Tank sees the whole battlefield from above.
 */
export async function runTank() {
  const kimi = createKimiClient();

  const [settings, recentLogs] = await Promise.all([
    getSettings(),
    getRecentLogs(360), // last 6 hours of logs
  ]);

  // ── Build performance intelligence ────────────────────────────────────────
  const tradeEvents = recentLogs.filter(l =>
    l.action?.includes('Trade Executed') ||
    l.action?.includes('Autopilot Decision') ||
    l.action?.includes('Bought') ||
    l.action?.includes('Sold') ||
    l.action?.includes('MISSION') ||
    l.action?.includes('NumNum BLOCKED') ||
    l.action?.includes('BIG JON STOPS') ||
    l.action?.includes('HARD STOP-LOSS') ||
    l.action?.includes('Autopilot error') ||
    l.action?.includes('fail')
  );

  // Dozer's clean accounting data — prefer this over raw log arithmetic
  const dozerReport = settings.dozerReport || null;


  const numNumBlocks   = parseInt(settings.numNumBlocks || '0');
  const blockedSymbol  = settings.numNumBlockedSymbol || null;
  const missionCompletions = settings.missionCompletions || 0;
  const missionStartTime   = settings.missionStartTime
    ? new Date(settings.missionStartTime)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const daysSinceMissionStart = ((Date.now() - missionStartTime.getTime()) / (1000 * 60 * 60 * 24)).toFixed(1);

  // Count Big Jon conflicts from recent logs
  const bigJonConflicts = recentLogs.filter(l => l.action?.includes('BIG JON STOPS')).length;
  const failDecisions   = recentLogs.filter(l => l.action?.includes('MISSION FAILED')).length;
  const stopLossFires   = recentLogs.filter(l => l.action?.includes('HARD STOP-LOSS')).length;

  // Previous Tank reports for continuity
  const previousReports = (settings.tankReports || []).slice(0, 2);

  const now = new Date();
  const hour = now.getUTCHours();
  const period = hour >= 6 && hour < 18 ? 'AM' : 'PM';

  // ── Pre-compute DOW intel before prompt construction ─────────────────────
  let dowIntelText = '(DOW Intelligence not yet generated — Scout will build it on the next cycle.)';
  try {
    if (settings.dowReport?.assets) {
      const dowIntel = getTodaysDowIntel(settings.dowReport);
      if (dowIntel) {
        const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const today = new Date().getUTCDay();
        const assetLines = [];
        for (const [sym, data] of Object.entries(settings.dowReport.assets)) {
          const s = data.byDow?.[today];
          if (!s || s.sampleCount < 5) continue;
          assetLines.push(`  ${sym}: avg ${s.avgChangePct > 0 ? '+' : ''}${s.avgChangePct}% | ${s.winRate}% green closes | samples: ${s.sampleCount}`);
        }
        dowIntelText = `DAY-OF-WEEK INTELLIGENCE (90-day seasonal pattern, built by Scout):
Today: ${dowIntel.dayName}
Market DOW posture: ${dowIntel.posture}
Per-asset breakdown for today (${dowIntel.dayName}):
${assetLines.join('\n') || '  Insufficient data'}
Report generated: ${settings.dowReportGeneratedAt || 'unknown'}

USE THIS INTEL TO ADJUST YOUR MISSION:
- If today is a historically strong day (winRate > 60%, avg > +1%), allow CIPHER to run full size on confirmed momentum entries.
- If today is Sunday or a historically weak day, explicitly cap trade size in your mission directive.
- If today is Tuesday with positive bias, mention it: "Tuesday typically sees elevated momentum — prioritize breakout entries in the 9am-11am EST window."`;
      }
    }
  } catch (dowErr) {
    console.warn('[Tank DOW] Non-fatal:', dowErr.message);
  }

  // ── Pre-compute trade sizing BEFORE calling the AI so the prompt contains
  // the real bounds. This prevents Tank's mission text from ever contradicting
  // the deterministic parameters (the '$10 max vs $15 min' bug).
  const liquidForSizing = dozerReport?.capitalBalance?.liquidUSD || 0;
  let preMinTradeSize;
  if (liquidForSizing >= 750)      preMinTradeSize = 50;
  else if (liquidForSizing >= 300) preMinTradeSize = 35;
  else if (liquidForSizing >= 100) preMinTradeSize = 20;
  else                             preMinTradeSize = 15;
  preMinTradeSize = Math.min(Math.max(preMinTradeSize, 15), 75);
  const preMaxTradeSize = Math.min(
    Math.max(liquidForSizing * 0.15, preMinTradeSize),
    Math.max(liquidForSizing * 0.35, preMinTradeSize)
  );

  const tankPrompt = `You are TANK, the Chief of Operations for CIPHER — an autonomous multi-agent crypto trading system.

Your identity: You are named after Tank from The Matrix — the operator who never goes into the simulation but sees every feed, knows where every agent is, and keeps the mission viable.

You run every 3 hours. You are the only agent with full visibility across all time. CIPHER sees 5 minutes. NULL sees 60 minutes. You see everything.

Your mandate:
1. PROTECT CAPITAL above all else. No goal you set should risk the fund's survival.
2. Set a mission directive that is AMBITIOUS BUT MATHEMATICALLY ACHIEVABLE.
3. Write a plain-language briefing for the human operator.
4. Assess each agent's health honestly.

---

DOZER ACCOUNTING REPORT (Verified Capital — 15min cadence, no AI, pure math):
${dozerReport ? `
  Capital Balance:
    Liquid USD available: $${dozerReport.capitalBalance?.liquidUSD?.toFixed(2) || '?'}
    Total deployed in open positions: $${dozerReport.capitalBalance?.totalDeployed?.toFixed(2) || '?'}
    Net realized P&L (closed trades): $${dozerReport.capitalBalance?.netRealizedPL?.toFixed(2) || '?'}
    Unrealized P&L (open positions): $${dozerReport.capitalBalance?.unrealizedPL?.toFixed(2) || '?'}
    NET POSITION (real scorecard): $${dozerReport.capitalBalance?.netPosition?.toFixed(2) || '?'}
    Liquidity status: ${dozerReport.liquidityStatus}
    Reconciliation: ${dozerReport.capitalBalance?.reconciliationNote}

  Performance Score (${dozerReport.performance?.totalClosedTrades || 0} closed trade pairs):
    Win rate: ${dozerReport.performance?.winRate || '0%'} (${dozerReport.performance?.winCount || 0}W / ${dozerReport.performance?.lossCount || 0}L)
    Avg net per trade: $${dozerReport.performance?.avgNetPerTrade?.toFixed(4) || '0'}
    Fee drag: ${dozerReport.performance?.feeDrag || '—'}
    Current streak: ${dozerReport.performance?.currentStreak?.count || 0}-${dozerReport.performance?.currentStreak?.type || 'none'}
    Best trade: ${dozerReport.performance?.bestTrade ? `${dozerReport.performance.bestTrade.symbol} +$${dozerReport.performance.bestTrade.netPL}` : 'none yet'}

  Capital risk: ${dozerReport.capitalRisk}
  External anomalies: ${dozerReport.externalAnomalies?.length || 0} (excluded from P&L)
` : 'Dozer has not run yet — first report generates in the next 15-minute window.'}

Current mission directive: "${settings.missionDirective || 'No active mission.'}"
Mission set by: ${settings.missionSetBy || 'Human'}
Mission running since: ${missionStartTime.toUTCString()} (${daysSinceMissionStart} days)
Mission completions: ${missionCompletions}

Open positions:
${JSON.stringify(settings.openPositions || {}, null, 2)}

NumNum block intelligence:
${numNumBlocks > 0
  ? `NumNum has blocked ${numNumBlocks} consecutive trade(s) on ${blockedSymbol}. The market has not reached the required exit price.`
  : 'NumNum has not blocked recent trades. System operating without friction.'}

${settings.cipherDistressFlag ? `
⚠️⚠️ CIPHER DISTRESS SIGNAL ⚠️⚠️
CIPHER has declared it is STUCK and cannot execute its mission.
Distress reason: "${settings.cipherDistressReason || 'Unknown'}"
Signal raised at: ${settings.cipherDistressAt || 'Unknown'}

As Chief of Operations, YOUR FIRST PRIORITY is to respond to this distress signal.
CIPHER is a field agent doing exactly the right thing by escalating to you rather than panicking.
You MUST address this in your mission directive and your agent health assessment.
Options available to you:
- If the market is ranging and CIPHER is stuck in a losing position, lower the mission's profit requirement and tell CIPHER to hold patiently.
- If conditions warrant, set a mission that explicitly allows CIPHER to exit at a small loss to free capital.
- Issue a directive via NULL that tells CIPHER directly: "I see you. Stand down. I am adjusting."
Do NOT ignore this signal. Do NOT set the same mission as before. Your team needs leadership.
` : ''}

NumNum gate — current calibration (Tank sets this each cycle):
  Floor: ${settings.numNumFloor || '1.5'}% minimum net profit
  Stop-loss: ${settings.numNumStopLoss || '5.0'}% drawdown trigger
  Last set by: Tank (changes each 3h cycle based on Dozer performance)

Recent agent events (last 12 hours):
${JSON.stringify(tradeEvents.slice(0, 30), null, 2)}

Big Jon conflicts in last 12h: ${bigJonConflicts}
CIPHER fail decisions: ${failDecisions}
Hard stop-loss triggers: ${stopLossFires}

NULL's last strategic directive:
"${settings.coachNotes || 'None issued yet.'}"

Hourly cognitive rollup:
"${(settings.cognitiveRollups && settings.cognitiveRollups[0]?.text) || 'No rollup yet.'}"

Macro trend ledger:
"${(settings.macroLedgers && settings.macroLedgers[0]?.text) || 'No macro ledger yet.'}"

${dowIntelText}

Previous Tank reports (your own continuity):
${previousReports.length > 0
  ? previousReports.map(r => `[${r.period} ${r.timestamp}]: ${r.briefing}`).join('\n\n')
  : 'This is your first report.'}

---

AGENT HEALTH ASSESSMENT GUIDE:
- CIPHER: HEALTHY if trading actively, no fail decisions, stop-losses not firing
- NULL: HEALTHY if issuing directives consistently (check coachNotes timestamp)
- BIG JON: HEALTHY if blocking correctly; MONITOR if >2 conflicts in 12h (may indicate NULL directive staleness)
- NUMNUM: HEALTHY if blocking bad math; MONITOR if blocking >10 times (may indicate profit threshold needs calibration)

---

MISSION DIRECTIVE RULES:
- You own the mission directive. The human does NOT set it anymore. You do.
- Your ONLY capital rule: PROTECT CAPITAL. Never set a goal that requires gambling.
- CRITICAL CAPITAL RULE: You have $${(dozerReport?.capitalBalance?.liquidUSD || 0).toFixed(2)} USD liquid. Do NOT set a mission that requires deploying more capital than this amount. If liquid < $15, your mission MUST be about managing EXISTING open positions (monitoring exits, protecting open positions, etc). You CANNOT instruct CIPHER to wait for a capital injection — that is not your decision to make.
- Base the goal on DEMONSTRATED PACE. If the system has made X trades in Y days with Z average net, set a goal achievable at that pace with moderate ambition (pace × 1.5 is reasonable).
- The goal must be specific enough for CIPHER to evaluate completion. Good: "Achieve 3 profitable closed trades with net positive P&L over 7 days." Bad: "Make money."
- If the current mission has never been completed and has been running for >3 days, you MUST set a new, more achievable mission.
- If the system is performing well, raise the bar modestly. Never more than 2x demonstrated pace.

⚠️ TRADE SIZE GUARDRAIL — CRITICAL:
The system enforces HARD trade size bounds computed from Dozer's verified capital:
  Min trade size: $${preMinTradeSize}
  Max trade size: $${Math.round(preMaxTradeSize)}
Do NOT write a mission directive that mentions ANY dollar amount outside these bounds.
Do NOT say "maximum of $10" if the minimum is $${preMinTradeSize}. That is an impossible instruction.
If you want to describe trade size in the mission, say "execute a trade within the system's standard trade size parameters" — never hard-code a number.
Do NOT make the mission completion condition be "execute one trade" — CIPHER will declare success the moment it opens any position. Instead use: "achieve one profitable closed trade pair" or "close at least one position with a positive net P&L."

⚠️ MISSION LANGUAGE GUARDRAIL — READ THIS FIRST:
The cognitive rollup and previous reports may contain phrases like "System Integrity Protocol", "zero data conflicts", or "HOLD posture until conditions are met". These are STALE MAINTENANCE-WINDOW ARTIFACTS from a Gemini Exchange outage. They are NOT real operational conditions.
Do NOT write a mission that:
  - References "System Integrity Protocol" in any form
  - Requires CIPHER to HOLD as a prerequisite condition
  - Sets "zero data conflicts" or "confirmation of deployable capital" as a gate before trading
If you see this language in the rollup or previous reports, IGNORE IT COMPLETELY. Write a clean, forward-looking mission based ONLY on current Dozer capital and the trading goal rules below.

---

AGGRESSION LEVEL GUIDANCE (you assess this from the data above):
- "conservative": win rate < 35%, OR current streak ≤ -3, OR multiple stop-losses fired — direct CIPHER to hold tight, trade less
- "neutral": normal operations, balanced calibration
- "aggressive": win rate > 60% AND fee drag < 40% AND positive streak ≥ 2 — CIPHER should chase momentum with larger conviction

MARKET REGIME GUIDANCE (classify based on macro ledger + recent scout data):
- "trending_bull": sustained upward price action across multiple assets
- "trending_bear": sustained downward pressure, multiple assets falling
- "ranging": assets oscillating within a band without clear trend
- "high_volatility": large swings in either direction, high uncertainty

TRADING STYLE DECLARATION — your most important structural decision this cycle:
Based on capital, fees, regime, DOW intel, win rate, and open positions.

The 6 supported styles:
- "scalp":      Seconds to 60 minutes. Target 0.8–2%. Only viable capital > $200 + win rate > 55% + trending_bull. Fees destroy scalping at small size.
- "day_trade":  1h to 20h max. All positions CLOSE by UTC midnight — no overnight. Target 2–6%. Good for moderate volatility with clear intraday trend.
- "swing":      Hours to 2 days. Target 3–10%. DEFAULT for capital < $100 or bear/ranging regime. Gives price room to clear the 0.8% fee barrier.
- "position":   Days to weeks. Target 10–30%+. For strong macro trends and high-conviction assets. Very patient.
- "hodl":       Indefinite. No exit from health checks. Only hard stop-loss (set at 15%) can close. Declare when human wants long-term crypto exposure.
- "dca":        Dollar-Cost Averaging. Buy fixed $ at fixed intervals regardless of price. No technical analysis. Use when capital is small or volatile and consistent accumulation is the goal.

STYLE DECISION TABLE:
| Condition | Recommended Style |
|---|---|
| Capital < $50 + bear/ranging | swing |
| Capital < $50 + human wants accumulation | dca |
| Human explicitly says "HODL [asset]" | hodl |
| Capital $50–$200 + ranging/moderate vol | day_trade or swing |
| Capital > $200 + win rate > 55% + trending_bull | scalp |
| Capital > $300 + strong multi-week trend | position |
| Capital > $500 + conviction asset + long thesis | hodl |

CURRENT CAPITAL: ~$${liquidUSD.toFixed(0)}. At this size, scalping is brutal — you need 3.3%+ move to clear fees. Default to swing unless compelling reason otherwise.

For DCA mode, also output:
  "dcaAsset": "SOL",        // which asset to accumulate
  "dcaAmount": 15,           // USD per interval
  "dcaIntervalHours": 168    // how often to buy (168 = weekly)

For HODL mode, also output:
  "hodlAsset": "BTC"         // which asset is being HODLed

Return ONLY valid JSON (no markdown, no code blocks):
{
  "missionDirective": "The new mission directive for CIPHER — specific, achievable, capital-protective",
  "missionRationale": "One sentence: the math behind this goal",
  "missionChanged": true | false,
  "tradingStyle": "scalp" | "day_trade" | "swing" | "position" | "hodl" | "dca",
  "tradingStyleReason": "One sentence explaining why this style fits current capital, regime, and position data.",
  "dcaAsset": null,
  "dcaAmount": null,
  "dcaIntervalHours": null,
  "hodlAsset": null,
  "agentHealth": {
    "cipher": "HEALTHY | MONITOR | CRITICAL — one sentence why",
    "null": "HEALTHY | MONITOR | CRITICAL — one sentence why",
    "bigJon": "HEALTHY | MONITOR | CRITICAL — one sentence why",
    "numNum": "HEALTHY | MONITOR | CRITICAL — one sentence why"
  },
  "systemHealth": "STABLE | CAUTION | CRITICAL",
  "briefing": "2-3 sentences in plain English for the human operator.",
  "capitalRisk": "LOW | MEDIUM | HIGH",
  "aggressionLevel": "conservative | neutral | aggressive",
  "regimeDetected": "trending_bull | trending_bear | ranging | high_volatility"
}`;

  let tankOutput;
  try {
    tankOutput = await kimi.chatJSON([{ role: 'user', content: tankPrompt }]);
  } catch (e) {
    await logAction(`⚠️ Tank AI parse error: ${e.message} — keeping current mission.`);
    tankOutput = {
      missionDirective: settings.missionDirective || 'Protect capital and execute disciplined trades.',
      missionRationale: 'Parse error — maintaining current directive.',
      missionChanged: false,
      tradingStyle: settings.tankTradingStyle || 'swing',
      tradingStyleReason: 'Parse error — maintaining previous style.',
      agentHealth: { cipher: 'UNKNOWN', null: 'UNKNOWN', bigJon: 'UNKNOWN', numNum: 'UNKNOWN' },
      systemHealth: 'UNKNOWN',
      briefing: 'Tank encountered a parse error on this report cycle. All systems maintaining current state.',
      capitalRisk: 'LOW',
      aggressionLevel: 'neutral',
      regimeDetected: 'ranging',
    };
  }

  // ── DETERMINISTIC CAPITAL-CONSTRAINT OVERRIDE ────────────────────────────
  // If liquid capital is below the minimum trade size, Tank's AI cannot set
  // a mission requiring new capital deployment. Override it here — no AI
  // hallucination can override a $1.64 account balance.
  const liquidUSD2 = dozerReport?.capitalBalance?.liquidUSD || 0;
  const hasOpenPositions = Object.keys(settings.openPositions || {}).length > 0;

  if (liquidUSD2 < 15 && hasOpenPositions) {
    const positionSummary = Object.entries(settings.openPositions || {})
      .map(([sym, pos]) => {
        const pct = pos.buyPrice > 0
          ? (((pos.currentPrice || pos.buyPrice) - pos.buyPrice) / pos.buyPrice * 100).toFixed(2)
          : '0.00';
        return `${sym} (${pct}% from cost basis)`;
      }).join(', ');

    const forcedMission = `Capital-constrained mode ($${liquidUSD2.toFixed(2)} liquid). Protect open positions and exit when NumNum approves a profitable sell. Do NOT wait for capital injection. Current positions: ${positionSummary}. CIPHER should actively propose sells when prices reach NumNum targets.`;

    if (tankOutput.missionDirective !== forcedMission) {
      await logAction(
        `⚠️ [TANK] Capital-constraint override: liquid $${liquidUSD2.toFixed(2)} < min $${minTradeSize}. Forcing mission to protect-and-exit mode. Previous AI mission: "${tankOutput.missionDirective?.substring(0, 80)}..."`,
        true
      );
      tankOutput.missionDirective = forcedMission;
      tankOutput.missionChanged = true;
    }
  }
  // ── END OVERRIDE ─────────────────────────────────────────────────────────

  // ── Validate tradingStyle and DCA/HODL config ────────────────────────────────
  const validStyles = ['scalp', 'day_trade', 'swing', 'position', 'hodl', 'dca'];
  const tradingStyle = validStyles.includes(tankOutput.tradingStyle) ? tankOutput.tradingStyle : 'swing';
  const tradingStyleReason = tankOutput.tradingStyleReason || 'Defaulting to swing — safest for current capital.';
  // DCA config (only meaningful when tradingStyle === 'dca')
  const dcaAsset         = tankOutput.dcaAsset || null;
  const dcaAmount        = tankOutput.dcaAmount ? parseFloat(tankOutput.dcaAmount) : null;
  const dcaIntervalHours = tankOutput.dcaIntervalHours ? parseFloat(tankOutput.dcaIntervalHours) : null;
  // HODL config
  const hodlAsset        = tankOutput.hodlAsset || null;
  // HODL gets wider stop-loss (15%) — override numNumStopLoss deterministically
  if (tradingStyle === 'hodl') numNumStopLoss = 15.0;

  // ── Build the report object ───────────────────────────────────────────────
  const nextRunMs = 6 * 60 * 60 * 1000; // 6h cadence
  const report = {
    timestamp: now.toISOString(),
    period,
    missionDirective: tankOutput.missionDirective,
    missionRationale: tankOutput.missionRationale,
    missionChanged: tankOutput.missionChanged,
    previousMission: tankOutput.missionChanged ? (settings.missionDirective || null) : null,
    tradingStyle,
    tradingStyleReason,
    agentHealth: tankOutput.agentHealth,
    systemHealth: tankOutput.systemHealth,
    capitalRisk: tankOutput.capitalRisk,
    aggressionLevel: tankOutput.aggressionLevel || 'neutral',
    regimeDetected: tankOutput.regimeDetected || 'ranging',
    briefing: tankOutput.briefing,
    nextRunAt: new Date(Date.now() + nextRunMs).toISOString(),
  };

  // ── Prepend to tankReports (keep last 10) ──────────────────────────────────
  const existingReports = (settings.tankReports || []).slice(0, 9);
  const updatedReports = [report, ...existingReports];

  // ── Deterministic NumNum Calibration ─────────────────────────────────────
  // Pure math. Tank reads Dozer's verified performance data and sets NumNum's
  // operating thresholds. No AI here — just rules grounded in P&L reality.
  const feeDragRaw = dozerReport?.performance?.feeDrag;
  const winRateRaw = dozerReport?.performance?.winRate;
  const feeDragPct = feeDragRaw ? parseFloat(feeDragRaw) : null; // e.g. "82.5%" → 82.5
  const winRatePct = winRateRaw ? parseFloat(winRateRaw) : null; // e.g. "33.3%" → 33.3

  let numNumFloor    = 1.5; // default minimum net profit %
  let numNumStopLoss = 5.0; // default stop-loss %
  let trailingStopLoss = 3.0; // default trailing stop-loss %
  let calibrationReason = 'default (no Dozer data yet)';

  if (feeDragPct !== null || winRatePct !== null) {
    // Rule 1: High fee drag → raise floor (exits need more cushion above fees)
    if (feeDragPct !== null && feeDragPct > 80) {
      numNumFloor = 2.5;
      calibrationReason = `fee drag ${feeDragPct.toFixed(1)}% (>80%) — floor raised to 2.5%`;
    } else if (feeDragPct !== null && feeDragPct > 50) {
      numNumFloor = 2.0;
      calibrationReason = `fee drag ${feeDragPct.toFixed(1)}% (>50%) — floor raised to 2.0%`;
    }

    // Rule 2: Low win rate → floor must compensate for losers
    if (winRatePct !== null && winRatePct < 35) {
      numNumFloor = Math.max(numNumFloor, 2.5);
      calibrationReason += ` | win rate ${winRatePct.toFixed(1)}% (<35%) — floor at least 2.5%`;
    } else if (winRatePct !== null && winRatePct < 50) {
      numNumFloor = Math.max(numNumFloor, 2.0);
      calibrationReason += ` | win rate ${winRatePct.toFixed(1)}% (<50%) — floor at least 2.0%`;
    }

    if (feeDragPct === null && winRatePct === null) {
      calibrationReason = 'default — insufficient Dozer data';
    }
  }

  // Rule 3: Capital risk from Tank AI → calibrate stop-loss
  if (tankOutput.capitalRisk === 'HIGH') {
    numNumStopLoss = 3.0;
    trailingStopLoss = 2.0;
    calibrationReason += ' | risk HIGH — stop-loss tightened to 3% / trail 2%';
  } else if (tankOutput.capitalRisk === 'LOW') {
    numNumStopLoss = 7.0;
    trailingStopLoss = 4.0;
    calibrationReason += ' | risk LOW — stop-loss widened to 7% / trail 4%';
  }

  // Rule 4: GRIDLOCK SELF-CORRECTION
  // If NumNum has blocked the same asset repeatedly, the system is trapped in a
  // fee-burning loop. Tank progressively lowers the floor to allow a controlled exit.
  // Thresholds: >20 blocks (~2h stuck) → floor drops to 1.0%
  //             >40 blocks (~4h stuck) → floor drops to 0.0% (exit at any price above fees)
  // This ONLY applies when the blocked asset is still an open position.
  // The floor resets to normal on the next Tank cycle after a successful trade clears the block.
  const gridlockBlocks  = parseInt(settings.numNumBlocks || '0');
  const gridlockSymbol  = settings.numNumBlockedSymbol || null;
  const openPositions   = settings.openPositions || {};
  const isGridlocked    = gridlockBlocks > 0 && gridlockSymbol && openPositions[gridlockSymbol];

  if (isGridlocked) {
    if (gridlockBlocks >= 40) {
      numNumFloor = 0.0;
      calibrationReason += ` | 🚨 GRIDLOCK OVERRIDE (${gridlockBlocks} blocks on ${gridlockSymbol}) — floor DROPPED to 0%: exit at any price above fees`;
    } else if (gridlockBlocks >= 20) {
      numNumFloor = Math.min(numNumFloor, 1.0);
      calibrationReason += ` | ⚠️ GRIDLOCK WARNING (${gridlockBlocks} blocks on ${gridlockSymbol}) — floor CAPPED at 1%`;
    }
  }

  // Clamp floor and stop to safe operating bounds.
  // EXCEPTION: Gridlock override (40+ blocks) is allowed to bypass the 0.5% hard floor.
  const floorMin = (isGridlocked && gridlockBlocks >= 40) ? 0.0 : 0.5;
  numNumFloor    = parseFloat(Math.min(Math.max(numNumFloor, floorMin), 4.0).toFixed(1));
  numNumStopLoss = parseFloat(Math.min(Math.max(numNumStopLoss, 2.0), 10.0).toFixed(1));
  trailingStopLoss = parseFloat(Math.min(Math.max(trailingStopLoss, 1.5), 6.0).toFixed(1));

  // ── NEW: Position Sizing — dynamic min/max trade sizes based on liquid capital ──────
  const liquidUSD = dozerReport?.capitalBalance?.liquidUSD || 0;

  let minTradeSize;
  if (liquidUSD >= 750)      minTradeSize = 50;
  else if (liquidUSD >= 300) minTradeSize = 35;
  else if (liquidUSD >= 100) minTradeSize = 20;
  else                       minTradeSize = 15;

  let maxTradePct = 0.15; // default 15% of liquid
  if (tankOutput.capitalRisk === 'HIGH')   maxTradePct = 0.10;
  else if (tankOutput.capitalRisk === 'LOW') maxTradePct = 0.20;
  let maxTradeSize = liquidUSD > 0 ? liquidUSD * maxTradePct : 50;

  // Clamp sizes to safe bounds — maxTradeSize must always be >= minTradeSize.
  // Bug: at ~$51 liquid, Math.max(pct, 25) then Math.min(result, liquid*0.25) creates
  // max < min. Fix: ensure max >= min, then cap at 35% of liquid.
  minTradeSize = parseFloat(Math.min(Math.max(minTradeSize, 15), 75).toFixed(0));
  maxTradeSize = parseFloat(Math.min(
    Math.max(liquidUSD * maxTradePct, minTradeSize),  // floor: never below minTradeSize
    Math.max(liquidUSD * 0.35, minTradeSize)           // cap: 35% of liquid (or min if tiny)
  ).toFixed(0));

  // ── NEW: Capital Efficiency Mode — fees eating > 30% of gross PnL ───────────────
  const capitalEfficiencyMode = feeDragPct !== null && feeDragPct > 30;

  // ── NEW: Clamp AI-returned aggressionLevel and regimeDetected ──────────────────
  const validAggression = ['conservative', 'neutral', 'aggressive'];
  const aggressionLevel = validAggression.includes(tankOutput.aggressionLevel)
    ? tankOutput.aggressionLevel : 'neutral';

  const validRegimes = ['trending_bull', 'trending_bear', 'ranging', 'high_volatility'];
  const regimeDetected = validRegimes.includes(tankOutput.regimeDetected)
    ? tankOutput.regimeDetected : 'ranging';
  // ── End Calibration ────────────────────────────────────────────────────────────────

  // ── PROTOCOL REVIEW DUTY ───────────────────────────────────────────────────────────
  // Tank reviews any pending CIPHER protocol proposals every 3h.
  // Promotes, rejects, or requests more data. Approved protocols become CIPHER hard rules.
  const existingProtocols = settings.cipherProtocols || [];
  const pendingProtocols  = existingProtocols.filter(p => p.status === 'pending');
  const activeProtocols   = existingProtocols.filter(p => p.status === 'active');
  let updatedProtocols    = [...existingProtocols];

  if (pendingProtocols.length > 0) {
    try {
      const reviewPrompt = `You are TANK, Chief of Operations. CIPHER has proposed the following trading protocols based on patterns it observed.

Your job: Review each proposal against the current performance data. Be rigorous. Only approve if the evidence is solid (3+ trades showing a clear pattern). Reject noise or proposals built on too few data points.

CURRENT PERFORMANCE DATA:
- Win rate: ${winRatePct !== null ? winRatePct.toFixed(1) + '%' : 'unknown'}
- Fee drag: ${feeDragPct !== null ? feeDragPct.toFixed(1) + '%' : 'unknown'}
- Total trades this era: ${dozerReport?.totalTrades || 0}
- System health: ${report.systemHealth}
- Liquid USD: $${liquidUSD.toFixed(2)}

PENDING PROTOCOLS TO REVIEW:
${pendingProtocols.map((p, i) => `
[${i}] ID: ${p.id}
Rule: "${p.rule}"
Rationale: ${p.rationale}
Confidence: ${p.confidence}
Trade count cited: ${p.tradeCount}
Proposed: ${p.proposedAt}
`).join('\n')}

For each protocol, respond with a JSON array. Each entry must have:
{
  "id": "<protocol id>",
  "decision": "APPROVE" | "REJECT" | "NEEDS_MORE_DATA",
  "reviewNote": "One sentence explaining your decision."
}

Return ONLY the JSON array. No markdown. No explanation outside the array.`;

      const reviews = await kimi.chatJSON([{ role: 'user', content: reviewPrompt }]);

      if (Array.isArray(reviews)) {
        for (const review of reviews) {
          const idx = updatedProtocols.findIndex(p => p.id === review.id);
          if (idx === -1) continue;

          const decision = review.decision?.toUpperCase();
          if (decision === 'APPROVE') {
            // Enforce max 5 active protocols — archive oldest if needed
            const currentActive = updatedProtocols.filter(p => p.status === 'active');
            if (currentActive.length >= 5) {
              const oldestIdx = updatedProtocols.findIndex(p => p.status === 'active');
              if (oldestIdx !== -1) updatedProtocols[oldestIdx].status = 'archived';
            }
            updatedProtocols[idx] = {
              ...updatedProtocols[idx],
              status: 'active',
              tankReview: review.reviewNote,
              tankReviewedAt: new Date().toISOString(),
            };
            await logAction(`✅ [TANK PROTOCOL APPROVED] "${updatedProtocols[idx].rule}" — ${review.reviewNote}`, true);
          } else if (decision === 'REJECT') {
            updatedProtocols[idx] = {
              ...updatedProtocols[idx],
              status: 'rejected',
              tankReview: review.reviewNote,
              tankReviewedAt: new Date().toISOString(),
            };
            await logAction(`❌ [TANK PROTOCOL REJECTED] "${updatedProtocols[idx].rule}" — ${review.reviewNote}`);
          } else {
            updatedProtocols[idx] = {
              ...updatedProtocols[idx],
              status: 'needs_more_data',
              tankReview: review.reviewNote,
              tankReviewedAt: new Date().toISOString(),
            };
            await logAction(`⏳ [TANK PROTOCOL DEFERRED] "${updatedProtocols[idx].rule}" — ${review.reviewNote}`);
          }
        }
      }
    } catch (protoErr) {
      await logAction(`⚠️ Tank protocol review error: ${protoErr.message}`);
    }
  }
  // ── END PROTOCOL REVIEW ────────────────────────────────────────────────────────────

  // ── Write everything to DynamoDB ──────────────────────────────────────────
  await updateSettings({
    tankReports: updatedReports,
    missionDirective: report.missionDirective,
    missionSetBy: 'Tank',
    missionSetAt: now.toISOString(),
    tankMissionLiquidUSD: liquidUSD.toString(),
    cipherProtocols: updatedProtocols,
    numNumFloor:            numNumFloor.toString(),
    numNumStopLoss:         numNumStopLoss.toString(),
    trailingStopLoss:       trailingStopLoss.toString(),
    tankMinTradeSize:       minTradeSize.toString(),
    tankMaxTradeSize:       maxTradeSize.toString(),
    tankCapitalEfficiencyMode: capitalEfficiencyMode,
    tankAggressionLevel:    aggressionLevel,
    tankRegimeDetected:     regimeDetected,
    tankTradingStyle:       tradingStyle,
    tankTradingStyleReason: tradingStyleReason,
    tankTradingStyleSetAt:  now.toISOString(),
    // DCA config
    ...(dcaAsset         ? { tankDcaAsset: dcaAsset }                           : {}),
    ...(dcaAmount        ? { tankDcaAmount: dcaAmount.toString() }               : {}),
    ...(dcaIntervalHours ? { tankDcaIntervalHours: dcaIntervalHours.toString() } : {}),
    // HODL config
    ...(hodlAsset ? { tankHodlAsset: hodlAsset } : {}),
    // Tank has responded to CIPHER's distress. Clear the flag.
    cipherDistressFlag:     false,
    cipherDistressReason:   '',
  });

  // ── Log Tank's activity ───────────────────────────────────────────────────
  const healthIcons = { HEALTHY: '✅', MONITOR: '⚠️', CRITICAL: '🚨', UNKNOWN: '❓', STABLE: '✅', CAUTION: '⚠️' };

  await logAction(
    `🎯 [TANK ${period} REPORT] System: ${healthIcons[report.systemHealth] || ''}${report.systemHealth} | Capital Risk: ${report.capitalRisk} | ${report.briefing}`,
    true
  );

  await logAction(
    `📊 [TANK] Calibrated → floor: ${numNumFloor}% | stop: ${numNumStopLoss}% | trail: ${trailingStopLoss}% | min: $${minTradeSize} | max: $${maxTradeSize} | aggression: ${aggressionLevel} | regime: ${regimeDetected} | style: ${tradingStyle.toUpperCase()} | capEffMode: ${capitalEfficiencyMode} | reason: ${calibrationReason}`
  );

  await logAction(
    `📐 [TANK STYLE] Trading style set to ${tradingStyle.toUpperCase()} — ${tradingStyleReason}`,
    true
  );

  if (report.missionChanged) {
    await logAction(
      `📋 [TANK] Mission updated: "${report.missionDirective}" (${report.missionRationale})`,
      true
    );
  }

  await logAction(
    `🤖 [TANK] Agent health — CIPHER: ${tankOutput.agentHealth?.cipher?.split('—')[0].trim()} | NULL: ${tankOutput.agentHealth?.null?.split('—')[0].trim()} | Big Jon: ${tankOutput.agentHealth?.bigJon?.split('—')[0].trim()} | NumNum: ${tankOutput.agentHealth?.numNum?.split('—')[0].trim()}`
  );

  return report;
}

// HTTP handler for direct invocation
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const report = await runTank();
    return res.status(200).json({ ok: true, report });
  } catch (e) {
    console.error('[Tank Error]:', e);
    await logAction(`❌ Tank error: ${e.message}`);
    return res.status(500).json({ error: e.message });
  }
}
