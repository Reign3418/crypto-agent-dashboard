import { useState, useEffect } from 'react';

const HEALTH_STYLE = {
  HEALTHY:  { dot: '#22c55e', label: 'HEALTHY' },
  MONITOR:  { dot: '#f59e0b', label: 'MONITOR' },
  CRITICAL: { dot: '#ef4444', label: 'CRITICAL' },
  UNKNOWN:  { dot: '#475569', label: '—' },
};

function parseHealth(str = '') {
  if (str?.startsWith('HEALTHY'))  return 'HEALTHY';
  if (str?.startsWith('MONITOR'))  return 'MONITOR';
  if (str?.startsWith('CRITICAL')) return 'CRITICAL';
  return 'UNKNOWN';
}

function HealthBadge({ status }) {
  const s = HEALTH_STYLE[parseHealth(status)];
  return (
    <span style={{
      fontSize: '0.58rem', fontWeight: 700, color: s.dot,
      background: s.dot + '18', border: `1px solid ${s.dot}44`,
      borderRadius: '20px', padding: '2px 8px',
      display: 'inline-flex', alignItems: 'center', gap: '4px',
    }}>
      <span style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: s.dot, boxShadow: `0 0 5px ${s.dot}`,
        display: 'inline-block',
        animation: s.label === 'HEALTHY' ? 'hPulse 2s ease-in-out infinite' : 'none',
      }} />
      {s.label}
    </span>
  );
}

function FlowLine({ color, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      <div style={{ position: 'relative', width: '2px', height: '36px', background: color + '28' }}>
        <div style={{
          position: 'absolute', width: '8px', height: '8px', borderRadius: '50%',
          background: color, left: '-3px', top: 0,
          boxShadow: `0 0 8px ${color}`,
          animation: 'flowDot 2s ease-in-out infinite',
        }} />
      </div>
      {label && (
        <span style={{ fontSize: '0.58rem', color: color + 'aa', letterSpacing: '0.06em', marginTop: '2px', fontFamily: 'monospace' }}>
          {label}
        </span>
      )}
    </div>
  );
}

function AgentCard({ icon, name, role, cadence, color, health, output, note, quote }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, #0b1120 60%, ${color}0d)`,
      border: `1px solid ${color}38`, borderLeft: `3px solid ${color}`,
      borderRadius: '10px', padding: '14px 16px',
      boxShadow: `0 0 24px ${color}0d`,
      animation: 'cardGlow 4s ease-in-out infinite',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.5rem' }}>{icon}</span>
          <div>
            <div style={{ fontWeight: 800, color, fontSize: '1rem', letterSpacing: '0.08em' }}>{name}</div>
            <div style={{ fontSize: '0.63rem', color: '#64748b', marginTop: '1px' }}>{role}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
          <span style={{
            fontSize: '0.6rem', fontWeight: 700, color,
            background: color + '1a', border: `1px solid ${color}44`,
            borderRadius: '20px', padding: '2px 8px',
          }}>⏱ {cadence}</span>
          {health !== undefined && <HealthBadge status={health} />}
        </div>
      </div>
      <div style={{ fontSize: '0.64rem', color: '#94a3b8', marginBottom: '5px', fontFamily: 'monospace' }}>
        → {output}
      </div>
      {note && (
        <div style={{ fontSize: '0.62rem', color, background: color + '10', borderRadius: '5px', padding: '3px 8px', marginBottom: '5px' }}>
          {note}
        </div>
      )}
      <div style={{ fontSize: '0.61rem', color: '#334155', fontStyle: 'italic', borderTop: `1px solid ${color}18`, paddingTop: '6px', marginTop: '6px' }}>
        {quote}
      </div>
    </div>
  );
}

function GateCard({ icon, name, type, desc, color }) {
  return (
    <div style={{
      flex: 1, background: `linear-gradient(160deg, #0b1120, ${color}10)`,
      border: `1px solid ${color}44`, borderRadius: '8px',
      padding: '10px 8px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: '0.7rem', color, marginBottom: '2px' }}>{name}</div>
      <div style={{ fontSize: '0.55rem', color: '#475569', marginBottom: '4px', letterSpacing: '0.04em' }}>{type}</div>
      <div style={{ fontSize: '0.6rem', color: '#64748b' }}>{desc}</div>
    </div>
  );
}

export default function BastionArchitecture() {
  const [settings, setSettings] = useState({});

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/settings');
        if (r.ok) setSettings(await r.json());
      } catch { /* silent */ }
    };
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  const tankReport  = (settings.tankReports || [])[0] || {};
  const health      = tankReport.agentHealth || {};
  const sysHealth   = tankReport.systemHealth || 'UNKNOWN';
  const capRisk     = tankReport.capitalRisk  || '—';
  const numFloor    = settings.numNumFloor    || '1.5';
  const numStop     = settings.numNumStopLoss || '5.0';
  const concLimit   = settings.concentrationLimit || '70';
  const autopilot   = settings.autopilotEnabled;
  const halted      = settings.isHalted;

  const sysColor = sysHealth === 'STABLE' ? '#22c55e' : sysHealth === 'CAUTION' ? '#f59e0b' : '#ef4444';

  return (
    <div style={{
      height: '100%', overflowY: 'auto', background: '#080c14',
      padding: '20px 24px', fontFamily: 'monospace', color: '#e2e8f0',
    }}>
      <style>{`
        @keyframes flowDot {
          0%   { top: -4px; opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes hPulse {
          0%,100% { opacity: 1; box-shadow: 0 0 5px currentColor; }
          50%      { opacity: 0.5; box-shadow: 0 0 2px currentColor; }
        }
        @keyframes cardGlow {
          0%,100% { box-shadow: 0 0 18px rgba(0,0,0,0); }
          50%      { box-shadow: 0 0 28px rgba(255,255,255,0.04); }
        }
        @keyframes ringFloat {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-3px); }
        }
      `}</style>

      {/* ── System Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a, #1a1f35)',
        border: '1px solid #1e293b', borderRadius: '12px',
        padding: '16px 20px', marginBottom: '20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, letterSpacing: '0.18em', color: '#e2e8f0' }}>
            ◈ BASTION — AUTONOMOUS TRADING SYSTEM
          </div>
          <div style={{ fontSize: '0.65rem', color: '#475569', marginTop: '3px', letterSpacing: '0.06em' }}>
            MULTI-AGENT · RING ARCHITECTURE · CAPITAL PRESERVATION MANDATE
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {[
            { label: 'SYSTEM', value: sysHealth, color: sysColor },
            { label: 'CAPITAL RISK', value: capRisk, color: capRisk === 'LOW' ? '#22c55e' : capRisk === 'HIGH' ? '#ef4444' : '#f59e0b' },
            { label: 'AUTOPILOT', value: autopilot ? 'ON' : 'OFF', color: autopilot ? '#22c55e' : '#ef4444' },
            { label: 'HALT', value: halted ? 'ACTIVE' : 'CLEAR', color: halted ? '#ef4444' : '#22c55e' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.55rem', color: '#334155', letterSpacing: '0.08em' }}>{label}</div>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main Architecture ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', marginBottom: '16px' }}>

        {/* ── LEFT: Combat Ring ── */}
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            fontSize: '0.65rem', fontWeight: 700, color: '#818cf8',
            background: '#818cf812', border: '1px solid #818cf833',
            borderRadius: '20px', padding: '4px 14px', marginBottom: '14px', letterSpacing: '0.1em',
          }}>
            ⚔️ COMBAT RING
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>

            {/* TANK */}
            <div style={{ width: '100%' }}>
              <AgentCard
                icon="🎯" name="TANK" role="Chief of Operations" cadence="12h" color="#818cf8"
                health={health.tank}
                output="missionDirective · numNumFloor · numNumStopLoss"
                note={`📊 Active calibration: NumNum floor ${parseFloat(numFloor).toFixed(1)}% | stop-loss ${parseFloat(numStop).toFixed(1)}%`}
                quote='"I see the whole battlefield. You see 5 minutes. I see 12 hours."'
              />
            </div>

            <FlowLine color="#818cf8" label="mission + calibration" />

            {/* NULL */}
            <div style={{ width: '100%' }}>
              <AgentCard
                icon="🧠" name="NULL" role="Strategic Commander" cadence="60m" color="#38bdf8"
                health={health.null}
                output="coachNotes — tactical directive to CIPHER"
                quote='"I translate Tank\'s mandate into CIPHER\'s next move."'
              />
            </div>

            <FlowLine color="#38bdf8" label="coachNotes" />

            {/* CIPHER */}
            <div style={{ width: '100%' }}>
              <AgentCard
                icon="⚡" name="CIPHER" role="Tactical Agent — Gemini 2.5 Pro" cadence="5m" color="#60a5fa"
                health={health.cipher}
                output="buy / sell / hold proposals"
                quote='"Execute with precision. Adapt with intelligence."'
              />
            </div>

            <FlowLine color="#60a5fa" label="proposal" />

            {/* Gates */}
            <div style={{
              width: '100%',
              background: 'linear-gradient(135deg, #0b1120, #1a1030)',
              border: '1px solid #2d1f50', borderRadius: '10px',
              padding: '12px',
            }}>
              <div style={{ fontSize: '0.62rem', color: '#6d28d9', letterSpacing: '0.1em', fontWeight: 700, marginBottom: '10px', textAlign: 'center' }}>
                ▼ BUY GATE STACK — DETERMINISTIC, NO AI ▼
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <GateCard icon="📊" name="Concentration" type="BUY GATE"
                  desc={`≤${concLimit}% per asset`} color="#e879f9" />
                <GateCard icon="📈" name="Momentum" type="BUY GATE"
                  desc="5m + 15m MA both ↑" color="#f59e0b" />
                <GateCard icon="🥊" name="Big Jon" type="AI GATE"
                  desc="NULL ↔ CIPHER alignment" color="#f97316" />
                <GateCard icon="🔢" name="NumNum" type="MATH GATE"
                  desc={`${parseFloat(numFloor).toFixed(1)}% floor · Tank-set`} color="#a78bfa" />
              </div>
              <div style={{ fontSize: '0.6rem', color: '#3b0764', textAlign: 'center', marginTop: '8px', letterSpacing: '0.06em' }}>
                ALL FOUR MUST PASS BEFORE EXECUTION
              </div>
            </div>

            <FlowLine color="#22c55e" label="approved" />

            {/* Exchange */}
            <div style={{
              width: '100%',
              background: 'linear-gradient(135deg, #052e16, #0b1120)',
              border: '1px solid #16a34a55', borderLeft: '3px solid #22c55e',
              borderRadius: '10px', padding: '14px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.5rem' }}>💱</span>
                <div>
                  <div style={{ fontWeight: 800, color: '#22c55e', fontSize: '1rem', letterSpacing: '0.08em' }}>GEMINI EXCHANGE</div>
                  <div style={{ fontSize: '0.63rem', color: '#64748b' }}>Trade Execution — Live Market</div>
                </div>
              </div>
              <div style={{ fontSize: '0.62rem', color: '#16a34a', background: '#16a34a18', border: '1px solid #22c55e33', borderRadius: '6px', padding: '6px 12px', textAlign: 'right' }}>
                0.4% taker fee per side<br />
                <span style={{ color: '#64748b' }}>LINK · SOL · BTC · AVAX</span>
              </div>
            </div>

          </div>
        </div>

        {/* ── RIGHT: Back Office + Safety ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Back Office Ring */}
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              fontSize: '0.65rem', fontWeight: 700, color: '#f59e0b',
              background: '#f59e0b12', border: '1px solid #f59e0b33',
              borderRadius: '20px', padding: '4px 14px', marginBottom: '14px', letterSpacing: '0.1em',
            }}>
              🏗️ BACK OFFICE RING
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

              {/* DOZER */}
              <div style={{
                background: 'linear-gradient(135deg, #0b1120, #f59e0b0d)',
                border: '1px solid #f59e0b38', borderLeft: '3px solid #f59e0b',
                borderRadius: '10px', padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.2rem' }}>🏗️</span>
                  <div>
                    <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: '0.9rem' }}>DOZER</div>
                    <div style={{ fontSize: '0.6rem', color: '#64748b' }}>Chief Accounting Officer</div>
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: '0.58rem', color: '#f59e0b', background: '#f59e0b1a', border: '1px solid #f59e0b44', borderRadius: '20px', padding: '2px 7px' }}>⏱ 15m</span>
                </div>
                <div style={{ fontSize: '0.62rem', color: '#94a3b8', fontFamily: 'monospace', marginBottom: '5px' }}>
                  → dozerReport → TANK every 12h
                </div>
                <div style={{ fontSize: '0.6rem', color: '#f59e0b', background: '#f59e0b10', borderRadius: '4px', padding: '3px 7px', marginBottom: '5px' }}>
                  FIFO P&L · Win rate · Fee drag · Capital risk
                </div>
                <div style={{ fontSize: '0.58rem', color: '#334155', fontStyle: 'italic' }}>
                  "No AI. Pure math. The only truth."
                </div>
              </div>

              {/* Data flow to Tank */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px' }}>
                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, #f59e0b44, #818cf844)' }} />
                <span style={{ fontSize: '0.55rem', color: '#475569' }}>feeds TANK</span>
                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, #818cf844, #f59e0b44)' }} />
              </div>

              {/* BASTION AI */}
              <div style={{
                background: 'linear-gradient(135deg, #0b1120, #34d3990d)',
                border: '1px solid #34d39938', borderLeft: '3px solid #34d399',
                borderRadius: '10px', padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.2rem' }}>🔍</span>
                  <div>
                    <div style={{ fontWeight: 800, color: '#34d399', fontSize: '0.9rem' }}>BASTION AI</div>
                    <div style={{ fontSize: '0.6rem', color: '#64748b' }}>Deep Dive Auditor</div>
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: '0.55rem', color: '#34d399', background: '#34d39918', border: '1px solid #34d39944', borderRadius: '20px', padding: '2px 7px' }}>on-demand</span>
                </div>
                <div style={{ fontSize: '0.62rem', color: '#94a3b8', fontFamily: 'monospace', marginBottom: '5px' }}>
                  → Forensic audit report
                </div>
                <div style={{ fontSize: '0.58rem', color: '#334155', fontStyle: 'italic' }}>
                  "Capital truth on command."
                </div>
              </div>
            </div>
          </div>

          {/* Data Flow Legend */}
          <div style={{
            background: '#0b1120', border: '1px solid #1e293b',
            borderRadius: '10px', padding: '12px 14px',
          }}>
            <div style={{ fontSize: '0.62rem', color: '#475569', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '8px' }}>
              DATA FLOW LEGEND
            </div>
            {[
              { color: '#818cf8', label: 'Tank → NULL → CIPHER', sub: 'Mission chain' },
              { color: '#f59e0b', label: 'Dozer → Tank', sub: 'Performance data' },
              { color: '#e879f9', label: 'Tank → NumNum', sub: 'Gate calibration' },
              { color: '#22c55e', label: 'NumNum → Exchange', sub: 'Approved trades' },
              { color: '#ef4444', label: 'Stop-Loss → Exit', sub: 'Bypass all AI' },
            ].map(({ color, label, sub }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <div style={{ width: '20px', height: '2px', background: color, flexShrink: 0, boxShadow: `0 0 4px ${color}` }} />
                <div>
                  <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>{label}</div>
                  <div style={{ fontSize: '0.56rem', color: '#334155' }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Live Gate Status */}
          <div style={{
            background: '#0b1120', border: '1px solid #1e293b',
            borderRadius: '10px', padding: '12px 14px',
          }}>
            <div style={{ fontSize: '0.62rem', color: '#475569', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '8px' }}>
              LIVE GATE PARAMETERS
            </div>
            {[
              { label: 'NumNum Floor', value: `${parseFloat(numFloor).toFixed(1)}%`, color: '#a78bfa', source: 'Tank-calibrated' },
              { label: 'Stop-Loss', value: `${parseFloat(numStop).toFixed(1)}%`, color: '#ef4444', source: 'Tank-calibrated' },
              { label: 'Fee Drag (fixed)', value: '0.80%', color: '#f59e0b', source: 'Gemini taker' },
              { label: 'Concentration Cap', value: `${concLimit}%`, color: '#e879f9', source: 'Per-asset limit' },
              { label: 'MA Periods', value: '10 candles', color: '#38bdf8', source: '5m + 15m' },
            ].map(({ label, value, color, source }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '5px' }}>
                <div>
                  <span style={{ fontSize: '0.62rem', color: '#64748b' }}>{label}</span>
                  <div style={{ fontSize: '0.55rem', color: '#334155' }}>{source}</div>
                </div>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Safety Layer ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1a0505, #0b1120)',
        border: '1px solid #7f1d1d55', borderRadius: '10px',
        padding: '14px 20px',
      }}>
        <div style={{ fontSize: '0.62rem', color: '#ef4444', fontWeight: 700, letterSpacing: '0.12em', marginBottom: '10px' }}>
          🛡 SAFETY LAYER — ALWAYS-ON, BYPASSES ALL AI
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {[
            { icon: '🚨', name: 'Hard Stop-Loss', desc: 'Deterministic -5% exit in scout.js. Fires before CIPHER. Cannot be disabled.', color: '#ef4444' },
            { icon: '🔴', name: 'Emergency Banner', desc: 'Full-screen pulsing alert across all tabs when autopilot is off or halted.', color: '#f97316' },
            { icon: '🔄', name: 'Reconcile Sync', desc: 'Hard-overwrites DynamoDB openPositions from live Gemini exchange balances.', color: '#38bdf8' },
          ].map(({ icon, name, desc, color }) => (
            <div key={name} style={{
              background: color + '0c', border: `1px solid ${color}33`,
              borderRadius: '8px', padding: '10px 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                <span style={{ fontWeight: 700, color, fontSize: '0.72rem' }}>{name}</span>
              </div>
              <div style={{ fontSize: '0.61rem', color: '#475569', lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Mission Brief ── */}
      {tankReport.briefing && (
        <div style={{
          marginTop: '14px',
          background: '#0b1120', border: '1px solid #818cf833',
          borderLeft: '3px solid #818cf8', borderRadius: '8px',
          padding: '10px 14px',
        }}>
          <div style={{ fontSize: '0.6rem', color: '#818cf8', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '4px' }}>
            🎯 TANK'S LAST BRIEFING
          </div>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.6 }}>
            {tankReport.briefing}
          </div>
        </div>
      )}
    </div>
  );
}
