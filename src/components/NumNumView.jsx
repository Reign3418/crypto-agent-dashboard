import { useState, useEffect, useRef } from 'react';

const GEMINI_FEE_RATE = 0.004;
const ROUND_TRIP_FEE  = GEMINI_FEE_RATE * 2; // 0.8%

// Run the same math NumNum runs — mirrored here for live display
function computeGateCheck(buyPrice, currentPrice, floor, stopLoss, highWaterMark, trailingStopLoss) {
  if (!buyPrice || !currentPrice || buyPrice <= 0) return null;
  const minProfit  = (parseFloat(floor) || 1.5) / 100;
  const stopPct    = parseFloat(stopLoss) || 5.0;
  const trailPct   = parseFloat(trailingStopLoss) || 3.0;
  const feeDragPct = ROUND_TRIP_FEE * 100;

  const hwm = highWaterMark || buyPrice;

  const currentPctFromBuy = ((currentPrice - buyPrice) / buyPrice) * 100;
  const breakEvenPrice    = buyPrice * (1 + ROUND_TRIP_FEE);
  const targetSellPrice   = buyPrice * (1 + ROUND_TRIP_FEE + minProfit);
  const netProfitPct      = currentPctFromBuy - feeDragPct;
  
  const dropFromBuyPct    = ((buyPrice - currentPrice) / buyPrice) * 100;
  const dropFromPeakPct   = ((hwm - currentPrice) / hwm) * 100;

  const isHardStop        = dropFromBuyPct >= stopPct;
  const isTrailStop       = dropFromPeakPct >= trailPct;
  const isStopLoss        = isHardStop || isTrailStop;

  const trailTriggerPrice = hwm * (1 - (trailPct / 100));

  const isProfitable      = netProfitPct >= (minProfit * 100);
  const distanceToTarget  = ((targetSellPrice - currentPrice) / currentPrice) * 100;

  let verdict, verdictColor, verdictIcon;
  if (isStopLoss) {
    verdict = isTrailStop ? 'TRAIL-STOP EXIT' : 'HARD-STOP EXIT'; 
    verdictColor = '#f97316'; verdictIcon = '🔴';
  } else if (isProfitable) {
    verdict = 'WOULD APPROVE'; verdictColor = '#22c55e'; verdictIcon = '✅';
  } else {
    verdict = 'WOULD BLOCK'; verdictColor = '#f59e0b'; verdictIcon = '⛔';
  }

  // Progress: 0 = at buy price, 100 = at target
  const range = targetSellPrice - buyPrice;
  const progress = range > 0 ? Math.max(0, Math.min(100, ((currentPrice - buyPrice) / range) * 100)) : 0;

  return {
    currentPctFromBuy: parseFloat(currentPctFromBuy.toFixed(3)),
    netProfitPct: parseFloat(netProfitPct.toFixed(3)),
    breakEvenPrice: parseFloat(breakEvenPrice.toFixed(4)),
    targetSellPrice: parseFloat(targetSellPrice.toFixed(4)),
    distanceToTarget: parseFloat(distanceToTarget.toFixed(3)),
    trailTriggerPrice: parseFloat(trailTriggerPrice.toFixed(4)),
    hwm: parseFloat(hwm.toFixed(4)),
    progress,
    verdict, verdictColor, verdictIcon,
    isStopLoss, isTrailStop, isProfitable, feeDragPct,
    minProfitPct: minProfit * 100,
    stopPct, trailPct
  };
}

function classifyNumNumLog(action = '') {
  if (action.includes('STOP-LOSS'))              return { label: 'STOP-EXIT',    color: '#f97316' };
  if (action.includes('CONCENTRATION BLOCKED'))  return { label: 'CONCENTR.',    color: '#e879f9' };
  if (action.includes('ENTRY QUALITY BLOCKED'))  return { label: 'MOMENTUM ⛔',  color: '#f59e0b' };
  if (action.includes('Entry quality'))          return { label: 'MOMENTUM',     color: '#38bdf8' };
  if (action.includes('APPROVE'))                return { label: 'APPROVE',      color: '#22c55e' };
  if (action.includes('REJECT') || action.includes('BLOCKED')) return { label: 'BLOCK', color: '#f59e0b' };
  if (action.includes('calibrated'))             return { label: 'CALIBRATION',  color: '#818cf8' };
  return { label: 'GATE', color: '#38bdf8' };
}

export default function NumNumView() {
  const [settings,   setSettings]   = useState({});
  const [livePrices, setLivePrices] = useState({});
  const [numLogs,    setNumLogs]     = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const isMounted = useRef(true);

  // Fetch settings + logs
  useEffect(() => {
    isMounted.current = true;
    const fetchAll = async () => {
      try {
        const [sRes, lRes] = await Promise.all([
          fetch('/api/settings'),
          fetch('/api/logs?limit=200'),
        ]);
        if (!isMounted.current) return;
        if (sRes.ok) setSettings(await sRes.json());
        if (lRes.ok) {
          const logs = await lRes.json();
          setNumLogs(
            logs.filter(l =>
              l.action?.includes('NumNum') ||
              l.action?.includes('numNum') ||
              l.action?.includes('[TANK] NumNum') ||
              l.action?.includes('CONCENTRATION BLOCKED') ||
              l.action?.includes('ENTRY QUALITY BLOCKED') ||
              l.action?.includes('Entry quality')
            ).slice(0, 40)
          );
        }
        setLastUpdated(new Date());
      } catch { /* silent */ }
    };
    fetchAll();
    const iv = setInterval(fetchAll, 8000);
    return () => { isMounted.current = false; clearInterval(iv); };
  }, []);

  // Fetch live prices for each open position
  useEffect(() => {
    const positions = settings.openPositions || {};
    const symbols = Object.keys(positions).filter(s => s !== 'USD' && s !== 'GUSD');
    if (!symbols.length) return;

    const fetchPrices = async () => {
      const results = {};
      await Promise.all(symbols.map(async sym => {
        try {
          const r = await fetch(`https://api.gemini.com/v1/pubticker/${sym.toLowerCase()}usd`);
          if (r.ok) {
            const d = await r.json();
            results[sym] = parseFloat(d.last);
          }
        } catch { /* silent */ }
      }));
      if (isMounted.current) setLivePrices(results);
    };
    fetchPrices();
    const iv = setInterval(fetchPrices, 5000);
    return () => clearInterval(iv);
  }, [settings.openPositions]);

  const floor     = settings.numNumFloor    || '1.5';
  const stopLoss  = settings.numNumStopLoss || '5.0';
  const trailingStopLoss = settings.trailingStopLoss || '3.0';
  const isTankSet = !!settings.numNumFloor;
  const openPositions = settings.openPositions || {};

  return (
    <div style={{
      height: '100%', overflowY: 'auto', background: 'var(--bg-primary)',
      padding: '20px', fontFamily: 'var(--font-mono)',
      display: 'flex', flexDirection: 'column', gap: '16px',
    }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.3rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            🔢 NumNum Gate <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>— Fee Viability Engine</span>
          </h1>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Pure math. No AI. No hallucinations. NumNum answers one question: will this trade make money after fees?
          </div>
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'right' }}>
          {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading...'}<br/>
          <span style={{ color: '#38bdf8' }}>Live prices every 5s</span>
        </div>
      </div>

      {/* ── Gate Configuration Card ── */}
      <div style={{
        background: 'var(--bg-secondary)', border: `1px solid ${isTankSet ? '#818cf8' : 'var(--border-subtle)'}`,
        borderRadius: '10px', padding: '16px',
        boxShadow: isTankSet ? '0 0 16px rgba(129,140,248,0.15)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '1rem' }}>⚙️</span>
          <span style={{ fontWeight: 700, color: isTankSet ? '#818cf8' : 'var(--text-secondary)', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
            {isTankSet ? 'TANK-CALIBRATED GATE' : 'DEFAULT GATE (Awaiting Tank)'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
          {[
            { label: 'MIN PROFIT FLOOR', value: `${parseFloat(floor).toFixed(1)}%`, color: '#818cf8', desc: 'Net gain required to approve' },
            { label: 'HARD STOP-LOSS', value: `${parseFloat(stopLoss).toFixed(1)}%`, color: '#ef4444', desc: 'Max drawdown from entry' },
            { label: 'TRAILING STOP', value: `${parseFloat(trailingStopLoss).toFixed(1)}%`, color: '#f97316', desc: 'Max drawdown from peak' },
            { label: 'FEE DRAG (fixed)', value: '0.80%', color: '#f59e0b', desc: '0.4% buy + 0.4% sell (Gemini)' },
            { label: 'BREAK-EVEN TARGET', value: `${(0.8 + parseFloat(floor)).toFixed(2)}%`, color: '#22c55e', desc: 'Gross gain needed above fees' },
          ].map(({ label, value, color, desc }) => (
            <div key={label} style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '6px' }}>{label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: '4px' }}>{desc}</div>
            </div>
          ))}
        </div>
        {isTankSet && (
          <div style={{ marginTop: '10px', fontSize: '0.68rem', color: '#818cf8', borderTop: '1px solid rgba(129,140,248,0.2)', paddingTop: '8px' }}>
            ⚡ Tank calibration active — thresholds auto-adjust every 12h based on Dozer's fee drag + win rate data
          </div>
        )}
      </div>

      {/* ── Live Position Gate Checks ── */}
      <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>
        LIVE POSITION GATE CHECK
      </div>

      {Object.keys(openPositions).length === 0 ? (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          No open positions. NumNum standing by.
        </div>
      ) : (
        Object.entries(openPositions).map(([sym, pos]) => {
          const currentPrice = livePrices[sym];
          const buyPrice     = pos.buyPrice ? parseFloat(pos.buyPrice) : null;
          const hwm          = pos.highWaterMark ? parseFloat(pos.highWaterMark) : buyPrice;
          const check        = currentPrice && buyPrice ? computeGateCheck(buyPrice, currentPrice, floor, stopLoss, hwm, trailingStopLoss) : null;
          const amount       = parseFloat(pos.amount || 0);
          const currentValue = currentPrice ? currentPrice * amount : null;

          return (
            <div key={sym} style={{
              background: 'var(--bg-secondary)',
              border: `1px solid ${check ? check.verdictColor + '44' : 'var(--border-subtle)'}`,
              borderRadius: '10px', padding: '16px',
              boxShadow: check ? `0 0 20px ${check.verdictColor}18` : 'none',
            }}>
              {/* Symbol header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div>
                  <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>{sym}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '10px' }}>
                    {amount.toFixed(6)} units held
                  </span>
                </div>
                {check && (
                  <div style={{
                    padding: '5px 12px', borderRadius: '20px',
                    background: check.verdictColor + '22',
                    border: `1px solid ${check.verdictColor}66`,
                    color: check.verdictColor, fontWeight: 700, fontSize: '0.78rem',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    {check.verdictIcon} {check.verdict}
                  </div>
                )}
              </div>

              {/* Price row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '14px' }}>
                {[
                  { label: 'ENTRY PRICE', value: buyPrice ? `$${buyPrice.toFixed(4)}` : '—', color: '#6b7280' },
                  { label: 'HIGH-WATER MARK', value: check ? `$${check.hwm.toFixed(4)}` : '—', color: '#8b5cf6', sub: 'Peak reached' },
                  {
                    label: 'LIVE PRICE',
                    value: currentPrice ? `$${currentPrice.toFixed(4)}` : '⟳',
                    color: check
                      ? (check.currentPctFromBuy >= 0 ? '#22c55e' : '#ef4444')
                      : 'var(--text-primary)',
                    sub: check ? `${check.currentPctFromBuy >= 0 ? '+' : ''}${check.currentPctFromBuy.toFixed(3)}%` : '',
                  },
                  {
                    label: 'TRAIL TRIGGER',
                    value: check ? `$${check.trailTriggerPrice.toFixed(4)}` : '—',
                    color: '#f97316',
                    sub: check ? `-${check.trailPct}% from peak` : '',
                  },
                  {
                    label: 'POSITION VALUE',
                    value: currentValue ? `$${currentValue.toFixed(2)}` : '—',
                    color: 'var(--text-primary)',
                  },
                ].map(({ label, value, color, sub }) => (
                  <div key={label} style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '4px' }}>{label}</div>
                    <div style={{ fontSize: '1.0rem', fontWeight: 700, color }}>{value}</div>
                    {sub && <div style={{ fontSize: '0.60rem', color, marginTop: '2px' }}>{sub}</div>}
                  </div>
                ))}
              </div>

              {/* Gate progress gauge */}
              {check && (
                <>
                  <div style={{ marginBottom: '6px', fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Break-even: <span style={{ color: '#f59e0b' }}>${check.breakEvenPrice.toFixed(4)}</span></span>
                    <span>Target (gate): <span style={{ color: '#818cf8' }}>${check.targetSellPrice.toFixed(4)}</span></span>
                  </div>
                  <div style={{ background: 'var(--bg-tertiary)', borderRadius: '6px', height: '12px', position: 'relative', overflow: 'hidden' }}>
                    {/* Fee drag zone */}
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${(ROUND_TRIP_FEE / (ROUND_TRIP_FEE + check.minProfitPct / 100)) * 100}%`,
                      background: 'rgba(245,158,11,0.25)',
                    }} />
                    {/* Progress fill */}
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${check.progress}%`,
                      background: check.isProfitable
                        ? 'linear-gradient(90deg,#16a34a,#22c55e)'
                        : check.isStopLoss
                          ? 'linear-gradient(90deg,#991b1b,#ef4444)'
                          : 'linear-gradient(90deg,#1d4ed8,#60a5fa)',
                      borderRadius: '6px',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                  <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      Net after fees: <span style={{ color: check.netProfitPct >= check.minProfitPct ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                        {check.netProfitPct >= 0 ? '+' : ''}{check.netProfitPct.toFixed(3)}%
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}> (need {check.minProfitPct.toFixed(1)}%)</span>
                    </div>
                    {!check.isProfitable && !check.isStopLoss && (
                      <div style={{ fontSize: '0.68rem', color: '#f59e0b', textAlign: 'right' }}>
                        📏 {check.distanceToTarget > 0 ? `+${check.distanceToTarget.toFixed(3)}%` : '—'} needed to clear gate
                      </div>
                    )}
                    {check.isProfitable && (
                      <div style={{ fontSize: '0.68rem', color: '#22c55e', textAlign: 'right' }}>
                        ✅ Gate clears — SELL approved if CIPHER decides
                      </div>
                    )}
                    {check.isStopLoss && (
                      <div style={{ fontSize: '0.68rem', color: '#f97316', textAlign: 'right' }}>
                        🔴 Stop-loss zone — exit override active
                      </div>
                    )}
                  </div>
                </>
              )}

              {!check && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', padding: '8px 0' }}>
                  ⟳ Fetching live price…
                </div>
              )}
            </div>
          );
        })
      )}

      {/* ── NumNum Decision Feed ── */}
      <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-secondary)', letterSpacing: '0.08em', marginTop: '4px' }}>
        NUMNUM DECISION LOG
      </div>
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: '10px',
        border: '1px solid var(--border-subtle)', overflow: 'hidden',
        maxHeight: '420px', overflowY: 'auto',
      }}>
        {numLogs.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            No NumNum log entries yet.
          </div>
        ) : (
          numLogs.map((log, i) => {
            const cls = classifyNumNumLog(log.action || '');
            const ts  = log.time || log.sk;
            const timeStr = ts ? new Date(typeof ts === 'string' && !ts.includes('T') ? parseInt(ts) : ts).toLocaleTimeString() : '';
            return (
              <div key={log.sk || i} style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '8px 14px',
                borderBottom: '1px solid var(--border-subtle)',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
              }}>
                <span style={{
                  minWidth: '76px', fontSize: '0.62rem', fontWeight: 700,
                  color: cls.color, background: cls.color + '18',
                  border: `1px solid ${cls.color}44`, borderRadius: '4px',
                  padding: '2px 6px', textAlign: 'center', flexShrink: 0,
                }}>{cls.label}</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', flexGrow: 1, lineHeight: 1.5 }}>
                  {log.action}
                </span>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {timeStr}
                </span>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
