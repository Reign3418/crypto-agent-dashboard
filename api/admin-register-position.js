/**
 * One-time admin endpoint: Register a manual trade into system memory.
 * REMOVE THIS FILE after use.
 */
import { getSettings, updateSettings } from '../lib/db.js';

export default async function handler(req, res) {
  // Security: only allow POST with the correct secret
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const validSecrets = [process.env.CRON_SECRET, 'BASTION-ONE-TIME-BTC-REG-MAY9'].filter(Boolean);
  if (!validSecrets.includes(req.headers['x-admin-secret'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { symbol, buyPrice, amount, note, action } = req.body;
    if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

    const settings = await getSettings();
    const openPositions = settings.openPositions || {};

    // action: 'delete' — clears a phantom position from memory
    if (action === 'delete') {
      const had = !!openPositions[symbol.toUpperCase()];
      delete openPositions[symbol.toUpperCase()];
      await updateSettings({ openPositions });
      return res.status(200).json({
        success: true,
        message: `✅ ${symbol.toUpperCase()} cleared from system memory. Had position: ${had}.`,
        remaining: Object.keys(openPositions)
      });
    }

    if (!buyPrice || !amount) return res.status(400).json({ error: 'Missing buyPrice or amount' });

    openPositions[symbol.toUpperCase()] = {
      buyPrice:  parseFloat(buyPrice),
      amount:    amount.toString(),
      timestamp: Date.now(),
      note:      note || 'Manually registered via admin endpoint'
    };

    await updateSettings({ openPositions });

    const stopLoss    = (parseFloat(buyPrice) * 0.95).toFixed(2);
    const numNumTarget = (parseFloat(buyPrice) * 1.023).toFixed(2);

    return res.status(200).json({
      success: true,
      registered: openPositions[symbol.toUpperCase()],
      stopLossTrigger: `$${stopLoss}`,
      numNumSellTarget: `$${numNumTarget}`,
      message: `✅ ${symbol.toUpperCase()} position registered. The team can now protect it.`
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
