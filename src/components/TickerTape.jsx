import { useEffect, useState } from 'react';

function TickerItem({ t }) {
  const [flash, setFlash] = useState('');
  const [prevPrice, setPrevPrice] = useState(t.price);

  useEffect(() => {
    const curr = parseFloat(t.price);
    const prev = parseFloat(prevPrice);
    if (curr > prev) {
      setFlash('flash-up');
      setPrevPrice(t.price);
      setTimeout(() => setFlash(''), 1000);
    } else if (curr < prev) {
      setFlash('flash-down');
      setPrevPrice(t.price);
      setTimeout(() => setFlash(''), 1000);
    }
  }, [t.price, prevPrice]);

  const change = parseFloat(t.percentChange24h) * 100;
  const isUp = change >= 0;
  
  return (
    <span className={flash} style={{ display: 'inline-flex', alignItems: 'center', margin: '0 2rem', padding: '2px 6px', borderRadius: '4px', transition: 'background-color 0.1s' }}>
      <strong style={{ marginRight: '6px' }}>{t.pair.replace(/USD$/i, '')}</strong>
      <span style={{ color: 'var(--text-secondary)' }}>${parseFloat(t.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span>
      <span style={{ color: isUp ? 'var(--status-success)' : 'var(--status-danger)', marginLeft: '6px', fontSize: '0.85em' }}>
        {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
      </span>
    </span>
  );
}

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
          .sort((a, b) => parseFloat(b.price) * parseFloat(b.percentChange24h) - parseFloat(a.price) * parseFloat(a.percentChange24h))
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
        {tickers.map(t => <TickerItem key={t.pair} t={t} />)}
      </div>
    </div>
  );
}
