import { getSettings, updateSettings, logAction } from '../lib/db.js';
import { getPortfolioBalances } from '../lib/trade.js';

/**
 * POST /api/reconcile
 *
 * One-shot reconciliation: reads live Gemini balances and writes any
 * holdings that are missing from openPositions into DynamoDB.
 * Uses CURRENT market price as the cost basis so the 5% stop-loss
 * starts protecting these positions immediately.
 *
 * Call this once whenever you suspect the memory is out of sync
 * with what's actually held on Gemini.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const [settings, liveBalances] = await Promise.all([
      getSettings(),
      getPortfolioBalances(),
    ]);

    const openPositions = settings.openPositions || {};
    const added = [];
    const skipped = [];

    for (const [symbol, data] of Object.entries(liveBalances)) {
      // Skip stablecoins — we don't need stop-loss on USD/GUSD
      if (symbol === 'USD' || symbol === 'GUSD') continue;
      // Skip dust (under $1.00 notional value)
      if (data.notional < 1.00) continue;

      if (openPositions[symbol]) {
        // Already tracked — leave it alone
        skipped.push({ symbol, reason: 'already_in_memory' });
        continue;
      }

      // Fetch the current market price to use as cost basis
      let currentPrice = null;
      try {
        const pRes = await fetch(`https://api.gemini.com/v1/pubticker/${symbol.toLowerCase()}usd`);
        if (pRes.ok) {
          const pData = await pRes.json();
          currentPrice = parseFloat(pData.last);
        }
      } catch (e) { /* non-fatal */ }

      if (!currentPrice || currentPrice <= 0) {
        skipped.push({ symbol, reason: 'could_not_fetch_price' });
        continue;
      }

      // Write into openPositions with current price as the "buy price"
      // Stop-loss will trigger if it drops a further 5% from NOW
      openPositions[symbol] = {
        buyPrice: currentPrice,
        timestamp: Date.now(),
        amount: data.amount.toString(),
        reconciled: true, // Flag so we know this was bootstrapped, not a real buy
      };

      added.push({ symbol, amount: data.amount, buyPrice: currentPrice, notional: data.notional });
      await logAction(`🔄 RECONCILE: Added legacy position ${symbol} (${data.amount} @ $${currentPrice}) to stop-loss memory.`, true);
    }

    await updateSettings({ openPositions });

    return res.status(200).json({
      success: true,
      added,
      skipped,
      totalTrackedNow: Object.keys(openPositions).length,
    });

  } catch (err) {
    console.error('[Reconcile Error]:', err);
    return res.status(500).json({ error: err.message });
  }
}
