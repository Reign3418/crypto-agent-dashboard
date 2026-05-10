import { useState, useEffect, useRef } from 'react';

/**
 * NullCommandCenter — Dedicated UI for NULL, the Strategic Commander.
 * Shows NULL's latest directive, command history (filtered from activity log),
 * and a live split-view vs CIPHER's most recent tactical decisions.
 */
export default function NullCommandCenter() {
  const [coachNotes, setCoachNotes]     = useState('');
  const [nullLogs, setNullLogs]         = useState([]);
  const [cipherLogs, setCipherLogs]     = useState([]);
  const [loading, setLoading]           = useState(true);
  const [lastUpdated, setLastUpdated]   = useState(null);
  const nullFeedRef = useRef(null);

  const fetchData = async () => {
    try {
      // Pull settings for coachNotes (NULL's latest directive)
      const settRes = await fetch('/api/settings');
      if (settRes.ok) {
        const s = await settRes.json();
        setCoachNotes(s.coachNotes || '');
      }

      // Pull last 500 logs and split into NULL vs CIPHER feeds
      // NULL logs once per hour; CIPHER can produce 50+ entries per hour, so 80 was burying NULL.
      const logRes = await fetch('/api/logs?limit=500');

      if (logRes.ok) {
        const logs = await logRes.json();
        setNullLogs(logs.filter(l => l.action?.includes('[NULL]')));
        setCipherLogs(logs.filter(l =>
          !l.action?.includes('[NULL]') && (
            l.action?.includes('Autopilot Decision') ||
            l.action?.includes('HOLD') ||
            l.action?.includes('Bought') ||
            l.action?.includes('Sold') ||
            l.action?.includes('GUARDRAIL') ||
            l.action?.includes('Mission')
          )
        ).slice(0, 20));
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error('NullCommandCenter fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (nullFeedRef.current) {
      nullFeedRef.current.scrollTop = nullFeedRef.current.scrollHeight;
    }
  }, [nullLogs]);

  const panelStyle = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  const headerStyle = (color) => ({
    padding: '10px 16px',
    borderBottom: '1px solid var(--border-subtle)',
    fontSize: '0.78rem',
    fontFamily: 'var(--font-mono)',
    color,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(0,0,0,0.2)',
    fontWeight: 700,
    letterSpacing: '0.05em',
  });

  const logRowStyle = (isNull) => ({
    padding: '6px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    fontSize: '0.78rem',
    lineHeight: 1.5,
    display: 'flex',
    gap: '10px',
  });

  const timeAgo = (isoStr) => {
    if (!isoStr) return '';
    const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'auto', padding: '16px' }}>

      {/* ── Header Banner ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(59,130,246,0.08))',
        border: '1px solid rgba(139,92,246,0.3)',
        borderRadius: '12px',
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: 'var(--accent-purple)',
              boxShadow: '0 0 8px var(--accent-purple)',
              animation: 'blink 2s infinite',
            }} />
            <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--accent-purple)' }}>NULL — Strategic Commander</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>gemini-2.5-flash</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Runs hourly. Analyzes CIPHER's performance and autonomously rewrites tactical directives.
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          <div>Last refresh</div>
          <div style={{ color: 'var(--accent-blue)' }}>{lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}</div>
        </div>
      </div>

      {/* ── NULL's Current Active Directive ── */}
      <div style={{
        background: 'rgba(139,92,246,0.07)',
        border: '1px solid rgba(139,92,246,0.35)',
        borderRadius: '12px',
        padding: '16px 20px',
      }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--accent-purple)', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: '8px', letterSpacing: '0.08em' }}>
          ▶ ACTIVE STRATEGIC DIRECTIVE (Coach Override)
        </div>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading...</div>
        ) : coachNotes ? (
          <div style={{ fontSize: '0.92rem', lineHeight: 1.7, color: 'var(--text-primary)' }}>{coachNotes}</div>
        ) : (
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No directive issued yet. NULL will issue its first command after 60 minutes of CIPHER activity.
          </div>
        )}
      </div>

      {/* ── Split Feed: NULL Commands vs CIPHER Decisions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', flex: 1, minHeight: 0 }}>

        {/* NULL Feed */}
        <div style={panelStyle}>
          <div style={headerStyle('var(--accent-purple)')}>
            <span>🧠 NULL — STRATEGIC LOG</span>
            <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{nullLogs.length} commands</span>
          </div>
          <div ref={nullFeedRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {nullLogs.length === 0 ? (
              <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: '0.82rem', fontStyle: 'italic' }}>
                NULL has not issued any commands yet. Check back in ~60 minutes after the first autonomous cycle.
              </div>
            ) : nullLogs.map((log, i) => (
              <div key={i} style={logRowStyle(true)}>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', flexShrink: 0, paddingTop: '2px' }}>
                  {log.time}
                </span>
                <span style={{ color: '#c4b5fd', lineHeight: 1.5 }}>{log.action}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CIPHER Feed */}
        <div style={panelStyle}>
          <div style={headerStyle('var(--accent-blue)')}>
            <span>⚡ CIPHER — TACTICAL DECISIONS</span>
            <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>last 20</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {cipherLogs.length === 0 ? (
              <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: '0.82rem', fontStyle: 'italic' }}>
                No CIPHER tactical decisions recorded yet.
              </div>
            ) : cipherLogs.map((log, i) => (
              <div key={i} style={logRowStyle(false)}>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', flexShrink: 0, paddingTop: '2px' }}>
                  {log.time}
                </span>
                <span style={{ color: 'var(--accent-green)', lineHeight: 1.5 }}>{log.action}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
