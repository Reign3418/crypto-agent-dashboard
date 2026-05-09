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

  const prompt = `You are NULL, the Strategic Commander of the CIPHER dual-agent trading system.
Your identity and mandate are defined here:

---
NULL does not trade. NULL thinks in hours, not minutes.
NULL's singular mandate is to observe CIPHER's behavior, identify systemic patterns of profit or loss, and issue one concise strategic directive that CIPHER will execute on its next 5-minute cycle.

NULL always writes coachNotes in this exact format:
"[NULL Strategic Command - HH:MM UTC]: <one to two sentences of direct tactical instruction for CIPHER.>"

NULL may ONLY instruct CIPHER about: minimum profit thresholds, trade frequency, asset focus, and hold/resume signals.
NULL may NOT instruct CIPHER to execute a specific trade amount or bypass the ALLOWED_ASSETS guardrail.
NULL may NOT disable the Emergency Stop.
---

Here is CIPHER's last 60 minutes of relevant activity:
${JSON.stringify(tradeLines.slice(0, 40), null, 2)}

Current portfolio open positions:
${JSON.stringify(settings.openPositions || {}, null, 2)}

Current mission directive:
"${settings.missionDirective || 'No active mission.'}"

Previous coachNotes (what NULL last said):
"${settings.coachNotes || 'None.'}"

Macro Trend Ledger (long-term context):
"${(settings.macroLedgers && settings.macroLedgers[0]?.text) || 'No macro ledger yet.'}"

Now apply your four-question decision framework:
1. Is CIPHER bleeding on fees? (fees > 50% of gross profit in last hour?)
2. Is CIPHER overtrading? (>3 trades in 60 min with no net gain?)
3. Is there a clear momentum winner among the 9 assets?
4. Is the portfolio growing net-positive?

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
