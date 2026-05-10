import { useState, useEffect } from 'react';

const TIP = {
  tank: {
    title: 'TANK — Chief of Operations',
    body: 'Runs every 12 hours. Reads Dozer\'s verified FIFO P&L, win rate, and fee drag, then uses deterministic rules to set NumNum\'s profit floor and stop-loss threshold. Also issues the mission directive that guides NULL. No hallucinations — calibration math is pure arithmetic, not AI.',
  },
  null: {
    title: 'NULL — Strategic Commander',
    body: 'Runs every 60 minutes. Reads Tank\'s mission directive and recent market data, then writes coachNotes — plain-language tactical guidance that tells CIPHER what to prioritize, what to avoid, and how aggressive to be this hour.',
  },
  cipher: {
    title: 'CIPHER — Tactical Agent',
    body: 'Runs every 5 minutes (Gemini 2.5 Pro). Reads NULL\'s coachNotes, live portfolio balances, news, price action, and its own post-mortem history. Proposes buy / sell / hold. Every proposal then passes through four deterministic gates before touching the exchange.',
  },
  concentration: {
    title: 'Gate 1 — Concentration Limit',
    body: 'Deterministic. Runs before any AI. Calculates what % of total deployed capital would be in one asset after this buy. If it exceeds the limit (default 70%), the buy is rejected immediately — no AI call needed. Prevents over-concentration in one coin.',
  },
  momentum: {
    title: 'Gate 2 — Entry Momentum',
    body: 'Deterministic. Fetches the last 10 candles from Gemini\'s public API for both 5-minute and 15-minute timeframes. Computes a simple moving average for each. Both must show current price above the MA (bullish) before a buy is approved. Prevents entering downtrends.',
  },
  bigjon: {
    title: 'Gate 3 — Big Jon (Conflict Referee)',
    body: 'AI-powered alignment check. Big Jon asks: does CIPHER\'s proposed trade directly contradict NULL\'s current directive? If CIPHER wants to buy while NULL said "avoid new positions," Big Jon stops the fight. A conflict is logged but does NOT kill autopilot — NULL self-corrects next hour.',
  },
  numnum: {
    title: 'Gate 4 — NumNum (Fee Viability)',
    body: 'Pure math. Checks: will this trade make money AFTER Gemini\'s 0.4% fee on each side (0.8% round-trip)? For sells, the position must be up enough to clear the Tank-calibrated profit floor net of fees. For buys, calculates the minimum exit price needed to profit. Tank recalibrates the floor every 12h based on Dozer\'s data.',
  },
  dozer: {
    title: 'DOZER — Chief Accounting Officer',
    body: 'Runs every 15 minutes. No AI — pure deterministic math. FIFO-matches every buy to its corresponding sell. Computes realized P&L, win rate, fee drag, current streak, and concentration risk per asset. Writes dozerReport to DynamoDB. Tank reads this report every 12h to calibrate NumNum.',
  },
  bastionai: {
    title: 'BASTION AI — Deep Dive Auditor',
    body: 'On-demand only — runs when you click the audit button. Reads the full trade history and Dozer\'s FIFO pairs and produces a plain-language forensic report. Follows strict accounting rules: never calculates P&L on externally-acquired assets, never over-reports gains.',
  },
  stoploss: {
    title: 'Hard Stop-Loss — Always Armed',
    body: 'Deterministic check in scout.js that runs BEFORE CIPHER on every 5-minute tick, regardless of autopilot state. If any open position is down more than the Tank-calibrated stop-loss threshold from its buy price, it executes a PANIC SELL immediately, bypassing all AI. Cannot be disabled.',
  },
  reconcile: {
    title: 'Reconcile Sync',
    body: 'Manual trigger. Hard-overwrites the DynamoDB openPositions table by reading live balances directly from the Gemini exchange API. Use this if the DB shows stale cost basis data. Computes costBasisUsd from buyPrice × amount and overwrites all fields — no "skip if exists" logic.',
  },
  banner: {
    title: 'Emergency Banner',
    body: 'Always-on UI layer. When autopilot is disabled OR an emergency halt is active, a full-width pulsing banner renders across every tab. Red for hard halt, amber for soft halt. Prevents the operator from missing that the system is not trading.',
  },
};

function Tooltip({ id, children, wrapperStyle = {} }) {
  const [show, setShow] = useState(false);
  const tip = TIP[id] || {};
  return (
    <div
      style={{ position: 'relative', ...wrapperStyle }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && tip.title && (
        <div style={{
          position: 'absolute', zIndex: 9999, bottom: 'calc(100% + 10px)', left: '50%',
          transform: 'translateX(-50%)', width: '280px',
          background: '#0f1929', border: '1px solid #334155',
          borderRadius: '10px', padding: '12px 14px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.72rem', color: '#e2e8f0', marginBottom: '6px', letterSpacing: '0.04em' }}>
            {tip.title}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#94a3b8', lineHeight: 1.6 }}>
            {tip.body}
          </div>
        </div>
      )}
    </div>
  );
}

function HealthDot({ status }) {
  const color = status?.startsWith('HEALTHY') ? '#22c55e' : status?.startsWith('MONITOR') ? '#f59e0b' : status?.startsWith('CRITICAL') ? '#ef4444' : '#475569';
  const label = status?.startsWith('HEALTHY') ? 'HEALTHY' : status?.startsWith('MONITOR') ? 'MONITOR' : status?.startsWith('CRITICAL') ? 'CRITICAL' : '—';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.58rem', color, background: color + '15', border: `1px solid ${color}40`, borderRadius: '20px', padding: '2px 8px', fontWeight: 700 }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, display: 'inline-block', boxShadow: `0 0 5px ${color}` }} />
      {label}
    </span>
  );
}

function FlowDot({ color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }}>
      <div style={{ position: 'relative', width: '2px', height: '28px', background: color + '25' }}>
        <div style={{ position: 'absolute', width: '8px', height: '8px', borderRadius: '50%', background: color, left: '-3px', boxShadow: `0 0 8px ${color}`, animation: 'fDot 2s ease-in-out infinite' }} />
      </div>
    </div>
  );
}

function Agent({ id, icon, name, role, cadence, color, health, output, note }) {
  return (
    <Tooltip id={id}>
      <div style={{
        background: `linear-gradient(135deg,#0b1120 55%,${color}0c)`,
        border: `1px solid ${color}35`, borderLeft: `3px solid ${color}`,
        borderRadius: '10px', padding: '14px 16px', cursor: 'help',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        position: 'relative',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = color + '80'; e.currentTarget.style.boxShadow = `0 0 24px ${color}20`; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = color + '35'; e.currentTarget.style.boxShadow = 'none'; }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{icon}</span>
            <div>
              <div style={{ fontWeight: 800, color, fontSize: '0.95rem', letterSpacing: '0.07em' }}>{name}</div>
              <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '1px' }}>{role}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color, background: color + '18', border: `1px solid ${color}40`, borderRadius: '20px', padding: '2px 8px' }}>⏱ {cadence}</span>
            {health !== undefined && <HealthDot status={health} />}
          </div>
        </div>
        <div style={{ fontSize: '0.63rem', color: '#94a3b8', fontFamily: 'monospace', marginBottom: note ? '5px' : 0 }}>
          → {output}
        </div>
        {note && (
          <div style={{ fontSize: '0.61rem', color, background: color + '0f', borderRadius: '5px', padding: '3px 8px', marginTop: '4px' }}>
            {note}
          </div>
        )}
        <div style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '0.55rem', color: '#334155' }}>hover ↗</div>
      </div>
    </Tooltip>
  );
}

function Gate({ id, icon, name, type, desc, color }) {
  return (
    <Tooltip id={id} wrapperStyle={{ flex: 1 }}>
      <div style={{
        background: `linear-gradient(160deg,#0b1120,${color}0e)`,
        border: `1px solid ${color}44`, borderRadius: '8px',
        padding: '12px 8px', textAlign: 'center', cursor: 'help',
        transition: 'border-color 0.2s, transform 0.15s',
        position: 'relative',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = color + '88'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = color + '44'; e.currentTarget.style.transform = 'none'; }}
      >
        <div style={{ fontSize: '1.3rem', marginBottom: '5px' }}>{icon}</div>
        <div style={{ fontWeight: 700, fontSize: '0.68rem', color, marginBottom: '2px' }}>{name}</div>
        <div style={{ fontSize: '0.55rem', color: '#475569', marginBottom: '4px', letterSpacing: '0.04em' }}>{type}</div>
        <div style={{ fontSize: '0.6rem', color: '#64748b', lineHeight: 1.4 }}>{desc}</div>
      </div>
    </Tooltip>
  );
}

function SafetyCard({ id, icon, name, desc, color }) {
  return (
    <Tooltip id={id}>
      <div style={{
        background: color + '0a', border: `1px solid ${color}30`,
        borderRadius: '8px', padding: '12px 14px', cursor: 'help',
        transition: 'border-color 0.2s',
      }}
        onMouseEnter={e => e.currentTarget.style.borderColor = color + '66'}
        onMouseLeave={e => e.currentTarget.style.borderColor = color + '30'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
          <span style={{ fontSize: '1.1rem' }}>{icon}</span>
          <span style={{ fontWeight: 700, color, fontSize: '0.72rem' }}>{name}</span>
        </div>
        <div style={{ fontSize: '0.61rem', color: '#475569', lineHeight: 1.5 }}>{desc}</div>
      </div>
    </Tooltip>
  );
}

export default function BastionArchitecture() {
  const [settings, setSettings] = useState({});

  useEffect(() => {
    const load = async () => {
      try { const r = await fetch('/api/settings'); if (r.ok) setSettings(await r.json()); } catch {}
    };
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  const report    = (settings.tankReports || [])[0] || {};
  const health    = report.agentHealth || {};
  const sysHealth = report.systemHealth || '—';
  const capRisk   = report.capitalRisk  || '—';
  const autopilot = settings.autopilotEnabled;
  const numFloor  = parseFloat(settings.numNumFloor  || '1.5').toFixed(1);
  const numStop   = parseFloat(settings.numNumStopLoss || '5.0').toFixed(1);
  const concLimit = settings.concentrationLimit || '70';

  const sysColor = sysHealth === 'STABLE' ? '#22c55e' : sysHealth === 'CAUTION' ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#080c14', fontFamily: 'monospace', color: '#e2e8f0' }}>
      <style>{`
        @keyframes fDot { 0%{top:-4px;opacity:0} 15%{opacity:1} 85%{opacity:1} 100%{top:100%;opacity:0} }
      `}</style>

      {/* ── Header ── */}
      <div style={{ padding: '20px 24px 0' }}>
        <div style={{
          background: 'linear-gradient(135deg,#0d1526,#111827)',
          border: '1px solid #1e293b', borderRadius: '12px', padding: '18px 22px',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, letterSpacing: '0.15em', color: '#e2e8f0' }}>
                ◈ BASTION — MULTI-AGENT AUTONOMOUS TRADING
              </div>
              <div style={{ fontSize: '0.63rem', color: '#475569', marginTop: '4px', letterSpacing: '0.06em' }}>
                COMBAT RING · BACK OFFICE RING · FOUR-GATE TRADE PIPELINE · ALWAYS-ON SAFETY LAYER
              </div>
              <div style={{ fontSize: '0.6rem', color: '#334155', marginTop: '3px' }}>
                Hover any agent or gate for a detailed explanation of what it does and why.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {[
                { label: 'SYSTEM', value: sysHealth, color: sysColor },
                { label: 'CAPITAL RISK', value: capRisk, color: capRisk === 'LOW' ? '#22c55e' : capRisk === 'HIGH' ? '#ef4444' : '#f59e0b' },
                { label: 'AUTOPILOT', value: autopilot ? 'ON' : 'OFF', color: autopilot ? '#22c55e' : '#ef4444' },
                { label: 'NUM FLOOR', value: numFloor + '%', color: '#a78bfa' },
                { label: 'STOP-LOSS', value: numStop + '%', color: '#ef4444' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.52rem', color: '#334155', letterSpacing: '0.08em' }}>{label}</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Grid ── */}
      <div style={{ padding: '0 24px 20px', display: 'grid', gridTemplateColumns: '1fr 260px', gap: '20px' }}>

        {/* ── LEFT: Combat Ring ── */}
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.62rem', fontWeight: 700, color: '#818cf8', background: '#818cf810', border: '1px solid #818cf830', borderRadius: '20px', padding: '4px 14px', marginBottom: '14px', letterSpacing: '0.1em' }}>
            ⚔️ COMBAT RING — Command chain, top to bottom
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Agent id="tank" icon="🎯" name="TANK" role="Chief of Operations" cadence="12h" color="#818cf8"
              health={health.tank}
              output="missionDirective · numNumFloor · numNumStopLoss"
              note={`📊 Active calibration: floor ${numFloor}% | stop-loss ${numStop}%`} />

            <FlowDot color="#818cf8" />

            <Agent id="null" icon="🧠" name="NULL" role="Strategic Commander" cadence="60m" color="#38bdf8"
              health={health.null}
              output="coachNotes — tactical directive to CIPHER" />

            <FlowDot color="#38bdf8" />

            <Agent id="cipher" icon="⚡" name="CIPHER" role="Tactical Agent (Gemini 2.5 Pro)" cadence="5m" color="#60a5fa"
              health={health.cipher}
              output="buy / sell / hold proposals" />

            <FlowDot color="#60a5fa" />

            {/* Gate stack */}
            <div style={{ background: 'linear-gradient(135deg,#0b1120,#150d2a)', border: '1px solid #2d1f50', borderRadius: '10px', padding: '14px' }}>
              <div style={{ fontSize: '0.6rem', color: '#6d28d9', letterSpacing: '0.1em', fontWeight: 700, textAlign: 'center', marginBottom: '12px' }}>
                ▼ BUY GATE STACK — all four must pass (hover each for detail)
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <Gate id="concentration" icon="📊" name="Concentration" type="BUY GATE — Math"
                  desc={`≤${concLimit}% per asset`} color="#e879f9" />
                <Gate id="momentum" icon="📈" name="Momentum" type="BUY GATE — Math"
                  desc="5m + 15m MA both ↑" color="#f59e0b" />
                <Gate id="bigjon" icon="🥊" name="Big Jon" type="AI GATE — Alignment"
                  desc="NULL ↔ CIPHER sync" color="#f97316" />
                <Gate id="numnum" icon="🔢" name="NumNum" type="MATH GATE — Fees"
                  desc={`${numFloor}% net floor`} color="#a78bfa" />
              </div>
              <div style={{ fontSize: '0.58rem', color: '#3b0764', textAlign: 'center', marginTop: '10px' }}>
                SELL orders skip Gates 1 & 2 — only Big Jon + NumNum check applies
              </div>
            </div>

            <FlowDot color="#22c55e" />

            {/* Exchange */}
            <div style={{ background: 'linear-gradient(135deg,#052e16,#0b1120)', border: '1px solid #16a34a55', borderLeft: '3px solid #22c55e', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.4rem' }}>💱</span>
                <div>
                  <div style={{ fontWeight: 800, color: '#22c55e', fontSize: '0.95rem', letterSpacing: '0.07em' }}>GEMINI EXCHANGE</div>
                  <div style={{ fontSize: '0.62rem', color: '#64748b' }}>Live execution — REST API</div>
                </div>
              </div>
              <div style={{ fontSize: '0.61rem', color: '#16a34a', background: '#16a34a15', border: '1px solid #22c55e30', borderRadius: '6px', padding: '6px 12px', textAlign: 'right', lineHeight: 1.6 }}>
                0.4% taker per side<br />
                <span style={{ color: '#334155' }}>LINK · SOL · BTC · AVAX</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Back Office Ring */}
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.62rem', fontWeight: 700, color: '#f59e0b', background: '#f59e0b10', border: '1px solid #f59e0b30', borderRadius: '20px', padding: '4px 14px', marginBottom: '14px', letterSpacing: '0.1em' }}>
              🏗️ BACK OFFICE RING
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Agent id="dozer" icon="🏗️" name="DOZER" role="Chief Accounting Officer" cadence="15m" color="#f59e0b"
                output="dozerReport → TANK every 12h" />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px' }}>
                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg,#f59e0b44,#818cf844)' }} />
                <span style={{ fontSize: '0.55rem', color: '#334155', whiteSpace: 'nowrap' }}>feeds TANK</span>
                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg,#818cf844,#f59e0b44)' }} />
              </div>
              <Agent id="bastionai" icon="🔍" name="BASTION AI" role="Deep Dive Auditor" cadence="on-demand" color="#34d399"
                output="Forensic audit report" />
            </div>
          </div>

          {/* Data flow legend */}
          <div style={{ background: '#0b1120', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '0.6rem', color: '#334155', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '10px' }}>DATA FLOW</div>
            {[
              { color: '#818cf8', label: 'Tank → NULL → CIPHER', sub: 'Mission chain' },
              { color: '#f59e0b', label: 'Dozer → Tank', sub: 'Performance data' },
              { color: '#e879f9', label: 'Tank → NumNum', sub: 'Gate calibration' },
              { color: '#22c55e', label: 'Gates → Exchange', sub: 'Approved trades' },
              { color: '#ef4444', label: 'Stop-Loss → Exit', sub: 'Bypasses all AI' },
            ].map(({ color, label, sub }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                <div style={{ width: '18px', height: '2px', background: color, flexShrink: 0, boxShadow: `0 0 4px ${color}` }} />
                <div>
                  <div style={{ fontSize: '0.61rem', color: '#94a3b8' }}>{label}</div>
                  <div style={{ fontSize: '0.56rem', color: '#334155' }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Live parameters */}
          <div style={{ background: '#0b1120', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '0.6rem', color: '#334155', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '10px' }}>LIVE GATE PARAMS</div>
            {[
              { label: 'Profit Floor', value: numFloor + '%', color: '#a78bfa', sub: 'Tank-calibrated' },
              { label: 'Stop-Loss', value: numStop + '%', color: '#ef4444', sub: 'Tank-calibrated' },
              { label: 'Fee Drag', value: '0.80%', color: '#f59e0b', sub: 'Fixed (Gemini)' },
              { label: 'Concentration Cap', value: concLimit + '%', color: '#e879f9', sub: 'Per asset' },
              { label: 'MA Periods', value: '10 candles', color: '#38bdf8', sub: '5m + 15m' },
            ].map(({ label, value, color, sub }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' }}>
                <div>
                  <div style={{ fontSize: '0.61rem', color: '#64748b' }}>{label}</div>
                  <div style={{ fontSize: '0.55rem', color: '#334155' }}>{sub}</div>
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Safety Layer ── */}
      <div style={{ padding: '0 24px 20px' }}>
        <div style={{ background: 'linear-gradient(135deg,#140505,#0b1120)', border: '1px solid #7f1d1d50', borderRadius: '10px', padding: '16px 20px' }}>
          <div style={{ fontSize: '0.62rem', color: '#ef4444', fontWeight: 700, letterSpacing: '0.12em', marginBottom: '12px' }}>
            🛡 SAFETY LAYER — ALWAYS-ON · BYPASSES ALL AI · HOVER FOR DETAIL
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
            <SafetyCard id="stoploss" icon="🚨" name="Hard Stop-Loss"
              desc="Deterministic. Fires before CIPHER. Cannot be disabled." color="#ef4444" />
            <SafetyCard id="banner" icon="🔴" name="Emergency Banner"
              desc="Full-screen alert when autopilot off or halted." color="#f97316" />
            <SafetyCard id="reconcile" icon="🔄" name="Reconcile Sync"
              desc="Hard-overwrites DB from live exchange balances." color="#38bdf8" />
          </div>
        </div>
      </div>

      {/* Tank briefing */}
      {report.briefing && (
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{ background: '#0b1120', border: '1px solid #818cf830', borderLeft: '3px solid #818cf8', borderRadius: '8px', padding: '12px 16px' }}>
            <div style={{ fontSize: '0.58rem', color: '#818cf8', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '5px' }}>🎯 TANK'S LAST BRIEFING</div>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.6 }}>{report.briefing}</div>
          </div>
        </div>
      )}
    </div>
  );
}
