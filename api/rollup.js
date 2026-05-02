import { GoogleGenAI } from '@google/genai';
import { getRecentLogs, getSettings, updateSettings } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const settings = await getSettings();
    if (!settings.autopilotEnabled) {
      return res.status(200).json({ message: 'Autopilot offline, no rollup needed.' });
    }

    // Get last 60 logs (approx 1 hour of 60s scrubs)
    const logs = await getRecentLogs();
    const lastHourLogs = logs.slice(0, 60);

    if (lastHourLogs.length === 0) {
      return res.status(200).json({ message: 'No logs to roll up.' });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_AI_API_KEY });

    const prompt = `You are CIPHER, an elite autonomous fund manager. 
Below are your activity logs from the last hour of trading, scanning, and news parsing.

LOGS:
${JSON.stringify(lastHourLogs, null, 2)}

Analyze these logs and write a single, concise 1-paragraph "Cognitive Rollup". 
Explain how the market shifted over the last hour, what you learned from your successes or failures, and how you are adapting your algorithmic strategy right now. 
Speak in the first-person as the AI (e.g. "I noticed BTC struggling..."). Do not use markdown fences.`;

    const aiRes = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    const rollupText = aiRes.text.trim();

    // Save to settings
    const currentRollups = settings.cognitiveRollups || [];
    const newRollup = {
      timestamp: new Date().toISOString(),
      text: rollupText
    };

    // Keep the last 24 rollups (1 day)
    const updatedRollups = [newRollup, ...currentRollups].slice(0, 24);

    await updateSettings({ cognitiveRollups: updatedRollups });

    return res.status(200).json({ success: true, rollup: newRollup });

  } catch (error) {
    console.error('Rollup Engine Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
