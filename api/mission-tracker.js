import { GoogleGenAI } from '@google/genai';
import { getSettings, updateSettings, getRecentLogs } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const settings = await getSettings();
    if (!settings.autopilotEnabled || !settings.missionDirective) {
      return res.status(200).json({ message: 'Autopilot offline or no mission set.' });
    }

    // Get live portfolio to check progress
    let totalUsd = 0;
    try {
      // Internal call to portfolio logic
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

    // Get last 15 mins of logs (approx 15 logs)
    const logs = await getRecentLogs();
    const recentLogs = logs.slice(0, 15);

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_AI_API_KEY });

    const prompt = `You are CIPHER, an elite autonomous fund manager. 
Your current MISSION DIRECTIVE is: "${settings.missionDirective}"
Your current PORTFOLIO VALUE is: $${totalUsd.toFixed(2)}

Recent Activity Logs:
${JSON.stringify(recentLogs, null, 2)}

Provide a concise 2-sentence tactical progress report on the Mission Directive. Are we on track or falling behind? What specific market actions are keeping us on pace or holding us back? Speak in the first-person as the AI (e.g. "I am trailing the $25 profit goal because SOL volume collapsed..."). Do not use markdown fences.`;

    const aiRes = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    const assessmentText = aiRes.text.trim();

    // Save to settings
    const currentAssessments = settings.missionAssessments || [];
    const newAssessment = {
      timestamp: new Date().toISOString(),
      text: assessmentText
    };

    // Keep the last 10 assessments
    const updatedAssessments = [newAssessment, ...currentAssessments].slice(0, 10);

    await updateSettings({ missionAssessments: updatedAssessments });

    return res.status(200).json({ success: true, assessment: newAssessment });

  } catch (error) {
    console.error('Mission Tracker Engine Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
