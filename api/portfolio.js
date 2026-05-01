import crypto from 'crypto';

export default async function handler(req, res) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.GEMINI_EXCHANGE_API_KEY;
  const apiSecret = process.env.GEMINI_EXCHANGE_API_SECRET;

  if (!apiKey || !apiSecret) {
    return res.status(500).json({ error: 'Missing Gemini Exchange API keys' });
  }

  const endpoint = '/v1/notionalbalances/usd';
  const url = `https://api.gemini.com${endpoint}`;
  
  // Explicitly passing 'account: "primary"' to fix the MissingAccounts error
  const payload = {
    request: endpoint,
    nonce: Date.now(),
    account: 'primary'
  };

  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto.createHmac('sha384', apiSecret).update(b64Payload).digest('hex');

  try {
    let response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': '0',
        'X-GEMINI-APIKEY': apiKey,
        'X-GEMINI-PAYLOAD': b64Payload,
        'X-GEMINI-SIGNATURE': signature,
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
        // Fallback to standard balances if notional fails
        const fallbackEndpoint = '/v1/balances';
        const fallbackPayload = { request: fallbackEndpoint, nonce: Date.now(), account: 'primary' };
        const fb64 = Buffer.from(JSON.stringify(fallbackPayload)).toString('base64');
        const fSig = crypto.createHmac('sha384', apiSecret).update(fb64).digest('hex');
        
        response = await fetch(`https://api.gemini.com${fallbackEndpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
                'Content-Length': '0',
                'X-GEMINI-APIKEY': apiKey,
                'X-GEMINI-PAYLOAD': fb64,
                'X-GEMINI-SIGNATURE': fSig,
                'Cache-Control': 'no-cache'
            }
        });
    }

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const data = await response.json();
    // Debug log — helps diagnose empty portfolio issue
    console.log('[Portfolio API] Raw response sample:', JSON.stringify(data?.slice?.(0, 3) ?? data));
    return res.status(200).json(data);
  } catch (error) {
    console.error('Portfolio Fetch Error:', error);
    return res.status(500).json({ error: 'Failed to fetch portfolio data: ' + error.message });
  }
}
