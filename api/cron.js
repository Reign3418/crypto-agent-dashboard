/**
 * Vercel Cron Job — runs every 5 minutes.
 * This is the MASTER ORCHESTRATOR for the entire CIPHER multi-agent system.
 *
 * All scheduling is handled server-side using DynamoDB timestamps.
 * The browser is NO LONGER required to be open for any task to run.
 *
 * Schedule:
 *   Every 5 min  → CIPHER Scout Mission (tactical trading)
 *   Every 15 min → DOZER (Accounting) + Mission Progress Assessment
 *   Every 60 min → Cognitive Rollup + NULL Strategic Command
 *   Every 12 hrs → Macro Trend Ledger + TANK (Chief of Operations)
 *   Every 24 hrs → 24H Macro Ledger
 *
 * Command Chain (Combat Ring): TANK (12h) → NULL (1h) → CIPHER (5min) → Big Jon → NumNum
 * Back Office Ring:             DOZER (15min) → feeds data to TANK
 */

import { logAction, getSettings, updateSettings } from '../lib/db.js';

const FIFTEEN_MIN    = 15 * 60 * 1000;
const SIXTY_MIN      = 60 * 60 * 1000;
const SIX_HR         =  6 * 60 * 60 * 1000; // Tank recalibrates every 6h
const TWELVE_HR      = 12 * 60 * 60 * 1000; // Macro ledger still runs every 12h
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

  const MAX_RUN_MS = 250000; // 250s — cron has maxDuration:300 in vercel.json; 50s was starving Tank/NULL
  const startTime = Date.now();
  const runId = new Date().toISOString();
  const results = {};
  const timeLeft = () => MAX_RUN_MS - (Date.now() - startTime);

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
    // Skip entirely if autopilot is off — saves 20-40s of AI + API calls per tick
    if (settings.autopilotEnabled) {
      const { runScoutMission } = await import('./scout.js');
      const scoutData = await runScoutMission();
      results.scout = `${scoutData?.report?.length || 0} assets scouted`;
    } else {
      results.scout = 'skipped (autopilot off)';
    }

    // ── STEP 2: DOZER — Accounting (every 15 min) ────────────────────────────
    if (timeLeft() > 8000 && now - timestamps.lastMissionTime >= FIFTEEN_MIN) {
      let step2ok = false;
      try {
        const { runDozer } = await import('./dozer.js');
        await runDozer();
        results.dozer = 'reconciled';
        step2ok = true;
      } catch (e) {
        await logAction(`⚠️ Dozer error: ${e.message}`);
      }

      // ── Mission Progress (same 15-min window) ─────────────────────────────
      try {
        const { default: rollupHandler } = await import('./rollup.js');
        const mockReq = { method: 'POST', query: { task: 'mission' }, headers: { host: req.headers.host } };
        const mockRes = { status: () => ({ json: () => {} }), setHeader: () => {} };
        await rollupHandler(mockReq, mockRes);
        results.mission = 'assessed';
      } catch (e) {
        await logAction(`⚠️ Mission assessment error: ${e.message}`);
      }

      // Only advance the timer if Dozer actually succeeded.
      // If it failed, the next cron tick will retry immediately.
      if (step2ok) {
        await updateSettings({ lastMissionTime: now.toString() });

        // ── MISSION FEASIBILITY AUTO-RECALIBRATION ─────────────────────────
        // After every Dozer run, check if capital changed significantly since
        // Tank set the mission. If so, recalibrate Tank immediately — no human
        // Force Sync needed. This is the core self-healing mechanism.
        try {
          const fresh = await getSettings();
          const currentLiquid  = fresh.dozerReport?.capitalBalance?.liquidUSD || 0;
          const missionLiquid  = parseFloat(fresh.tankMissionLiquidUSD || '0');
          const lastTankRanAt  = parseInt(fresh.last12HTime || '0');
          const minSinceLastTank = (now - lastTankRanAt) / 60000;

          // Capital change % since Tank last set the mission
          const liquidChangePct = missionLiquid > 0
            ? Math.abs(currentLiquid - missionLiquid) / missionLiquid * 100
            : currentLiquid > 0 ? 100 : 0;

          // Trigger conditions:
          //   1. Capital changed >30% since mission was set
          //   2. Tank hasn't run in the last 30 minutes (prevent storm)
          //   3. We have budget left in this cron window
          if (liquidChangePct > 30 && minSinceLastTank > 30 && timeLeft() > 30000) {
            await logAction(
              `⚡ [AUTO-RECAL] Liquid changed ${liquidChangePct.toFixed(0)}% since mission set ($${missionLiquid.toFixed(2)} → $${currentLiquid.toFixed(2)}). Auto-triggering Tank recalibration.`,
              true
            );
            const { runTank } = await import('./tank.js');
            const tankReport = await runTank();
            await updateSettings({ last12HTime: now.toString() });
            results.autoRecal = `Tank recalibrated — ${tankReport.systemHealth}`;
          }
        } catch (e) {
          await logAction(`⚠️ Auto-recal check error: ${e.message}`);
        }
        // ── END AUTO-RECALIBRATION ─────────────────────────────────────────
      }
    }

    // ── STEP 3: NULL — Strategic Command (every 60 min) ──────────────────────
    // NULL runs BEFORE the Cognitive Rollup so it is not starved by the AI summary.
    if (timeLeft() > 8000 && now - timestamps.lastNullTime >= SIXTY_MIN && settings.autopilotEnabled) {
      try {
        const { runNullCommander } = await import('./null-commander.js');
        const directive = await runNullCommander();
        await updateSettings({ lastNullTime: now.toString() });
        results.null = `Directive issued`;
      } catch (e) {
        await logAction(`⚠️ NULL Commander error: ${e.message}`);
      }
    }

    // ── STEP 4: Cognitive Rollup (every 60 min) ───────────────────────────────
    if (timeLeft() > 12000 && now - timestamps.lastRollupTime >= SIXTY_MIN) {
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


    // ── STEP 5: 12H Macro Ledger + TANK dedicated cron handles Tank every 6h ───────────
    // Tank now runs via tank-cron (0 */6 * * *). The gate here is a FALLBACK ONLY
    // in case tank-cron missed a run. Uses SIX_HR so it aligns with the new cadence.
    if (timeLeft() > 15000 && now - timestamps.last12HTime >= SIX_HR) {
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
    if (timeLeft() > 8000 && now - timestamps.last24HTime >= TWENTY_FOUR_HR) {
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

