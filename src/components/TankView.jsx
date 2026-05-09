import { useState, useEffect } from 'react';

const HEALTH_COLOR = {
  HEALTHY: '#22c55e',
  MONITOR: '#f59e0b',
  CRITICAL: '#ef4444',
  STABLE:   '#22c55e',
  CAUTION:  '#f59e0b',
  UNKNOWN:  '#6b7280',
};

const HEALTH_ICON = {
  HEALTHY:  '●',
  MONITOR:  '⚠',
  CRITICAL: '🚨',
  STABLE:   '●',
  CAUTION:  '⚠',
  UNKNOWN:  '○',
};

const RISK_COLOR = { LOW: '#22c55e', MEDIUM: '#f59e0b', HIGH: '#ef4444' };

function AgentPill({ name, status }) {
  const raw = (status || 'UNKNOWN').split('—')[0].trim().toUpperCase();
  const level = raw.includes('CRITICAL') ? 'CRITICAL' : raw.includes('MONITOR') ? 'MONITOR' : raw.includes('HEALTHY') ? 'HEALTHY' : 'UNKNOWN';
  const color = HEALTH_COLOR[level] || '#6b7280';
  const icon  = HEALTH_ICON[level] || '○';
  const detail = (status || '').includes('—') ? status.split('—').slice(1).join('—').trim() : '';

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '8px',
      padding: '8px 10px', borderRadius: '6px',
      background: `${color}12`,
      border: `1px solid ${color}30`,
      marginBottom: '6px',
    }}>
      <span style={{ color, fontWeight: 700, fontSize: '0.8rem', minWidth: '16px', paddingTop: '1px' }}>{icon}</span>
      <div>
        <span style={{ color, fontWeight: 700, fontSize: '0.78rem' }}>{name}</span>
        <span style={{ color: '#6b7280', fontSize: '0.75rem', marginLeft: '6px' }}>{level}</span>
        {detail && <div style={{ color: '#9ca3af', fontSize: '0.72rem', marginTop: '2px', lineHeight: 1.3 }}>{detail}</div>}
      </div>
    </div>
  );
}

function ReportCard({ report, dim = false }) {
  if (!report) return null;

  const ts = new Date(report.timestamp);
  const formatted = ts.toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  const sysColor  = HEALTH_COLOR[report.systemHealth] || '#6b7280';
  const riskColor = RISK_COLOR[report.capitalRisk] || '#6b7280';

  return (
    <div style={{
      background: dim ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${dim ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)'}`,
      borderRadius: '10px', padding: '18px',
      opacity: dim ? 0.7 : 1,
    }}>
      {/* Report header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            background: report.period === 'AM' ? 'rgba(251,191,36,0.15)' : 'rgba(99,102,241,0.15)',
            color: report.period === 'AM' ? '#fbbf24' : '#818cf8',
            border: `1px solid ${report.period === 'AM' ? 'rgba(251,191,36,0.3)' : 'rgba(99,102,241,0.3)'}`,
            borderRadius: '4px', padding: '2px 8px',
            fontSize: '0.7rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
          }}>{report.period} REPORT</span>
          <span style={{ color: '#6b7280', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>{formatted}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: sysColor, fontWeight: 700 }}>
            {HEALTH_ICON[report.systemHealth]} {report.systemHealth}
          </span>
          <span style={{
            fontSize: '0.7rem', fontWeight: 700, color: riskColor,
            background: `${riskColor}18`, border: `1px solid ${riskColor}40`,
            borderRadius: '4px', padding: '1px 6px',
          }}>RISK: {report.capitalRisk}</span>
        </div>
      </div>

      {/* Briefing */}
      <p style={{
        color: dim ? '#9ca3af' : '#d1d5db',
        fontSize: '0.88rem', lineHeight: 1.6,
        margin: '0 0 16px 0',
        fontStyle: 'normal',
      }}>
        {report.briefing}
      </p>

      {/* Mission change notice */}
      {report.missionChanged && (
        <div style={{
          background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: '6px', padding: '10px 12px', marginBottom: '14px',
        }}>
          <div style={{ fontSize: '0.7rem', color: '#818cf8', fontWeight: 700, marginBottom: '4px' }}>📋 MISSION UPDATED</div>
          <div style={{ fontSize: '0.82rem', color: '#c7d2fe', lineHeight: 1.4 }}>"{report.missionDirective}"</div>
          <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '4px' }}>{report.missionRationale}</div>
          {report.previousMission && (
            <div style={{ fontSize: '0.7rem', color: '#4b5563', marginTop: '4px' }}>
              Previous: "{report.previousMission}"
            </div>
          )}
        </div>
      )}

      {/* Agent health grid */}
      {report.agentHealth && (
        <div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '8px' }}>AGENT HEALTH</div>
          <AgentPill name="CIPHER"  status={report.agentHealth.cipher} />
          <AgentPill name="NULL"    status={report.agentHealth.null} />
          <AgentPill name="BIG JON" status={report.agentHealth.bigJon} />
          <AgentPill name="NUMNUM"  status={report.agentHealth.numNum} />
        </div>
      )}
    </div>
  );
}

export default function TankView() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) setSettings(await res.json());
      } catch (e) {
        console.error('TankView fetch error:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
    const interval = setInterval(fetchSettings, 60000);
    return () => clearInterval(interval);
  }, []);

  const dozer      = settings?.dozerReport || null;
  const reports    = settings?.tankReports || [];
  const latest     = reports[0] || null;
  const previous   = reports[1] || null;
  const mission    = settings?.missionDirective || 'No mission set yet.';
  const missionBy  = settings?.missionSetBy || 'Human';
  const missionAt  = settings?.missionSetAt ? new Date(settings.missionSetAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '—';

  // Compute next run time from latest report
  const nextRunLabel = latest?.nextRunAt
    ? new Date(latest.nextRunAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
    : '~12h from last run';

  const sysStatus = latest?.systemHealth || 'AWAITING FIRST REPORT';
  const sysColor  = HEALTH_COLOR[sysStatus] || '#6b7280';

  const styles = {
    page: {
      height: '100%', overflowY: 'auto', padding: '20px',
      fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
      color: 'var(--text-primary)',
    },
    header: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      marginBottom: '20px', flexWrap: 'wrap', gap: '12px',
    },
    badge: (color) => ({
      background: `${color}18`, border: `1px solid ${color}40`,
      color, borderRadius: '5px', padding: '3px 10px',
      fontSize: '0.7rem', fontWeight: 700,
    }),
    missionCard: {
      background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
      borderRadius: '10px', padding: '16px', marginBottom: '20px',
    },
    section: { marginBottom: '16px' },
    label: { fontSize: '0.65rem', color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '6px' },
  };

  return (
    <div style={styles.page}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={styles.header}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>🎯 TANK</span>
            <span style={{ color: '#6b7280', fontSize: '0.78rem' }}>Chief of Operations</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#4b5563' }}>
            Next report: {nextRunLabel} &nbsp;·&nbsp; Runs every 12 hours
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={styles.badge(sysColor)}>{HEALTH_ICON[sysStatus] || '○'} {sysStatus}</span>
          {latest && <span style={styles.badge(RISK_COLOR[latest.capitalRisk] || '#6b7280')}>CAPITAL RISK: {latest.capitalRisk}</span>}
        </div>
      </div>

      {loading && (
        <div style={{ color: '#6b7280', textAlign: 'center', padding: '40px' }}>
          Syncing with DynamoDB...
        </div>
      )}

      {!loading && !latest && (
        <div style={{
          background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)',
          borderRadius: '10px', padding: '24px', textAlign: 'center', color: '#fbbf24',
          marginBottom: '20px',
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🎯</div>
          <div style={{ fontWeight: 700, marginBottom: '4px' }}>Tank is standing by</div>
          <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>
            First report generates at the next 12-hour cron trigger.
          </div>
        </div>
      )}

      {/* ── Current Mission ──────────────────────────────────────── */}
      <div style={styles.missionCard}>
        <div style={{ ...styles.label, color: '#818cf8' }}>CURRENT MISSION DIRECTIVE</div>
        <div style={{ fontSize: '0.92rem', color: '#e0e7ff', lineHeight: 1.5, marginBottom: '8px' }}>
          "{mission}"
        </div>
        <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>
          Set by <strong style={{ color: '#818cf8' }}>{missionBy}</strong> on {missionAt}
        </div>
        {latest?.missionRationale && !latest.missionChanged && (
          <div style={{ fontSize: '0.72rem', color: '#4b5563', marginTop: '4px' }}>
            Rationale: {latest.missionRationale}
          </div>
        )}
      </div>

      {/* ── Latest Report ────────────────────────────────────────── */}
      {latest && (
        <div style={styles.section}>
          <div style={styles.label}>LATEST REPORT</div>
          <ReportCard report={latest} />
        </div>
      )}

      {/* ── Previous Report ──────────────────────────────────────── */}
      {previous && (
        <div style={styles.section}>
          <div style={styles.label}>PREVIOUS REPORT</div>
          <ReportCard report={previous} dim={true} />
        </div>
      )}

      {/* ── Dozer Accounting Panel ───────────────────────────────── */}
      <div style={styles.section}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <div style={styles.label}>📊 DOZER — VERIFIED ACCOUNTING</div>
          {dozer && (
            <span style={{ fontSize: '0.65rem', color: '#4b5563' }}>
              Last run: {new Date(dozer.timestamp).toLocaleString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
              &nbsp;·&nbsp; {dozer.tradesAnalyzed} logs analyzed
            </span>
          )}
        </div>

        {!dozer ? (
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '8px', padding: '16px', color: '#6b7280', fontSize: '0.8rem', textAlign: 'center'
          }}>
            Dozer's first report generates in the next 15-minute cron window.
          </div>
        ) : (
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px', padding: '16px',
          }}>
            {/* Capital Balance Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginBottom: '14px' }}>
              {[
                { label: 'LIQUID USD',   value: `$${(dozer.capitalBalance?.liquidUSD || 0).toFixed(2)}`,   color: dozer.liquidityStatus === 'ADEQUATE' ? '#22c55e' : dozer.liquidityStatus === 'LOW' ? '#f59e0b' : '#ef4444' },
                { label: 'DEPLOYED',     value: `$${(dozer.capitalBalance?.totalDeployed || 0).toFixed(2)}`,  color: '#60a5fa' },
                { label: 'REALIZED P&L', value: `$${(dozer.capitalBalance?.netRealizedPL || 0).toFixed(2)}`,  color: (dozer.capitalBalance?.netRealizedPL || 0) >= 0 ? '#22c55e' : '#ef4444' },
                { label: 'UNREALIZED',   value: `$${(dozer.capitalBalance?.unrealizedPL || 0).toFixed(2)}`,   color: (dozer.capitalBalance?.unrealizedPL || 0) >= 0 ? '#22c55e' : '#f59e0b' },
                { label: 'NET POSITION', value: `$${(dozer.capitalBalance?.netPosition || 0).toFixed(2)}`,    color: (dozer.capitalBalance?.netPosition || 0) >= 0 ? '#22c55e' : '#ef4444' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '10px',
                  borderTop: `2px solid ${color}40`,
                }}>
                  <div style={{ fontSize: '0.62rem', color: '#6b7280', fontWeight: 700, letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Performance Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '14px' }}>
              {[
                { label: 'WIN RATE',     value: `${dozer.performance?.winCount || 0}W / ${dozer.performance?.lossCount || 0}L (${dozer.performance?.winRate || '0%'})` },
                { label: 'AVG NET/TRADE',value: `$${(dozer.performance?.avgNetPerTrade || 0).toFixed(4)}` },
                { label: 'FEE DRAG',     value: dozer.performance?.feeDrag || '—' },
                { label: 'STREAK',       value: `${dozer.performance?.currentStreak?.count || 0}-${dozer.performance?.currentStreak?.type || 'none'}`,
                  color: dozer.performance?.currentStreak?.type === 'win' ? '#22c55e' : dozer.performance?.currentStreak?.type === 'loss' ? '#ef4444' : '#6b7280' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  background: 'rgba(255,255,255,0.02)', borderRadius: '6px', padding: '10px',
                }}>
                  <div style={{ fontSize: '0.62rem', color: '#6b7280', fontWeight: 700, letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: color || '#d1d5db' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Concentration Risk */}
            {dozer.concentrationRisk && Object.keys(dozer.concentrationRisk).length > 0 && (
              <div>
                <div style={{ fontSize: '0.62rem', color: '#6b7280', fontWeight: 700, letterSpacing: '0.06em', marginBottom: '6px' }}>CONCENTRATION RISK</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {Object.entries(dozer.concentrationRisk).map(([sym, r]) => {
                    const c = r.status === 'HIGH' ? '#ef4444' : r.status === 'ELEVATED' ? '#f59e0b' : '#22c55e';
                    return (
                      <div key={sym} style={{
                        background: `${c}12`, border: `1px solid ${c}40`,
                        borderRadius: '5px', padding: '4px 10px',
                        fontSize: '0.75rem', color: c, fontWeight: 700,
                      }}>
                        {sym} {r.pct}% <span style={{ fontWeight: 400, color: '#6b7280' }}>{r.status}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Reconciliation note */}
            <div style={{ fontSize: '0.7rem', color: '#4b5563', marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
              {dozer.capitalBalance?.reconciliationNote}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
