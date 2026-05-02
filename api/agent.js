import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';
import { logAction } from '../lib/db.js';

// --- Gemini Exchange API Helpers ---
async function geminiPrivateApiRequest(endpoint, payload = {}) {
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

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  if (!process.env.GEMINI_AI_API_KEY) {
    return res.status(500).json({ error: 'Missing GEMINI_AI_API_KEY in Vercel Environment Variables' });
  }

  try {
    // Log the user's incoming command
    await logAction(`Received instruction: "${prompt.substring(0, 40)}..."`);

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_AI_API_KEY });

    // 1. Define the Tools (What the AI is allowed to do)
    const tools = [{
      functionDeclarations: [
        {
          name: 'getAccountBalances',
          description: 'Fetch the current balances of all assets in the user\'s Gemini crypto portfolio.',
        },
        {
          name: 'getMarketTicker',
          description: 'Get the latest market ticker data for a specific trading pair (e.g., btcusd, ethusd, solusd).',
          parameters: {
            type: 'OBJECT',
            properties: {
              symbol: {
                type: 'STRING',
                description: 'The trading pair symbol, like btcusd or ethusd.'
              }
            },
            required: ['symbol']
          }
        },
        {
          name: 'getScoutReport',
          description: 'Run the Scout — scan all Gemini markets, find the top movers up and down, read live news for each, and return a ranked intelligence report. Use this when the user asks what is hot, what is moving, what they should watch, or for a market overview.',
        },
        {
          name: 'evaluateStrategies',
          description: 'Evaluate all active trading strategies against the current market. Returns which strategies have their conditions met and which are not triggered. Use when the user asks if any strategies are triggered, what their rules are doing, or for a strategy status check.',
        },
        {
          name: 'executeTrade',
          description: 'Execute a real, live buy or sell trade on the Gemini Exchange. The backend has a hardcoded safety cap of $2.00 max per trade, so the USD amount MUST be <= 2.00. Use this when the user explicitly asks to buy or sell an asset.',
          parameters: {
            type: 'OBJECT',
            properties: {
              symbol: { type: 'STRING', description: 'The trading pair symbol without USD, e.g. BTC or ETH' },
              side: { type: 'STRING', description: 'Either "buy" or "sell"' },
              usdAmount: { type: 'NUMBER', description: 'The dollar amount to trade. MUST NOT EXCEED 2.00.' }
            },
            required: ['symbol', 'side', 'usdAmount']
          }
        }
      ]
    }];

    const systemInstruction = "You are an elite cryptocurrency trading assistant. You have access to real-time market data and the user's Gemini portfolio. Analyze data intelligently and answer concisely.";

    // 2. The Agentic Loop
    let contents = [{ role: 'user', parts: [{ text: prompt }] }];
    let finalResponseText = '';
    let isAgentDone = false;
    let maxLoops = 5; // Prevent infinite loops
    let loops = 0;

    while (!isAgentDone && loops < maxLoops) {
        loops++;
        const aiResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: { tools, systemInstruction }
        });

        // Did the AI decide to use a tool?
        if (aiResponse.functionCalls && aiResponse.functionCalls.length > 0) {
            const functionCall = aiResponse.functionCalls[0];
            let functionResult = {};

            try {
                await logAction(`Executing AI Tool: ${functionCall.name}`, true);
                
                if (functionCall.name === 'getAccountBalances') {
                    const balances = await geminiPrivateApiRequest('/v1/balances');
                    functionResult = { balances: balances.filter(b => parseFloat(b.amount) > 0) };
                    await logAction(`Successfully retrieved portfolio balances.`);
                } else if (functionCall.name === 'getMarketTicker') {
                    const { symbol } = functionCall.args;
                    const tickerData = await getTicker(symbol);
                    functionResult = { ticker: tickerData };
                    await logAction(`Fetched market data for ${symbol.toUpperCase()}.`);
                } else if (functionCall.name === 'getScoutReport') {
                    await logAction('🔭 Agent triggered Scout — scanning all markets + news...', true);
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
                    functionResult = { topMovers };
                    await logAction(`✅ Scout returned ${topMovers.length} top movers for AI analysis.`);
                } else if (functionCall.name === 'evaluateStrategies') {
                    await logAction('⚡ Agent evaluating all active strategies...', true);
                    const evalRes = await fetch(`https://${req.headers.host}/api/evaluate`);
                    if (!evalRes.ok) throw new Error('Strategy evaluation API failed');
                    const evalData = await evalRes.json();
                    functionResult = evalData;
                    await logAction(`✅ Strategy eval complete: ${evalData.triggered?.length || 0} triggered out of ${evalData.evaluated} active.`);
                } else if (functionCall.name === 'executeTrade') {
                    const { symbol, side, usdAmount } = functionCall.args;
                    await logAction(`🤖 Agent attempting to ${side.toUpperCase()} $${usdAmount} of ${symbol}...`, true);
                    
                    const { executeTrade } = await import('../lib/trade.js');
                    const tradeData = await executeTrade(symbol, side, usdAmount);
                    
                    functionResult = { 
                      success: true, 
                      executed_amount: tradeData.executed_amount,
                      price: tradeData.price,
                      order_id: tradeData.order_id
                    };
                }
            } catch (apiError) {
                await logAction(`Tool Error (${functionCall.name}): ${apiError.message}`);
                functionResult = { error: apiError.message };
            }

            // Append the model's tool request to the conversation history
            contents.push({ role: 'model', parts: [{ functionCall }] });
            // Append the actual tool data back to the conversation history
            contents.push({ role: 'user', parts: [{ functionResponse: { name: functionCall.name, response: functionResult } }] });
            
            // Loop restarts so the AI can decide if it needs to call another tool!
        } else {
            // The AI didn't call any tools, meaning it is finally ready to speak to the user!
            finalResponseText = aiResponse.text || "No response generated.";
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
