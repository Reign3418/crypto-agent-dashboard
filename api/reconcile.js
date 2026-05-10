import { getSettings, updateSettings, logAction } from '../lib/db.js';
import { getPortfolioBalances } from '../lib/trade.js';

/**
 * POST /api/reconcile
 *
 * Full position sync: reads live Gemini balances and OVERWRITES openPositions
 * in DynamoDB for every non-dust holding. Uses CURRENT market price as the
 * cost basis, resetting the stop-loss baseline from now.
 *
 * This is a hard sync — it corrects corrupted records, not just missing ones.
 * Run any time position data looks wrong.
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

    const existingPositions = settings.openPositions || {};
    const newPositions = {};
    const corrected = [];
    const added = [];
    const skipped = [];

    for (const [symbol, data] of Object.entries(liveBalances)) {
      if (symbol === 'USD' || symbol === 'GUSD') continue;
      if (data.notional < 1.00) continue;

      // Fetch current market price
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

      const wasTracked = !!existingPositions[symbol];
      const costBasisUsd = parseFloat((currentPrice * data.amount).toFixed(4));

      // Always write from live truth — corrects corrupted records too
      newPositions[symbol] = {
        buyPrice:     currentPrice,
        amount:       data.amount.toString(),
        costBasisUsd: costBasisUsd,
        timestamp:    Date.now(),
        reconciled:   true,
      };

      if (wasTracked) {
        corrected.push({ symbol, amount: data.amount, buyPrice: currentPrice, costBasisUsd, notional: data.notional });
        await logAction(`🔄 RECONCILE: Corrected position ${symbol} — ${data.amount.toFixed(6)} units @ $${currentPrice.toFixed(4)} (cost basis reset to $${costBasisUsd.toFixed(2)}).`, true);
      } else {
        added.push({ symbol, amount: data.amount, buyPrice: currentPrice, costBasisUsd, notional: data.notional });
        await logAction(`🔄 RECONCILE: Added position ${symbol} — ${data.amount.toFixed(6)} units @ $${currentPrice.toFixed(4)}.`, true);
      }
    }

    // Preserve any positions that are in memory but NOT on exchange
    // (e.g. pending or recently sold) — don't wipe them
    for (const [symbol, pos] of Object.entries(existingPositions)) {
      if (!newPositions[symbol]) {
        newPositions[symbol] = pos;
      }
    }

    await updateSettings({ openPositions: newPositions });
    await logAction(`✅ RECONCILE COMPLETE — ${corrected.length} corrected, ${added.length} added, ${skipped.length} skipped.`);

    return res.status(200).json({
      success: true,
      corrected,
      added,
      skipped,
      totalTrackedNow: Object.keys(newPositions).length,
    });

  } catch (err) {
    console.error('[Reconcile Error]:', err);
    return res.status(500).json({ error: err.message });
  }
}
