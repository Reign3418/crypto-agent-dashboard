/**
 * DowIntelligence.jsx — Day-of-Week Seasonal Pattern Heatmap
 * Owned by Scout (data), displayed on Strategy tab.
 * Tank reads this same data to calibrate mission posture.
 */
import { useState, useEffect } from 'react';

const DAY_NAMES    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL     = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CORE_SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP', 'LINK', 'DOGE', 'LTC', 'AVAX', 'BCH'];

// Color scale: red → grey → green based on avgChangePct
function heatColor(pct) {
  if (pct == null) return 'rgba(255,255,255,0.04)';
  if (pct >  3)  return 'rgba(34,197,94,0.55)';
  if (pct >  1.5) return 'rgba(34,197,94,0.38)';
  if (pct >  0.5) return 'rgba(34,197,94,0.22)';
  if (pct > -0.5) return 'rgba(255,255,255,0.07)';
  if (pct > -1.5) return 'rgba(239,68,68,0.22)';
  if (pct > -3)   return 'rgba(239,68,68,0.38)';
  return 'rgba(239,68,68,0.55)';
}

function textColor(pct) {
  if (pct == null) return 'var(--text-muted)';
  return pct > 0.2 ? '#86efac' : pct < -0.2 ? '#fca5a5' : 'var(--text-muted)';
}

export default function DowIntelligence() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [selected, setSelected] = useState(null); // { sym, dow } for detail panel
  const [refreshing, setRefreshing] = useState(false);
  const today = new Date().getUTCDay();

  const load = async (force = false) => {
    try {
      const url = force ? '/api/dow-analysis?refresh=1' : '/api/dow-analysis';
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRefresh = () => { setRefreshing(true); load(true); };

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
      📅 Loading 90-day DOW analysis...
    </div>
  );

  if (error) return (
    <div style={{ padding: '24px', color: '#f87171', fontFamily: 'var(--font-mono)' }}>
      ❌ DOW Analysis error: {error}
    </div>
  );

  const report   = data?.report;
  const todayIntel = data?.today;
  const assets   = report?.assets || {};

  // Build per-day aggregate (market average across all assets)
  const dayAggregates = {};
  for (let d = 0; d <= 6; d++) {
    const avgs = CORE_SYMBOLS.map(s => assets[s]?.byDow?.[d]?.avgChangePct).filter(v => v != null);
    const wins = CORE_SYMBOLS.map(s => assets[s]?.byDow?.[d]?.winRate).filter(v => v != null);
    dayAggregates[d] = {
      avgChangePct: avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length * 100) / 100 : null,
      winRate:      wins.length ? Math.round(wins.reduce((a, b) => a + b, 0) / wins.length * 100) / 100 : null,
    };
  }

  const selStats = selected ? assets[selected.sym]?.byDow?.[selected.dow] : null;

  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-primary)' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-blue)' }}>📅 Day-of-Week Intelligence</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            90-day seasonal pattern · Built by Scout · Read by Tank
            {data?.cachedAt && <span style={{ marginLeft: '8px' }}>· Updated: {new Date(data.cachedAt).toLocaleDateString()}</span>}
            {data?.ageHours > 0 && <span style={{ marginLeft: '4px', color: data.ageHours > 20 ? '#f59e0b' : 'var(--text-muted)' }}>({data.ageHours}h ago)</span>}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            padding: '4px 12px', borderRadius: '4px', cursor: 'pointer',
            background: 'rgba(59,130,246,0.1)', border: '1px solid var(--accent-blue)',
            color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
            opacity: refreshing ? 0.5 : 1,
          }}
        >
          {refreshing ? '⏳ Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      {/* Today's posture banner */}
      {todayIntel && (
        <div style={{
          padding: '10px 14px', borderRadius: '6px', marginBottom: '16px',
          background: todayIntel.avgMarketChangePct > 1 ? 'rgba(34,197,94,0.1)'
                    : todayIntel.avgMarketChangePct < -0.5 ? 'rgba(239,68,68,0.1)'
                    : 'rgba(255,255,255,0.05)',
          border: `1px solid ${todayIntel.avgMarketChangePct > 1 ? 'rgba(34,197,94,0.3)' : todayIntel.avgMarketChangePct < -0.5 ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`,
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '4px' }}>
            Today ({todayIntel.dayName}) · Market avg: {todayIntel.avgMarketChangePct > 0 ? '+' : ''}{todayIntel.avgMarketChangePct}%
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: '1.5' }}>
            {todayIntel.posture}
          </div>
        </div>
      )}

      {/* Heatmap Grid */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '640px' }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 400, minWidth: '52px' }}>Asset</th>
              {DAY_NAMES.map((d, i) => (
                <th key={i} style={{
                  padding: '6px 6px', textAlign: 'center', fontSize: '0.72rem', fontWeight: 700,
                  color: i === today ? 'var(--accent-blue)' : 'var(--text-muted)',
                  borderBottom: i === today ? '2px solid var(--accent-blue)' : '1px solid rgba(255,255,255,0.06)',
                  minWidth: '72px',
                }}>
                  {d}{i === today ? ' ◀' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Market aggregate row */}
            <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
              <td style={{ padding: '5px 8px', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 700 }}>AVG</td>
              {Array.from({ length: 7 }, (_, d) => {
                const s = dayAggregates[d];
                return (
                  <td key={d} style={{ padding: '5px 4px', background: heatColor(s?.avgChangePct), textAlign: 'center' }}>
                    <div style={{ color: textColor(s?.avgChangePct), fontWeight: 700, fontSize: '0.75rem' }}>
                      {s?.avgChangePct != null ? `${s.avgChangePct > 0 ? '+' : ''}${s.avgChangePct}%` : '—'}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }}>
                      {s?.winRate != null ? `${s.winRate}% ✓` : ''}
                    </div>
                  </td>
                );
              })}
            </tr>

            {/* Per-asset rows */}
            {CORE_SYMBOLS.map(sym => {
              const assetData = assets[sym];
              if (!assetData) return null;
              return (
                <tr key={sym} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '4px 8px', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.75rem' }}>{sym}</td>
                  {Array.from({ length: 7 }, (_, d) => {
                    const s = assetData.byDow?.[d];
                    const isSelected = selected?.sym === sym && selected?.dow === d;
                    return (
                      <td
                        key={d}
                        onClick={() => setSelected(isSelected ? null : { sym, dow: d })}
                        style={{
                          padding: '4px', background: heatColor(s?.avgChangePct),
                          textAlign: 'center', cursor: 'pointer',
                          outline: isSelected ? '2px solid var(--accent-blue)' : 'none',
                          transition: 'outline 0.1s',
                        }}
                      >
                        {s?.sampleCount >= 5 ? (
                          <>
                            <div style={{ color: textColor(s.avgChangePct), fontWeight: 600, fontSize: '0.72rem' }}>
                              {s.avgChangePct > 0 ? '+' : ''}{s.avgChangePct}%
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.58rem' }}>
                              {s.winRate}% ✓
                            </div>
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }}>—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail panel for selected cell */}
      {selStats && selected && (
        <div style={{
          marginTop: '16px', padding: '14px 16px', borderRadius: '6px',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: '10px', color: 'var(--accent-blue)' }}>
            {selected.sym} on {DAY_FULL[selected.dow]} — 90-day detail
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
            {[
              { label: 'Avg Change',    value: `${selStats.avgChangePct > 0 ? '+' : ''}${selStats.avgChangePct}%` },
              { label: 'Win Rate',      value: `${selStats.winRate}% green` },
              { label: 'Best Day',      value: `+${selStats.bestDay}%` },
              { label: 'Worst Day',     value: `${selStats.worstDay}%` },
              { label: 'Avg High Wick', value: `+${selStats.avgHighWick}%` },
              { label: 'Avg Low Wick',  value: `-${selStats.avgLowWick}%` },
              { label: 'Sample Size',   value: `${selStats.sampleCount} occurrences` },
              { label: 'Avg Volume',    value: selStats.avgVolume.toLocaleString(undefined, { maximumFractionDigits: 0 }) },
            ].map(({ label, value }) => (
              <div key={label} style={{ padding: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '3px' }}>{label}</div>
                <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{value}</div>
              </div>
            ))}
          </div>
          {/* Insight */}
          <div style={{ marginTop: '10px', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            {selStats.winRate > 65 && selStats.avgChangePct > 0.5
              ? `✅ HIGH CONFIDENCE UP — ${selected.sym} has closed green ${selStats.winRate}% of ${DAY_FULL[selected.dow]}s. Strong candidate for a pre-market entry on this day.`
              : selStats.winRate < 40 || selStats.avgChangePct < -0.5
              ? `⚠️ HISTORICALLY WEAK — ${selected.sym} underperforms on ${DAY_FULL[selected.dow]}s. Prefer to hold cash or tighten stops on this day.`
              : `➡️ NEUTRAL — No strong ${DAY_FULL[selected.dow]} bias for ${selected.sym}. Standard sizing applies.`
            }
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
        <span>Click any cell for detailed stats.</span>
        <span style={{ color: '#86efac' }}>■ Green = historically positive avg</span>
        <span style={{ color: '#fca5a5' }}>■ Red = historically negative avg</span>
        <span>Numbers = avg % price change (open→close). ✓ = % of days that closed green.</span>
      </div>
    </div>
  );
}
