import crypto from 'crypto';
import { logAction } from './db.js';

/**
 * Execute a trade on Gemini.
 * @param {string} symbol - e.g., 'BTC'
 * @param {string} side - 'buy' or 'sell'
 * @param {number} usdAmount - The dollar amount to trade (e.g., 2.00)
 */
export async function executeTrade(symbol, side, usdAmount) {
  // Trade size is now fully determined by CIPHER's autonomous engine.
  const apiKey = process.env.GEMINI_EXCHANGE_API_KEY;
  const apiSecret = process.env.GEMINI_EXCHANGE_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('Missing Gemini Exchange API keys');
  }

  const tickerSymbol = `${symbol}usd`.toLowerCase();

  // 1. Fetch current market price to calculate asset amount
  const priceRes = await fetch(`https://api.gemini.com/v1/pubticker/${tickerSymbol}`);
  if (!priceRes.ok) {
    throw new Error(`Failed to fetch current price for ${symbol}`);
  }
  const ticker = await priceRes.json();
  const currentPrice = parseFloat(ticker.last);

  if (!currentPrice || currentPrice <= 0) {
    throw new Error(`Invalid market price returned for ${symbol}`);
  }

  // Calculate amount of crypto to buy/sell
  let assetAmount = usdAmount / currentPrice;

  // Gemini requires amounts to be rounded to a specific decimal place. 
  // For most major assets, 5-6 decimals is safe, but we'll use 6.
  // Actually, BTC allows 8. Let's use 6 for safety to avoid MIN_SIZE errors on cheap coins, 
  // but wait: for $2 of BTC ($90k), asset amount is 0.000022. 
  // Let's use 6 decimals.
  assetAmount = parseFloat(assetAmount.toFixed(6));

  if (assetAmount <= 0) {
    throw new Error(`Calculated asset amount too small for $${usdAmount} of ${symbol}`);
  }

  // 2. Prepare Order Payload
  // Gemini does not have a native "market" order via REST.
  // To simulate it, we use "exchange limit" with "immediate-or-cancel".
  // For buys, we set price 5% higher than current to guarantee immediate fill.
  // For sells, we set price 5% lower.
  const limitPriceMultiplier = side === 'buy' ? 1.05 : 0.95;
  const limitPrice = (currentPrice * limitPriceMultiplier).toFixed(2);

  const endpoint = '/v1/order/new';
  const url = `https://api.gemini.com${endpoint}`;
  
  const payload = {
    request: endpoint,
    nonce: Date.now(),
    account: 'primary',
    symbol: tickerSymbol,
    amount: assetAmount.toString(),
    price: limitPrice.toString(),
    side: side,
    type: 'exchange limit',
    options: ['immediate-or-cancel']
  };

  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto.createHmac('sha384', apiSecret).update(b64Payload).digest('hex');

  // 3. Execute Order
  try {
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

    const data = await response.json();

    if (!response.ok) {
      await logAction(`❌ Trade Failed: Attempted to ${side} $${usdAmount} of ${symbol}. Error: ${data.message || data.reason}`);
      throw new Error(data.message || data.reason);
    }

    const execAmount = data.executed_amount || '0';
    await logAction(`✅ Trade Executed: ${side.toUpperCase()} ${execAmount} ${symbol} for ~$${usdAmount} (IOC limit order).`);
    
    return data;

  } catch (error) {
    console.error('Trade Execution Error:', error);
    throw error;
  }
}

/**
 * Fetch current portfolio balances.
 * Used by the AI to determine if there are liquidatable assets.
 */
export async function getPortfolioBalances() {
  const apiKey = process.env.GEMINI_EXCHANGE_API_KEY;
  const apiSecret = process.env.GEMINI_EXCHANGE_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('Missing Gemini Exchange API keys');
  }

  const endpoint = '/v1/notionalbalances/usd';
  const url = `https://api.gemini.com${endpoint}`;
  
  const payload = {
    request: endpoint,
    nonce: Date.now(),
    account: 'primary'
  };

  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto.createHmac('sha384', apiSecret).update(b64Payload).digest('hex');

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
    throw new Error(`Failed to fetch balances: ${await response.text()}`);
  }

  const json = await response.json();
  const activeBalances = {};
  
  if (Array.isArray(json)) {
    json.forEach(item => {
      const amount = parseFloat(item.amount || 0);
      const notional = parseFloat(item.amountNotional || 0);
      if (amount > 0) {
        activeBalances[item.currency.toUpperCase()] = {
          amount,
          notional
        };
      }
    });
  }
  
  return activeBalances;
}
