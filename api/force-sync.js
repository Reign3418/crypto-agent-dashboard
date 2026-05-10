/**
 * Force Sync — Cascade trigger for the full ring stack.
 *
 * Runs the ring in correct order, respecting the chain:
 *   Dozer → Tank → NULL
 *
 * CIPHER is NOT triggered — it picks up the fresh context
 * naturally on its next cron tick. This is intentional:
 * we never interrupt CIPHER mid-cycle.
 *
 * Nothing is wiped. No positions touched. No history lost.
 * This is a "sync from the top" — the same math and AI that
 * runs on schedule, just triggered now instead of waiting.
 */

import { logAction, updateSettings } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const startTime = Date.now();
  const steps = [];

  function elapsed() {
    return ((Date.now() - startTime) / 1000).toFixed(1);
  }

  await logAction(`🔄 [FORCE SYNC] Human operator triggered full ring cascade: Dozer → Tank → NULL`, true);

  // ── Step 1: DOZER ──────────────────────────────────────────────────────────
  // Run accounting first so Tank has fresh P&L data to read.
  let dozerResult = null;
  try {
    const t0 = Date.now();
    const { runDozer } = await import('./dozer.js');
    dozerResult = await runDozer();
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    steps.push({ step: 'Dozer', status: 'ok', elapsed: `${dt}s` });
    await logAction(`✅ [FORCE SYNC] Dozer complete in ${dt}s — accounts reconciled`);
  } catch (e) {
    steps.push({ step: 'Dozer', status: 'error', error: e.message });
    await logAction(`❌ [FORCE SYNC] Dozer failed: ${e.message}`);
    // Non-fatal — Tank can still run with cached Dozer data
  }

  // ── Step 2: TANK ──────────────────────────────────────────────────────────
  // Tank reads fresh Dozer data, sets mission + calibrates NumNum.
  let tankResult = null;
  try {
    const t0 = Date.now();
    const { runTank } = await import('./tank.js');
    tankResult = await runTank();
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    steps.push({ step: 'Tank', status: 'ok', elapsed: `${dt}s`, systemHealth: tankResult.systemHealth });
    // Stamp last12HTime so cron.js doesn't double-run Tank on the next tick
    await updateSettings({ last12HTime: Date.now().toString() });
    await logAction(`✅ [FORCE SYNC] Tank complete in ${dt}s — mission updated, NumNum recalibrated`);
  } catch (e) {
    steps.push({ step: 'Tank', status: 'error', error: e.message });
    await logAction(`❌ [FORCE SYNC] Tank failed: ${e.message}`);
    // Fatal for NULL — NULL needs Tank's fresh directive
    return res.status(500).json({
      ok: false,
      error: `Tank failed: ${e.message}`,
      steps,
      totalElapsed: `${elapsed()}s`,
    });
  }

  // ── Step 3: NULL ──────────────────────────────────────────────────────────
  // NULL reads Tank's fresh mission and writes new coachNotes for CIPHER.
  try {
    const t0 = Date.now();
    const { runNullCommander } = await import('./null-commander.js');
    await runNullCommander();
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    steps.push({ step: 'NULL', status: 'ok', elapsed: `${dt}s` });
    // Stamp lastNullTime so cron doesn't double-run NULL
    await updateSettings({ lastNullTime: Date.now().toString() });
    await logAction(`✅ [FORCE SYNC] NULL complete in ${dt}s — fresh directive issued to CIPHER`);
  } catch (e) {
    steps.push({ step: 'NULL', status: 'error', error: e.message });
    await logAction(`❌ [FORCE SYNC] NULL failed: ${e.message}`);
    // Non-fatal — Tank already ran, CIPHER will get NULL's next scheduled directive
  }

  const totalElapsed = elapsed();
  await logAction(
    `🔄 [FORCE SYNC] Complete in ${totalElapsed}s — ring cascade finished. CIPHER picks up on next cron tick.`,
    true
  );

  return res.status(200).json({
    ok: true,
    steps,
    totalElapsed: `${totalElapsed}s`,
    systemHealth: tankResult?.systemHealth,
    capitalRisk:  tankResult?.capitalRisk,
    mission:      tankResult?.missionDirective,
  });
}
