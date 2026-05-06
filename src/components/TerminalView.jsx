import { useState, useEffect, useCallback } from 'react';
import CandleChart from './CandleChart';
import OrderBook from './OrderBook';
import TickerTape from './TickerTape';
import AINeuralFeed from './AINeuralFeed';
import ActivityLog from './ActivityLog';
import PortfolioSummary from './PortfolioSummary';

export default function TerminalView({ isHalted }) {
  const [symbol, setSymbol] = useState('btcusd');
  const [candles, setCandles] = useState([]);
  const [loadingCandles, setLoadingCandles] = useState(false);
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [aiState, setAiState] = useState('IDLE');
  const [neuralLogs, setNeuralLogs] = useState([]);

  const addNeuralLog = useCallback((text, color) => {
    const time = new Date().toISOString().split('T')[1].slice(0, 12);
    setNeuralLogs(prev => [...prev.slice(-40), { time, text, color }]);
  }, []);

  const runNeuralSimulation = async (executeAction) => {
    setAiState('PROCESSING');
    setNeuralLogs([]);
    
    addNeuralLog('[SYS] Waking up Gemini 2.5 Flash...', 'var(--text-muted)');
    await new Promise(r => setTimeout(r, 600));
    
    addNeuralLog('[API] Performing Pre-Scout Market Sweep...', 'var(--accent-blue)');
    try {
      const res = await fetch('/api/proxy?route=pricefeed');
      if (res.ok) {
        const data = await res.json();
        const usdPairs = data
          .filter(t => t.pair.toLowerCase().endsWith('usd'))
          .sort((a, b) => Math.abs(parseFloat(b.percentChange24h)) - Math.abs(parseFloat(a.percentChange24h)));
        
        if (usdPairs.length > 0) {
          const target = usdPairs[0].pair.toLowerCase();
          setSymbol(target);
          addNeuralLog(`[SCOUT] Target acquired: ${target.toUpperCase()}. Feeding to CIPHER Core...`, 'var(--accent-green)');
        }
      }
    } catch (e) {
      console.warn('Pre-scout failed', e);
    }

    await new Promise(r => setTimeout(r, 1200));

    addNeuralLog('[DB] Cross-referencing DynamoDB for Strategy Rules...', 'var(--text-primary)');
    await new Promise(r => setTimeout(r, 800));

    addNeuralLog('[AI] Analyzing candlestick patterns & momentum...', 'var(--accent-green)');
    
    try {
      await executeAction();
      addNeuralLog('[EXEC] Scout cycle complete. Returning to sleep.', 'var(--status-success)');
    } catch (e) {
      if (e.message !== 'Cancelled') {
         addNeuralLog(`[ERR] Execution halted: ${e.message}`, 'var(--status-error)');
      }
    } finally {
      setTimeout(() => setAiState('IDLE'), 2000);
    }
  };

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

  // Browser-based Auto-Pinger to bypass Vercel 1/day Cron limit
  useEffect(() => {
    if (!autopilotEnabled || isHalted) return;
    
    console.log('[Browser Pinger] Started. Will execute Scout every 60s while tab is open.');
    
    let isRunning = true;
    
    const loop = async () => {
      if (!isRunning) return;
      try {
        await runNeuralSimulation(async () => {
          const res = await fetch('/api/scout', { method: 'GET' });
          if (!res.ok) throw new Error(await res.text());
        });
      } catch (err) {
        console.error('[Browser Pinger] Error:', err);
      }
      
      if (isRunning) {
        setTimeout(loop, 60 * 1000); // 60 seconds cooldown after completion
      }
    };
    
    // Start the first loop immediately
    loop();

    // Hourly Cognitive Rollup trigger
    const rollupInterval = setInterval(async () => {
      try {
        console.log('[Browser Pinger] Triggering Hourly Cognitive Rollup...');
        await fetch('/api/rollup', { method: 'POST' });
      } catch (e) {
        console.error('Rollup error:', e);
      }
    }, 60 * 60 * 1000); // 1 hour

    return () => {
      console.log('[Browser Pinger] Stopped.');
      isRunning = false;
      clearInterval(rollupInterval);
    };
  }, [autopilotEnabled, isHalted]);

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
            {!['btcusd', 'ethusd', 'solusd', 'pepeusd', 'dogeusd'].includes(symbol) && (
              <option value={symbol}>{symbol.replace(/usd$/i, '').toUpperCase()}/USD</option>
            )}
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
          {candles.length > 0 && <CandleChart symbol={symbol.toUpperCase()} candles={candles} />}
        </div>
      </div>

      {/* Autopilot & Agent Console */}
      <div 
        className="terminal-panel" 
        style={{ 
          gridArea: 'autopilot', 
          borderLeft: '1px solid var(--border-subtle)',
          boxShadow: aiState === 'PROCESSING' ? 'inset 0 0 20px rgba(34, 197, 94, 0.1)' : 'none',
          borderColor: aiState === 'PROCESSING' ? 'var(--accent-green)' : 'var(--border-subtle)',
          transition: 'all 0.3s ease'
        }}
      >
        <div className="terminal-header">CIPHER Command Center</div>
        
        {/* Toggle UI inside Terminal */}
        <div style={{ 
          padding: '12px', borderBottom: '1px solid var(--bg-primary)', 
          background: autopilotEnabled ? 'rgba(34, 197, 94, 0.05)' : 'var(--bg-secondary)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <span style={{ fontWeight: 'bold', color: autopilotEnabled ? 'var(--status-success)' : 'var(--text-secondary)' }}>
              {autopilotEnabled ? '● CIPHER AUTOPILOT ACTIVE' : '○ CIPHER AUTOPILOT OFFLINE'}
            </span>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Mission Directive Active (60s Hyper-Scrub)</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
                onClick={() => {
                    const btn = document.getElementById('force-btn');
                    btn.disabled = true;
                    btn.innerText = 'Executing...';
                    
                    const pass = prompt('Enter your dashboard password to manually execute Scout:');
                    if (!pass) {
                        btn.disabled = false;
                        btn.innerText = '⚡ Force Exec';
                        return;
                    }

                    runNeuralSimulation(async () => {
                        const res = await fetch('/api/scout', {
                            headers: { 'Authorization': 'Basic ' + btoa('admin:' + pass) }
                        });
                        if (res.ok) {
                            addNeuralLog('[SYS] Fetch successful. Updating Live Feed...', 'var(--text-muted)');
                        } else {
                            throw new Error(await res.text());
                        }
                    }).finally(() => {
                        btn.disabled = false;
                        btn.innerText = '⚡ Force Exec';
                    });
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

        {/* AINeuralFeed */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <AINeuralFeed logs={neuralLogs} isScanning={aiState === 'PROCESSING'} />
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
