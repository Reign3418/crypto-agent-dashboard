import crypto from 'crypto';
import { logAction, getSettings, updateSettings } from './db.js';

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

  // --- EMERGENCY GUARDRAILS ---
  const ALLOWED_ASSETS = ['BTC', 'ETH', 'SOL', 'XRP', 'LINK', 'DOGE', 'LTC', 'AVAX', 'BCH'];
  if (side === 'buy' && !ALLOWED_ASSETS.includes(symbol.toUpperCase())) {
    await logAction(`⛔ GUARDRAIL: Rejected BUY order for ${symbol}. Asset is illiquid and violates SPREAD PROTECTION.`);
    throw new Error(`GUARDRAIL REJECTION: ${symbol} is restricted.`);
  }

  if (side === 'buy') {
    const balances = await getPortfolioBalances();
    // Count how many non-stablecoin assets we hold > $1.00 of
    let openPositions = 0;
    for (const [sym, data] of Object.entries(balances)) {
      if (sym !== 'USD' && sym !== 'GUSD' && data.notional > 1.0) {
        openPositions++;
      }
    }
    if (openPositions >= 2) {
      await logAction(`⛔ GUARDRAIL: Rejected BUY order for ${symbol}. Portfolio already holds ${openPositions} active positions. Violates CHURN PREVENTION.`);
      throw new Error(`GUARDRAIL REJECTION: Max open positions reached.`);
    }
  }
  // ----------------------------

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

  if (side === 'sell') {
    const balances = await getPortfolioBalances();
    const heldData = balances[symbol.toUpperCase()];
    if (heldData && heldData.amount) {
      const maxWeCanSell = parseFloat(heldData.amount);
      if (assetAmount > maxWeCanSell) {
         assetAmount = maxWeCanSell; // Clamp to what we actually own to prevent InsufficientFunds
      }
    }
  }

  // Gemini requires amounts to be rounded to a specific decimal place. 
  // For most major assets, 5-6 decimals is safe, but we'll use 6.
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
    let feeAmount = parseFloat(data.fee_amount || '0');
    const feeCurrency = data.fee_currency || 'USD';
    const avgPrice = parseFloat(data.avg_execution_price || limitPrice);
    
    // Calculate the TRUE exact USD volume of the trade that executed
    const trueUsdVol = parseFloat(execAmount) * avgPrice;

    // FORCE FEE MATH: Gemini IOC orders sometimes return 0 fee before settlement.
    // ActiveTrader taker fee is 0.40%. We must enforce this so Bastion isn't blind.
    if (feeAmount === 0 && trueUsdVol > 0) {
      feeAmount = trueUsdVol * 0.004;
    }

    await logAction(`✅ Trade Executed: ${side.toUpperCase()} ${execAmount} ${symbol} for ~$${trueUsdVol.toFixed(4)} (IOC). Fee: ${feeAmount.toFixed(4)} USD`);
    
    // Update cost basis memory — store ACTUAL fill price, not the limit price
    try {
      const settings = await getSettings();
      let openPos = settings.openPositions || {};
      if (side === 'buy') {
        // Use avg_execution_price (the real fill price) so stop-loss math is accurate.
        const actualFillPrice = parseFloat(data.avg_execution_price || currentPrice);
        const newAmount = parseFloat(execAmount);

        if (openPos[symbol]) {
          // Position already exists — weighted-average into it instead of overwriting.
          // This ensures costBasisUsd is always: blendedBuyPrice × totalAmountHeld
          const existingAmount = parseFloat(openPos[symbol].amount || 0);
          const existingPrice  = parseFloat(openPos[symbol].buyPrice || actualFillPrice);
          const existingHWM    = parseFloat(openPos[symbol].highWaterMark || existingPrice);
          const totalAmount    = existingAmount + newAmount;
          const blendedPrice   = ((existingPrice * existingAmount) + (actualFillPrice * newAmount)) / totalAmount;
          openPos[symbol] = {
            buyPrice:  parseFloat(blendedPrice.toFixed(8)),
            amount:    parseFloat(totalAmount.toFixed(8)),
            highWaterMark: Math.max(existingHWM, actualFillPrice),
            timestamp: Date.now(),
          };
        } else {
          // First buy of this asset — record fresh
          openPos[symbol] = {
            buyPrice:  actualFillPrice,
            amount:    parseFloat(newAmount.toFixed(8)),
            highWaterMark: actualFillPrice,
            timestamp: Date.now(),
          };
        }
      } else if (side === 'sell') {
        // On sell, reduce the tracked amount rather than deleting the whole record.
        // This handles partial sells correctly and keeps cost basis intact for any remainder.
        const soldAmount = parseFloat(execAmount);
        if (openPos[symbol]) {
          const remaining = parseFloat(openPos[symbol].amount || 0) - soldAmount;
          if (remaining > 0.000001) {
            openPos[symbol] = { ...openPos[symbol], amount: parseFloat(remaining.toFixed(8)) };
          } else {
            delete openPos[symbol]; // Position fully closed
          }
        }
      }
      await updateSettings({ openPositions: openPos });
    } catch(e) {
      console.error('Failed to update cost basis:', e);
    }

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
