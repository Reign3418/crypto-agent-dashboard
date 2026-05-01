import { saveStrategy, getStrategies, toggleStrategy, deleteStrategy } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // GET — list all active strategies
    if (req.method === 'GET') {
      const strategies = await getStrategies();
      return res.status(200).json(strategies);
    }

    // POST — create new strategy
    if (req.method === 'POST') {
      const body = req.body;
      if (!body.name || !body.asset) {
        return res.status(400).json({ error: 'name and asset are required' });
      }
      const saved = await saveStrategy(body);
      return res.status(201).json(saved);
    }

    // PATCH — toggle enabled or update notes
    if (req.method === 'PATCH') {
      const { id, enabled } = req.body;
      if (!id) return res.status(400).json({ error: 'id is required' });
      await toggleStrategy(id, enabled);
      return res.status(200).json({ ok: true });
    }

    // DELETE — soft delete
    if (req.method === 'DELETE') {
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'id is required' });
      await deleteStrategy(id);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Strategies API Error]:', error);
    return res.status(500).json({ error: error.message });
  }
}
