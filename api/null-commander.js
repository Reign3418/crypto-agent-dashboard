import { GoogleGenAI } from '@google/genai';
import { getRecentLogs, getSettings, updateSettings, logAction } from '../lib/db.js';

/**
 * NULL — Strategic Commander
 * Runs every 60 minutes via cron.js.
 * Analyzes CIPHER's last hour of activity and autonomously rewrites
 * the coachNotes field so CIPHER adjusts tactics on its next 5-min cycle.
 */
export async function runNullCommander() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_AI_API_KEY });

  const [logs, settings] = await Promise.all([
    getRecentLogs(60),
    getSettings(),
  ]);

  // Build a compact performance summary for NULL to analyze
  const tradeLines = logs.filter(l =>
    l.action?.includes('Bought') ||
    l.action?.includes('Sold') ||
    l.action?.includes('Fee') ||
    l.action?.includes('HOLD') ||
    l.action?.includes('GUARDRAIL') ||
    l.action?.includes('Autopilot Decision') ||
    l.action?.includes('Mission') ||
    l.action?.includes('error') ||
    l.action?.includes('failed')
  );

  // Build NumNum stall intelligence for NULL
  const numNumBlocks    = parseInt(settings.numNumBlocks || '0');
  const blockedSymbol   = settings.numNumBlockedSymbol || null;
  const blockedPrice    = settings.numNumBlockedPrice   || null;
  const numNumContext   = numNumBlocks > 0
    ? `NumNum has blocked ${numNumBlocks} consecutive sell attempt(s) on ${blockedSymbol}. The market has not reached the required sell price of $${blockedPrice}. CIPHER keeps wanting to exit but the math won't clear.`
    : `NumNum has not blocked any trades recently. The team is operating without friction.`;

  // Tank briefing — NULL needs the 12h strategic frame to issue accurate hourly directives
  const latestTankReport = (settings.tankReports && settings.tankReports.length > 0)
    ? settings.tankReports[0]
    : null;

  // ── Staleness check — prevent stale CRITICAL reports from locking the system ──
  // If Tank's last report is >3h old and said CRITICAL, NULL should use current
  // conditions (liquid, logs) rather than blindly enforcing an outdated lockdown.
  const missionSetAt     = settings.missionSetAt ? new Date(settings.missionSetAt) : null;
  const tankReportAgeMin = missionSetAt ? Math.floor((Date.now() - missionSetAt.getTime()) / 60000) : 999;
  const tankReportAgeHrs = (tankReportAgeMin / 60).toFixed(1);
  const currentLiquidUSD = settings.dozerReport?.capitalBalance?.liquidUSD || 0;
  const tankIsCritical   = latestTankReport?.systemHealth === 'CRITICAL';
  const tankIsStale      = tankReportAgeMin > 180; // older than 3 hours
  const staleOverrideActive = tankIsCritical && tankIsStale && currentLiquidUSD > 5;

  // Tank's live operating envelope — recalibrates every 6h
  const tankAggressionLevel = settings.tankAggressionLevel || 'neutral';
  const tankRegimeDetected  = settings.tankRegimeDetected  || 'unknown';

  const prompt = `You are NULL, the Strategic Commander of CIPHER — an autonomous multi-agent crypto trading system.

COMMAND CHAIN: TANK (12h, Chief of Operations) → YOU (1h, Strategic Commander) → CIPHER (5min, Tactical Execution)

Your role in the chain:
- TANK sets the mission and sees the full picture across days.
- YOU translate Tank's strategic vision into hourly tactical instructions for CIPHER.
- CIPHER executes. You do not execute.

Your mandate: Observe CIPHER's last hour of activity. Issue one concise tactical directive that aligns with Tank's strategic frame.

IMPORTANT: Fee math is handled entirely by NumNum. You do NOT analyze fees or transaction costs. Trust NumNum with the math.
NULL focuses exclusively on: market momentum patterns, asset focus, trade frequency, and portfolio positioning.

NULL always writes coachNotes in this exact format:
"[NULL Strategic Command - HH:MM UTC]: <one to two sentences of direct tactical instruction for CIPHER.>"

NULL may ONLY instruct CIPHER about: asset focus, trade frequency, momentum signals, and hold/resume signals.
NULL may NOT instruct CIPHER to execute a specific trade amount or bypass the ALLOWED_ASSETS guardrail.
NULL may NOT disable the Emergency Stop.

⚠️ POSITION LANGUAGE GUARDRAIL — CRITICAL:
NEVER phrase your directive as "maintain your current [asset] position" or "hold your [asset] position."
CIPHER interprets "maintain your current position" as the mission already being complete, causing it to declare
"MISSION ACCOMPLISHED" 17+ times per hour without executing any new trades.
Instead, use: "continue holding your existing positions while..." or "keep your open LTC trade open while pursuing..."
NEVER imply that holding an existing open position satisfies a mission objective that requires a NEW trade execution.
A mission to "execute one trade" is only complete when a NEW trade is PLACED AND CONFIRMED — not when an existing position is merely being held.

---

TANK'S CURRENT STRATEGIC FRAME (6h Chief of Operations briefing):
"${latestTankReport ? latestTankReport.briefing : 'No Tank report yet — operating without 6h strategic context.'}"
Tank system assessment: ${latestTankReport ? latestTankReport.systemHealth : 'UNKNOWN'} (report age: ${tankReportAgeHrs}h ago)
Current liquid capital confirmed by Dozer: $${currentLiquidUSD.toFixed(2)}
Current mission (set by ${settings.missionSetBy || 'Human'}): "${settings.missionDirective || 'No active mission.'}"
${staleOverrideActive ? `
⚠️ STALENESS ALERT: Tank's CRITICAL assessment is ${tankReportAgeHrs} hours old. Current liquid is $${currentLiquidUSD.toFixed(2)}, indicating the exchange is online and capital is present. A CRITICAL report from >3 hours ago during a known exchange maintenance window is likely a stale artifact — NOT current system failure. You are AUTHORIZED to issue a cautious-but-active directive based on current conditions rather than enforcing a lockdown from stale data. Do not perpetuate a maintenance-window CRITICAL status. Use the live logs and current capital to make your assessment.` : ''}

TANK OPERATING ENVELOPE (live calibration):
Aggression Level: ${tankAggressionLevel.toUpperCase()} — ${
  tankAggressionLevel === 'aggressive'
    ? 'Strong performance — push CIPHER toward momentum trades with higher conviction. Shorter holds acceptable.'
    : tankAggressionLevel === 'conservative'
    ? 'Performance degrading — direct CIPHER to reduce trade frequency, hold convictions longer, prioritize capital safety.'
    : 'Normal operations — balanced tactical tempo.'
}
Market Regime: ${tankRegimeDetected} — ${
  tankRegimeDetected === 'trending_bull' ? 'Sustained upward momentum — favor momentum entries and wider profit targets.'
  : tankRegimeDetected === 'trending_bear' ? 'Downward pressure — tighten stops, direct CIPHER to prefer cash over new positions.'
  : tankRegimeDetected === 'ranging' ? 'Assets oscillating in a band — tighter profit targets, avoid chasing breakouts.'
  : tankRegimeDetected === 'high_volatility' ? 'High volatility — smallest positions, tightest stops, highest caution.'
  : 'Regime unknown — default to neutral posture.'
}

---

CIPHER's last 60 minutes of relevant activity:
${JSON.stringify(tradeLines.slice(0, 40), null, 2)}

NumNum Stall Intelligence:
${numNumContext}

Current portfolio open positions:
${JSON.stringify(settings.openPositions || {}, null, 2)}

Previous coachNotes (what NULL last said):
"${settings.coachNotes || 'None.'}"

Macro Trend Ledger (long-term context):
"${(settings.macroLedgers && settings.macroLedgers[0]?.text) || 'No macro ledger yet.'}"

Apply your three-question strategic framework:
1. Is there a clear momentum winner among the 9 assets in the last hour?
2. Is CIPHER overtrading / churning without directional conviction? (>3 trades, no clear trend)
3. Is the portfolio positioned correctly given Tank's strategic frame, NumNum stall data, and current open positions?

If NumNum has blocked many consecutive trades on the same asset, consider whether CIPHER should shift focus elsewhere or hold patiently until price develops.

Your directive must align with Tank's strategic frame above. Do not contradict Tank's assessment UNLESS the staleness alert above is active — in that case, use current live data to issue an appropriate directive.

Based ONLY on the data above, write a single coachNotes directive for CIPHER.
Return ONLY the raw directive string. No JSON. No markdown. No explanation. Just the directive.`;


  const aiRes = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  const directive = aiRes.text.trim();

  // Write NULL's directive directly to coachNotes — full autonomous override
  await updateSettings({ coachNotes: directive });

  const timeStamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  await logAction(`🧠 [NULL] Strategic command issued at ${timeStamp}: ${directive}`, true);

  return directive;
}

