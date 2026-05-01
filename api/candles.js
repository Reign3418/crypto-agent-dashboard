export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol, timeframe = '1hr' } = req.query;

  if (!symbol) return res.status(400).json({ error: 'symbol query param is required' });

  const validTimeframes = ['1m', '5m', '15m', '30m', '1hr', '6hr', '1day'];
  if (!validTimeframes.includes(timeframe)) {
    return res.status(400).json({ error: `Invalid timeframe. Use one of: ${validTimeframes.join(', ')}` });
  }

  try {
    const url = `https://api.gemini.com/v2/candles/${symbol.toLowerCase()}/${timeframe}`;
    const gemRes = await fetch(url);

    if (!gemRes.ok) {
      throw new Error(`Gemini candles API error: ${gemRes.status}`);
    }

    const data = await gemRes.json();

    // Gemini returns [timestamp_ms, open, high, low, close, volume]
    // lightweight-charts expects { time (seconds), open, high, low, close }
    const candles = data.map(([time, open, high, low, close, volume]) => ({
      time: Math.floor(time / 1000),
      open, high, low, close, volume
    })).reverse(); // Gemini returns newest first, charts need oldest first

    return res.status(200).json(candles);
  } catch (error) {
    console.error('[Candles Error]:', error);
    return res.status(500).json({ error: error.message });
  }
}
