import { GoogleGenAI } from '@google/genai';
import { getRecentLogs, getSettings, updateSettings } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const task = req.query.task || 'rollup';

  try {
    const settings = await getSettings();
    // NOTE: Rollup and Macro Ledgers are MEMORY systems — they run regardless of autopilot state.
    // Only the Mission Tracker is skipped if there is no active mission directive.
    // Never gate memory accumulation on the autopilot toggle.
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_AI_API_KEY });
    const logs = await getRecentLogs();


    // ---- MISSION TRACKER (15 MINS) ----
    if (task === 'mission') {
      if (!settings.missionDirective) return res.status(200).json({ message: 'No mission set.' });
      
      let totalUsd = 0;
      try {
        const { getPortfolioBalances } = await import('../lib/trade.js');
        const activeBalances = await getPortfolioBalances();
        totalUsd = Object.values(activeBalances).reduce((sum, item) => sum + (item.notional || 0), 0);
      } catch (e) {
        console.warn('Failed to fetch portfolio for mission tracker:', e.message);
      }

      const recentLogs = logs.slice(0, 15);

      // ── Deterministic fee total — do NOT ask the AI to sum this ──
      const feeLogPattern = /Fee:\s*\$([\d.]+)/gi;
      let missionFeeTotal = 0;
      recentLogs.forEach(l => { const m = feeLogPattern.exec(l.action || ''); if (m) missionFeeTotal += parseFloat(m[1]); feeLogPattern.lastIndex = 0; });

      const prompt = `You are CIPHER, an elite autonomous fund manager.
Your current MISSION DIRECTIVE is: "${settings.missionDirective}"
Your current PORTFOLIO VALUE is: $${totalUsd.toFixed(2)}
Fees paid in recent activity (pre-calculated, do not recompute): $${missionFeeTotal.toFixed(4)}

Recent Activity Logs:
${JSON.stringify(recentLogs, null, 2)}

Provide a concise 2-sentence tactical progress report on the Mission Directive. Are we on track or falling behind? Fee data is pre-calculated above — use it directly, do not recalculate from logs.
Speak in the first-person as the AI. Do not use markdown fences.`;

      const aiRes = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const assessmentText = aiRes.text.trim();

      const currentAssessments = settings.missionAssessments || [];
      const newAssessment = { timestamp: new Date().toISOString(), text: assessmentText };
      const updatedAssessments = [newAssessment, ...currentAssessments].slice(0, 10);
      
      await updateSettings({ 
          missionAssessments: updatedAssessments
      });

      return res.status(200).json({ success: true, assessment: newAssessment });
    }
    // ---- MACRO TREND LEDGERS (12H / 24H) ----
    if (task === '12h' || task === '24h') {
      const hoursToLookBack = task === '12h' ? 12 : 24;
      const currentRollups = settings.cognitiveRollups || [];
      const relevantRollups = currentRollups.slice(0, hoursToLookBack);

      if (relevantRollups.length === 0) return res.status(200).json({ message: 'No hourly rollups to compile into a macro ledger.' });

      const prompt = `You are CIPHER, an elite autonomous fund manager.
Below are your hourly cognitive rollups from the last ${hoursToLookBack} hours.

HOURLY ROLLUPS:
${JSON.stringify(relevantRollups.map(r => r.text), null, 2)}

Dozer's verified fee drag for this period: ${settings.dozerReport?.performance?.feeDrag || 'not yet available'}.
Dozer's verified win rate: ${settings.dozerReport?.performance?.winRate || 'not yet available'}.

Synthesize these hourly reports into a single, high-level "Macro Trend Ledger".
Identify overarching market shifts. What strategies failed or succeeded? Reference the Dozer-verified fee drag above — do NOT recalculate fees yourself.
State clearly how you will permanently adjust strategy to learn from these trends.
Speak in the first-person as the AI. Do not use markdown fences. Keep it to 1 concise paragraph.`;

      const aiRes = await ai.models.generateContent({ model: 'gemini-2.5-pro', contents: prompt });
      const ledgerText = aiRes.text.trim();

      const currentLedgers = settings.macroLedgers || [];
      const newLedger = { timestamp: new Date().toISOString(), type: task.toUpperCase(), text: ledgerText };
      const updatedLedgers = [newLedger, ...currentLedgers].slice(0, 14); // Keep last 14 ledgers (about a week of 12h/24h)
      await updateSettings({ macroLedgers: updatedLedgers });

      return res.status(200).json({ success: true, ledger: newLedger });
    }

    // ---- COGNITIVE ROLLUP (60 MINS) ----
    if (task === 'rollup') {
      const lastHourLogs = logs.slice(0, 60);
      if (lastHourLogs.length === 0) return res.status(200).json({ message: 'No logs to roll up.' });

      let totalUsd = 0;
      try {
        const { getPortfolioBalances } = await import('../lib/trade.js');
        const activeBalances = await getPortfolioBalances();
        totalUsd = Object.values(activeBalances).reduce((sum, item) => sum + (item.notional || 0), 0);
      } catch (e) {
        console.warn('Failed to fetch portfolio for 60m rollup:', e.message);
      }

      // ── Deterministic fee total — do NOT ask the AI to sum this ──
      const feePattern = /Fee:\s*\$([\d.]+)/gi;
      let hourlyFeeTotal = 0;
      lastHourLogs.forEach(l => { const m = feePattern.exec(l.action || ''); if (m) hourlyFeeTotal += parseFloat(m[1]); feePattern.lastIndex = 0; });

      const prompt = `You are CIPHER, an elite autonomous fund manager.
Your current PORTFOLIO VALUE is: $${totalUsd.toFixed(2)}
Fees paid this hour (pre-calculated by fee parser, do not recompute): $${hourlyFeeTotal.toFixed(4)}
Dozer's verified fee drag: ${settings.dozerReport?.performance?.feeDrag || 'not yet available'}

Below are your activity logs from the last hour.

LOGS:
${JSON.stringify(lastHourLogs, null, 2)}

Analyze these logs and write a single, concise 1-paragraph "Cognitive Rollup".
Explain how the market shifted over the last hour, what you learned from your successes or failures, and how you are adapting your strategy right now.
The hourly fee total is pre-calculated above — reference it directly. Do NOT recalculate fees from the raw logs.
Speak in the first-person as the AI. Do not use markdown fences.`;

      const aiRes = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const rollupText = aiRes.text.trim();

      const currentRollups = settings.cognitiveRollups || [];
      const newRollup = { timestamp: new Date().toISOString(), text: rollupText };
      const updatedRollups = [newRollup, ...currentRollups].slice(0, 24);
      
      const currentHistory = settings.portfolioHistory || [];
      const newPoint = { time: Math.floor(Date.now() / 1000), value: parseFloat(totalUsd.toFixed(2)) };
      // Keep last 672 points (28 days of 60-min intervals)
      const updatedHistory = [...currentHistory, newPoint].slice(-672);

      await updateSettings({ 
          cognitiveRollups: updatedRollups,
          portfolioHistory: updatedHistory
      });

      return res.status(200).json({ success: true, rollup: newRollup });
    }

    if (task === 'analyze') {
      const { getDeepDiveAnalysis } = await import('../lib/db.js');
      const data = await getDeepDiveAnalysis();
      const recentLogs = logs.slice(0, 120); // last ~120 activity entries across all agents

      // ── Dozer accounting — ground truth ──────────────────────────────────────
      const dozerReport = settings.dozerReport || null;
      const dozerSummary = dozerReport ? `
Net realized P&L (closed trades, FIFO): $${dozerReport.capitalBalance?.netRealizedPL?.toFixed(4) ?? '?'}
Unrealized P&L (open positions):        $${dozerReport.capitalBalance?.unrealizedPL?.toFixed(4) ?? '?'}
Net position (real scorecard):          $${dozerReport.capitalBalance?.netPosition?.toFixed(4) ?? '?'}
Liquid USD:                             $${dozerReport.capitalBalance?.liquidUSD?.toFixed(2) ?? '?'}
Win rate:                               ${dozerReport.performance?.winRate ?? '?'}
Fee drag (fees as % of gross P&L):      ${dozerReport.performance?.feeDrag ?? '?'}
Avg net per trade:                      $${dozerReport.performance?.avgNetPerTrade?.toFixed(4) ?? '?'}
Closed trade pairs:                     ${dozerReport.performance?.totalClosedTrades ?? 0}
Current streak:                         ${dozerReport.performance?.currentStreak?.count ?? 0}-${dozerReport.performance?.currentStreak?.type ?? 'none'}
Liquidity status:                       ${dozerReport.liquidityStatus ?? '?'}
Reconciliation note:                    ${dozerReport.capitalBalance?.reconciliationNote ?? 'none'}
` : 'Dozer has not run yet or report unavailable.';

      // ── System intelligence ───────────────────────────────────────────────────
      const latestTankReport  = (settings.tankReports || [])[0] || null;
      const prevTankReport    = (settings.tankReports || [])[1] || null;
      const activeProtocols   = (settings.cipherProtocols || []).filter(p => p.status === 'active');
      const pendingProtocols  = (settings.cipherProtocols || []).filter(p => p.status === 'pending');
      const latestRollup      = (settings.cognitiveRollups || [])[0]?.text || 'None yet.';
      const latestLedger      = (settings.macroLedgers || [])[0]?.text || 'None yet.';

      const missionSetAt = settings.missionSetAt
        ? new Date(settings.missionSetAt).toISOString()
        : 'unknown';
      const missionAgeHours = settings.missionSetAt
        ? ((Date.now() - new Date(settings.missionSetAt).getTime()) / (1000 * 60 * 60)).toFixed(1)
        : '?';

      const numNumLastBlock = settings.numNumLastBlockTime
        ? new Date(parseInt(settings.numNumLastBlockTime)).toISOString()
        : 'never';

      const systemIntel = `
=== SYSTEM INTELLIGENCE ===

ERA: ${settings.activeEraName || 'Unknown'}
AUTOPILOT: ${settings.autopilotEnabled ? '✅ ENABLED' : '🔴 DISABLED'}
OPEN POSITIONS: ${JSON.stringify(settings.openPositions || {}, null, 2)}

--- TANK (Chief of Operations — 3h cadence) ---
Mission directive:   "${settings.missionDirective || 'None set'}"
Mission set by:      ${settings.missionSetBy || 'Unknown'}
Mission set at:      ${missionSetAt} (${missionAgeHours}h ago)
Mission completions: ${settings.missionCompletions || 0}
System health:       ${latestTankReport?.systemHealth || 'NO REPORT YET'}
Capital risk:        ${latestTankReport?.capitalRisk || 'unknown'}
Market regime:       ${settings.tankRegimeDetected || 'unknown'}
Aggression level:    ${settings.tankAggressionLevel || 'unknown'}
Min trade size:      $${settings.tankMinTradeSize || '?'}
Max trade size:      $${settings.tankMaxTradeSize || '?'}
Cap efficiency mode: ${settings.tankCapitalEfficiencyMode ? 'ACTIVE — fee drag high, skip marginal trades' : 'inactive'}
Latest briefing:     "${latestTankReport?.briefing || 'none'}"
Previous briefing:   "${prevTankReport?.briefing || 'none'}"

--- NULL (Strategic Commander — 60m cadence) ---
Current coachNotes directive: "${settings.coachNotes || 'None issued'}"

--- NUMNUM (Trade Gate — fires on every trade attempt) ---
Profit floor:            ${settings.numNumFloor || '?'}%  minimum net gain required to execute
Stop-loss threshold:     ${settings.numNumStopLoss || '?'}%
Trailing stop-loss:      ${settings.trailingStopLoss || '?'}%
Consecutive blocks:      ${settings.numNumBlocks || 0}
Last blocked symbol:     ${settings.numNumBlockedSymbol || 'none'}
Last block time:         ${numNumLastBlock}
Last blocked price tgt:  $${settings.numNumBlockedPrice || '?'}

--- PROTOCOL INTELLIGENCE ---
Active approved protocols (${activeProtocols.length}):
${activeProtocols.length > 0 ? activeProtocols.map((p, i) => `  ${i + 1}. "${p.rule}" (approved ${p.tankReviewedAt || '?'}): ${p.tankReview || 'no note'}`).join('\n') : '  None active yet.'}
Pending Tank review (${pendingProtocols.length}):
${pendingProtocols.length > 0 ? pendingProtocols.map((p, i) => `  ${i + 1}. "${p.rule}" (proposed ${p.proposedAt || '?'}, confidence: ${p.confidence})`).join('\n') : '  None pending.'}

--- COGNITIVE MEMORY ---
Latest 1h rollup:
"${latestRollup}"

Latest macro ledger (12h-24h):
"${latestLedger}"
`;

      const tradeStats = `
=== DOZER VERIFIED ACCOUNTING ===
${dozerSummary}

=== ERA TRADE STATISTICS (${data.eraName}) ===
Total logs analyzed: ${data.totalLogsAnalyzed}
Total trades executed: ${data.totalTrades} (${data.totalBuys} buys / ${data.totalSells} sells)
Buy volume: $${data.buyVolumeUsd} | Sell volume: $${data.sellVolumeUsd}
Total fees paid: $${data.totalFeesUSD}
${Object.keys(data.coinStats || {}).length > 0
  ? `Per-coin:\n${JSON.stringify(data.coinStats, null, 2)}`
  : 'No trades have executed this era.'}
`;

      const activityStream = `
=== RECENT ACTIVITY STREAM (last ${recentLogs.length} log entries — ALL agents) ===
${recentLogs.map(l => {
  const ts = new Date(parseInt(l.sk)).toISOString();
  return `[${ts}] ${l.action}`;
}).join('\n')}
`;

      const prompt = `You are BASTION, the capital-preservation AI and Chief Auditor for this autonomous multi-agent crypto trading system.

Your supervisor has requested a FULL SYSTEM DEEP DIVE — not a trade summary or a pat on the back. This is a real investigation into every layer of the system. You have access to everything: agent states, decision chains, log streams, financial records, and protocol intelligence.

${systemIntel}

${tradeStats}

${activityStream}

---
INVESTIGATION RULES:
- Do NOT recalculate P&L, fees, or win rate. Dozer already computed them deterministically.
- Do NOT praise "capital preservation" if the system should be trading but isn't.
- NumNum fee gates and hard stop-losses are already operational — do not recommend them.
- Pull specific log entries as evidence when making claims.
- If CIPHER has 0 trades, investigate WHY, not just report it.

Write a structured intelligence report with these FIVE sections:

**SYSTEM STATE**
What is each agent actually doing right now? Is the ring spinning? Is autopilot on? How old is the current Tank mission — is it stale? What is NULL telling CIPHER right now word-for-word? Is Capital Efficiency Mode affecting trade sizes?

**BLOCKAGE ANALYSIS**
Trace the exact execution chain: Tank (mission) → NULL (directive) → CIPHER (decision) → NumNum (gate) → Exchange. At what point in this chain is execution being blocked or delayed? Pull specific log evidence. If 0 trades have executed, name the specific reason in the chain. Is it the mission language, the NULL directive, NumNum thresholds, autopilot being off, or a market condition?

**FINANCIAL POSITION**
Use Dozer's numbers. State liquid USD, net P&L, win rate, fee drag, open positions and their unrealized P&L. Is capital at risk?

**AGENT HEALTH VERDICT**
Rate each agent on a single line: Tank / NULL / CIPHER / NumNum. Use HEALTHY / MONITOR / CRITICAL. Back each verdict with one specific piece of evidence from the logs or system state.

**TOP PRIORITY FIX**
One concrete, specific, immediately actionable recommendation. Not "tune the parameters" — name exactly what to change and why the logs support it.

Be blunt. Be specific. This is an audit, not a press release. If something is broken, say exactly what and show the evidence.`;

      const aiRes = await ai.models.generateContent({ model: 'gemini-2.5-pro', contents: prompt });
      const analysisText = aiRes.text.trim();

      return res.status(200).json({ success: true, data, analysis: analysisText });
    }


    return res.status(400).json({ error: 'Invalid task specified.' });

  } catch (error) {
    console.error('AI Tasks Engine Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

