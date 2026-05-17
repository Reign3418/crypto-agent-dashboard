import { useState, useEffect, useRef, useLayoutEffect } from 'react';

// ── Log Classification Engine ─────────────────────────────────────────────
const classifyLog = (action = '') => {
  if (!action) return { level: 'routine', label: 'SYS', color: '#444' };

  // CRITICAL — always visible, always red
  if (action.includes('BIG JON STOPS THE FIGHT') || action.includes('HARD STOP-LOSS') || action.includes('PANIC SELL'))
    return { level: 'critical', label: 'CRIT', color: '#ef4444' };

  // ERROR
  if (action.includes('❌') || action.includes('Autopilot error') || action.includes('failed:') || action.includes('ERR'))
    return { level: 'error', label: 'ERR', color: '#f97316' };

  // TRADE — actual money moving
  if (action.includes('Trade Executed') || action.includes('Autopilot Decision:') || action.includes('LIQUIDATE'))
    return { level: 'trade', label: 'TRADE', color: '#22c55e' };

  // BLOCK — gate blocked a trade
  if (action.includes('NumNum BLOCKED') || action.includes('NumNum REJECT') || action.includes('trade aborted'))
    return { level: 'block', label: 'BLOCK', color: '#f59e0b' };

  // NULL — strategic directive
  if (action.includes('NULL Strategic Command') || action.includes('coachNotes') || action.includes('Strategic command issued'))
    return { level: 'null', label: 'NULL', color: '#818cf8' };

  // GATE — Big Jon or NumNum running (not a block, just a pass)
  if (action.includes('Big Jon:') || action.includes('NumNum:') || action.includes("Let's get it on"))
    return { level: 'gate', label: 'GATE', color: '#38bdf8' };

  // MISSION events
  if (action.includes('MISSION') || action.includes('missionCompletions') || action.includes('Optimization Suggestion'))
    return { level: 'mission', label: 'MSION', color: '#a78bfa' };

  // ALERT — stop-loss check, emergency
  if (action.includes('🚨') || action.includes('EMERGENCY') || action.includes('autopilot disabled'))
    return { level: 'alert', label: 'ALERT', color: '#fb923c' };

  // ROUTINE — the heartbeat noise (5-min scan chatter)
  if (
    action.includes('CIPHER Core Autopilot is ON') ||
    action.includes('Core asset scan complete') ||
    action.includes('Handing market data') ||
    action.includes('Scout report complete') ||
    action.includes('Auto-eval:') ||
    action.includes('strategies checked') ||
    action.includes('assets scouted') ||
    action.includes('Biggest mover:')
  )
    return { level: 'routine', label: 'SYS', color: '#3f3f46' };

  // INFO — everything else
  return { level: 'info', label: 'INFO', color: '#6b7280' };
};

// ── Filter Config ─────────────────────────────────────────────────────────
const FILTERS = [
  { id: 'all',      label: 'ALL',     levels: null },
  { id: 'trades',   label: '💰 TRADES',  levels: ['trade', 'critical'] },
  { id: 'blocks',   label: '⛔ BLOCKS',  levels: ['block', 'critical', 'alert'] },
  { id: 'null',     label: '🧠 NULL',    levels: ['null'] },
  { id: 'gates',    label: '🥊 GATES',   levels: ['gate', 'block'] },
  { id: 'errors',   label: '❌ ERRORS',  levels: ['error', 'critical'] },
  { id: 'signal',   label: '📡 SIGNAL',  levels: ['trade', 'block', 'null', 'critical', 'alert', 'error', 'mission'] },
];

export default function ActivityLog({ isHalted, minimal = false }) {
  const [logs, setLogs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('signal'); // default: hide routine SYS noise
  const [paused, setPaused]       = useState(false);
  const [search, setSearch]       = useState('');
  const [newCount, setNewCount]   = useState(0);
  const containerRef              = useRef(null);
  const pausedRef                 = useRef(false);
  const [expanded, setExpanded]   = useState({});

  pausedRef.current = paused;

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await fetch('/api/logs');
        if (res.ok) {
          const data = await res.json();
          setLogs(prev => {
            const added = data.length - prev.length;
            if (added > 0 && pausedRef.current) setNewCount(n => n + added);
            return data;
          });
        }
      } catch (err) {
        console.error('Failed to fetch logs', err);
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  // Pin scroll to top whenever logs update or filter changes — newest entry always visible
  useLayoutEffect(() => {
    if (containerRef.current && !paused) {
      containerRef.current.scrollTop = 0;
    }
  }, [logs, filter, search, paused]);

  const handleResume = () => {
    setPaused(false);
    setNewCount(0);
  };

  // ── Filtering ─────────────────────────────────────────────────────────
  const activeFilter = FILTERS.find(f => f.id === filter);
  const filteredLogs = logs
    .map(log => ({ ...log, _cls: classifyLog(log.action) }))
    .filter(log => {
      if (activeFilter.levels && !activeFilter.levels.includes(log._cls.level)) return false;
      if (search && !log.action?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .reverse(); // newest first — no scrolling needed

  const counts = logs.reduce((acc, log) => {
    const cls = classifyLog(log.action);
    acc[cls.level] = (acc[cls.level] || 0) + 1;
    return acc;
  }, {});

  // ── Styles ────────────────────────────────────────────────────────────
  const styles = {
    wrapper: {
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
      fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
    },
    toolbar: {
      display: 'flex', gap: '4px', padding: '6px 8px',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--bg-secondary)', flexWrap: 'wrap', alignItems: 'center',
      flexShrink: 0,
    },
    filterBtn: (active) => ({
      padding: '2px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '0.7rem',
      fontFamily: 'var(--font-mono)', fontWeight: active ? 'bold' : 'normal',
      border: active ? '1px solid var(--accent-blue)' : '1px solid var(--border-subtle)',
      background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
      color: active ? 'var(--accent-blue)' : 'var(--text-muted)',
    }),
    pauseBtn: {
      marginLeft: 'auto', padding: '2px 8px', borderRadius: '3px', cursor: 'pointer',
      fontSize: '0.7rem', fontFamily: 'var(--font-mono)', fontWeight: 'bold',
      border: '1px solid var(--border-subtle)',
      background: paused ? 'rgba(251,146,60,0.15)' : 'transparent',
      color: paused ? '#fb923c' : 'var(--text-muted)',
    },
    searchBox: {
      padding: '2px 6px', borderRadius: '3px', fontSize: '0.7rem',
      fontFamily: 'var(--font-mono)', border: '1px solid var(--border-subtle)',
      background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '120px',
    },
    logList: {
      flex: 1, overflowY: 'auto',
    },
    logRow: (cls, hl) => ({
      display: 'flex', gap: '8px', padding: '4px 8px',
      borderLeft: `3px solid ${cls.color}`,
      background: hl ? `${cls.color}18` : 'transparent',
      borderBottom: '1px solid rgba(255,255,255,0.03)',
      alignItems: 'flex-start',
      cursor: 'pointer',
    }),
    label: (color) => ({
      minWidth: '40px', fontSize: '0.65rem', fontWeight: 'bold',
      color, opacity: 0.9, paddingTop: '2px', flexShrink: 0,
    }),
    timestamp: {
      minWidth: '48px', color: 'var(--text-muted)', fontSize: '0.7rem',
      paddingTop: '2px', flexShrink: 0,
    },
    action: (color, isExpanded) => ({
      color, flex: 1, lineHeight: '1.5', wordBreak: 'break-word',
      display: '-webkit-box',
      WebkitLineClamp: isExpanded ? 'unset' : 3,
      WebkitBoxOrient: 'vertical',
      overflow: isExpanded ? 'visible' : 'hidden',
    }),
    expandHint: {
      fontSize: '0.6rem', color: 'var(--text-muted)', flexShrink: 0,
      paddingTop: '2px', userSelect: 'none', opacity: 0.6,
    },
    statusBar: {
      display: 'flex', gap: '12px', padding: '3px 8px', fontSize: '0.65rem',
      color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)',
      background: 'var(--bg-secondary)', flexShrink: 0,
    },
    newBadge: {
      position: 'absolute', top: '36px', right: '12px', zIndex: 10,
      background: '#f59e0b', color: '#000', fontWeight: 'bold',
      padding: '3px 10px', borderRadius: '12px', cursor: 'pointer',
      fontSize: '0.7rem', fontFamily: 'var(--font-mono)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    },
  };

  const getActionColor = (cls) => {
    if (cls.level === 'routine') return '#3f3f46';
    if (cls.level === 'trade') return '#86efac';
    if (cls.level === 'critical') return '#fca5a5';
    if (cls.level === 'error') return '#fdba74';
    if (cls.level === 'block') return '#fcd34d';
    if (cls.level === 'null') return '#c4b5fd';
    if (cls.level === 'gate') return '#7dd3fc';
    if (cls.level === 'mission') return '#d8b4fe';
    return 'var(--text-secondary)';
  };

  const highlight = ['trade', 'critical', 'block', 'null', 'mission'];

  return (
    <div style={{ position: 'relative', ...styles.wrapper }}>
      {/* New entries badge when paused */}
      {paused && newCount > 0 && (
        <div style={styles.newBadge} onClick={handleResume}>
          ▼ {newCount} new — click to resume
        </div>
      )}

      {/* Toolbar */}
      <div style={styles.toolbar}>
        {FILTERS.map(f => (
          <button key={f.id} style={styles.filterBtn(filter === f.id)} onClick={() => setFilter(f.id)}>
            {f.label}
            {f.id === 'errors' && counts.error > 0 && (
              <span style={{ marginLeft: '4px', color: '#ef4444' }}>({counts.error})</span>
            )}
            {f.id === 'trades' && counts.trade > 0 && (
              <span style={{ marginLeft: '4px', color: '#22c55e' }}>({counts.trade})</span>
            )}
          </button>
        ))}
        <input
          style={styles.searchBox}
          placeholder="search logs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button style={styles.pauseBtn} onClick={() => paused ? handleResume() : setPaused(true)}>
          {paused ? '▶ RESUME' : '⏸ PAUSE'}
        </button>
      </div>

      {/* Log list — newest at top */}
      <div style={styles.logList} ref={containerRef}>
        {loading ? (
          <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>
            Syncing with DynamoDB...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>
            No logs match this filter.
          </div>
        ) : (
          filteredLogs.map((log, i) => {
            const key = log.id || log.sk || i;
            const isExpanded = !!expanded[key];
            const isLong = (log.action || '').length > 120;
            return (
              <div
                key={key}
                style={styles.logRow(log._cls, highlight.includes(log._cls.level))}
                onClick={() => isLong && setExpanded(prev => ({ ...prev, [key]: !prev[key] }))}
              >
                <span style={styles.label(log._cls.color)}>{log._cls.label}</span>
                <span style={styles.timestamp}>{log.time}</span>
                <span style={styles.action(getActionColor(log._cls), isExpanded)}>{log.action}</span>
                {isLong && (
                  <span style={styles.expandHint}>{isExpanded ? '▲' : '▼'}</span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Status bar */}
      <div style={styles.statusBar}>
        <span>{filteredLogs.length}/{logs.length} entries</span>
        {counts.trade && <span style={{ color: '#22c55e' }}>💰 {counts.trade} trades</span>}
        {counts.block && <span style={{ color: '#f59e0b' }}>⛔ {counts.block} blocks</span>}
        {counts.error && <span style={{ color: '#ef4444' }}>❌ {counts.error} errors</span>}
        {counts.critical && <span style={{ color: '#ef4444' }}>🚨 {counts.critical} critical</span>}
        <span style={{ marginLeft: 'auto' }}>
          {paused ? '⏸ PAUSED (fetching halted)' : '● LIVE · newest first'}
        </span>
      </div>
    </div>
  );
}
