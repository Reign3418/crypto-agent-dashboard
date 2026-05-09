import { GoogleGenAI } from '@google/genai';
import { logAction, saveScoutReport, updateSettings } from '../lib/db.js';
import { runEvaluation } from '../lib/evaluator.js';
import { runNumNum } from '../lib/numnum.js';

/**
 * Big Jon — The Conflict Referee
 * Runs before any trade is executed. Checks if CIPHER's proposed action
 * directly conflicts with NULL's current strategic directive.
 * If a conflict is detected, Big Jon stops the fight and triggers an auto-stop.
 *
 * Returns { conflict: boolean, reason: string }
 */
async function checkNullCipherSync(ai, nullDirective, cipherDecision) {
  // If NULL has no directive yet, no conflict possible
  if (!nullDirective || nullDirective.trim() === '') {
    return { conflict: false, reason: 'No NULL directive active.' };
  }
  // Only check when CIPHER wants to actively trade (not hold/complete/fail)
  if (cipherDecision.decision !== 'buy' && cipherDecision.decision !== 'sell') {
    return { conflict: false, reason: 'CIPHER is holding. No action to conflict.' };
  }

  const syncPrompt = `You are a conflict-detection arbitrator for a dual-agent trading system.

NULL (Strategic Commander) issued this directive:
"${nullDirective}"

CIPHER (Tactical Agent) is about to execute this action:
${JSON.stringify(cipherDecision, null, 2)}

Does CIPHER's proposed action DIRECTLY CONTRADICT NULL's directive? 
A conflict means NULL said to hold/stop/pause/avoid an asset and CIPHER is about to trade it anyway.
If NULL said to focus on a specific asset and CIPHER is trading a different one, that is also a conflict.
If NULL said to raise profit thresholds and CIPHER is selling at a loss or tiny margin, that is a conflict.

Return ONLY valid JSON (no markdown):
{ "conflict": true | false, "reason": "one sentence explanation" }`;

  try {
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: syncPrompt,
    });
    const raw = res.text.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(raw);
  } catch (e) {
    // If the sync check itself fails, fail safe — do NOT block the trade
    console.warn('[Sync Validator] Check failed, allowing trade:', e.message);
    return { conflict: false, reason: 'Sync check error — defaulting to allow.' };
  }
}

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

export async function runScoutMission() {
  try {
    await logAction('🔭 Scout mission started. Scanning 9 core assets...');

    // Step 1: HARD-LOCKED to liquid assets only.
    // The backend trade guardrail already blocks other coins, so scanning altcoins
    // is pure noise that confuses the AI. We fetch exactly the nine we care about.
    const CORE_ASSETS = [
      { symbol: 'btcusd', displaySymbol: 'BTC' },
      { symbol: 'ethusd', displaySymbol: 'ETH' },
      { symbol: 'solusd', displaySymbol: 'SOL' },
      { symbol: 'xrpusd', displaySymbol: 'XRP' },
      { symbol: 'linkusd', displaySymbol: 'LINK' },
      { symbol: 'dogeusd', displaySymbol: 'DOGE' },
      { symbol: 'ltcusd', displaySymbol: 'LTC' },
      { symbol: 'avaxusd', displaySymbol: 'AVAX' },
      { symbol: 'bchusd', displaySymbol: 'BCH' },
    ];

    const priceFeedRes = await fetch('https://api.gemini.com/v1/pricefeed');
    const priceFeedData = priceFeedRes.ok ? await priceFeedRes.json() : [];
    const priceMap = {};
    for (const item of priceFeedData) {
      priceMap[item.pair.toLowerCase()] = {
        price: parseFloat(item.price),
        change24h: parseFloat(item.percentChange24h) * 100,
      };
    }

    const topMovers = CORE_ASSETS.map(asset => ({
      symbol: asset.symbol,
      displaySymbol: asset.displaySymbol,
      price: priceMap[asset.symbol]?.price || 0,
      change24h: priceMap[asset.symbol]?.change24h || 0,
    })).filter(m => m.price > 0);

    // Find biggest mover among the three for the log
    const biggestMover = [...topMovers].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))[0];
    await logAction(`📊 Core asset scan complete. Biggest mover: ${biggestMover?.displaySymbol} (${biggestMover?.change24h?.toFixed(2)}% 24h)`, true);

    // Step 2: Fetch OHLCV for each core asset (in parallel)
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

    await logAction('🤖 Handing market data to AI Scout for analysis...');

    // Step 4: Call Gemini AI with Google Search Grounding
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_AI_API_KEY });

    const scoutPrompt = `You are a crypto market scout with live internet access. You are the intelligence arm of an autonomous fund that ONLY trades 9 core assets (BTC, ETH, SOL, XRP, LINK, DOGE, LTC, AVAX, BCH).

Analyze this real-time market data from the Gemini Exchange and use Google Search to find breaking news, regulatory updates, macro events, or major social sentiment specifically for these 9 assets.

Market Data (last 24h):
${JSON.stringify(marketSummary, null, 2)}

Return ONLY a valid JSON array (no markdown, no code blocks, just the raw array) where each object has exactly these fields:
- "symbol": string (ticker, e.g. "BTC")
- "direction": "bullish" | "bearish" | "neutral"
- "change24h": number (the percentage)
- "price": string (formatted price)
- "newsHeadline": string (one real news headline you found, or "No major news" if none)
- "analystNote": string (your one-sentence key insight combining price action and news — focus on whether this is a good entry/exit opportunity)
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

    // BUG 2 FIX: Always ensure BTC, ETH, SOL are in tickerMap for stop-loss coverage.
    // On calm days these may not be in the top 12 movers, which would silently skip stop-loss.
    const CORE_TICKERS = ['BTC', 'ETH', 'SOL', 'XRP'];
    for (const asset of CORE_TICKERS) {
      if (!tickerMap[asset]) {
        try {
          const pRes = await fetch(`https://api.gemini.com/v1/pubticker/${asset.toLowerCase()}usd`);
          if (pRes.ok) {
            const pData = await pRes.json();
            tickerMap[asset] = { price: parseFloat(pData.last), change24h: 0 };
          }
        } catch(e) { /* non-fatal — skip */ }
      }
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
      const { getSettings, getRecentLogs } = await import('../lib/db.js');
      const { fetchLiveNews } = await import('../lib/news.js');
      const settings = await getSettings();
      const recentLogs = await getRecentLogs().catch(() => []);
      const liveNews = await fetchLiveNews();

      // BUG 3 FIX: Hard stop-loss ALWAYS runs — regardless of autopilot toggle.
      // If you turn off autopilot, you still need capital protection.
      const { executeTrade, getPortfolioBalances } = await import('../lib/trade.js');
      let panicSold = false;
      if (settings.openPositions && Object.keys(settings.openPositions).length > 0) {
        for (const [sym, data] of Object.entries(settings.openPositions)) {
          const currentData = tickerMap[sym.toUpperCase()];
          if (currentData) {
            const buyPrice = parseFloat(data.buyPrice);
            const currentPrice = parseFloat(currentData.price);
            const dropPct = ((buyPrice - currentPrice) / buyPrice) * 100;

            if (dropPct >= 5.0) {
              await logAction(`🚨 HARD STOP-LOSS TRIGGERED: ${sym} dropped ${dropPct.toFixed(2)}% from buy price $${buyPrice.toFixed(2)}. Bypassing AI and executing PANIC SELL!`, true);
              try {
                const notionalToSell = parseFloat(data.amount) * currentPrice;
                if (notionalToSell > 1.00) {
                  await executeTrade(sym, 'sell', notionalToSell.toFixed(2));
                } else {
                  await logAction(`⚠️ Notional value of ${sym} too low to sell ($${notionalToSell.toFixed(2)}). Removing from active memory.`);
                  const { updateSettings } = await import('../lib/db.js');
                  let openPos = settings.openPositions;
                  delete openPos[sym];
                  await updateSettings({ openPositions: openPos });
                }
                panicSold = true;
              } catch(e) {
                await logAction(`❌ Failed to execute panic sell for ${sym}: ${e.message}`);
              }
            }
          }
        }
      }

      if (panicSold) {
        return res.status(200).json({ success: true, message: 'Hard Stop-Loss triggered. AI Autopilot bypassed for this cycle.' });
      }

      if (settings.autopilotEnabled) {
        await logAction('🚀 CIPHER Core Autopilot is ON. AI evaluating the market for a trade opportunity...');
        
        const balances = await getPortfolioBalances().catch(() => ({}));
        const liquidatable = settings.liquidatableAssets || [];

        const missionDirective = settings.missionDirective || 'Make 10 trades and secure $25 in profit.';

        const latestRollup = (settings.cognitiveRollups && settings.cognitiveRollups.length > 0) 
            ? settings.cognitiveRollups[0].text 
            : 'No recent rollups available.';
            
        const latestLedger = (settings.macroLedgers && settings.macroLedgers.length > 0)
            ? settings.macroLedgers[0].text
            : 'No recent macro ledgers available.';

        const autopilotPrompt = `You are CIPHER (Crypto Intelligence & Portfolio Heuristics Engine/Router), an elite autonomous fund manager.

Your MISSION DIRECTIVE is:
"${missionDirective}"
${settings.coachNotes ? `\nCOACH'S OVERRIDE NOTES:\n"${settings.coachNotes}"\n(You MUST prioritize these tactical notes in your immediate decisions.)\n` : ''}

Here is the latest Scout market report for the top movers:
${JSON.stringify(reportForStorage, null, 2)}

Your current Portfolio Balances (Available Capital):
${JSON.stringify(balances, null, 2)}

ACTIVE COST-BASIS MEMORY (What you paid for your current holdings):
${JSON.stringify(settings.openPositions || {}, null, 2)}
Use this memory to calculate your exact Unrealized Profit/Loss. Do not sell an asset if it is down unless it is a tactical necessity to free up capital. Try to sell assets that are UP from your buyPrice!

You are authorized to sell any of the following assets to free up USD capital if needed: ${liquidatable.length > 0 ? liquidatable.join(', ') : 'NONE'}

LATEST GLOBAL CRYPTO NEWS HEADLINES:
${JSON.stringify(liveNews, null, 2)}
Cross-reference these global headlines with the price action. Is a drop caused by a panic-inducing headline, or is a surge driven by major partnerships?

LONG-TERM AI MEMORY (Your Historical Post-Mortems):
Hourly Cognitive Rollup: "${latestRollup}"
Macro Trend Ledger: "${latestLedger}"
CRITICAL: You MUST incorporate the lessons from your long-term memory above into your current trading decision. If your memory says you are bleeding on fees, you MUST reduce trade frequency. If it says a specific strategy failed, DO NOT repeat it.

NEURAL FEEDBACK LOOP (Your Recent 5-Minute History):
${JSON.stringify(recentLogs.slice(0, 5), null, 2)}
Review your recent Neural Feed logs above. If you see recent trade errors or failures, you MUST learn from them and adapt your strategy. Do not repeat failed actions.

Analyze this data and your mission directive. You have full discretion over trade sizing. You may choose to trade any asset or HOLD.
If you want to BUY an asset but your USD balance is low, you MAY choose to liquidate a permitted asset. 
To do this, set "fundingSource" to the symbol of the authorized asset you want to sell to fund this buy (e.g., "ETH"). You can ONLY use assets listed in the authorized list above.
If you have enough USD or are just doing a normal SELL, set "fundingSource" to "USD".

Return ONLY a JSON object with this exact structure (no markdown fences, just raw JSON):
{
  "decision": "buy" | "sell" | "hold" | "complete" | "fail",
  "symbol": "BTC", // required if buying/selling
  "amount": 10.50,  // the USD amount you decide to trade based on your mission
  "fundingSource": "USD", // "USD" or the symbol of an authorized asset to liquidate
  "reasoning": "One sentence explaining why you are making this move. If you use 'complete' or 'fail', explain the outcome.",
  "optimizationSuggestion": "If decision is 'complete', provide 1 sentence on how the user could optimize the Mission Directive or parameters for better results next time."
}

If you evaluate your Portfolio Balances and determine that you have successfully accomplished your Mission Directive, you MUST return "decision": "complete". Do not stop executing. Provide an optimization suggestion so we can immediately start the next cycle with better context.
If you evaluate your Portfolio Balances and determine that your Mission Directive has completely failed (e.g., severe drawdown, out of capital, or impossible market conditions), you MUST return "decision": "fail". This will trigger an emergency halt to protect remaining funds.`;

        const apRes = await ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: autopilotPrompt
        });
        
        let rawApText = apRes.text.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
        const apDecision = JSON.parse(rawApText);
        
        if (apDecision.decision === 'buy' || apDecision.decision === 'sell') {
           // ── BIG JON CONFLICT CHECK ──────────────────────────────────────────
           // Big Jon steps in before any trade. If CIPHER and NULL are out of sync, he stops the fight.
           const sync = await checkNullCipherSync(ai, settings.coachNotes, apDecision);
           if (sync.conflict) {
             await logAction(`🛑 BIG JON STOPS THE FIGHT: CIPHER/NULL CONFLICT DETECTED. ${sync.reason} CIPHER wanted to ${apDecision.decision.toUpperCase()} ${apDecision.symbol}. NULL's directive: "${(settings.coachNotes || '').slice(0, 100)}". System halted for human review.`, true);
             await updateSettings({ autopilotEnabled: false });
             // Don't return — let runScoutMission finish normally and return its report
           } else {
             await logAction(`🥊 Big Jon: CIPHER & NULL are aligned. Let's get it on! Proceeding with ${apDecision.decision.toUpperCase()} ${apDecision.symbol}.`);
             // ── END BIG JON CHECK ──────────────────────────────────────────────

             // ── NUMNUM FEE VIABILITY CHECK ───────────────────────────────────────
             // NumNum does the math so CIPHER doesn't have to. Pure arithmetic gate.
             // Use tickerMap (already verified) instead of reportForStorage to get live price.
             const savedPos = (settings.openPositions || {})[apDecision.symbol?.toUpperCase()];
             const livePriceData = tickerMap[apDecision.symbol?.toUpperCase()];
             const livePrice = livePriceData?.price || savedPos?.buyPrice || 0;
             const numNumResult = runNumNum({
               side: apDecision.decision,
               usdAmount: apDecision.amount,
               currentPrice: parseFloat(livePrice),
               buyPrice: savedPos?.buyPrice ? parseFloat(savedPos.buyPrice) : null,
             });
             await logAction(`🔢 NumNum: ${numNumResult.reason}`);
             if (!numNumResult.approved) {
               // ── NUMNUM FEEDBACK LOOP ────────────────────────────────────────
               // Increment block counter so NULL can see repeated stalls in its hourly audit.
               const prevBlocks = parseInt(settings.numNumBlocks || '0');
               const newBlockCount = prevBlocks + 1;
               await updateSettings({
                 numNumBlocks: newBlockCount.toString(),
                 numNumBlockedSymbol: apDecision.symbol?.toUpperCase(),
                 numNumBlockedPrice: numNumResult.targetSellPrice?.toString(),
                 numNumLastBlockTime: Date.now().toString(),
               });
               await logAction(`⛔ NumNum BLOCKED the trade. (Block #${newBlockCount} on ${apDecision.symbol?.toUpperCase()}). CIPHER stands down. Waiting for better math.`);
               // ── END FEEDBACK LOOP ───────────────────────────────────────────
             } else {
               // ── END NUMNUM CHECK ────────────────────────────────────────────────

               const fundSrc = (apDecision.fundingSource || 'USD').toUpperCase();
               if (apDecision.decision === 'buy' && fundSrc !== 'USD') {
                 if (!liquidatable.includes(fundSrc)) {
                   await logAction(`❌ Autopilot tried to liquidate ${fundSrc}, but it is not in the approved liquidatable assets list! Trade aborted.`);
                 } else {
                   await logAction(`🧠 Autopilot Decision: LIQUIDATE ${fundSrc} to fund BUY of ${apDecision.symbol}. Reason: ${apDecision.reasoning}`, true);
                   await executeTrade(fundSrc, 'sell', apDecision.amount);
                   await executeTrade(apDecision.symbol, 'buy', apDecision.amount);
                 }
               } else {
                 await logAction(`🧠 Autopilot Decision: ${apDecision.decision.toUpperCase()} $${apDecision.amount} of ${apDecision.symbol}. Reason: ${apDecision.reasoning}`, true);
                 await executeTrade(apDecision.symbol, apDecision.decision, apDecision.amount);
               }
               // Trade executed — reset NumNum block counter
               await updateSettings({
                 numNumBlocks: '0',
                 numNumBlockedSymbol: '',
               });
             } // end NumNum approved
           } // end Big Jon approved
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
        } else if (apDecision.decision === 'fail') {
           await logAction(`🚨 MISSION FAILED. Emergency Halt Initiated. Reason: ${apDecision.reasoning}`, true);
           const { updateSettings } = await import('../lib/db.js');
           await updateSettings({ autopilotEnabled: false });
        } else {
           await logAction(`🧠 Autopilot Decision: HOLD. Reason: ${apDecision.reasoning}`);
        }
      }
    } catch (apErr) {
      console.warn('[Autopilot Error]:', apErr);
      await logAction(`❌ Autopilot error: ${apErr.message}`);
    }

    return {
      generatedAt,
      report: finalReport // Return full report with candles to the frontend
    };

  } catch (error) {
    console.error('[Scout Error]:', error);
    await logAction(`❌ Scout error: ${error.message}`);
    throw error;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = await runScoutMission();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Scout mission failed', details: err.message });
  }
}
