import { fetchLiveNews } from '../lib/news.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const headlines = await fetchLiveNews();
    return res.status(200).json(headlines);
  } catch (error) {
    console.error('Failed to fetch news proxy:', error);
    return res.status(500).json({ error: error.message });
  }
}
