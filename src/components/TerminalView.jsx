import { useState, useEffect, useCallback } from 'react';
import CandleChart from './CandleChart';
import OrderBook from './OrderBook';
import TickerTape from './TickerTape';
import AgentChat from './AgentChat';
import ActivityLog from './ActivityLog';
import PortfolioSummary from './PortfolioSummary';

export default function TerminalView({ isHalted }) {
  const [symbol, setSymbol] = useState('btcusd');
  const [candles, setCandles] = useState([]);
  const [loadingCandles, setLoadingCandles] = useState(false);
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);

  // Fetch Autopilot state
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => setAutopilotEnabled(d.autopilotEnabled || false))
      .catch(console.error);
  }, []);

  const toggleAutopilot = async () => {
    const newVal = !autopilotEnabled;
    setAutopilotEnabled(newVal);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autopilotEnabled: newVal })
      });
    } catch (e) {
      console.error(e);
      setAutopilotEnabled(!newVal);
    }
  };

  // Fetch Candles
  const fetchCandles = useCallback(async (sym) => {
    setLoadingCandles(true);
    try {
      const res = await fetch(`/api/proxy?route=candles&symbol=${sym}&timeframe=1hr`);
      if (res.ok) {
        const data = await res.json();
        setCandles(data);
      }
    } catch (e) {
      console.error('Failed to fetch candles', e);
    } finally {
      setLoadingCandles(false);
    }
  }, []);

  useEffect(() => {
    fetchCandles(symbol);
    const interval = setInterval(() => fetchCandles(symbol), 60000);
    return () => clearInterval(interval);
  }, [symbol, fetchCandles]);

  return (
    <div className="terminal-grid">
      <TickerTape />

      {/* Main Chart Area */}
      <div className="terminal-panel" style={{ gridArea: 'chart' }}>
        <div className="terminal-header" style={{ display: 'flex', gap: '10px' }}>
          <span>TradingView Chart</span>
          <select 
            value={symbol} 
            onChange={(e) => setSymbol(e.target.value)}
            style={{ 
              background: 'transparent', color: 'var(--accent-blue)', 
              border: 'none', fontWeight: 'bold', outline: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)' 
            }}
          >
            <option value="btcusd">BTC/USD</option>
            <option value="ethusd">ETH/USD</option>
            <option value="solusd">SOL/USD</option>
            <option value="pepeusd">PEPE/USD</option>
            <option value="dogeusd">DOGE/USD</option>
          </select>
        </div>
        <div style={{ flex: 1, padding: '2px', position: 'relative' }}>
          {loadingCandles && candles.length === 0 && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'var(--text-muted)' }}>Loading...</div>
          )}
          {candles.length > 0 && <CandleChart data={candles} />}
        </div>
      </div>

      {/* Autopilot & Agent Console */}
      <div className="terminal-panel" style={{ gridArea: 'autopilot', borderLeft: '1px solid var(--border-subtle)' }}>
        <div className="terminal-header">Command Center</div>
        
        {/* Toggle UI inside Terminal */}
        <div style={{ 
          padding: '12px', borderBottom: '1px solid var(--bg-primary)', 
          background: autopilotEnabled ? 'rgba(34, 197, 94, 0.05)' : 'var(--bg-secondary)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <span style={{ fontWeight: 'bold', color: autopilotEnabled ? 'var(--status-success)' : 'var(--text-secondary)' }}>
              {autopilotEnabled ? '● AUTOPILOT ACTIVE' : '○ AUTOPILOT OFFLINE'}
            </span>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Executes 1 trade per day (Cron Limit)</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
                onClick={async () => {
                    const btn = document.getElementById('force-btn');
                    btn.disabled = true;
                    btn.innerText = 'Executing...';
                    try {
                        const pass = prompt('Enter your dashboard password to manually execute Scout:');
                        if (!pass) throw new Error('Cancelled');
                        const res = await fetch('/api/scout', {
                            headers: { 'Authorization': 'Basic ' + btoa('admin:' + pass) }
                        });
                        if (res.ok) alert('Scout cycle executed successfully! Check Live Feed.');
                        else alert('Failed: ' + await res.text());
                    } catch (e) {
                        if (e.message !== 'Cancelled') alert(e.message);
                    } finally {
                        btn.disabled = false;
                        btn.innerText = '⚡ Force Exec';
                    }
                }}
                id="force-btn"
                disabled={isHalted || !autopilotEnabled}
                style={{
                padding: '4px 8px', border: '1px solid var(--accent-blue)', borderRadius: '4px', cursor: (isHalted || !autopilotEnabled) ? 'not-allowed' : 'pointer',
                background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-blue)',
                fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 'bold', opacity: (isHalted || !autopilotEnabled) ? 0.5 : 1
                }}
            >
                ⚡ Force Exec
            </button>
            <button 
                onClick={toggleAutopilot}
                disabled={isHalted}
                style={{
                padding: '4px 12px', border: '1px solid', borderRadius: '4px', cursor: 'pointer',
                background: autopilotEnabled ? 'var(--status-success)' : 'transparent',
                color: autopilotEnabled ? '#000' : 'var(--text-secondary)',
                borderColor: autopilotEnabled ? 'var(--status-success)' : 'var(--border-subtle)',
                fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 'bold'
                }}
            >
                {autopilotEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Mini Agent Chat */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <AgentChat isHalted={isHalted} miniMode={true} />
        </div>
      </div>

      <OrderBook symbol={symbol} />

      {/* Logs Area */}
      <div className="terminal-panel" style={{ gridArea: 'logs', borderTop: '1px solid var(--border-subtle)' }}>
        <div className="terminal-header">Live Feed</div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ActivityLog isHalted={isHalted} minimal={true} />
        </div>
      </div>

      {/* Portfolio Area */}
      <div className="terminal-panel" style={{ gridArea: 'portfolio', borderTop: '1px solid var(--border-subtle)' }}>
        <div className="terminal-header">Portfolio Balances</div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <PortfolioSummary minimal={true} />
        </div>
      </div>
    </div>
  );
}
