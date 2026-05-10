/**
 * Tank Cron — Dedicated 12-hour heartbeat for TANK (Chief of Operations).
 *
 * This endpoint runs independently of the main 5-minute cron so that Tank
 * is NEVER starved by Scout's AI call time consumption. The main cron's
 * last12HTime gate still applies — if Tank already ran via this dedicated
 * cron, the main cron will skip it.
 *
 * Schedule: every 12 hours (see vercel.json)
 */

import { logAction, getSettings, updateSettings } from '../lib/db.js';

export default async function handler(req, res) {
  // Allow Vercel cron auth
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();
  try {
    await logAction(`⏰ [TANK-CRON] Dedicated 12h cycle starting...`, true);

    // Run 12H macro ledger first — Tank reads it for context
    try {
      const { default: rollupHandler } = await import('./rollup.js');
      const mockReq = { method: 'POST', query: { task: '12h' }, headers: { host: req.headers.host } };
      const mockRes = { status: () => ({ json: () => {} }), setHeader: () => {} };
      await rollupHandler(mockReq, mockRes);
    } catch (e) {
      await logAction(`⚠️ [TANK-CRON] 12H ledger error: ${e.message}`);
    }

    // Run Tank
    const { runTank } = await import('./tank.js');
    const tankReport = await runTank();

    // Advance the shared timestamp so the main cron doesn't double-run Tank
    await updateSettings({ last12HTime: Date.now().toString() });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    await logAction(`✅ [TANK-CRON] Complete in ${elapsed}s — System: ${tankReport.systemHealth}`, true);

    return res.status(200).json({
      ok: true,
      elapsed: `${elapsed}s`,
      systemHealth: tankReport.systemHealth,
      capitalRisk: tankReport.capitalRisk,
    });

  } catch (error) {
    console.error('[Tank-Cron Error]:', error);
    await logAction(`❌ [TANK-CRON] Failed: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
}
