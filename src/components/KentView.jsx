import { useState, useEffect } from 'react';

export default function KentView() {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchBriefing = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setBriefing(data.kentBriefing || null);
    } catch (e) {
      console.error('Failed to fetch Kent briefing', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBriefing();
    const iv = setInterval(fetchBriefing, 15000); // Poll every 15s
    return () => clearInterval(iv);
  }, []);

  const runKentManual = async () => {
    setLoading(true);
    await fetch('/api/kent', { method: 'POST' });
    await fetchBriefing();
  };

  if (loading && !briefing) return <div style={{ padding: '20px' }}>Loading Intelligence...</div>;

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>📰 KENT — Chief Market Analyst</h2>
        <button 
          onClick={runKentManual}
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Gather Intelligence Now
        </button>
      </div>

      {!briefing ? (
        <div className="panel">No intelligence briefing available yet. Wait for Kent to run or click gather.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Header Panel */}
          <div className="panel" style={{ borderLeft: '4px solid var(--accent-blue)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
              <span>Published: {new Date(briefing.timestamp).toLocaleString()}</span>
              <span>Volatility: <strong>{briefing.volatilityState}</strong> | Lens: <strong>{briefing.recommendedCandleDepth}h</strong></span>
            </div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1.2rem' }}>Macro Narrative</h3>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{briefing.macroNarrative}</p>
          </div>

          {/* Catalysts Grid */}
          <div className="panel">
            <h3 style={{ margin: '0 0 15px 0', fontSize: '1.2rem' }}>Asset Catalysts</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
              {Object.entries(briefing.catalysts || {}).map(([symbol, news]) => (
                <div key={symbol} style={{ 
                  background: 'var(--bg-secondary)', 
                  padding: '12px', 
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)'
                }}>
                  <strong style={{ display: 'block', marginBottom: '5px', color: 'var(--accent-blue)' }}>{symbol}</strong>
                  <span style={{ fontSize: '0.9rem', color: news ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {news || 'No active catalysts.'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Sources Cited */}
          {briefing.sources && briefing.sources.length > 0 && (
            <div className="panel" style={{ marginTop: '10px' }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: 'var(--text-muted)' }}>Sources Cited</h3>
              <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {briefing.sources.map((source, idx) => (
                  <li key={idx} style={{ fontSize: '0.85rem' }}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>
                      {source.title || source.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
        </div>
      )}
    </div>
  );
}
