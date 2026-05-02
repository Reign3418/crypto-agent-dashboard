import { useState, useEffect } from 'react';

export default function PortfolioSummary({ minimal = false }) {
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
            const active = json.filter(item => {
                const amount = parseFloat(item.amount || 0);
                const notional = parseFloat(item.amountNotional || 0);
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
            }).sort((a, b) => parseFloat(b.value.replace(/[$,]/g, '') || 0) - parseFloat(a.value.replace(/[$,]/g, '') || 0));
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
    <section className={minimal ? "" : "glass-panel"} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-muted">Loading live portfolio from Gemini...</p>
    </section>
  );

  if (error) return (
    <section className={minimal ? "" : "glass-panel"} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p className="text-danger">⚠️ Connection failed: {error}</p>
    </section>
  );

  return (
    <section className={minimal ? "" : "glass-panel"} style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {!minimal && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '24px' }}>
            <h2 style={{ margin: 0 }}>Portfolio Balances</h2>
            <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                ${data.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-muted" style={{ fontSize: '0.85rem' }}>Total USD Notional</div>
            </div>
        </div>
      )}

      {minimal && (
        <div style={{ padding: '8px 12px', background: 'rgba(59, 130, 246, 0.1)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>TOTAL USD NOTIONAL</span>
          <span style={{ fontWeight: 'bold', color: 'var(--accent-blue)' }}>${data.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {data.assets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            <p>No active balances found.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: minimal ? 'var(--font-mono)' : 'inherit' }}>
            <thead>
              <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)', fontSize: minimal ? '0.75rem' : '0.85rem', textTransform: 'uppercase' }}>
                <th style={{ padding: minimal ? '6px 12px' : '12px 0' }}>Asset</th>
                <th style={{ padding: minimal ? '6px 12px' : '12px 0' }}>Balance</th>
                <th style={{ padding: minimal ? '6px 12px' : '12px 0', textAlign: 'right' }}>Notional Value</th>
              </tr>
            </thead>
            <tbody>
              {data.assets.map(asset => (
                <tr key={asset.symbol} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.2s' }}>
                  <td style={{ padding: minimal ? '8px 12px' : '16px 0', fontWeight: 600, color: 'var(--text-primary)' }}>{asset.symbol}</td>
                  <td style={{ padding: minimal ? '8px 12px' : '16px 0', color: 'var(--text-secondary)' }}>{asset.balance}</td>
                  <td style={{ padding: minimal ? '8px 12px' : '16px 0', textAlign: 'right', fontWeight: 500, color: 'var(--text-primary)' }}>{asset.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
