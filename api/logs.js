import { getRecentLogs } from '../lib/db.js';

export default async function handler(req, res) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const logs = await getRecentLogs(limit);
    return res.status(200).json(logs);
  } catch (error) {
    console.error('API Logs Error:', error);
    return res.status(500).json({ error: 'Failed to fetch logs' });
  }
}
