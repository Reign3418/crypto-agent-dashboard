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

---

TANK'S CURRENT STRATEGIC FRAME (12h Chief of Operations briefing):
"${latestTankReport ? latestTankReport.briefing : 'No Tank report yet — operating without 12h strategic context.'}"
Tank system assessment: ${latestTankReport ? latestTankReport.systemHealth : 'UNKNOWN'}
Current mission (set by ${settings.missionSetBy || 'Human'}): "${settings.missionDirective || 'No active mission.'}"

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

Your directive must align with Tank's strategic frame above. Do not contradict Tank's assessment.

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

