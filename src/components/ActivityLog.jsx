import { useState, useEffect } from 'react';

export default function ActivityLog({ isHalted, minimal = false }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await fetch('/api/logs');
        if (res.ok) {
          const data = await res.json();
          setLogs(data);
        }
      } catch (err) {
        console.error("Failed to fetch logs", err);
      } finally {
        setLoading(false);
      }
    }

    // Initial fetch
    fetchLogs();

    // Poll every 5 seconds for new background actions
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className={minimal ? "" : "glass-panel"} style={{ display: 'flex', flexDirection: 'column', gap: minimal ? '8px' : '20px', height: '100%' }}>
      {!minimal && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Autonomous Activity Logs</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="pulse-dot" style={{ background: isHalted ? 'var(--status-danger)' : 'var(--status-success)', boxShadow: isHalted ? '0 0 8px var(--status-danger)' : '0 0 8px var(--status-success)', animation: isHalted ? 'none' : 'pulse 2s infinite' }}></div>
            <span className="text-muted" style={{ fontSize: '0.9rem' }}>{isHalted ? 'Agent Offline' : 'Agent Active'}</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: minimal ? '2px' : '10px', flex: 1, overflowY: 'auto' }}>
        {loading ? (
            <div style={{ padding: '20px', textAlign: 'center', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <p className="text-muted">Syncing ledger with AWS DynamoDB...</p>
            </div>
        ) : logs.length === 0 ? (
            <p className="text-muted">No recent autonomous activity.</p>
        ) : (
            logs.map((log, index) => (
            <div 
                key={log.id || index}
                style={{ 
                display: 'flex', 
                gap: minimal ? '8px' : '16px', 
                padding: minimal ? '4px 8px' : '12px 16px', 
                background: log.highlight ? 'rgba(74, 158, 255, 0.1)' : (minimal ? 'transparent' : 'var(--bg-tertiary)'), 
                borderLeft: log.highlight ? `3px solid var(--accent-blue)` : (minimal ? 'none' : '3px solid var(--border-subtle)'),
                borderBottom: minimal ? '1px solid var(--bg-primary)' : 'none',
                borderRadius: minimal ? '0' : '0 8px 8px 0',
                fontSize: minimal ? '0.8rem' : '0.95rem',
                fontFamily: minimal ? 'var(--font-mono)' : 'inherit'
                }}
            >
                <div className="text-muted" style={{ minWidth: minimal ? '50px' : '70px', fontSize: minimal ? '0.75rem' : '0.85rem', paddingTop: minimal ? '0' : '2px' }}>
                {log.time}
                </div>
                <div style={{ color: log.highlight ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {log.action}
                </div>
            </div>
            ))
        )}
      </div>
    </section>
  );
}
