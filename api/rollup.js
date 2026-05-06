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
    if (!settings.autopilotEnabled) {
      return res.status(200).json({ message: 'Autopilot offline.' });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_AI_API_KEY });
    const logs = await getRecentLogs();

    // ---- MISSION TRACKER (15 MINS) ----
    if (task === 'mission') {
      if (!settings.missionDirective) return res.status(200).json({ message: 'No mission set.' });
      
      let totalUsd = 0;
      try {
        const host = req.headers.host || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const portRes = await fetch(`${protocol}://${host}/api/portfolio`, { method: 'POST' });
        if (portRes.ok) {
          const json = await portRes.json();
          if (Array.isArray(json)) {
              totalUsd = json.reduce((sum, item) => sum + parseFloat(item.amountNotional || 0), 0);
          }
        }
      } catch (e) {
        console.warn('Failed to fetch portfolio for mission tracker:', e.message);
      }

      const recentLogs = logs.slice(0, 15);
      const prompt = `You are CIPHER, an elite autonomous fund manager. 
Your current MISSION DIRECTIVE is: "${settings.missionDirective}"
Your current PORTFOLIO VALUE is: $${totalUsd.toFixed(2)}

Recent Activity Logs:
${JSON.stringify(recentLogs, null, 2)}

Provide a concise 2-sentence tactical progress report on the Mission Directive. Are we on track or falling behind? 
CRITICAL ALGORITHM UPDATE: You must analyze the recent logs for transaction fees ("Fee: X"). Compile a trend of how much aggressive trading is costing us. If transaction fees are eating up our profits, you MUST flag this in your report and advise halting hyper-active, low-dollar trades immediately.
Speak in the first-person as the AI (e.g. "I am trailing the goal because transaction fees are bleeding the portfolio..."). Do not use markdown fences.`;

      const aiRes = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const assessmentText = aiRes.text.trim();

      const currentAssessments = settings.missionAssessments || [];
      const newAssessment = { timestamp: new Date().toISOString(), text: assessmentText };
      const updatedAssessments = [newAssessment, ...currentAssessments].slice(0, 10);
      await updateSettings({ missionAssessments: updatedAssessments });

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

Synthesize these hourly reports into a single, high-level "Macro Trend Ledger". 
Identify overarching market shifts over the last ${hoursToLookBack} hours. What overarching algorithmic strategies failed or succeeded? How much did transaction fees impact the overall portfolio over this long period? State clearly how you will permanently adjust your algorithm to learn from yesterday's trends.
Speak in the first-person as the AI. Do not use markdown fences. Keep it to 1 concise paragraph.`;

      const aiRes = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
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

      const prompt = `You are CIPHER, an elite autonomous fund manager. 
Below are your activity logs from the last hour of trading, scanning, and news parsing.

LOGS:
${JSON.stringify(lastHourLogs, null, 2)}

Analyze these logs and write a single, concise 1-paragraph "Cognitive Rollup". 
Explain how the market shifted over the last hour, what you learned from your successes or failures, and how you are adapting your algorithmic strategy right now. 
CRITICAL ALGORITHM UPDATE: You must calculate the total transaction fees paid in the last hour from the logs. If aggressive trades and fees are bleeding the portfolio, strictly advise altering the algorithm to increase order sizes or reduce frequency.
Speak in the first-person as the AI (e.g. "I noticed BTC struggling..."). Do not use markdown fences.`;

      const aiRes = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const rollupText = aiRes.text.trim();

      const currentRollups = settings.cognitiveRollups || [];
      const newRollup = { timestamp: new Date().toISOString(), text: rollupText };
      const updatedRollups = [newRollup, ...currentRollups].slice(0, 24);
      await updateSettings({ cognitiveRollups: updatedRollups });

      return res.status(200).json({ success: true, rollup: newRollup });
    }

    return res.status(400).json({ error: 'Invalid task specified.' });

  } catch (error) {
    console.error('AI Tasks Engine Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

