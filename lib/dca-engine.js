/**
 * lib/dca-engine.js — Dollar-Cost Averaging Engine
 *
 * Pure math. No AI. No opinion on price direction.
 * Runs inside Scout every 5 minutes.
 * If tradingStyle === 'dca' and the interval has elapsed → execute a buy.
 *
 * Tank configures:
 *   tankDcaAsset:         e.g. "SOL"
 *   tankDcaAmount:        e.g. 15 (USD)
 *   tankDcaIntervalHours: e.g. 168 (weekly)
 *
 * Writes:
 *   dcaLastBuyAt:    ISO timestamp of last DCA buy
 *   dcaTotalBought:  running total USD deployed via DCA
 *   dcaBuyCount:     number of DCA buys executed
 */

export async function runDcaEngine({ settings, executeTrade, logAction, updateSettings }) {
  const tradingStyle = settings.tankTradingStyle || 'swing';

  // Only runs in DCA mode
  if (tradingStyle !== 'dca') return { executed: false, reason: `Style is ${tradingStyle}, not dca.` };

  const dcaAsset    = settings.tankDcaAsset;
  const dcaAmount   = parseFloat(settings.tankDcaAmount || '0');
  const intervalHrs = parseFloat(settings.tankDcaIntervalHours || '168'); // default: weekly

  // Validate config
  if (!dcaAsset) {
    await logAction('⚠️ [DCA] No dcaAsset configured. Tank needs to set tankDcaAsset.');
    return { executed: false, reason: 'No DCA asset configured.' };
  }
  if (dcaAmount < 10) {
    await logAction(`⚠️ [DCA] dcaAmount $${dcaAmount} is below $10 minimum. Skipping.`);
    return { executed: false, reason: 'DCA amount too small.' };
  }

  // Check if interval has elapsed
  const lastBuyAt   = settings.dcaLastBuyAt ? new Date(settings.dcaLastBuyAt).getTime() : 0;
  const elapsed     = (Date.now() - lastBuyAt) / (1000 * 60 * 60);
  const nextBuyIn   = intervalHrs - elapsed;

  if (elapsed < intervalHrs) {
    await logAction(
      `💰 [DCA] ${dcaAsset} — next buy in ${nextBuyIn.toFixed(1)}h (interval: ${intervalHrs}h | last: ${lastBuyAt ? new Date(lastBuyAt).toLocaleString() : 'never'})`
    );
    return { executed: false, reason: `DCA interval not elapsed. ${nextBuyIn.toFixed(1)}h remaining.` };
  }

  // Time to buy
  await logAction(
    `💰 [DCA] Interval elapsed (${elapsed.toFixed(1)}h ≥ ${intervalHrs}h). Executing scheduled buy: $${dcaAmount} ${dcaAsset}.`,
    true
  );

  try {
    const result = await executeTrade(dcaAsset, 'buy', dcaAmount.toFixed(2));

    const totalBought = parseFloat(settings.dcaTotalBought || '0') + dcaAmount;
    const buyCount    = parseInt(settings.dcaBuyCount || '0') + 1;
    const now         = new Date().toISOString();

    await updateSettings({
      dcaLastBuyAt:    now,
      dcaTotalBought:  totalBought.toFixed(2),
      dcaBuyCount:     buyCount.toString(),
    });

    await logAction(
      `✅ [DCA] Buy #${buyCount} complete: $${dcaAmount} ${dcaAsset}. Total DCA deployed: $${totalBought.toFixed(2)} across ${buyCount} buys.`,
      true
    );

    return { executed: true, asset: dcaAsset, amount: dcaAmount, buyCount, totalBought };
  } catch (e) {
    await logAction(`❌ [DCA] Buy failed: ${e.message}`);
    return { executed: false, error: e.message };
  }
}

/**
 * Human-readable DCA schedule summary for the dashboard.
 */
export function dcaScheduleSummary(settings) {
  const asset    = settings.tankDcaAsset;
  const amount   = settings.tankDcaAmount;
  const interval = settings.tankDcaIntervalHours;
  const lastBuy  = settings.dcaLastBuyAt;
  const total    = settings.dcaTotalBought;
  const count    = settings.dcaBuyCount;

  if (!asset || !amount) return null;

  const nextMs   = lastBuy ? new Date(lastBuy).getTime() + parseFloat(interval) * 3600000 : Date.now();
  const nextIn   = Math.max(0, (nextMs - Date.now()) / (1000 * 60 * 60));

  return {
    asset, amount, interval,
    lastBuyAt: lastBuy || null,
    nextBuyIn: nextIn.toFixed(1),
    totalDeployed: total || '0',
    buyCount: count || '0',
    label: `$${amount} ${asset} every ${parseFloat(interval) >= 168 ? `${Math.round(parseFloat(interval)/24)}d` : `${interval}h`}`,
    nextBuyLabel: nextIn < 0.5 ? 'Imminent' : `in ${nextIn.toFixed(1)}h`,
  };
}
