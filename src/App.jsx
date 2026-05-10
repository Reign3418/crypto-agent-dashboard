import { useState, useEffect } from 'react';
import './index.css';
import PortfolioSummary from './components/PortfolioSummary';
import ActivityLog from './components/ActivityLog';
import AgentChat from './components/AgentChat';
import MarketIntelligence from './components/MarketIntelligence';
import ScoutPanel from './components/ScoutPanel';
import StrategyPanel from './components/StrategyPanel';
import TerminalView from './components/TerminalView';
import NullCommandCenter from './components/NullCommandCenter';
import TankView from './components/TankView';
import DozerView from './components/DozerView';

const TABS = [
  { id: 'terminal',  label: '🖥️ Terminal',   hash: '#terminal' },
  { id: 'tank',      label: '🎯 Tank',        hash: '#tank' },
  { id: 'dozer',     label: '🏗️ Dozer',      hash: '#dozer'   },
  { id: 'null',      label: '🧠 NULL',        hash: '#null' },
  { id: 'strategy',  label: '⚡ Strategy',   hash: '#strategy' },
  { id: 'logs',      label: '📋 Logs',       hash: '#logs' },
];

function getInitialTab() {
  const hash = window.location.hash;
  const match = TABS.find(t => t.hash === hash);
  return match ? match.id : 'terminal';
}

function App() {
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [isHalted, setIsHalted] = useState(false);
  const [strategyAlerts, setStrategyAlerts] = useState(0);
  const [autopilotEnabled, setAutopilotEnabled] = useState(true); // optimistic default

  // Poll autopilot state every 20s so banner reflects reality across all tabs
  useEffect(() => {
    const check = () =>
      fetch('/api/settings').then(r => r.json()).then(d => setAutopilotEnabled(d.autopilotEnabled ?? true)).catch(() => {});
    check();
    const iv = setInterval(check, 20000);
    return () => clearInterval(iv);
  }, []);

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

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--bg-primary)',
    }}>

      {/* ── Fixed Header ──────────────────────────────────────── */}
      <header className="app-header" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        minHeight: '64px',
        flexShrink: 0,
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
        gap: '20px',
      }}>
        {/* Brand */}
        <div className="desktop-only" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <div style={{
            width: '10px', height: '10px', borderRadius: '50%',
            background: isHalted ? 'var(--status-danger)' : 'var(--accent-blue)',
            boxShadow: isHalted ? '0 0 10px var(--status-danger)' : '0 0 10px var(--accent-blue)',
            transition: 'all 0.3s'
          }} />
          <span style={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
            CIPHER Core
          </span>
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>gemini-2.5-flash</span>
        </div>

        {/* Tab Nav */}
        <nav className="nav-tabs" style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: '10px' }}>
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
        <div className="desktop-only" style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button
            onClick={() => window.open(
              `${window.location.origin}/#terminal`,
              `screen_terminal`,
              `width=${Math.floor(screen.width / 2)},height=${Math.floor(screen.height / 2)},left=0,top=0,toolbar=no,menubar=no,scrollbars=no,resizable=yes`
            )}
            title="Open Terminal in a new pop-out window"
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
            ⧉ Pop-out Terminal
          </button>
        </div>

        {/* Emergency Stop */}
        <div className="emergency-stop-container">
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
        </div>
      </header>

      {/* ── Warning Banner — Emergency Stop or Autopilot Off ──────────────── */}
      {(isHalted || !autopilotEnabled) && (
        <div style={{
          flexShrink: 0,
          background: isHalted
            ? 'linear-gradient(90deg, #7f1d1d, #991b1b, #7f1d1d)'
            : 'linear-gradient(90deg, #78350f, #92400e, #78350f)',
          backgroundSize: '200% 100%',
          animation: 'bannerPulse 2s ease-in-out infinite',
          borderBottom: `2px solid ${isHalted ? '#ef4444' : '#f59e0b'}`,
          padding: '10px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.4rem', animation: 'iconFlash 1s step-end infinite' }}>
              {isHalted ? '🛑' : '⚠️'}
            </span>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {isHalted ? 'EMERGENCY STOP ENGAGED — ALL TRADING HALTED' : 'AUTOPILOT OFFLINE — CIPHER IS NOT TRADING'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>
                {isHalted
                  ? 'No agent can execute trades. Refresh the page and re-enable autopilot to resume operations.'
                  : 'The system is standing by. Turn Autopilot ON in the Terminal tab to resume autonomous trading.'}
              </div>
            </div>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>
            {isHalted ? 'HARD HALT' : 'SOFT HALT'}
          </div>
        </div>
      )}

      <style>{`
        @keyframes bannerPulse {
          0%, 100% { background-position: 0% 50%; opacity: 1; }
          50% { background-position: 100% 50%; opacity: 0.88; }
        }
        @keyframes iconFlash {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `}</style>

      {/* ── Tab Content (fills remaining viewport exactly) ────── */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* TERMINAL TAB */}
        {activeTab === 'terminal' && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <TerminalView isHalted={isHalted} />
          </div>
        )}


        {/* TANK TAB */}
        {activeTab === 'tank' && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <TankView />
          </div>
        )}

        {/* DOZER TAB */}
        {activeTab === 'dozer' && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <DozerView />
          </div>
        )}

        {/* NULL COMMAND CENTER TAB */}
        {activeTab === 'null' && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <NullCommandCenter />
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
