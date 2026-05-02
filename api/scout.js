import { GoogleGenAI } from '@google/genai';
import { logAction, saveScoutReport } from '../lib/db.js';
import { runEvaluation } from '../lib/evaluator.js';

// Fetch all USD trading pairs from Gemini's public price feed
async function getAllMovers() {
  const res = await fetch('https://api.gemini.com/v1/pricefeed');
  if (!res.ok) throw new Error('Failed to fetch Gemini price feed');
  const data = await res.json();

  // Filter to USD pairs only and parse the percent change
  const usdPairs = data
    .filter(item => item.pair.toLowerCase().endsWith('usd'))
    .map(item => ({
      symbol: item.pair.toLowerCase(),
      displaySymbol: item.pair.replace(/USD$/i, ''),
      price: parseFloat(item.price),
      change24h: parseFloat(item.percentChange24h) * 100, // convert to percentage
    }))
    .filter(item => !isNaN(item.change24h) && !isNaN(item.price) && item.price > 0);

  // Sort by absolute change to surface biggest movers in either direction
  return usdPairs.sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
}

// Fetch 1-hour OHLCV candles for a symbol
async function getCandles(symbol) {
  const res = await fetch(`https://api.gemini.com/v2/candles/${symbol}/1hr`);
  if (!res.ok) return [];
  const data = await res.json();
  // Returns [timestamp, open, high, low, close, volume] — newest first.
  // We take the last 24 and reverse them so they are chronological (oldest -> newest),
  // which is strictly required by the lightweight-charts library to render correctly.
  return data.slice(0, 24).map(([time, open, high, low, close, volume]) => ({
    time: Math.floor(time / 1000), // lightweight-charts expects seconds
    open, high, low, close, volume
  })).reverse();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await logAction('🔭 Scout mission started. Scanning all Gemini USD markets...');

    // Step 1: Get all movers, take top 12
    const allMovers = await getAllMovers();
    const topMovers = allMovers.slice(0, 12);

    await logAction(`📊 Top mover identified: ${topMovers[0]?.displaySymbol} (${topMovers[0]?.change24h?.toFixed(2)}% 24h)`, true);

    // Step 2: Fetch OHLCV for each top mover (in parallel)
    const moversWithCandles = await Promise.all(
      topMovers.map(async (mover) => {
        const candles = await getCandles(mover.symbol);
        return { ...mover, candles };
      })
    );

    // Step 3: Build a concise data payload for the AI
    const marketSummary = moversWithCandles.map(m => ({
      symbol: m.displaySymbol,
      price: `$${m.price.toLocaleString()}`,
      change24h: `${m.change24h.toFixed(2)}%`,
      trend: m.change24h > 0 ? 'UP' : 'DOWN',
      recentCandles: m.candles.slice(0, 6).map(c => ({ close: c.close, volume: c.volume }))
    }));

    await logAction('🤖 Handing market data to AI Scout for news analysis...');

    // Step 4: Call Gemini AI with Google Search Grounding
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_AI_API_KEY });

    const scoutPrompt = `You are a crypto market scout with live internet access.
    
Analyze this real-time market data from the Gemini Exchange and use Google Search to find breaking news, regulatory updates, partnerships, or major social sentiment for EACH asset.

Market Data (last 24h):
${JSON.stringify(marketSummary, null, 2)}

Return ONLY a valid JSON array (no markdown, no code blocks, just the raw array) where each object has exactly these fields:
- "symbol": string (ticker, e.g. "BTC")
- "direction": "bullish" | "bearish" | "neutral"
- "change24h": number (the percentage)
- "price": string (formatted price)
- "newsHeadline": string (one real news headline you found, or "No major news" if none)
- "analystNote": string (your one-sentence key insight combining price action and news)
- "riskLevel": "low" | "medium" | "high"`;

    const aiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: scoutPrompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    // Step 5: Parse the AI's JSON response
    let scoutReport = [];
    try {
      let rawText = aiResponse.text.trim();
      // Strip any accidental markdown code fences
      rawText = rawText.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
      scoutReport = JSON.parse(rawText);
    } catch (parseErr) {
      // If AI response can't be parsed, fall back to raw market data
      await logAction('⚠️ Scout AI parse error — returning raw market data.');
      scoutReport = topMovers.map(m => ({
        symbol: m.displaySymbol,
        direction: m.change24h > 0 ? 'bullish' : 'bearish',
        change24h: parseFloat(m.change24h.toFixed(2)),
        price: `$${m.price.toLocaleString()}`,
        newsHeadline: 'AI analysis unavailable',
        analystNote: `${m.displaySymbol} moved ${m.change24h.toFixed(2)}% in the last 24 hours.`,
        riskLevel: Math.abs(m.change24h) > 10 ? 'high' : Math.abs(m.change24h) > 4 ? 'medium' : 'low'
      }));
    }

    // Step 6: Attach candle data for the chart (not sent to AI to save tokens)
    const finalReport = scoutReport.map((item, idx) => ({
      ...item,
      candles: moversWithCandles[idx]?.candles || []
    }));

    await logAction(`✅ Scout report complete. ${finalReport.length} assets analyzed.`, true);

    const generatedAt = new Date().toISOString();

    // Persist to DynamoDB — strip candle arrays first to keep item size small
    const reportForStorage = finalReport.map(({ candles: _, ...rest }) => rest);
    await saveScoutReport(reportForStorage, generatedAt);

    // ── Auto-evaluate strategies using fresh Scout data ────────────────────
    // Build tickerMap from data already in memory — no second Gemini API call
    const tickerMap = {};
    for (const mover of moversWithCandles) {
      tickerMap[mover.displaySymbol.toUpperCase()] = {
        price: mover.price,
        change24h: mover.change24h,
      };
    }
    try {
      const evalResult = await runEvaluation({ tickerMap, scoutReport: finalReport });
      if (evalResult.triggered.length > 0) {
        await logAction(
          `🚨 Auto-eval: ${evalResult.triggered.length} strategy triggered after Scout — ${evalResult.triggered.join(', ')}`,
          true
        );
      } else if (evalResult.evaluated > 0) {
        await logAction(`✅ Auto-eval: ${evalResult.evaluated} strategies checked — none triggered.`);
      }
    } catch (evalErr) {
      console.warn('[Scout] Strategy auto-eval failed (non-fatal):', evalErr.message);
    }

    // ── Global AI Autopilot ────────────────────────────────────────────────
    try {
      const { getSettings } = await import('../lib/db.js');
      const settings = await getSettings();
      if (settings.autopilotEnabled) {
        await logAction('🚀 CIPHER Core Autopilot is ON. AI evaluating the market for a trade opportunity...');
        
        const { executeTrade, getPortfolioBalances } = await import('../lib/trade.js');
        const balances = await getPortfolioBalances().catch(() => ({}));
        const liquidatable = settings.liquidatableAssets || [];

        const missionDirective = settings.missionDirective || 'Make 10 trades and secure $25 in profit.';

        const autopilotPrompt = `You are CIPHER (Crypto Intelligence & Portfolio Heuristics Engine/Router), an elite autonomous fund manager.

Your MISSION DIRECTIVE is:
"${missionDirective}"

Here is the latest Scout market report for the top movers:
${JSON.stringify(reportForStorage, null, 2)}

Your current Portfolio Balances (Available Capital):
${JSON.stringify(balances, null, 2)}

You are authorized to sell any of the following assets to free up USD capital if needed: ${liquidatable.length > 0 ? liquidatable.join(', ') : 'NONE'}

Analyze this data and your mission directive. You have full discretion over trade sizing. You may choose to trade any asset or HOLD.
If you want to BUY an asset but your USD balance is low, you MAY choose to liquidate a permitted asset. 
To do this, set "fundingSource" to the symbol of the authorized asset you want to sell to fund this buy (e.g., "ETH"). You can ONLY use assets listed in the authorized list above.
If you have enough USD or are just doing a normal SELL, set "fundingSource" to "USD".

Return ONLY a JSON object with this exact structure (no markdown fences, just raw JSON):
{
  "decision": "buy" | "sell" | "hold" | "complete",
  "symbol": "BTC", // required if buying/selling
  "amount": 10.50,  // the USD amount you decide to trade based on your mission
  "fundingSource": "USD", // "USD" or the symbol of an authorized asset to liquidate
  "reasoning": "One sentence explaining why you are making this move. If you use 'complete', explain that the mission is accomplished.",
  "optimizationSuggestion": "If decision is 'complete', provide 1 sentence on how the user could optimize the Mission Directive or parameters for better results next time."
}

If you evaluate your Portfolio Balances and determine that you have successfully accomplished your Mission Directive, you MUST return "decision": "complete". Do not stop executing. Provide an optimization suggestion so we can immediately start the next cycle with better context.`;

        const apRes = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: autopilotPrompt
        });
        
        let rawApText = apRes.text.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
        const apDecision = JSON.parse(rawApText);
        
        if (apDecision.decision === 'buy' || apDecision.decision === 'sell') {
           const fundSrc = (apDecision.fundingSource || 'USD').toUpperCase();
           
           if (apDecision.decision === 'buy' && fundSrc !== 'USD') {
             if (!liquidatable.includes(fundSrc)) {
               await logAction(`❌ Autopilot tried to liquidate ${fundSrc}, but it is not in the approved liquidatable assets list! Trade aborted.`);
             } else {
               await logAction(`🧠 Autopilot Decision: LIQUIDATE ${fundSrc} to fund BUY of ${apDecision.symbol}. Reason: ${apDecision.reasoning}`, true);
               // 1. Sell the funding source
               await executeTrade(fundSrc, 'sell', apDecision.amount);
               // 2. Buy the target asset
               await executeTrade(apDecision.symbol, 'buy', apDecision.amount);
             }
           } else {
             await logAction(`🧠 Autopilot Decision: ${apDecision.decision.toUpperCase()} $${apDecision.amount} of ${apDecision.symbol}. Reason: ${apDecision.reasoning}`, true);
             await executeTrade(apDecision.symbol, apDecision.decision, apDecision.amount);
           }
        } else if (apDecision.decision === 'complete') {
           const { updateSettings } = await import('../lib/db.js');
           const completions = (settings.missionCompletions || 0) + 1;
           const startTime = settings.missionStartTime ? new Date(settings.missionStartTime) : new Date();
           const hoursActive = ((Date.now() - startTime.getTime()) / (1000 * 60 * 60)).toFixed(2);
           
           await logAction(`🏁 MISSION ACCOMPLISHED (x${completions}). Uptime: ${hoursActive} hours. Re-running cycle. Reason: ${apDecision.reasoning}`, true);
           if (apDecision.optimizationSuggestion) {
               await logAction(`🧠 AI Optimization Suggestion: ${apDecision.optimizationSuggestion}`, true);
           }
           await updateSettings({ missionCompletions: completions });
        } else {
           await logAction(`🧠 Autopilot Decision: HOLD. Reason: ${apDecision.reasoning}`);
        }
      }
    } catch (apErr) {
      console.warn('[Autopilot Error]:', apErr);
      await logAction(`❌ Autopilot error: ${apErr.message}`);
    }

    return res.status(200).json({
      generatedAt,
      report: finalReport // Return full report with candles to the frontend
    });

  } catch (error) {
    console.error('[Scout Error]:', error);
    await logAction(`❌ Scout error: ${error.message}`);
    return res.status(500).json({ error: 'Scout mission failed', details: error.message });
  }
}
