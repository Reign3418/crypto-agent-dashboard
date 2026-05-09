/**
 * One-time patch: Register manual BTC purchase into system memory.
 * Run once, then delete.
 * 
 * Buy details from Gemini receipt:
 * Date: May 09, 2026 2:13 AM
 * Fill price: $81,215.89
 * Amount: 0.00023431 BTC
 * Fee: $0.28 (Instant Buy fee — higher than ActiveTrader)
 */

import { getSettings, updateSettings } from '../lib/db.js';

const BTC_BUY_PRICE  = 81215.89;
const BTC_AMOUNT     = '0.00023431';
const BTC_TIMESTAMP  = new Date('2026-05-09T06:13:00Z').getTime(); // 2:13 AM EDT = 6:13 AM UTC

async function patchBtcPosition() {
  console.log('📋 Reading current settings...');
  const settings = await getSettings();

  const openPositions = settings.openPositions || {};

  // Register the manual BTC buy so stop-loss, NumNum, and CIPHER can all see it
  openPositions['BTC'] = {
    buyPrice:  BTC_BUY_PRICE,
    amount:    BTC_AMOUNT,
    timestamp: BTC_TIMESTAMP,
    note:      'Manually registered — Instant Buy via Gemini UI at 2:13 AM EDT May 9 2026'
  };

  await updateSettings({ openPositions });

  console.log('✅ BTC position registered into system memory:');
  console.log(`   Buy Price : $${BTC_BUY_PRICE.toLocaleString()}`);
  console.log(`   Amount    : ${BTC_AMOUNT} BTC`);
  console.log(`   Stop-Loss triggers at: $${(BTC_BUY_PRICE * 0.95).toFixed(2)} (-5%)`);
  console.log(`   NumNum sell target   : $${(BTC_BUY_PRICE * 1.023).toFixed(2)} (+2.3% to clear fees+profit)`);
  console.log('');
  console.log('🛡️  The team can now protect this position. Delete this script when done.');
}

patchBtcPosition().catch(console.error);
