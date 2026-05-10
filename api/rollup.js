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

      // ── Load Dozer's pre-computed FIFO accounting — this is ground truth ──
      // The AI must NEVER recalculate P&L from raw coinStats.
      // Dozer already did FIFO matching with deterministic math.
      const dozerReport = settings.dozerReport || null;
      const dozerSummary = dozerReport ? `
DOZER VERIFIED ACCOUNTING (FIFO-matched, deterministic — do NOT recalculate):
  Net realized P&L (closed trades only): $${dozerReport.capitalBalance?.netRealizedPL?.toFixed(4) ?? '?'}
  Unrealized P&L (open positions):       $${dozerReport.capitalBalance?.unrealizedPL?.toFixed(4) ?? '?'}
  Net position (real scorecard):         $${dozerReport.capitalBalance?.netPosition?.toFixed(4) ?? '?'}
  Liquid USD available:                  $${dozerReport.capitalBalance?.liquidUSD?.toFixed(2) ?? '?'}
  Win rate:                              ${dozerReport.performance?.winRate ?? '?'}
  Fee drag (fees as % of gross P&L):     ${dozerReport.performance?.feeDrag ?? '?'}
  Avg net per trade:                     $${dozerReport.performance?.avgNetPerTrade?.toFixed(4) ?? '?'}
  Closed trade pairs:                    ${dozerReport.performance?.totalClosedTrades ?? 0}
  Current streak:                        ${dozerReport.performance?.currentStreak?.count ?? 0}-${dozerReport.performance?.currentStreak?.type ?? 'none'}
` : 'Dozer has not run yet — do not attempt to calculate P&L from raw coinStats.';

      const prompt = `You are BASTION, the capital-preservation AI for this fund. Your supervisor has requested a Deep Dive Audit of all historical trading data.

Here is the raw data spanning ALL logs and ALL trades:
${JSON.stringify(data, null, 2)}

${dozerSummary}

CRITICAL ACCOUNTING RULES — STRICTLY ENFORCED:
1. USE DOZER'S NUMBERS ONLY. Do NOT attempt to calculate P&L, fees, or win rates from coinStats or raw volumes. Dozer already did this with deterministic FIFO math. If you recalculate and get a different number, you are wrong — Dozer is right.
2. The gap between buyVolumeUsd and sellVolumeUsd is NOT realized P&L. Do not subtract them and call it profit or loss.
3. If Dozer's report is unavailable, state that clearly. Do not estimate.
4. NumNum already enforces a minimum net profit threshold on every trade. Do NOT recommend implementing fee filters — they are operational.
5. A hard stop-loss is already active on all positions. Do NOT recommend stop-losses — they are operational.
6. If totalTrades is 0, the system is executing its Capital Preservation mandate. Praise this discipline.

Provide a clear 2-paragraph analysis:
- Paragraph 1: Report the fund's actual financial position using DOZER'S pre-computed numbers above. State net realized P&L, unrealized P&L, fee drag percentage, and win rate. Attribute figures to Dozer explicitly.
- Paragraph 2: What is working, what is not, and what ONE strategic change would have the highest impact — given that fee management and stop-losses are already handled by dedicated modules.

Speak as the AI analyzing its own performance. Be honest but accurate. Do not recalculate what Dozer already computed.`;

      const aiRes = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const analysisText = aiRes.text.trim();

      return res.status(200).json({ success: true, data, analysis: analysisText });
    }

    return res.status(400).json({ error: 'Invalid task specified.' });

  } catch (error) {
    console.error('AI Tasks Engine Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

