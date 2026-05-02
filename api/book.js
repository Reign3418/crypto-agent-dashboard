export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol query param is required' });

  try {
    const gemRes = await fetch(`https://api.gemini.com/v1/book/${symbol.toLowerCase()}?limit_bids=15&limit_asks=15`);
    if (!gemRes.ok) {
      throw new Error(`Gemini book API error: ${gemRes.status}`);
    }
    const data = await gemRes.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('[Book Proxy Error]:', error);
    return res.status(500).json({ error: error.message });
  }
}
