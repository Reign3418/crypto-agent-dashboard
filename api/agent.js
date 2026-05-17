import createKimiClient from '../lib/ai-client.js';
import crypto from 'crypto';
import { logAction } from '../lib/db.js';

// --- Gemini Exchange API Helpers ---
async function geminiExchangeApiRequest(endpoint, payload = {}) {
  const apiKey = process.env.GEMINI_EXCHANGE_API_KEY;
  const apiSecret = process.env.GEMINI_EXCHANGE_API_SECRET;
  
  if (!apiKey || !apiSecret) {
    throw new Error("Missing Gemini Exchange API keys.");
  }

  const url = `https://api.gemini.com${endpoint}`;
  
  const basePayload = {
    request: endpoint,
    nonce: Date.now(),
    account: 'primary',
    ...payload
  };

  const b64Payload = Buffer.from(JSON.stringify(basePayload)).toString('base64');
  
  const signature = crypto
    .createHmac('sha384', apiSecret)
    .update(b64Payload)
    .digest('hex');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'Content-Length': '0',
      'X-GEMINI-APIKEY': apiKey,
      'X-GEMINI-PAYLOAD': b64Payload,
      'X-GEMINI-SIGNATURE': signature,
      'Cache-Control': 'no-cache'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini Exchange Error: ${response.status} - ${text}`);
  }

  return await response.json();
}

async function getTicker(symbol) {
    const url = `https://api.gemini.com/v1/pubticker/${symbol}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ticker for ${symbol}`);
    return await response.json();
}

// --- Main Serverless Function ---
export default async function handler(req, res) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, history } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  if (!process.env.KIMI_API_KEY) {
    return res.status(500).json({ error: 'Missing KIMI_API_KEY in Vercel Environment Variables' });
  }

  try {
    // Log the user's incoming command
    await logAction(`Received instruction: "${prompt.substring(0, 40)}..."`);

    const kimi = createKimiClient();

    // 1. Define the System Prompt with embedded tool descriptions
    const systemPrompt = `You are an elite cryptocurrency trading assistant. You have access to real-time market data and the user's Gemini portfolio. Analyze data intelligently and answer concisely.

CRITICAL EMERGENCY DIRECTIVES:
1. SPREAD PROTECTION: You may ONLY trade BTC, ETH, SOL, and XRP. Do not trade any other coins, as their low liquidity and massive spreads destroy capital.
2. PORTFOLIO PROTECTION: You MUST enact a strict 5% stop-loss logic. If the user's assets are down more than 5% from their value, prioritize selling them immediately to cut losses.
3. CHURN PREVENTION: Do not execute new BUYS if the portfolio already holds active positions in non-stablecoin assets, to prevent massive fee churn.

You have access to the following tools. To use a tool, respond with ONLY a valid JSON object in this exact format:
{"tool": "functionName", "parameters": {...}}

After receiving tool results, you may call another tool (up to 5 times) or provide a final plain-text answer to the user.

Available tools:

1. getAccountBalances
   Description: Fetch the current balances of all assets in the user's Gemini crypto portfolio.
   Parameters: none

2. getMarketTicker
   Description: Get the latest market ticker data for a specific trading pair (e.g., btcusd, ethusd, solusd).
   Parameters:
     - symbol (string, required): The trading pair symbol, like btcusd or ethusd.

3. getScoutReport
   Description: Run the Scout — scan all Gemini markets, find the top movers up and down, read live news for each, and return a ranked intelligence report. Use this when the user asks what is hot, what is moving, what they should watch, or for a market overview.
   Parameters: none

4. evaluateStrategies
   Description: Evaluate all active trading strategies against the current market. Returns which strategies have their conditions met and which are not triggered. Use when the user asks if any strategies are triggered, what their rules are doing, or for a strategy status check.
   Parameters: none

5. executeTrade
   Description: Execute a real, live buy or sell trade on the Gemini Exchange. The USD amount determines the size of the trade. Use this when the user explicitly asks to buy or sell an asset.
   Parameters:
     - symbol (string, required): The trading pair symbol without USD, e.g. BTC or ETH
     - side (string, required): Either "buy" or "sell"
     - usdAmount (number, required): The dollar amount to trade.

IMPORTANT:
- When you want to call a tool, output ONLY the JSON object. Do not add markdown formatting, explanation text, or code fences.
- When you are ready to answer the user, respond with plain text (NOT JSON).
- Do not call more than 5 tools in total for a single user request.`;

    // 2. Build the messages array for Kimi
    let messages = [{ role: 'system', content: systemPrompt }];

    if (history && Array.isArray(history)) {
        const historyMessages = history.map(msg => ({
            role: msg.role === 'agent' ? 'assistant' : msg.role,
            content: msg.content
        }));
        messages.push(...historyMessages);
    }
    messages.push({ role: 'user', content: prompt });

    // 3. The Agentic Loop
    let finalResponseText = '';
    let isAgentDone = false;
    const maxLoops = 5; // Prevent infinite loops
    let loops = 0;

    while (!isAgentDone && loops < maxLoops) {
        loops++;
        const response = await kimi.chat(messages, { temperature: 0.3 });

        // Try to parse the response as a tool call
        let toolCall = null;
        try {
            const parsed = JSON.parse(response.trim());
            if (parsed.tool && typeof parsed.tool === 'string') {
                toolCall = parsed;
            }
        } catch {
            // Not valid JSON — treat as plain text (final response)
        }

        if (toolCall) {
            const toolName = toolCall.tool;
            const toolParams = toolCall.parameters || {};
            let toolResult = {};

            try {
                await logAction(`Executing AI Tool: ${toolName}`, true);
                
                if (toolName === 'getAccountBalances') {
                    const balances = await geminiExchangeApiRequest('/v1/balances');
                    toolResult = { balances: balances.filter(b => parseFloat(b.amount) > 0) };
                    await logAction(`Successfully retrieved portfolio balances.`);
                } else if (toolName === 'getMarketTicker') {
                    const { symbol } = toolParams;
                    const tickerData = await getTicker(symbol);
                    toolResult = { ticker: tickerData };
                    await logAction(`Fetched market data for ${symbol.toUpperCase()}.`);
                } else if (toolName === 'getScoutReport') {
                    await logAction('Agent triggered Scout — scanning all markets + news...', true);
                    // Call the Gemini public pricefeed directly instead of an internal self-call
                    const pfRes = await fetch('https://api.gemini.com/v1/pricefeed');
                    const pfData = await pfRes.json();
                    const topMovers = pfData
                        .filter(i => i.pair.toLowerCase().endsWith('usd'))
                        .map(i => ({
                            symbol: i.pair.replace(/USD$/i, ''),
                            price: parseFloat(i.price),
                            change24h: (parseFloat(i.percentChange24h) * 100).toFixed(2) + '%'
                        }))
                        .sort((a, b) => Math.abs(parseFloat(b.change24h)) - Math.abs(parseFloat(a.change24h)))
                        .slice(0, 12);
                    toolResult = { topMovers };
                    await logAction(`Scout returned ${topMovers.length} top movers for AI analysis.`);
                } else if (toolName === 'evaluateStrategies') {
                    await logAction('Agent evaluating all active strategies...', true);
                    const evalRes = await fetch(`https://${req.headers.host}/api/evaluate`);
                    if (!evalRes.ok) throw new Error('Strategy evaluation API failed');
                    const evalData = await evalRes.json();
                    toolResult = evalData;
                    await logAction(`Strategy eval complete: ${evalData.triggered?.length || 0} triggered out of ${evalData.evaluated} active.`);
                } else if (toolName === 'executeTrade') {
                    const { symbol, side, usdAmount } = toolParams;
                    await logAction(`Agent attempting to ${side.toUpperCase()} $${usdAmount} of ${symbol}...`, true);
                    
                    const { executeTrade } = await import('../lib/trade.js');
                    const tradeData = await executeTrade(symbol, side, usdAmount);
                    
                    toolResult = { 
                      success: true, 
                      executed_amount: tradeData.executed_amount,
                      price: tradeData.price,
                      order_id: tradeData.order_id,
                      fee_amount: tradeData.fee_amount,
                      fee_currency: tradeData.fee_currency
                    };
                } else {
                    toolResult = { error: `Unknown tool: ${toolName}` };
                }
            } catch (apiError) {
                await logAction(`Tool Error (${toolName}): ${apiError.message}`);
                toolResult = { error: apiError.message };
            }

            // Append the model's tool request to the conversation history
            messages.push({ role: 'assistant', content: response.trim() });
            // Append the actual tool data back to the conversation history
            messages.push({ role: 'user', content: `Tool result for "${toolName}": ${JSON.stringify(toolResult)}` });
            
            // Loop restarts so the AI can decide if it needs to call another tool!
        } else {
            // The AI didn't call any tools, meaning it is finally ready to speak to the user!
            finalResponseText = response || "No response generated.";
            isAgentDone = true;
        }
    }

    if (!isAgentDone) {
        finalResponseText = "I reached my maximum processing depth and could not complete the request. Please try rephrasing.";
    }

    // Never return a blank bubble — always have something to say
    if (!finalResponseText || finalResponseText.trim() === '') {
        finalResponseText = "I completed the analysis but could not generate a text summary. Please try again.";
    }

    await logAction(`Task complete. Responded to user.`);
    return res.status(200).json({ response: finalResponseText });

  } catch (error) {
    console.error('[Agent Error]:', error);
    await logAction(`System Error: ${error.message}`);
    return res.status(500).json({ 
      error: 'Backend Execution Failed.',
      details: error.message 
    });
  }
}
