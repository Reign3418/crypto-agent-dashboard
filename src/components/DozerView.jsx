import { useState, useEffect } from 'react';

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmt(n, prefix = '$') {
  if (n == null) return '—';
  const abs = Math.abs(n).toFixed(2);
  const sign = n < 0 ? '-' : n > 0 ? '+' : '';
  return `${sign}${prefix}${abs}`;
}

function fmtPlain(n) {
  if (n == null) return '—';
  return `$${parseFloat(n).toFixed(2)}`;
}

const STATUS_COLOR = {
  ADEQUATE: 'var(--accent-green)',
  LOW:      '#f59e0b',
  CRITICAL: 'var(--accent-red)',
  HIGH:     'var(--accent-red)',
  ELEVATED: '#f59e0b',
  OK:       'var(--accent-green)',
  LOW_RISK: 'var(--accent-green)',
  MEDIUM:   '#f59e0b',
};

const STAT_CARD = ({ label, value, sub, color, border }) => (
  <div style={{
    background: 'var(--bg-tertiary)',
    border: `1px solid ${border || 'var(--border-subtle)'}`,
    borderRadius: '10px',
    padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: '4px',
  }}>
    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: 'monospace' }}>{value}</div>
    {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sub}</div>}
  </div>
);

export default function DozerView() {
  const [report, setReport]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState(null);
  const [forcing, setForcing] = useState(false);
  const [forceError, setForceError] = useState(null);

  const fetchReport = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setReport(data.dozerReport || null);
      setLastFetch(new Date());
    } catch (e) {
      console.error('DozerView fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  const forceRun = async () => {
    setForcing(true);
    setForceError(null);
    try {
      const res = await fetch('/api/dozer', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unknown error');
      await fetchReport();
    } catch (e) {
      setForceError(e.message);
    } finally {
      setForcing(false);
    }
  };

  useEffect(() => {
    fetchReport();
    const iv = setInterval(fetchReport, 60000);
    return () => clearInterval(iv);
  }, []);

  // ── Standing by ────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
      Loading...
    </div>
  );

  if (!report) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
      <div style={{ fontSize: '2rem' }}>🏗️</div>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>DOZER — Standing By</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>First accounting report generates in the next 15-minute cron window.</div>
      {forceError && <div style={{ fontSize: '0.8rem', color: 'var(--accent-red)', maxWidth: '400px', textAlign: 'center' }}>Error: {forceError}</div>}
      <button onClick={forceRun} disabled={forcing} style={{ marginTop: '8px', padding: '10px 24px', borderRadius: '8px', background: 'rgba(74,158,255,0.15)', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)', fontWeight: 700, cursor: forcing ? 'not-allowed' : 'pointer', fontSize: '0.85rem', opacity: forcing ? 0.6 : 1 }}>
        {forcing ? '⏳ Running Dozer...' : '▶ Force Run Dozer Now'}
      </button>
    </div>
  );

  const { capitalBalance: cap, performance: perf, concentrationRisk, closedPairs, externalAnomalies, liquidityStatus, capitalRisk } = report;
  const streakLabel = perf.currentStreak.count > 0
    ? `${perf.currentStreak.count}-${perf.currentStreak.type === 'win' ? '🟢 win' : '🔴 loss'} streak`
    : 'No streak';

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            🏗️ DOZER — Verified Accounting
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px',
              background: capitalRisk === 'LOW' ? 'rgba(34,197,94,0.15)' : capitalRisk === 'MEDIUM' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
              color: STATUS_COLOR[capitalRisk] || 'var(--text-muted)',
              border: `1px solid ${STATUS_COLOR[capitalRisk] || 'var(--border-subtle)'}40`,
            }}>Capital Risk: {capitalRisk}</span>
          </h2>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            No AI · Pure deterministic math · {report.tradesAnalyzed?.toLocaleString()} log entries scanned · Last run {timeAgo(report.timestamp)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={forceRun}
            disabled={forcing}
            style={{ background: forcing ? 'var(--bg-tertiary)' : 'rgba(74,158,255,0.15)', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)', borderRadius: '8px', padding: '6px 12px', cursor: forcing ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontWeight: 600, opacity: forcing ? 0.6 : 1 }}
          >{forcing ? '⏳ Running...' : '▶ Force Run'}</button>
          <button
            onClick={fetchReport}
            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.78rem' }}
          >↻ Refresh</button>
        </div>
        {forceError && <div style={{ fontSize: '0.75rem', color: 'var(--accent-red)', marginTop: '6px' }}>Error: {forceError}</div>}
      </div>

      {/* ── Capital Balance ──────────────────────────────────────────────────── */}
      <section className="glass-panel" style={{ padding: '16px 20px' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Capital Balance
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
          <STAT_CARD
            label="Liquid USD"
            value={fmtPlain(cap.liquidUSD)}
            sub={`Status: ${liquidityStatus}`}
            color={STATUS_COLOR[liquidityStatus]}
            border={`${STATUS_COLOR[liquidityStatus]}40`}
          />
          <STAT_CARD
            label="Deployed"
            value={fmtPlain(cap.totalDeployed)}
            sub="In open positions"
          />
          <STAT_CARD
            label="Realized P&L"
            value={fmt(cap.netRealizedPL)}
            sub={`Gross: ${fmt(cap.grossRealizedPL)}`}
            color={cap.netRealizedPL >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
            border={cap.netRealizedPL >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}
          />
          <STAT_CARD
            label="Unrealized P&L"
            value={fmt(cap.unrealizedPL)}
            sub="Open positions"
            color={cap.unrealizedPL >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
          />
          <STAT_CARD
            label="Net Position"
            value={fmt(cap.netPosition)}
            sub="Realized + Unrealized"
            color={cap.netPosition >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
            border={cap.netPosition >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}
          />
          <STAT_CARD
            label="Fees Paid"
            value={`$${parseFloat(cap.totalFeesPaid).toFixed(4)}`}
            sub="All-time this era"
            color="#f59e0b"
          />
        </div>
        {cap.reconciliationNote && (
          <div style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-muted)', padding: '6px 10px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
            📋 {cap.reconciliationNote}
          </div>
        )}
      </section>

      {/* ── Performance Score ────────────────────────────────────────────────── */}
      <section className="glass-panel" style={{ padding: '16px 20px' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Performance Score — {perf.totalClosedTrades} Closed Trade Pairs
        </h3>
        {perf.totalClosedTrades === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No closed trade pairs yet. Open positions will appear here once sold.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            <STAT_CARD
              label="Win Rate"
              value={perf.winRate}
              sub={`${perf.winCount}W / ${perf.lossCount}L`}
              color={parseFloat(perf.winRate) >= 50 ? 'var(--accent-green)' : 'var(--accent-red)'}
            />
            <STAT_CARD
              label="Avg Net / Trade"
              value={fmt(perf.avgNetPerTrade)}
              color={perf.avgNetPerTrade >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
            />
            <STAT_CARD
              label="Fee Drag"
              value={perf.feeDrag}
              sub="Fees as % of gross P&L"
              color="#f59e0b"
            />
            <STAT_CARD
              label="Streak"
              value={streakLabel}
              color={perf.currentStreak.type === 'win' ? 'var(--accent-green)' : perf.currentStreak.type === 'loss' ? 'var(--accent-red)' : 'var(--text-muted)'}
            />
            {perf.bestTrade && (
              <STAT_CARD
                label="Best Trade"
                value={`${perf.bestTrade.symbol} ${fmt(perf.bestTrade.netPL)}`}
                color="var(--accent-green)"
              />
            )}
            {perf.worstTrade && (
              <STAT_CARD
                label="Worst Trade"
                value={`${perf.worstTrade.symbol} ${fmt(perf.worstTrade.netPL)}`}
                color="var(--accent-red)"
              />
            )}
          </div>
        )}
      </section>

      {/* ── Concentration Risk ───────────────────────────────────────────────── */}
      {concentrationRisk && Object.keys(concentrationRisk).length > 0 && (
        <section className="glass-panel" style={{ padding: '16px 20px' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Concentration Risk
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {Object.entries(concentrationRisk).map(([sym, data]) => (
              <div key={sym} style={{
                padding: '10px 16px', borderRadius: '10px', minWidth: '120px',
                background: 'var(--bg-tertiary)',
                border: `1px solid ${STATUS_COLOR[data.status] || 'var(--border-subtle)'}40`,
              }}>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{sym}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: STATUS_COLOR[data.status], fontFamily: 'monospace' }}>{data.pct}%</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>${data.costBasis} deployed</div>
                <div style={{
                  fontSize: '0.65rem', fontWeight: 700, marginTop: '4px',
                  color: STATUS_COLOR[data.status],
                }}>{data.status}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── FIFO Closed Trade Ledger ─────────────────────────────────────────── */}
      <section className="glass-panel" style={{ padding: '16px 20px' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          FIFO Closed Trade Ledger
        </h3>
        {!closedPairs || closedPairs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No closed pairs yet — positions appear here once fully sold.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 10px', fontWeight: 600 }}>Asset</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600 }}>Cost Basis</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600 }}>Proceeds</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600 }}>Fees</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600 }}>Gross P&L</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600 }}>Net P&L</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600 }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {[...closedPairs].reverse().map((pair, i) => (
                  <tr key={i} style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  }}>
                    <td style={{ padding: '7px 10px', fontWeight: 700 }}>{pair.symbol}</td>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace' }}>${parseFloat(pair.costBasis).toFixed(2)}</td>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace' }}>${parseFloat(pair.proceeds).toFixed(2)}</td>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#f59e0b' }}>${parseFloat(pair.fees).toFixed(4)}</td>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: pair.grossPL >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {fmt(pair.grossPL)}
                    </td>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700, color: pair.netPL >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {fmt(pair.netPL)}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700,
                        background: pair.won ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                        color: pair.won ? 'var(--accent-green)' : 'var(--accent-red)',
                      }}>
                        {pair.won ? '✓ WIN' : '✗ LOSS'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── External Anomalies ───────────────────────────────────────────────── */}
      {externalAnomalies && externalAnomalies.length > 0 && (
        <section className="glass-panel" style={{ padding: '16px 20px', border: '1px solid rgba(245,158,11,0.3)' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '0.9rem', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ⚠️ External Anomalies — Excluded from P&L
          </h3>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
            These assets were acquired outside CIPHER (e.g., manual transfers) and then sold. Acquisition cost is unknown — excluded from all P&L calculations.
          </div>
          {externalAnomalies.map((a, i) => (
            <div key={i} style={{ padding: '8px 12px', background: 'rgba(245,158,11,0.08)', borderRadius: '8px', fontSize: '0.82rem', marginTop: '6px' }}>
              <strong>{a.symbol}</strong> — Sell proceeds: ${parseFloat(a.usdValue).toFixed(2)} · Fee: ${parseFloat(a.fee).toFixed(4)} · {a.note}
            </div>
          ))}
        </section>
      )}

    </div>
  );
}

