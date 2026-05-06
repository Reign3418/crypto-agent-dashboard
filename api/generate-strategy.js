import { GoogleGenAI } from '@google/genai';
import { getLastScoutReport, getSettings } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_AI_API_KEY });

    // Load last Scout report for context (may be empty if Scout hasn't run yet)
    const lastScout = await getLastScoutReport();
    const settings = await getSettings();

    // Fall back to live pricefeed if no Scout report exists
    let marketContext = '';
    if (lastScout && lastScout.length > 0) {
      const top5 = lastScout.slice(0, 5).map(a =>
        `${a.symbol}: ${a.price}, ${a.change24h > 0 ? '+' : ''}${typeof a.change24h === 'number' ? a.change24h.toFixed(2) : a.change24h}% 24h, direction: ${a.direction}, risk: ${a.riskLevel}, news: ${a.newsHeadline}`
      ).join('\n');
      marketContext = `Latest Scout report (${new Date().toLocaleString()}):\n${top5}`;
    } else {
      // Fetch live pricefeed as fallback
      const pfRes = await fetch('https://api.gemini.com/v1/pricefeed');
      const pfData = await pfRes.json();
      const top5 = pfData
        .filter(i => i.pair.toLowerCase().endsWith('usd'))
        .map(i => ({
          symbol: i.pair.replace(/USD$/i, ''),
          change: (parseFloat(i.percentChange24h) * 100).toFixed(2),
          price: parseFloat(i.price).toLocaleString()
        }))
        .sort((a, b) => Math.abs(parseFloat(b.change)) - Math.abs(parseFloat(a.change)))
        .slice(0, 5)
        .map(i => `${i.symbol}: $${i.price}, ${i.change}% 24h`)
        .join('\n');
      marketContext = `Live market snapshot:\n${top5}`;
    }

    if (settings.macroLedgers && settings.macroLedgers.length > 0) {
      marketContext += `\n\nCRITICAL HISTORICAL CONTEXT (From Last ${settings.macroLedgers[0].type} Macro Ledger):\n${settings.macroLedgers[0].text}\nEnsure your new strategy respects the lessons learned in this ledger!`;
    }

    const prompt = `You are a professional crypto trading strategist. Based on current market data, generate ONE actionable alert strategy for a retail trader.

${marketContext}

Available condition types (use ONLY these exact values):
- price_drop_pct  (requires: value=number, window="1h"|"4h"|"24h")
- price_rise_pct  (requires: value=number, window="1h"|"4h"|"24h")
- price_below     (requires: value=number in USD)
- price_above     (requires: value=number in USD)
- change_exceeds  (requires: value=number, window="1h"|"4h"|"24h")
- scout_bearish   (no extra fields)
- scout_bullish   (no extra fields)
- scout_risk_high (no extra fields)

Available assets: BTC, ETH, SOL

Rules:
- EMERGENCY GUARDRAIL 1: You may ONLY generate strategies for highly liquid assets (BTC, ETH, SOL). Do not use any other coin.
- EMERGENCY GUARDRAIL 2: Every strategy MUST include an aggressive condition to cut losses (e.g., price_drop_pct of 5%).
- Generate only 1–3 conditions. Keep it focused.
- cooldownMinutes must be one of: 15, 30, 60, 120, 360, 1440.
- CRITICAL ALGORITHM UPDATE: High-frequency, low-dollar trading can destroy the portfolio via transaction fees. If the market is choppy or fees are a concern, enforce longer cooldowns (e.g., 60, 120, or 360) to prevent the agent from bleeding capital.
- action.type must be "alert" (no live trading yet)
- conditionLogic must be "ALL" or "ANY"
- notes should explain WHY this strategy makes sense given the market right now, explicitly noting if you raised the cooldown to protect against fee bleed. (2–3 sentences max)

Return ONLY valid JSON — no markdown, no explanation outside the JSON:
{
  "name": "string",
  "asset": "string",
  "conditions": [ { "type": "string", "value": number_or_omit, "window": "string_or_omit" } ],
  "conditionLogic": "ALL" | "ANY",
  "cooldownMinutes": number,
  "action": { "type": "alert", "amount": 0, "amountType": "fixed" },
  "notes": "string"
}`;

    const aiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    let rawText = aiResponse.text.trim();
    // Strip markdown fences if present
    rawText = rawText.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();

    const strategy = JSON.parse(rawText);

    // Validate and sanitize before returning
    const VALID_CONDITIONS = ['price_drop_pct','price_rise_pct','price_below','price_above','change_exceeds','scout_bearish','scout_bullish','scout_risk_high'];
    const VALID_COOLDOWNS = [15, 30, 60, 120, 360, 1440];

    strategy.conditions = (strategy.conditions || []).filter(c => VALID_CONDITIONS.includes(c.type));
    if (!VALID_COOLDOWNS.includes(strategy.cooldownMinutes)) strategy.cooldownMinutes = 60;
    strategy.action = { type: 'alert', amount: 0, amountType: 'fixed' };
    strategy.conditionLogic = ['ALL', 'ANY'].includes(strategy.conditionLogic) ? strategy.conditionLogic : 'ALL';
    strategy.enabled = true;

    return res.status(200).json({ strategy, marketContext });

  } catch (error) {
    console.error('[Generate Strategy Error]:', error);
    return res.status(500).json({ error: error.message });
  }
}
