/**
 * Vercel Cron Job — runs every 30 minutes.
 * Vercel automatically injects: Authorization: Bearer <CRON_SECRET>
 * The middleware lets this through; all other requests still need Basic Auth.
 */

import { logAction } from '../lib/db.js';

export default async function handler(req, res) {
  // Verify this is a legitimate Vercel cron call, not someone hitting /api/cron manually
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();
  const runId = new Date().toISOString();

  try {
    await logAction(`⏰ Cron job started at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, true);

    // ── Step 1: Run Scout ──────────────────────────────────────────────────
    // Calls Scout directly via internal fetch — Scout already handles:
    //   • Fetching live prices + candles
    //   • AI analysis with Google Search Grounding
    //   • Saving report to DynamoDB
    //   • Auto-evaluating all active strategies
    //   • Logging triggered strategies to Activity Feed
    const scoutRes = await fetch(`https://${req.headers.host}/api/scout`, {
      headers: {
        // Pass the cron secret so middleware lets it through
        'Authorization': `Bearer ${cronSecret}`,
      },
    });

    if (!scoutRes.ok) {
      const errText = await scoutRes.text();
      throw new Error(`Scout failed: ${scoutRes.status} — ${errText.slice(0, 200)}`);
    }

    const scoutData = await scoutRes.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    await logAction(
      `✅ Cron complete in ${elapsed}s — ${scoutData.report?.length || 0} assets scouted, strategies auto-evaluated.`,
      true
    );

    return res.status(200).json({
      ok: true,
      runId,
      elapsed: `${elapsed}s`,
      assetsAnalyzed: scoutData.report?.length || 0,
      generatedAt: scoutData.generatedAt,
    });

  } catch (error) {
    console.error('[Cron Error]:', error);
    await logAction(`❌ Cron job failed: ${error.message}`);
    return res.status(500).json({ error: error.message, runId });
  }
}
