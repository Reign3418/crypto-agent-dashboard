/**
 * KENT — Chief Market Analyst / News Anchor (Intelligence Ring)
 * CIPHER Multi-Agent Trading System
 *
 * Runs every 30 minutes.
 * Uses Google Search Grounding to build a persistent news narrative.
 * Outputs to settings.kentBriefing for CIPHER and NULL to read.
 */

import { GoogleGenAI } from '@google/genai';
import { logAction, getSettings, updateSettings } from '../lib/db.js';

export async function runKent() {
  await logAction('📰 [KENT] Gathering news and tracking macro events...');

  try {
    const settings = await getSettings();
    const previousBriefing = settings.kentBriefing || { macroNarrative: 'No previous data', catalysts: {} };

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_AI_API_KEY });
    
    // The 9 core assets
    const CORE_ASSETS = ['BTC', 'ETH', 'SOL', 'XRP', 'LINK', 'DOGE', 'LTC', 'AVAX', 'BCH'];

    const prompt = `You are Kent, the Chief Market Analyst for an autonomous crypto trading fund.
Your job is to read the news, track breaking events, and tell the trading agents what matters.
You focus ONLY on the macro environment and these 9 core assets: ${CORE_ASSETS.join(', ')}.

Here is your PREVIOUS briefing (use this to track evolving stories, don't just repeat it):
${JSON.stringify(previousBriefing, null, 2)}

Use Google Search to find breaking news from the last 60 minutes affecting crypto, the global economy, or these specific assets.

Based on what you find, determine the 'recommendedCandleDepth' (the Lens):
- If the market is quiet with no major news, recommend: 6
- If there is moderate news or momentum building, recommend: 12
- If there is a major breaking macro event or extreme volatility, recommend: 24

Return ONLY a valid JSON object matching this exact structure:
{
  "macroNarrative": "A 2-3 sentence summary of the overall market mood and global events right now.",
  "catalysts": {
    "BTC": "One sentence news impact, or null if nothing new",
    "ETH": "One sentence news impact, or null if nothing new"
  },
  "recommendedCandleDepth": 6,
  "volatilityState": "LOW"
}
Make sure all 9 assets (BTC, ETH, SOL, XRP, LINK, DOGE, LTC, AVAX, BCH) are included in the catalysts object, using null if there is no news.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2
      }
    });

    let rawText = response.text.trim();
    rawText = rawText.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    
    const briefing = JSON.parse(rawText);
    briefing.timestamp = new Date().toISOString();

    await updateSettings({ kentBriefing: briefing });
    
    await logAction(`📰 [KENT] Briefing published. Volatility: ${briefing.volatilityState}. Lens set to ${briefing.recommendedCandleDepth}h.`, true);

    return briefing;

  } catch (err) {
    await logAction(`⚠️ [KENT] Error gathering intelligence: ${err.message}`);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const result = await runKent();
  res.status(200).json({ ok: true, report: result });
}
