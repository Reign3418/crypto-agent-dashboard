/**
 * Vercel Cron Job — runs every 5 minutes.
 * This is the MASTER ORCHESTRATOR for the entire BASTION multi-agent system.
 *
 * All scheduling is handled server-side using DynamoDB timestamps.
 * The browser is NO LONGER required to be open for any task to run.
 *
 * Schedule:
 *   Every 5 min  → CIPHER Scout Mission (tactical trading)
 *   Every 15 min → Mission Progress Assessment
 *   Every 60 min → Cognitive Rollup + NULL Strategic Command
 *   Every 12 hrs → Macro Trend Ledger + TANK (Chief of Operations)
 *   Every 24 hrs → 24H Macro Ledger
 *
 * Command Chain: TANK (12h) → NULL (1h) → CIPHER (5min) → Big Jon → NumNum
 */

import { logAction, getSettings, updateSettings } from '../lib/db.js';

const FIFTEEN_MIN = 15 * 60 * 1000;
const SIXTY_MIN   = 60 * 60 * 1000;
const TWELVE_HR   = 12 * 60 * 60 * 1000;
const TWENTY_FOUR_HR = 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  // Verify this is a legitimate Vercel cron call
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
  const results = {};

  try {
    await logAction(`⏰ Cron started at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, true);

    const settings = await getSettings();
    const now = Date.now();
    const timestamps = {
      lastMissionTime:    parseInt(settings.lastMissionTime    || '0'),
      lastRollupTime:     parseInt(settings.lastRollupTime     || '0'),
      lastNullTime:       parseInt(settings.lastNullTime       || '0'),
      last12HTime:        parseInt(settings.last12HTime        || '0'),
      last24HTime:        parseInt(settings.last24HTime        || '0'),
    };

    // ── STEP 1: CIPHER — Tactical Scout (every tick) ─────────────────────────
    const { runScoutMission } = await import('./scout.js');
    const scoutData = await runScoutMission();
    results.scout = `${scoutData?.report?.length || 0} assets scouted`;

    // ── STEP 2: Mission Progress (every 15 min) ───────────────────────────────
    if (now - timestamps.lastMissionTime >= FIFTEEN_MIN) {
      try {
        const { default: rollupHandler } = await import('./rollup.js');
        const mockReq = { method: 'POST', query: { task: 'mission' }, headers: { host: req.headers.host } };
        const mockRes = { status: () => ({ json: () => {} }), setHeader: () => {} };
        await rollupHandler(mockReq, mockRes);
        await updateSettings({ lastMissionTime: now.toString() });
        results.mission = 'assessed';
      } catch (e) {
        await logAction(`⚠️ Mission assessment error: ${e.message}`);
      }
    }

    // ── STEP 3: Cognitive Rollup (every 60 min) ───────────────────────────────
    if (now - timestamps.lastRollupTime >= SIXTY_MIN) {
      try {
        const { default: rollupHandler } = await import('./rollup.js');
        const mockReq = { method: 'POST', query: { task: 'rollup' }, headers: { host: req.headers.host } };
        const mockRes = { status: () => ({ json: () => {} }), setHeader: () => {} };
        await rollupHandler(mockReq, mockRes);
        await updateSettings({ lastRollupTime: now.toString() });
        results.rollup = 'complete';
      } catch (e) {
        await logAction(`⚠️ Cognitive rollup error: ${e.message}`);
      }
    }

    // ── STEP 4: NULL — Strategic Command (every 60 min) ──────────────────────
    if (now - timestamps.lastNullTime >= SIXTY_MIN && settings.autopilotEnabled) {
      try {
        const { runNullCommander } = await import('./null-commander.js');
        const directive = await runNullCommander();
        await updateSettings({ lastNullTime: now.toString() });
        results.null = `Directive issued`;
      } catch (e) {
        await logAction(`⚠️ NULL Commander error: ${e.message}`);
      }
    }

    // ── STEP 5: 12H Macro Ledger + TANK ──────────────────────────────────────
    if (now - timestamps.last12HTime >= TWELVE_HR) {
      try {
        const { default: rollupHandler } = await import('./rollup.js');
        const mockReq = { method: 'POST', query: { task: '12h' }, headers: { host: req.headers.host } };
        const mockRes = { status: () => ({ json: () => {} }), setHeader: () => {} };
        await rollupHandler(mockReq, mockRes);
        results.ledger12h = 'complete';
      } catch (e) {
        await logAction(`⚠️ 12H ledger error: ${e.message}`);
      }

      // Tank runs immediately after the macro ledger — he reads it for context
      try {
        const { runTank } = await import('./tank.js');
        const tankReport = await runTank();
        results.tank = `${tankReport.period} report complete — System: ${tankReport.systemHealth}`;
      } catch (e) {
        await logAction(`⚠️ Tank error: ${e.message}`);
      }

      await updateSettings({ last12HTime: now.toString() });
    }

    // ── STEP 6: 24H Macro Ledger ──────────────────────────────────────────────
    if (now - timestamps.last24HTime >= TWENTY_FOUR_HR) {
      try {
        const { default: rollupHandler } = await import('./rollup.js');
        const mockReq = { method: 'POST', query: { task: '24h' }, headers: { host: req.headers.host } };
        const mockRes = { status: () => ({ json: () => {} }), setHeader: () => {} };
        await rollupHandler(mockReq, mockRes);
        await updateSettings({ last24HTime: now.toString() });
        results.ledger24h = 'complete';
      } catch (e) {
        await logAction(`⚠️ 24H ledger error: ${e.message}`);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    await logAction(`✅ Cron complete in ${elapsed}s — ${JSON.stringify(results)}`, true);

    return res.status(200).json({ ok: true, runId, elapsed: `${elapsed}s`, results });

  } catch (error) {
    console.error('[Cron Error]:', error);
    await logAction(`❌ Cron job failed: ${error.message}`);
    return res.status(500).json({ error: error.message, runId });
  }
}
