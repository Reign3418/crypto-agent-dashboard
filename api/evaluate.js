import { runEvaluationWithLivePrices } from '../lib/evaluator.js';
import { getLastScoutReport } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Load the last Scout report from DynamoDB so Scout-based conditions work
    // even when this endpoint is called outside of a Scout run
    const lastScoutReport = await getLastScoutReport();
    const result = await runEvaluationWithLivePrices(lastScoutReport);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[Evaluate Error]:', error);
    return res.status(500).json({ error: error.message });
  }
}
