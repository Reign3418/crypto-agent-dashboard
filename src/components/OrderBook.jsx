import { useEffect, useState } from 'react';

export default function OrderBook({ symbol = 'btcusd' }) {
  const [book, setBook] = useState({ bids: [], asks: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchBook = async () => {
      try {
        const res = await fetch(`/api/book?symbol=${symbol}`);
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();
        if (active) {
          // Asks are sorted lowest price first (best ask). We want to display highest at top.
          const asks = (data.asks || []).slice(0, 15).reverse();
          // Bids are sorted highest price first (best bid). We want to display highest at top.
          const bids = (data.bids || []).slice(0, 15);
          
          // Calculate max amount for depth bars
          const allAmounts = [...asks, ...bids].map(x => parseFloat(x.amount));
          const maxAmount = Math.max(...allAmounts) || 1;
          
          setBook({ 
            asks: asks.map(a => ({ ...a, depth: (parseFloat(a.amount) / maxAmount) * 100 })),
            bids: bids.map(b => ({ ...b, depth: (parseFloat(b.amount) / maxAmount) * 100 }))
          });
        }
      } catch (e) {
        console.error('Orderbook error', e);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchBook();
    const interval = setInterval(fetchBook, 5000); // Polling every 5s for the demo
    return () => { active = false; clearInterval(interval); };
  }, [symbol]);

  const renderRow = (row, type) => {
    const isAsk = type === 'ask';
    const color = isAsk ? 'var(--status-danger)' : 'var(--status-success)';
    const bgOpacity = isAsk ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)';
    
    return (
      <div key={row.price + row.amount} style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        padding: '2px 8px',
        fontSize: '0.8rem',
        fontFamily: 'var(--font-mono)',
        position: 'relative'
      }}>
        {/* Depth Bar */}
        <div style={{
          position: 'absolute',
          top: 0, bottom: 0, right: 0,
          width: `${row.depth}%`,
          background: bgOpacity,
          zIndex: 0
        }} />
        
        <span style={{ color, zIndex: 1 }}>{parseFloat(row.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        <span style={{ color: 'var(--text-secondary)', zIndex: 1 }}>{parseFloat(row.amount).toFixed(4)}</span>
      </div>
    );
  };

  return (
    <div className="terminal-panel" style={{ gridArea: 'orderbook' }}>
      <div className="terminal-header">
        <span>Order Book ({symbol.toUpperCase()})</span>
        <span style={{ color: 'var(--status-success)', fontWeight: 400 }}>Live 🟢</span>
      </div>
      
      <div style={{ display: 'flex', padding: '4px 8px', fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        <span style={{ flex: 1 }}>Price (USD)</span>
        <span>Amount ({symbol.replace(/usd$/i, '').toUpperCase()})</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {loading && <div style={{ padding: '10px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>}
        
        {/* Asks (Red, Sell orders) */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-end', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '4px', marginBottom: '4px' }}>
          {book.asks.map(a => renderRow(a, 'ask'))}
        </div>
        
        {/* Spread Indicator could go here, but for now just the boundary */}
        
        {/* Bids (Green, Buy orders) */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-start' }}>
          {book.bids.map(b => renderRow(b, 'bid'))}
        </div>
      </div>
    </div>
  );
}
