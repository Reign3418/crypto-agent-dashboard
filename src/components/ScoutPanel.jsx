import { useState, useEffect, useCallback } from 'react';
import CandleChart from './CandleChart';

const DIRECTION_COLORS = {
  bullish: 'var(--status-success)',
  bearish: 'var(--status-danger)',
  neutral: '#94a3b8',
};

const DIRECTION_ICONS = {
  bullish: '▲',
  bearish: '▼',
  neutral: '—',
};

const RISK_COLORS = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
};

export default function ScoutPanel({ isHalted }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/scout-reports?limit=10');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Failed to load scout history', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadHistoricReport = (item) => {
    setReport(item.report);
    setGeneratedAt(item.generatedAt);
    setSelectedAsset(item.report?.[0] || null);
    setShowHistory(false);
  };

  const runScout = useCallback(async () => {
    if (isHalted || loading) return;
    setLoading(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000); // 90s max — Scout is slow
      const res = await fetch('/api/scout', { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Scout API error: ${res.status}`);
      const data = await res.json();
      setReport(data.report);
      setGeneratedAt(data.generatedAt);
      if (data.report && data.report.length > 0) {
        setSelectedAsset(data.report[0]);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Scout timed out. The AI took too long. Try again.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [isHalted, loading]);

  // Only auto-run if we have no cached report yet (prevents re-run on every tab switch)
  useEffect(() => {
    if (!isHalted && !report) runScout();
  }, []);

  const bullish = report?.filter(a => a.direction === 'bullish') || [];
  const bearish = report?.filter(a => a.direction === 'bearish') || [];

  return (
    <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            🔭 CIPHER Intel
          </h2>
          {generatedAt && (
            <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
              Last scan: {new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}
            style={{
              background: showHistory ? 'rgba(74,158,255,0.15)' : 'var(--bg-tertiary)',
              border: `1px solid ${showHistory ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
              color: showHistory ? 'var(--accent-blue)' : 'var(--text-muted)',
              borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.85rem'
            }}
          >
            📂 History
          </button>
          <button
            onClick={runScout}
            disabled={loading || isHalted}
            className="btn-primary"
            style={{ opacity: (loading || isHalted) ? 0.5 : 1, cursor: (loading || isHalted) ? 'not-allowed' : 'pointer', fontSize: '0.9rem', padding: '10px 20px' }}
          >
            {loading ? '🔭 Scanning...' : '▶ Run Scout'}
          </button>
        </div>
      </div>

      {/* History Drawer */}
      {showHistory && (
        <div style={{ background: 'var(--bg-tertiary)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: '0.9rem', color: 'var(--accent-blue)' }}>📂 Past Scout Reports</p>
          {historyLoading ? (
            <p className="text-muted" style={{ fontSize: '0.85rem', margin: 0 }}>Loading history from DynamoDB...</p>
          ) : history.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '0.85rem', margin: 0 }}>No saved reports yet. Run Scout to generate the first one.</p>
          ) : (
            history.map((item) => (
              <div
                key={item.sk}
                onClick={() => loadHistoricReport(item)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: '8px',
                  cursor: 'pointer', border: '1px solid var(--border-subtle)', transition: 'border-color 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
              >
                <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                  {new Date(item.generatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {item.assetCount} assets analyzed
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{ padding: '30px', textAlign: 'center', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
          <p style={{ color: 'var(--accent-blue)', marginBottom: '8px', fontSize: '1rem' }}>🤖 Scout is live — scanning {'>'}200 markets and reading the news...</p>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>This takes 20–40 seconds. The AI is Googling breaking news for each asset.</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div style={{ padding: '16px', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--status-danger)', borderRadius: '8px' }}>
          <p style={{ color: 'var(--status-danger)', margin: 0 }}>Scout Error: {error}</p>
        </div>
      )}

      {/* Report Grid */}
      {report && !loading && (
        <div className="grid-stack-mobile" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          
          {/* Bullish Column */}
          <div>
            <h3 style={{ color: DIRECTION_COLORS.bullish, marginBottom: '12px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ▲ Gaining ({bullish.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {bullish.map(asset => (
                <AssetCard
                  key={asset.symbol}
                  asset={asset}
                  isSelected={selectedAsset?.symbol === asset.symbol}
                  onClick={() => setSelectedAsset(asset)}
                />
              ))}
            </div>
          </div>

          {/* Bearish Column */}
          <div>
            <h3 style={{ color: DIRECTION_COLORS.bearish, marginBottom: '12px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ▼ Declining ({bearish.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {bearish.map(asset => (
                <AssetCard
                  key={asset.symbol}
                  asset={asset}
                  isSelected={selectedAsset?.symbol === asset.symbol}
                  onClick={() => setSelectedAsset(asset)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Selected Asset Chart & Detail */}
      {selectedAsset && !loading && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ margin: 0, color: DIRECTION_COLORS[selectedAsset.direction], fontSize: '1.2rem' }}>
                {DIRECTION_ICONS[selectedAsset.direction]} {selectedAsset.symbol} — {selectedAsset.price}
              </h3>
              <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                Risk: <span style={{ color: RISK_COLORS[selectedAsset.riskLevel], fontWeight: 600 }}>{selectedAsset.riskLevel?.toUpperCase()}</span>
              </p>
            </div>
            <div style={{ textAlign: 'right', maxWidth: '55%' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                📰 {selectedAsset.newsHeadline}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--accent-blue)' }}>
                💡 {selectedAsset.analystNote}
              </p>
            </div>
          </div>

          <CandleChart
            symbol={selectedAsset.symbol}
            candles={selectedAsset.candles || []}
          />
        </div>
      )}

      {/* Empty/initial state */}
      {!report && !loading && !error && (
        <div style={{ padding: '30px', textAlign: 'center', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
          <p className="text-muted">Hit "Run Scout" to start market recon.</p>
        </div>
      )}
    </section>
  );
}

function AssetCard({ asset, isSelected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 14px',
        background: isSelected ? 'rgba(74, 158, 255, 0.12)' : 'var(--bg-tertiary)',
        border: isSelected ? '1px solid var(--accent-blue)' : '1px solid var(--border-subtle)',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '50%',
            background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: '0.75rem', color: DIRECTION_COLORS[asset.direction]
          }}>
            {asset.symbol?.slice(0, 3)}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{asset.symbol}</div>
            <div className="text-muted" style={{ fontSize: '0.78rem' }}>{asset.price}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: DIRECTION_COLORS[asset.direction], fontWeight: 700, fontSize: '0.95rem' }}>
            {asset.change24h > 0 ? '+' : ''}{typeof asset.change24h === 'number' ? asset.change24h.toFixed(2) : asset.change24h}%
          </div>
          <div style={{
            fontSize: '0.7rem',
            padding: '2px 6px',
            borderRadius: '4px',
            background: `${RISK_COLORS[asset.riskLevel]}22`,
            color: RISK_COLORS[asset.riskLevel],
            fontWeight: 600,
            textTransform: 'uppercase',
            marginTop: '4px'
          }}>
            {asset.riskLevel}
          </div>
        </div>
      </div>
    </div>
  );
}
