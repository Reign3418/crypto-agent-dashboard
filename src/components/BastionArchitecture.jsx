import { useState, useEffect } from 'react';

const AGENTS = [
  { id:'tank',   icon:'🎯', name:'TANK',         role:'Chief of Operations',        cadence:'3h',       color:'#818cf8', ring:'combat',     output:'missionDirective · numNumFloor · numNumStopLoss · DOW posture', tip:'Runs every 3h. Reads Dozer P&L + DOW intelligence from Scout. Sets mission directive, NumNum thresholds, trade size bounds, aggression level, and market regime for the full cycle.' },
  { id:'null',   icon:'🧠', name:'NULL',          role:'Strategic Commander',         cadence:'60m',      color:'#38bdf8', ring:'combat',     output:'coachNotes — tactical directive to CIPHER', tip:'Runs every 60 minutes. Reads Tank mission + live market data. Writes plain-language coachNotes telling CIPHER what to prioritize this hour.' },
  { id:'cipher', icon:'⚡', name:'CIPHER',        role:'Tactical Agent · Gemini 2.5 Flash', cadence:'5m', color:'#60a5fa', ring:'combat',  output:'buy / sell / hold / stuck / complete proposals', tip:'Runs every 5 minutes on Gemini 2.5 Flash. Reads NULL directives, live balances, news, Scout report, and DOW intel. Proposes trade actions that then pass through 4 gates.' },
  { id:'scout',  icon:'🔭', name:'SCOUT',         role:'Market Intelligence',          cadence:'5m',      color:'#f472b6', ring:'combat',     output:'scoutReport · DOW analysis (24h cache) · strategy eval', tip:'Runs every 5 minutes alongside CIPHER. Scans 9 core assets via Gemini public API. Builds 1h candle analysis for AI. Also owns the 90-day DOW pattern report (refreshed daily).' },
  { id:'dozer',  icon:'🏗️', name:'DOZER',         role:'Chief Accounting Officer',     cadence:'15m',     color:'#f59e0b', ring:'backoffice', output:'dozerReport → TANK · FIFO P&L · fee drag · win rate', tip:'No AI — pure math. FIFO-matches every buy to its sell. Computes realized P&L, win rate, fee drag, streaks. Tank reads this every 3h to calibrate NumNum.' },
  { id:'kent',   icon:'📋', name:'KENT',          role:'Trade Logger & Ledger',        cadence:'real-time',color:'#34d399', ring:'backoffice', output:'trade logs · Fee: X.XXXX USD format', tip:'Executes all trades and writes structured logs. Uses toFixed(4) fee format. Feeds Dozer\'s parser and the activity log feed.' },
  { id:'audit',  icon:'🔍', name:'CIPHER AUDIT',  role:'Deep Dive Auditor',            cadence:'on-demand',color:'#a78bfa', ring:'backoffice', output:'Forensic P&L report across full trade history', tip:'On-demand only. Reads full trade history and Dozer FIFO pairs. Produces plain-language forensic report. Strict accounting: never calculates P&L on externally-acquired assets.' },
];

const GATES = [
  { id:'conc',     icon:'📊', name:'Concentration', type:'BUY · Math',      color:'#e879f9', desc:'≤70% per asset of total capital' },
  { id:'momentum', icon:'📈', name:'Momentum',       type:'BUY · Math',      color:'#f59e0b', desc:'5m + 15m MA both bullish' },
  { id:'bigjon',   icon:'🥊', name:'Big Jon',        type:'ALL · AI',        color:'#f97316', desc:'NULL ↔ CIPHER conflict check' },
  { id:'numnum',   icon:'🔢', name:'NumNum',         type:'ALL · Math',      color:'#a78bfa', desc:'Fee-viable: clears 0.8% round-trip' },
];

const SAFETY = [
  { icon:'🚨', name:'Hard Stop-Loss',    color:'#ef4444', desc:'Fires before CIPHER every 5m. Panic sells if position down > threshold. Cannot be disabled.' },
  { icon:'📉', name:'Trailing Stop',     color:'#f97316', desc:'Tracks high-water mark per position. Sells if price drops > 3% from peak.' },
  { icon:'🛑', name:'Big Jon Referee',   color:'#fb923c', desc:'Blocks trades that contradict NULL\'s live directive. Logs conflict, keeps autopilot ON.' },
  { icon:'🔴', name:'Emergency Banner',  color:'#ef4444', desc:'Full-width pulsing alert when autopilot off or halted. Visible on every tab.' },
  { icon:'🔄', name:'Reconcile Sync',    color:'#38bdf8', desc:'Hard-overwrites DB from live Gemini balances. Use if cost-basis is stale.' },
  { icon:'🌐', name:'DOW Posture Guard', color:'#818cf8', desc:'Scout flags low-volume days (Sunday). Tank caps trade size automatically.' },
];

function dot(color) {
  return <span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:color,boxShadow:`0 0 6px ${color}`,marginRight:5}} />;
}

function HealthBadge({ status }) {
  const c = !status ? '#475569' : status.startsWith('HEALTHY') ? '#22c55e' : status.startsWith('MONITOR') ? '#f59e0b' : '#ef4444';
  const l = !status ? '—' : status.startsWith('HEALTHY') ? 'HEALTHY' : status.startsWith('MONITOR') ? 'MONITOR' : 'CRITICAL';
  return <span style={{fontSize:'0.58rem',color:c,background:c+'18',border:`1px solid ${c}40`,borderRadius:20,padding:'2px 8px',fontWeight:700}}>{dot(c)}{l}</span>;
}

export default function CipherArchitecture() {
  const [settings, setSettings] = useState({});
  const [tip, setTip] = useState(null);

  useEffect(() => {
    const load = async () => { try { const r = await fetch('/api/settings'); if (r.ok) setSettings(await r.json()); } catch {} };
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  const report   = (settings.tankReports || [])[0] || {};
  const health   = report.agentHealth || {};
  const autopilot = settings.autopilotEnabled;
  const numFloor = parseFloat(settings.numNumFloor || '1.5').toFixed(1);
  const numStop  = parseFloat(settings.numNumStopLoss || '5.0').toFixed(1);
  const dowDay   = settings.dowReport ? (() => { const d = new Date().getUTCDay(); const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; return days[d]; })() : null;

  const combat    = AGENTS.filter(a => a.ring === 'combat');
  const backoffice = AGENTS.filter(a => a.ring === 'backoffice');

  return (
    <div style={{minHeight:'100%',background:'#080c14',fontFamily:'monospace',color:'#e2e8f0',padding:'20px 24px',boxSizing:'border-box'}}
      onClick={() => setTip(null)}>
      <style>{`@keyframes fDot{0%{top:-4px;opacity:0}15%{opacity:1}85%{opacity:1}100%{top:100%;opacity:0}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>

      {/* Header */}
      <div style={{background:'linear-gradient(135deg,#0d1526,#111827)',border:'1px solid #1e293b',borderRadius:12,padding:'18px 22px',marginBottom:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}>
          <div>
            <div style={{fontSize:'1.05rem',fontWeight:900,letterSpacing:'0.12em',color:'#e2e8f0'}}>◈ CIPHER MULTI-AGENT SYSTEM</div>
            <div style={{fontSize:'0.62rem',color:'#475569',marginTop:4,letterSpacing:'0.06em'}}>COMBAT RING · BACK OFFICE RING · 4-GATE TRADE PIPELINE · ALWAYS-ON SAFETY LAYER · DOW INTELLIGENCE</div>
            <div style={{fontSize:'0.6rem',color:'#334155',marginTop:3}}>Click any agent card for detail · Model: Gemini 2.5 Flash across all AI agents</div>
          </div>
          <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
            {[
              {label:'SYSTEM',    value:report.systemHealth||'—',  color:report.systemHealth==='STABLE'?'#22c55e':report.systemHealth==='CAUTION'?'#f59e0b':'#ef4444'},
              {label:'AUTOPILOT', value:autopilot?'ON':'OFF',       color:autopilot?'#22c55e':'#ef4444'},
              {label:'NUM FLOOR', value:numFloor+'%',               color:'#a78bfa'},
              {label:'STOP-LOSS', value:numStop+'%',                color:'#ef4444'},
              {label:'FEE DRAG',  value:'0.80%',                    color:'#f59e0b'},
              ...(dowDay ? [{label:'TODAY DOW', value:dowDay, color:'#818cf8'}] : []),
            ].map(({label,value,color})=>(
              <div key={label} style={{textAlign:'center'}}>
                <div style={{fontSize:'0.52rem',color:'#334155',letterSpacing:'0.08em'}}>{label}</div>
                <div style={{fontSize:'0.82rem',fontWeight:800,color}}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tip overlay */}
      {tip && (
        <div onClick={e=>{e.stopPropagation();setTip(null)}} style={{position:'fixed',inset:0,zIndex:9998,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#0f1929',border:'1px solid #334155',borderRadius:12,padding:24,maxWidth:420,boxShadow:'0 20px 60px rgba(0,0,0,0.8)'}}>
            <div style={{fontWeight:800,color:'#e2e8f0',marginBottom:10,fontSize:'0.9rem'}}>{tip.name}</div>
            <div style={{fontSize:'0.75rem',color:'#94a3b8',lineHeight:1.7}}>{tip.tip}</div>
            <button onClick={()=>setTip(null)} style={{marginTop:14,background:'none',border:'1px solid #334155',color:'#64748b',borderRadius:6,padding:'4px 14px',cursor:'pointer',fontSize:'0.72rem'}}>Close</button>
          </div>
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'1fr 280px',gap:20}}>

        {/* LEFT: Combat Ring */}
        <div>
          <div style={{display:'inline-flex',alignItems:'center',gap:8,fontSize:'0.62rem',fontWeight:700,color:'#818cf8',background:'#818cf810',border:'1px solid #818cf830',borderRadius:20,padding:'4px 14px',marginBottom:14,letterSpacing:'0.1em'}}>
            ⚔️ COMBAT RING — command chain top to bottom
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:0}}>
            {combat.map((a,i)=>(
              <div key={a.id}>
                <div onClick={e=>{e.stopPropagation();setTip(a)}} style={{background:`linear-gradient(135deg,#0b1120 55%,${a.color}0c)`,border:`1px solid ${a.color}35`,borderLeft:`3px solid ${a.color}`,borderRadius:10,padding:'14px 16px',cursor:'pointer',transition:'box-shadow 0.2s',marginBottom:0}}
                  onMouseEnter={e=>{e.currentTarget.style.boxShadow=`0 0 20px ${a.color}20`}}
                  onMouseLeave={e=>{e.currentTarget.style.boxShadow='none'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontSize:'1.3rem'}}>{a.icon}</span>
                      <div>
                        <div style={{fontWeight:800,color:a.color,fontSize:'0.9rem',letterSpacing:'0.07em'}}>{a.name}</div>
                        <div style={{fontSize:'0.61rem',color:'#64748b',marginTop:1}}>{a.role}</div>
                      </div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:5}}>
                      <span style={{fontSize:'0.58rem',fontWeight:700,color:a.color,background:a.color+'18',border:`1px solid ${a.color}40`,borderRadius:20,padding:'2px 8px'}}>⏱ {a.cadence}</span>
                      <HealthBadge status={health[a.id.replace('cipher','cipher')]} />
                    </div>
                  </div>
                  <div style={{fontSize:'0.62rem',color:'#64748b',fontFamily:'monospace'}}>→ {a.output}</div>
                  <div style={{fontSize:'0.55rem',color:'#334155',marginTop:4}}>click for detail ↗</div>
                </div>

                {/* Flow dot between agents */}
                {i < combat.length - 1 && (
                  <div style={{display:'flex',justifyContent:'center',padding:'2px 0'}}>
                    <div style={{position:'relative',width:2,height:24,background:a.color+'20'}}>
                      <div style={{position:'absolute',width:8,height:8,borderRadius:'50%',background:a.color,left:-3,boxShadow:`0 0 8px ${a.color}`,animation:'fDot 2s ease-in-out infinite'}} />
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Flow to gates */}
            <div style={{display:'flex',justifyContent:'center',padding:'2px 0'}}>
              <div style={{position:'relative',width:2,height:24,background:'#60a5fa20'}}>
                <div style={{position:'absolute',width:8,height:8,borderRadius:'50%',background:'#60a5fa',left:-3,boxShadow:'0 0 8px #60a5fa',animation:'fDot 2s ease-in-out infinite'}} />
              </div>
            </div>

            {/* Gate stack */}
            <div style={{background:'linear-gradient(135deg,#0b1120,#150d2a)',border:'1px solid #2d1f50',borderRadius:10,padding:14}}>
              <div style={{fontSize:'0.6rem',color:'#6d28d9',letterSpacing:'0.1em',fontWeight:700,textAlign:'center',marginBottom:12}}>▼ 4-GATE TRADE PIPELINE — all gates must pass</div>
              <div style={{display:'flex',gap:10}}>
                {GATES.map(g=>(
                  <div key={g.id} style={{flex:1,background:`linear-gradient(160deg,#0b1120,${g.color}0e)`,border:`1px solid ${g.color}44`,borderRadius:8,padding:'10px 8px',textAlign:'center'}}>
                    <div style={{fontSize:'1.1rem',marginBottom:4}}>{g.icon}</div>
                    <div style={{fontWeight:700,fontSize:'0.66rem',color:g.color,marginBottom:2}}>{g.name}</div>
                    <div style={{fontSize:'0.54rem',color:'#475569',marginBottom:4}}>{g.type}</div>
                    <div style={{fontSize:'0.58rem',color:'#64748b',lineHeight:1.4}}>{g.desc}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:'0.56rem',color:'#3b0764',textAlign:'center',marginTop:10}}>SELL orders skip Gates 1 &amp; 2 — Big Jon + NumNum only</div>
            </div>

            {/* Flow to exchange */}
            <div style={{display:'flex',justifyContent:'center',padding:'2px 0'}}>
              <div style={{position:'relative',width:2,height:24,background:'#22c55e20'}}>
                <div style={{position:'absolute',width:8,height:8,borderRadius:'50%',background:'#22c55e',left:-3,boxShadow:'0 0 8px #22c55e',animation:'fDot 2s ease-in-out infinite'}} />
              </div>
            </div>

            {/* Exchange */}
            <div style={{background:'linear-gradient(135deg,#052e16,#0b1120)',border:'1px solid #16a34a55',borderLeft:'3px solid #22c55e',borderRadius:10,padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:'1.3rem'}}>💱</span>
                <div>
                  <div style={{fontWeight:800,color:'#22c55e',fontSize:'0.9rem',letterSpacing:'0.07em'}}>GEMINI EXCHANGE</div>
                  <div style={{fontSize:'0.61rem',color:'#64748b'}}>Live REST API · ActiveTrader</div>
                </div>
              </div>
              <div style={{fontSize:'0.6rem',color:'#16a34a',background:'#16a34a15',border:'1px solid #22c55e30',borderRadius:6,padding:'6px 12px',textAlign:'right',lineHeight:1.7}}>
                0.4% taker per side<br/><span style={{color:'#334155'}}>BTC · ETH · SOL · XRP · LINK · DOGE · LTC · AVAX · BCH</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{display:'flex',flexDirection:'column',gap:16}}>

          {/* Back Office Ring */}
          <div>
            <div style={{display:'inline-flex',alignItems:'center',gap:8,fontSize:'0.62rem',fontWeight:700,color:'#f59e0b',background:'#f59e0b10',border:'1px solid #f59e0b30',borderRadius:20,padding:'4px 14px',marginBottom:14,letterSpacing:'0.1em'}}>
              🏗️ BACK OFFICE RING
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {backoffice.map(a=>(
                <div key={a.id} onClick={e=>{e.stopPropagation();setTip(a)}} style={{background:`linear-gradient(135deg,#0b1120 55%,${a.color}0c)`,border:`1px solid ${a.color}35`,borderLeft:`3px solid ${a.color}`,borderRadius:10,padding:'12px 14px',cursor:'pointer'}}
                  onMouseEnter={e=>{e.currentTarget.style.boxShadow=`0 0 16px ${a.color}20`}}
                  onMouseLeave={e=>{e.currentTarget.style.boxShadow='none'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:'1.1rem'}}>{a.icon}</span>
                      <div>
                        <div style={{fontWeight:800,color:a.color,fontSize:'0.8rem',letterSpacing:'0.06em'}}>{a.name}</div>
                        <div style={{fontSize:'0.58rem',color:'#64748b'}}>{a.role}</div>
                      </div>
                    </div>
                    <span style={{fontSize:'0.56rem',fontWeight:700,color:a.color,background:a.color+'18',border:`1px solid ${a.color}40`,borderRadius:20,padding:'2px 7px'}}>⏱ {a.cadence}</span>
                  </div>
                  <div style={{fontSize:'0.6rem',color:'#64748b',fontFamily:'monospace'}}>→ {a.output}</div>
                </div>
              ))}
            </div>
          </div>

          {/* DOW Intelligence status */}
          <div style={{background:'#0b1120',border:'1px solid #818cf830',borderLeft:'3px solid #818cf8',borderRadius:10,padding:14}}>
            <div style={{fontSize:'0.6rem',color:'#818cf8',fontWeight:700,letterSpacing:'0.08em',marginBottom:8}}>📅 DOW INTELLIGENCE</div>
            {[
              {label:'Owner',    value:'Scout',              color:'#f472b6'},
              {label:'Consumer', value:'Tank (every 3h)',    color:'#818cf8'},
              {label:'Cache',    value:'24h (DynamoDB)',     color:'#64748b'},
              {label:'Window',   value:'90 days candles',   color:'#64748b'},
              {label:'Assets',   value:'All 9 core assets', color:'#64748b'},
              {label:'Today',    value:dowDay||'—',          color:'#38bdf8'},
            ].map(({label,value,color})=>(
              <div key={label} style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                <span style={{fontSize:'0.6rem',color:'#475569'}}>{label}</span>
                <span style={{fontSize:'0.6rem',fontWeight:700,color}}>{value}</span>
              </div>
            ))}
          </div>

          {/* Live params */}
          <div style={{background:'#0b1120',border:'1px solid #1e293b',borderRadius:10,padding:14}}>
            <div style={{fontSize:'0.6rem',color:'#334155',fontWeight:700,letterSpacing:'0.08em',marginBottom:10}}>LIVE GATE PARAMS</div>
            {[
              {label:'Profit Floor',      value:numFloor+'%',  color:'#a78bfa', sub:'Tank-calibrated'},
              {label:'Stop-Loss',         value:numStop+'%',   color:'#ef4444', sub:'Tank-calibrated'},
              {label:'Trailing Stop',     value:'3.0%',        color:'#f97316', sub:'From peak'},
              {label:'Fee Drag',          value:'0.80%',       color:'#f59e0b', sub:'Fixed (Gemini)'},
              {label:'Concentration Cap', value:'70%',         color:'#e879f9', sub:'Per asset'},
              {label:'MA Periods',        value:'10 candles',  color:'#38bdf8', sub:'5m + 15m'},
            ].map(({label,value,color,sub})=>(
              <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:7}}>
                <div>
                  <div style={{fontSize:'0.6rem',color:'#64748b'}}>{label}</div>
                  <div style={{fontSize:'0.54rem',color:'#334155'}}>{sub}</div>
                </div>
                <span style={{fontSize:'0.8rem',fontWeight:800,color}}>{value}</span>
              </div>
            ))}
          </div>

          {/* Data flow legend */}
          <div style={{background:'#0b1120',border:'1px solid #1e293b',borderRadius:10,padding:14}}>
            <div style={{fontSize:'0.6rem',color:'#334155',fontWeight:700,letterSpacing:'0.08em',marginBottom:10}}>DATA FLOW</div>
            {[
              {color:'#818cf8', label:'Tank → NULL → CIPHER',    sub:'Mission chain'},
              {color:'#f472b6', label:'Scout → CIPHER + Tank',   sub:'Market + DOW intel'},
              {color:'#f59e0b', label:'Dozer → Tank',            sub:'Performance data'},
              {color:'#a78bfa', label:'Tank → NumNum',           sub:'Gate calibration'},
              {color:'#22c55e', label:'Gates → Exchange',        sub:'Approved trades'},
              {color:'#ef4444', label:'Stop-Loss → Exit',        sub:'Bypasses all AI'},
            ].map(({color,label,sub})=>(
              <div key={label} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7}}>
                <div style={{width:18,height:2,background:color,flexShrink:0,boxShadow:`0 0 4px ${color}`}} />
                <div>
                  <div style={{fontSize:'0.6rem',color:'#94a3b8'}}>{label}</div>
                  <div style={{fontSize:'0.55rem',color:'#334155'}}>{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Safety Layer */}
      <div style={{marginTop:20,background:'linear-gradient(135deg,#140505,#0b1120)',border:'1px solid #7f1d1d50',borderRadius:10,padding:'16px 20px'}}>
        <div style={{fontSize:'0.62rem',color:'#ef4444',fontWeight:700,letterSpacing:'0.12em',marginBottom:12}}>
          🛡 SAFETY LAYER — ALWAYS-ON · BYPASSES ALL AI
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12}}>
          {SAFETY.map(s=>(
            <div key={s.name} style={{background:s.color+'0a',border:`1px solid ${s.color}30`,borderRadius:8,padding:'12px 14px'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                <span style={{fontSize:'1rem'}}>{s.icon}</span>
                <span style={{fontWeight:700,color:s.color,fontSize:'0.7rem'}}>{s.name}</span>
              </div>
              <div style={{fontSize:'0.61rem',color:'#475569',lineHeight:1.5}}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tank briefing */}
      {report.briefing && (
        <div style={{marginTop:20,background:'#0b1120',border:'1px solid #818cf830',borderLeft:'3px solid #818cf8',borderRadius:8,padding:'12px 16px'}}>
          <div style={{fontSize:'0.58rem',color:'#818cf8',fontWeight:700,letterSpacing:'0.08em',marginBottom:5}}>🎯 TANK&apos;S LAST BRIEFING</div>
          <div style={{fontSize:'0.68rem',color:'#94a3b8',lineHeight:1.6}}>{report.briefing}</div>
        </div>
      )}
    </div>
  );
}
