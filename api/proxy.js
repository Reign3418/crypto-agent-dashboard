export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { route, symbol, timeframe = '1hr' } = req.query;

  if (!route) {
    return res.status(400).json({ error: 'route query param is required (e.g., pricefeed, book, candles)' });
  }

  try {
    let url = '';
    
    if (route === 'pricefeed') {
      url = 'https://api.gemini.com/v1/pricefeed';
    } 
    else if (route === 'book') {
      if (!symbol) return res.status(400).json({ error: 'symbol required for book' });
      url = `https://api.gemini.com/v1/book/${symbol.toLowerCase()}?limit_bids=15&limit_asks=15`;
    } 
    else if (route === 'candles') {
      if (!symbol) return res.status(400).json({ error: 'symbol required for candles' });
      const validTimeframes = ['1m', '5m', '15m', '30m', '1hr', '6hr', '1day'];
      if (!validTimeframes.includes(timeframe)) {
        return res.status(400).json({ error: `Invalid timeframe. Use one of: ${validTimeframes.join(', ')}` });
      }
      url = `https://api.gemini.com/v2/candles/${symbol.toLowerCase()}/${timeframe}`;
    } 
    else {
      return res.status(400).json({ error: 'Invalid route' });
    }

    const gemRes = await fetch(url);
    if (!gemRes.ok) throw new Error(`Gemini API error: ${gemRes.status}`);
    const data = await gemRes.json();

    // Specific transform for candles
    if (route === 'candles') {
      const mappedCandles = data.map(([time, open, high, low, close, volume]) => ({
        time: Math.floor(time / 1000),
        open, high, low, close, volume
      })).reverse();
      return res.status(200).json(mappedCandles);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error(`[Proxy Error] ${route}:`, error);
    return res.status(500).json({ error: error.message });
  }
}
