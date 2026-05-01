import { useState, useEffect } from 'react';
import './index.css';
import PortfolioSummary from './components/PortfolioSummary';
import ActivityLog from './components/ActivityLog';
import AgentChat from './components/AgentChat';
import MarketIntelligence from './components/MarketIntelligence';
import ScoutPanel from './components/ScoutPanel';
import StrategyPanel from './components/StrategyPanel';

const TABS = [
  { id: 'portfolio', label: '📊 Portfolio', hash: '#portfolio' },
  { id: 'scout',     label: '🔭 Scout',     hash: '#scout' },
  { id: 'strategy',  label: '⚡ Strategy',  hash: '#strategy' },
  { id: 'agent',     label: '🤖 Agent',     hash: '#agent' },
  { id: 'logs',      label: '📋 Logs',      hash: '#logs' },
];

function getInitialTab() {
  const hash = window.location.hash;
  const match = TABS.find(t => t.hash === hash);
  return match ? match.id : 'portfolio';
}

function App() {
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [isHalted, setIsHalted] = useState(false);
  const [strategyAlerts, setStrategyAlerts] = useState(0);

  // Sync tab ↔ URL hash so each screen can be bookmarked
  useEffect(() => {
    const tab = TABS.find(t => t.id === activeTab);
    if (tab) window.location.hash = tab.hash;
  }, [activeTab]);

  // Listen for browser back/forward
  useEffect(() => {
    const onHashChange = () => setActiveTab(getInitialTab());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleEmergencyStop = () => {
    setIsHalted(true);
    fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'User hit the Emergency Stop button. Log that the system was halted. Do not execute any tools.' })
    }).catch(() => {});
  };

  const launchAllScreens = () => {
    // Calculate a 2x2 grid using half the screen dimensions
    const w = Math.floor(screen.width / 2);
    const h = Math.floor(screen.height / 2);
    const features = (left, top) =>
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=no,resizable=yes,status=no`;
    const base = window.location.origin;
    // Open all 4 tabs in a 2x2 grid — user drags each to a monitor
    window.open(`${base}/#portfolio`, 'screen_portfolio', features(0, 0));
    window.open(`${base}/#scout`,     'screen_scout',     features(w, 0));
    window.open(`${base}/#agent`,     'screen_agent',     features(0, h));
    window.open(`${base}/#logs`,      'screen_logs',      features(w, h));
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--bg-primary)',
    }}>

      {/* ── Fixed Header ──────────────────────────────────────── */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        height: '64px',
        flexShrink: 0,
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
        gap: '20px',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <div style={{
            width: '10px', height: '10px', borderRadius: '50%',
            background: isHalted ? 'var(--status-danger)' : 'var(--accent-blue)',
            boxShadow: isHalted ? '0 0 10px var(--status-danger)' : '0 0 10px var(--accent-blue)',
            transition: 'all 0.3s'
          }} />
          <span style={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
            Personal Trading Assistant
          </span>
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>gemini-2.5-flash</span>
        </div>

        {/* Tab Nav */}
        <nav style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: '10px' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '7px 18px',
                borderRadius: '7px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.88rem',
                fontWeight: activeTab === tab.id ? 700 : 400,
                background: activeTab === tab.id ? 'var(--accent-blue)' : 'transparent',
                color: activeTab === tab.id ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.2s',
                position: 'relative',
              }}
            >
              {tab.label}
              {tab.id === 'strategy' && strategyAlerts > 0 && activeTab !== 'strategy' && (
                <span style={{
                  position: 'absolute', top: '-4px', right: '-4px',
                  background: 'var(--status-danger)', color: 'white',
                  borderRadius: '50%', width: '16px', height: '16px',
                  fontSize: '0.65rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{strategyAlerts}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Screen launchers */}
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          {TABS.map((tab, i) => {
            const positions = [
              { left: 0, top: 0 },
              { left: Math.floor(screen.width / 2), top: 0 },
              { left: 0, top: Math.floor(screen.height / 2) },
              { left: Math.floor(screen.width / 2), top: Math.floor(screen.height / 2) },
            ];
            const pos = positions[i];
            const w = Math.floor(screen.width / 2);
            const h = Math.floor(screen.height / 2);
            return (
              <button
                key={tab.id}
                onClick={() => window.open(
                  `${window.location.origin}${tab.hash}`,
                  `screen_${tab.id}`,
                  `width=${w},height=${h},left=${pos.left},top=${pos.top},toolbar=no,menubar=no,scrollbars=no,resizable=yes`
                )}
                title={`Open ${tab.label} in a new window`}
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                {tab.label}
              </button>
            );
          })}
          <button
            onClick={launchAllScreens}
            title="Try to open all 4 at once (allow popups if only 1 opens)"
            style={{
              background: 'rgba(74,158,255,0.15)',
              border: '1px solid var(--accent-blue)',
              color: 'var(--accent-blue)',
              borderRadius: '6px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            ⧉ All
          </button>
        </div>

        {/* Emergency Stop */}
        <button
          className="btn-danger"
          onClick={handleEmergencyStop}
          disabled={isHalted}
          style={{
            flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: '6px',
            opacity: isHalted ? 0.5 : 1,
            cursor: isHalted ? 'not-allowed' : 'pointer',
            fontSize: '0.85rem', padding: '8px 16px'
          }}
        >
          ⚠️ {isHalted ? 'HALTED' : 'Emergency Stop'}
        </button>
      </header>

      {/* ── Tab Content (fills remaining viewport exactly) ────── */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* PORTFOLIO TAB */}
        {activeTab === 'portfolio' && (
          <div style={{
            flex: 1, overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr',
            gap: '16px',
            padding: '16px',
          }}>
            {/* Left: Market Intelligence */}
            <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <MarketIntelligence isHalted={isHalted} />
            </div>
            {/* Right: Portfolio */}
            <div style={{ overflow: 'auto' }}>
              <PortfolioSummary />
            </div>
          </div>
        )}

        {/* SCOUT TAB */}
        {activeTab === 'scout' && (
          <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            <ScoutPanel isHalted={isHalted} />
          </div>
        )}

        {/* AGENT TAB */}
        {activeTab === 'agent' && (
          <div style={{
            flex: 1, overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: '1fr 420px',
            gap: '16px',
            padding: '16px',
          }}>
            {/* Left: market intel context for the agent */}
            <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <MarketIntelligence isHalted={isHalted} />
              <PortfolioSummary />
            </div>
            {/* Right: Chat — fills full height */}
            <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <AgentChat isHalted={isHalted} />
            </div>
          </div>
        )}

        {/* STRATEGY TAB */}
        {activeTab === 'strategy' && (
          <div style={{ flex: 1, overflow: 'hidden', padding: '16px' }}>
            <StrategyPanel
              isHalted={isHalted}
              onTriggeredCount={(n) => setStrategyAlerts(n)}
            />
          </div>
        )}

        {/* LOGS TAB */}
        {activeTab === 'logs' && (
          <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            <ActivityLog isHalted={isHalted} />
          </div>
        )}

      </main>
    </div>
  );
}

export default App;
