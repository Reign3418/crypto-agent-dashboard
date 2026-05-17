/**
 * /api/dow-analysis — Day-of-Week Intelligence Endpoint
 * Serves pre-computed DOW report to the dashboard.
 * Scout generates it (cached 24h in DynamoDB). This just reads + returns it.
 *
 * GET /api/dow-analysis          — return cached report
 * GET /api/dow-analysis?refresh=1 — force regenerate (admin use)
 */
import { getSettings, updateSettings } from '../lib/db.js';
import { buildDowReport, getTodaysDowIntel } from '../lib/dow-analysis.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const settings = await getSettings();
    const forceRefresh = req.query.refresh === '1';
    const cachedAt = settings.dowReportGeneratedAt
      ? new Date(settings.dowReportGeneratedAt).getTime()
      : 0;
    const ageHours = (Date.now() - cachedAt) / (1000 * 60 * 60);

    let report = settings.dowReport || null;

    // Refresh if: forced, missing, or > 24 hours old
    if (forceRefresh || !report || ageHours > 24) {
      report = await buildDowReport();
      await updateSettings({
        dowReport: report,
        dowReportGeneratedAt: report.generatedAt,
      });
    }

    const todayIntel = getTodaysDowIntel(report);

    return res.status(200).json({
      ok: true,
      cachedAt: settings.dowReportGeneratedAt || report.generatedAt,
      ageHours: Math.round(ageHours * 10) / 10,
      today: todayIntel,
      report,
    });
  } catch (err) {
    console.error('[DOW Analysis Error]:', err);
    return res.status(500).json({ error: 'DOW analysis failed', details: err.message });
  }
}
