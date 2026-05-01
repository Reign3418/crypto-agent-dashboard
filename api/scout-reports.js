import { getScoutReports } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const limit = parseInt(req.query.limit || '10', 10);
    const reports = await getScoutReports(limit);
    return res.status(200).json(reports);
  } catch (error) {
    console.error('[Scout Reports Error]:', error);
    return res.status(500).json({ error: error.message });
  }
}
