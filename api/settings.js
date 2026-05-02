import { getSettings, updateSettings } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const settings = await getSettings();
      return res.status(200).json(settings);
    } 
    
    if (req.method === 'POST') {
      const settingsPatch = req.body;
      const newSettings = await updateSettings(settingsPatch);
      return res.status(200).json(newSettings);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Settings API Error]:', error);
    return res.status(500).json({ error: error.message });
  }
}
