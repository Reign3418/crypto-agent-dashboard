import { useEffect, useState } from 'react';

export default function TickerTape() {
  const [tickers, setTickers] = useState([]);

  useEffect(() => {
    let active = true;
    const fetchTickers = async () => {
      try {
        const res = await fetch('/api/proxy?route=pricefeed');
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        
        // Filter to USD pairs and sort by volume to get the most relevant
        const usdPairs = data
          .filter(t => t.pair.toLowerCase().endsWith('usd'))
          .sort((a, b) => parseFloat(b.price) * parseFloat(b.percentChange24h) - parseFloat(a.price) * parseFloat(a.percentChange24h)) // sort by roughly activity
          .slice(0, 30);
          
        setTickers(usdPairs);
      } catch (e) {
        console.error('Ticker feed error', e);
      }
    };

    fetchTickers();
    const interval = setInterval(fetchTickers, 30000); // refresh every 30s
    return () => { active = false; clearInterval(interval); };
  }, []);

  if (tickers.length === 0) return null;

  return (
    <div className="ticker-wrap" style={{ gridArea: 'ticker' }}>
      <div className="ticker-move">
        {tickers.map(t => {
          const change = parseFloat(t.percentChange24h) * 100;
          const isUp = change >= 0;
          return (
            <span key={t.pair} style={{ display: 'inline-flex', alignItems: 'center', margin: '0 2rem' }}>
              <strong style={{ marginRight: '6px' }}>{t.pair.replace(/USD$/i, '')}</strong>
              <span style={{ color: 'var(--text-secondary)' }}>${parseFloat(t.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span>
              <span style={{ color: isUp ? 'var(--status-success)' : 'var(--status-danger)', marginLeft: '6px', fontSize: '0.85em' }}>
                {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
