import { useState, useEffect } from 'react';

export default function PortfolioSummary() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchPortfolio() {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch('/api/portfolio', { method: 'POST', signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`API Error ${res.status}: ${text}`);
        }
        const json = await res.json();
        
        let formattedAssets = [];
        let totalUsd = 0;

        if (Array.isArray(json)) {
            // Handle BOTH /v1/notionalbalances/usd and /v1/balances response shapes
            const active = json.filter(item => {
                const amount = parseFloat(item.amount || 0);
                const notional = parseFloat(item.amountNotional || 0);
                // Keep any asset that has either a non-zero raw amount OR a non-zero USD value
                return amount > 0 || notional > 0;
            });
            
            formattedAssets = active.map(item => {
                const notional = parseFloat(item.amountNotional || 0);
                const amount = parseFloat(item.amount || 0);
                totalUsd += notional;
                return {
                    symbol: item.currency,
                    balance: amount > 0 ? amount.toFixed(6) : '—',
                    value: notional > 0 ? `$${notional.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'
                };
            })
                // Sort by USD value descending so biggest holdings show first
                .sort((a, b) => parseFloat(b.value.replace(/[$,]/g, '') || 0) - parseFloat(a.value.replace(/[$,]/g, '') || 0));
        }

        setData({ assets: formattedAssets, totalUsd });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchPortfolio();
  }, []);

  if (loading) return (
    <section className="glass-panel" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-muted">Loading live portfolio from Gemini...</p>
    </section>
  );

  if (error) return (
    <section className="glass-panel" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-danger">Error: {error}</p>
    </section>
  );

  const { assets, totalUsd } = data;

  return (
    <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h2>Portfolio Overview</h2>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '20px' }}>
        <div>
          <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Balance (USD)</p>
          <h1 style={{ fontSize: '3rem', margin: 0 }}>
            {totalUsd > 0 ? `$${totalUsd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '---'}
          </h1>
        </div>
        <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '8px', height: '8px', background: 'var(--status-success)', borderRadius: '50%', boxShadow: '0 0 8px var(--status-success)' }}></div>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>Live Connection</span>
            </div>
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: '16px', fontSize: '1.1rem' }}>Asset Allocation</h3>
        {assets.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <p className="text-muted">No active assets found in your Gemini account.</p>
            </div>
        ) : (
            <div style={{ display: 'grid', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
            {assets.map((asset) => (
                <div key={asset.symbol} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '8px', transition: 'background 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--accent-blue)' }}>
                    {asset.symbol[0]}
                    </div>
                    <div>
                        <div style={{ fontWeight: 600 }}>{asset.symbol}</div>
                        <div className="text-muted" style={{ fontSize: '0.85rem' }}>{asset.balance} tokens</div>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600 }}>{asset.value}</div>
                </div>
                </div>
            ))}
            </div>
        )}
      </div>
    </section>
  );
}
