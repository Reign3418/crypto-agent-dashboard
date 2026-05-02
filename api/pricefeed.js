export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const gemRes = await fetch('https://api.gemini.com/v1/pricefeed');
    if (!gemRes.ok) {
      throw new Error(`Gemini pricefeed API error: ${gemRes.status}`);
    }
    const data = await gemRes.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('[PriceFeed Proxy Error]:', error);
    return res.status(500).json({ error: error.message });
  }
}
