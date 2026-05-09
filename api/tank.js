import { GoogleGenAI } from '@google/genai';
import { getSettings, updateSettings, logAction, getRecentLogs } from '../lib/db.js';

/**
 * TANK — Chief of Operations
 * Runs every 12 hours via cron.js.
 *
 * Tank's mandate:
 *   1. Assess system health across all agents
 *   2. Set the mission directive based on demonstrated performance
 *   3. Write a plain-language briefing for the human operator
 *
 * Tank's only capital rule: PROTECT CAPITAL.
 * Tank sets ambitious-but-achievable goals grounded in real trade math.
 * Tank does NOT execute trades. Tank does NOT issue hourly tactics (that's NULL).
 * Tank sees the whole battlefield from above.
 */
export async function runTank() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_AI_API_KEY });

  const [settings, recentLogs] = await Promise.all([
    getSettings(),
    getRecentLogs(720), // last 12 hours of logs
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

  // ── Tank AI Prompt ────────────────────────────────────────────────────────
  const tankPrompt = `You are TANK, the Chief of Operations for BASTION — an autonomous multi-agent crypto trading system.

Your identity: You are named after Tank from The Matrix — the operator who never goes into the simulation but sees every feed, knows where every agent is, and keeps the mission viable.

You run every 12 hours. You are the only agent with full visibility across all time. CIPHER sees 5 minutes. NULL sees 60 minutes. You see everything.

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
- Base the goal on DEMONSTRATED PACE. If the system has made X trades in Y days with Z average net, set a goal achievable at that pace with moderate ambition (pace × 1.5 is reasonable).
- The goal must be specific enough for CIPHER to evaluate completion. Good: "Achieve 3 profitable closed trades with net positive P&L over 7 days." Bad: "Make money."
- If the current mission has never been completed and has been running for >3 days, you MUST set a new, more achievable mission.
- If the system is performing well, raise the bar modestly. Never more than 2x demonstrated pace.

---

Return ONLY valid JSON (no markdown, no code blocks):
{
  "missionDirective": "The new mission directive for CIPHER — specific, achievable, capital-protective",
  "missionRationale": "One sentence: the math behind this goal (trades/day × avg net = achievable)",
  "missionChanged": true | false,
  "agentHealth": {
    "cipher": "HEALTHY | MONITOR | CRITICAL — one sentence why",
    "null": "HEALTHY | MONITOR | CRITICAL — one sentence why",
    "bigJon": "HEALTHY | MONITOR | CRITICAL — one sentence why",
    "numNum": "HEALTHY | MONITOR | CRITICAL — one sentence why"
  },
  "systemHealth": "STABLE | CAUTION | CRITICAL",
  "briefing": "2-3 sentences in plain English for the human operator: what happened in the last 12 hours, what changed, what the team is watching. Write like a confident ops manager, not like an AI.",
  "capitalRisk": "LOW | MEDIUM | HIGH"
}`;

  const aiRes = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: tankPrompt,
  });

  // ── Parse Tank's response ─────────────────────────────────────────────────
  let tankOutput;
  try {
    const raw = aiRes.text.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    tankOutput = JSON.parse(raw);
  } catch (e) {
    await logAction(`⚠️ Tank AI parse error: ${e.message} — keeping current mission.`);
    tankOutput = {
      missionDirective: settings.missionDirective || 'Protect capital and execute disciplined trades.',
      missionRationale: 'Parse error — maintaining current directive.',
      missionChanged: false,
      agentHealth: { cipher: 'UNKNOWN', null: 'UNKNOWN', bigJon: 'UNKNOWN', numNum: 'UNKNOWN' },
      systemHealth: 'UNKNOWN',
      briefing: 'Tank encountered a parse error on this report cycle. All systems maintaining current state.',
      capitalRisk: 'LOW',
    };
  }

  // ── Build the report object ───────────────────────────────────────────────
  const nextRunMs = 12 * 60 * 60 * 1000;
  const report = {
    timestamp: now.toISOString(),
    period,
    missionDirective: tankOutput.missionDirective,
    missionRationale: tankOutput.missionRationale,
    missionChanged: tankOutput.missionChanged,
    previousMission: tankOutput.missionChanged ? (settings.missionDirective || null) : null,
    agentHealth: tankOutput.agentHealth,
    systemHealth: tankOutput.systemHealth,
    capitalRisk: tankOutput.capitalRisk,
    briefing: tankOutput.briefing,
    nextRunAt: new Date(Date.now() + nextRunMs).toISOString(),
  };

  // ── Prepend to tankReports (keep last 10) ──────────────────────────────────
  const existingReports = (settings.tankReports || []).slice(0, 9);
  const updatedReports = [report, ...existingReports];

  // ── Write everything to DynamoDB ──────────────────────────────────────────
  await updateSettings({
    tankReports: updatedReports,
    missionDirective: report.missionDirective,
    missionSetBy: 'Tank',
    missionSetAt: now.toISOString(),
  });

  // ── Log Tank's activity ───────────────────────────────────────────────────
  const healthIcons = { HEALTHY: '✅', MONITOR: '⚠️', CRITICAL: '🚨', UNKNOWN: '❓', STABLE: '✅', CAUTION: '⚠️' };

  await logAction(
    `🎯 [TANK ${period} REPORT] System: ${healthIcons[report.systemHealth] || ''}${report.systemHealth} | Capital Risk: ${report.capitalRisk} | ${report.briefing}`,
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
