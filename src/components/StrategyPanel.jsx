import { useState, useEffect, useCallback } from 'react';

const ASSETS = ['BTC','ETH','SOL','AVAX','LINK','MATIC','DOT','ADA','DOGE','SHIB','LTC','XRP','ATOM','UNI','AAVE','CRV','FTM','NEAR','APT','ARB','ZEC'];

const CONDITION_TYPES = [
  { value: 'price_drop_pct',  label: 'Price drops by %',        hasValue: true,  hasWindow: true  },
  { value: 'price_rise_pct',  label: 'Price rises by %',        hasValue: true,  hasWindow: true  },
  { value: 'price_below',     label: 'Price is below $',        hasValue: true,  hasWindow: false },
  { value: 'price_above',     label: 'Price is above $',        hasValue: true,  hasWindow: false },
  { value: 'change_exceeds',  label: 'Change exceeds % (±)',    hasValue: true,  hasWindow: true  },
  { value: 'scout_bearish',   label: 'Scout rates: Bearish',    hasValue: false, hasWindow: false },
  { value: 'scout_bullish',   label: 'Scout rates: Bullish',    hasValue: false, hasWindow: false },
  { value: 'scout_risk_high', label: 'Scout rates: High Risk',  hasValue: false, hasWindow: false },
];

const ACTION_TYPES = [
  { value: 'alert',    label: '🔔 Alert only (log to activity feed)' },
  { value: 'buy',      label: '🟢 Buy' },
  { value: 'sell',     label: '🔴 Sell' },
];

const BLANK_CONDITION = { type: 'price_drop_pct', value: 5, window: '24h' };
const BLANK_FORM = {
  name: '', asset: 'BTC', enabled: true,
  conditions: [{ ...BLANK_CONDITION }],
  conditionLogic: 'ALL',
  cooldownMinutes: 60,
  action: { type: 'alert', amount: 0, amountType: 'fixed' },
  notes: '',
};

function timeAgo(iso) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const labelStyle = {
  display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)',
  marginBottom: '6px', fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase'
};
const inputStyle = {
  width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)', padding: '10px 12px', borderRadius: '8px',
  fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
};

export default function StrategyPanel({ isHalted, onTriggeredCount }) {
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(BLANK_FORM);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evalResults, setEvalResults] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [triggerHistory, setTriggerHistory] = useState([]);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSuggestionNote, setAiSuggestionNote] = useState(null);
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [liquidatableAssets, setLiquidatableAssets] = useState([]);
  const [missionDirective, setMissionDirective] = useState('');
  const [coachNotes, setCoachNotes] = useState('');
  const [cognitiveRollups, setCognitiveRollups] = useState([]);
  const [missionAssessments, setMissionAssessments] = useState([]);
  const [macroLedgers, setMacroLedgers] = useState([]);
  const [auditResult, setAuditResult] = useState('');
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState('');
  const [activePersona, setActivePersona] = useState('Bastion');
  const [activeEraName, setActiveEraName] = useState('Aegis');
  const [concentrationOverride, setConcentrationOverride] = useState(null);
  const [overridePct,    setOverridePct]    = useState(75);
  const [overrideAsset,  setOverrideAsset]  = useState('LINK');
  const [overrideExpiry, setOverrideExpiry] = useState('6h');

  const fetchStrategies = useCallback(async () => {
    try {
      const [resStrats, resSettings] = await Promise.all([
        fetch('/api/strategies'),
        fetch('/api/settings')
      ]);
      const dataStrats = await resStrats.json();
      const dataSettings = await resSettings.json();
      
      if (Array.isArray(dataStrats)) setStrategies(dataStrats);
      setAutopilotEnabled(dataSettings.autopilotEnabled || false);
      setLiquidatableAssets(dataSettings.liquidatableAssets || []);
      setMissionDirective(dataSettings.missionDirective || 'Make 10 trades and secure $25 in profit.');
      setCoachNotes(dataSettings.coachNotes || '');
      setCognitiveRollups(dataSettings.cognitiveRollups || []);
      setMissionAssessments(dataSettings.missionAssessments || []);
      setMacroLedgers(dataSettings.macroLedgers || []);
      setActivePersona(dataSettings.activePersona || 'Bastion');
      setActiveEraName(dataSettings.activeEraName || 'Aegis');
      const co = dataSettings.concentrationOverride || null;
      // Auto-expire if past expiry time
      if (co && co.expiresAt && Date.now() > co.expiresAt) {
        setConcentrationOverride(null);
      } else {
        setConcentrationOverride(co);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
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

  const toggleLiquidatableAsset = async (assetSym) => {
    const current = new Set(liquidatableAssets);
    if (current.has(assetSym)) current.delete(assetSym);
    else current.add(assetSym);
    
    const newVal = Array.from(current);
    setLiquidatableAssets(newVal);
    
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liquidatableAssets: newVal })
      });
    } catch (e) {
      console.error(e);
      // Revert if failed
      setLiquidatableAssets(liquidatableAssets);
    }
  };

  const saveMissionDirective = async (e) => {
    const val = e.target.value;
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            missionDirective: val,
            missionCompletions: 0,
            missionStartTime: new Date().toISOString()
        })
      });
    } catch (err) {
      console.error("Failed to save mission directive", err);
    }
  };

  const saveCoachNotes = async (e) => {
    const val = e.target.value;
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachNotes: val })
      });
    } catch (err) {
      console.error("Failed to save coach notes", err);
    }
  };

  const saveConcentrationOverride = async () => {
    const expiryMs = { '2h': 2, '6h': 6, '12h': 12, '24h': 24, 'none': null };
    const hrs = expiryMs[overrideExpiry];
    const expiresAt = hrs ? Date.now() + hrs * 60 * 60 * 1000 : null;
    const val = { asset: overrideAsset, pct: overridePct, expiresAt, setAt: Date.now() };
    setConcentrationOverride(val);
    try {
      await fetch('/api/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concentrationOverride: val }),
      });
    } catch (err) { console.error('Failed to save concentration override', err); }
  };

  const clearConcentrationOverride = async () => {
    setConcentrationOverride(null);
    try {
      await fetch('/api/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concentrationOverride: null }),
      });
    } catch (err) { console.error('Failed to clear concentration override', err); }
  };

  const fetchTriggerHistory = useCallback(async () => {

    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const logs = await res.json();
        const triggers = logs.filter(l => l.action?.includes('Strategy triggered:'));
        setTriggerHistory(triggers.slice(0, 10));
      }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchStrategies();
    fetchTriggerHistory();
    const interval = setInterval(() => {
      fetchStrategies();
      fetchTriggerHistory();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Bubble triggered count up to App for tab badge
  useEffect(() => {
    if (onTriggeredCount && evalResults) {
      onTriggeredCount(evalResults.triggered?.length || 0);
    }
  }, [evalResults]);

  // ── Form helpers ──────────────────────────────────────────────────────────
  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const addCondition = () => setForm(f => ({ ...f, conditions: [...f.conditions, { ...BLANK_CONDITION }] }));
  const removeCondition = (idx) => setForm(f => ({ ...f, conditions: f.conditions.filter((_, i) => i !== idx) }));
  const updateCondition = (idx, key, val) =>
    setForm(f => ({ ...f, conditions: f.conditions.map((c, i) => i === idx ? { ...c, [key]: val } : c) }));

  const openNewForm = () => { setForm(BLANK_FORM); setEditing(null); setAiSuggestionNote(null); setShowForm(true); };
  const openEditForm = (s) => {
    setForm({
      name: s.name, asset: s.asset, enabled: s.enabled,
      conditions: s.conditions, conditionLogic: s.conditionLogic,
      cooldownMinutes: s.cooldownMinutes || 60,
      action: s.action, notes: s.notes || '',
    });
    setEditing(s.id);
    setAiSuggestionNote(null);
    setShowForm(true);
  };
  const cancelForm = () => { setShowForm(false); setEditing(null); setAiSuggestionNote(null); };

  const generateWithAI = async () => {
    setAiGenerating(true);
    try {
      const res = await fetch('/api/generate-strategy');
      if (!res.ok) throw new Error('AI strategy generation failed');
      const { strategy, marketContext } = await res.json();
      setForm({
        name: strategy.name || '',
        asset: strategy.asset || 'BTC',
        enabled: true,
        conditions: strategy.conditions || [{ ...BLANK_CONDITION }],
        conditionLogic: strategy.conditionLogic || 'ALL',
        cooldownMinutes: strategy.cooldownMinutes || 60,
        action: strategy.action || { type: 'alert', amount: 0, amountType: 'fixed' },
        notes: strategy.notes || '',
      });
      setEditing(null);
      setAiSuggestionNote(strategy.notes || 'AI generated this strategy based on current market data.');
      setShowForm(true);
    } catch (e) {
      console.error('AI generate error:', e);
      alert('AI strategy generation failed. Check the console.');
    } finally {
      setAiGenerating(false);
    }
  };

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const saveForm = async () => {
    if (!form.name.trim() || !form.asset) return;
    setSaving(true);
    try {
      const body = editing ? { ...form, id: editing } : form;
      const res = await fetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) { setShowForm(false); setEditing(null); fetchStrategies(); }
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleToggle = async (id, current) => {
    await fetch('/api/strategies', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled: !current }),
    });
    fetchStrategies();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this strategy? This cannot be undone.')) return;
    await fetch(`/api/strategies?id=${id}`, { method: 'DELETE' });
    fetchStrategies();
  };

  // ── Evaluate ──────────────────────────────────────────────────────────────
  const runEvaluate = async () => {
    setEvaluating(true);
    try {
      const res = await fetch('/api/evaluate');
      if (res.ok) {
        const data = await res.json();
        setEvalResults(data);
        fetchStrategies();
        fetchTriggerHistory();
      }
    } catch (e) { console.error(e); }
    finally { setEvaluating(false); }
  };

  const conditionSummary = (conditions, logic) => {
    if (!conditions?.length) return 'No conditions set';
    const parts = conditions.map(c => {
      const def = CONDITION_TYPES.find(t => t.value === c.type);
      const label = def?.label || c.type;
      const val = c.value ? ` ${c.value}${c.type.includes('pct') || c.type === 'change_exceeds' ? '%' : '$'}` : '';
      const win = c.window ? ` (${c.window})` : '';
      return `${label}${val}${win}`;
    });
    return parts.join(logic === 'ANY' ? ' OR ' : ' AND ');
  };

  const enabledCount = strategies.filter(s => s.enabled).length;
  const [showStrategies, setShowStrategies] = useState(false);

  const runReconcile = async () => {
    setReconciling(true);
    setReconcileResult('');
    try {
      const res = await fetch('/api/reconcile', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const addedList = data.added.length > 0
          ? data.added.map(a => `• ${a.symbol}: ${a.amount} @ $${a.buyPrice.toFixed(2)} ($${a.notional.toFixed(2)})`).join('\n')
          : '(none — all positions already tracked)';
        setReconcileResult(`✅ Sync complete!\n\nAdded to stop-loss memory:\n${addedList}\n\nTotal tracked: ${data.totalTrackedNow}`);
      } else {
        setReconcileResult(`❌ Error: ${data.error}`);
      }
    } catch (e) {
      setReconcileResult(`❌ Network error: ${e.message}`);
    } finally {
      setReconciling(false);
    }
  };

  const runAudit = async () => {
    if (!window.confirm("Scan the entire database and run AI analysis on all trades. Proceed?")) return;
    setAuditResult('⏳ Scanning database...');
    try {
      const res = await fetch('/api/rollup?task=analyze', { method: 'POST' });
      const json = await res.json();
      if (json.analysis) {
        setAuditResult("=== RAW DB RESULTS ===\n" + JSON.stringify(json.data, null, 2) + "\n\n=== AI ANALYSIS ===\n" + json.analysis);
      } else {
        setAuditResult("Audit failed: " + JSON.stringify(json));
      }
    } catch (e) {
      setAuditResult("Error: " + e.message);
    }
  };

  const declareNewEra = async () => {
    const eraName = window.prompt("Enter a name for the new Era (e.g. Bastion, Hurricane):");
    if (!eraName || !eraName.trim()) return;
    
    if (!window.confirm(`Are you sure you want to declare the "${eraName.trim()}" Era? This will hide all previous logs from the Deep Dive Audit and reset the scorecard to 0.`)) return;

    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          activeEraName: eraName.trim(), 
          activeEraEpoch: Date.now() 
        })
      });
      setActiveEraName(eraName.trim());
      alert(`The "${eraName.trim()}" Era has begun! Old logs are now archived from active analysis.`);
    } catch (e) {
      alert("Failed to declare new era.");
      console.error(e);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', overflowY: 'auto' }}>

      {/* ── Row 1: Status bar ── */}
      <section className="glass-panel" style={{
        display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
        border: autopilotEnabled ? '1px solid var(--accent-green)' : '1px solid var(--border-subtle)',
        background: autopilotEnabled ? 'rgba(34,197,94,0.05)' : 'var(--bg-secondary)',
        transition: 'all 0.3s ease', padding: '14px 20px'
      }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: autopilotEnabled ? 'var(--accent-green)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {autopilotEnabled ? '🚀' : '✈️'} CIPHER Autopilot — {autopilotEnabled ? 'ACTIVE' : 'INACTIVE'}
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>Persona: {activePersona}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-muted)', background: 'rgba(168,85,247,0.1)', padding: '2px 8px', borderRadius: '10px', border: '1px solid var(--accent-purple)' }}>Era: {activeEraName}</span>
            </div>
          </h2>
          <p className="text-muted" style={{ margin: '3px 0 0', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{autopilotEnabled ? 'AI is continuously executing the mission directive via 60s hyper-scrubs.' : 'Turn on for fully autonomous trading on 9 core large-cap assets.'}</span>
            <button onClick={declareNewEra} style={{ background: 'none', border: 'none', color: 'var(--accent-purple)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}>Declare New Era</button>
          </p>
        </div>
        <button
          onClick={toggleAutopilot}
          disabled={isHalted}
          style={{
            padding: '10px 28px', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem',
            background: autopilotEnabled ? 'var(--accent-green)' : 'var(--bg-tertiary)',
            color: autopilotEnabled ? '#000' : 'var(--text-muted)',
            transition: 'all 0.2s', opacity: isHalted ? 0.5 : 1
          }}
        >
          {autopilotEnabled ? 'ON' : 'OFF'}
        </button>
      </section>

      {/* ── Mission Progress (only if data exists) ── */}
      {missionAssessments.length > 0 && (
        <section className="glass-panel" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid var(--accent-blue)', padding: '14px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--accent-blue)' }}>🎯 Mission Progress</h3>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{timeAgo(missionAssessments[0].timestamp)}</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.6 }}>{missionAssessments[0].text}</p>
        </section>
      )}

      {/* ── Row 2: Three-column grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>

        {/* Col 1: Mission + Coach */}
        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>💼 Mission Control</h3>

          <div>
            <label style={labelStyle}>Mission Directive</label>
            <textarea
              value={missionDirective}
              onChange={(e) => setMissionDirective(e.target.value)}
              onBlur={saveMissionDirective}
              placeholder="e.g. Scalp BTC/XRP and build a $10 profit cushion."
              style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '10px', borderRadius: '8px', fontSize: '0.85rem', resize: 'vertical', minHeight: '70px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Coach&apos;s Override Notes</label>
            <textarea
              value={coachNotes}
              onChange={(e) => setCoachNotes(e.target.value)}
              onBlur={saveCoachNotes}
              placeholder="e.g. DOGE is pumping — go heavier on DOGE today."
              style={{ width: '100%', background: 'rgba(59,130,246,0.05)', border: '1px solid var(--accent-blue)', color: 'var(--text-primary)', padding: '10px', borderRadius: '8px', fontSize: '0.85rem', resize: 'vertical', minHeight: '55px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Safe Pool (can sell to free USD)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {['BTC','ETH','SOL','XRP','LINK','DOGE','LTC','AVAX','BCH'].map(sym => (
                <button
                  key={sym}
                  onClick={() => toggleLiquidatableAsset(sym)}
                  style={{
                    padding: '5px 12px', borderRadius: '16px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', transition: 'all 0.2s',
                    border: liquidatableAssets.includes(sym) ? '1px solid var(--accent-green)' : '1px solid var(--border-subtle)',
                    background: liquidatableAssets.includes(sym) ? 'rgba(34,197,94,0.12)' : 'var(--bg-tertiary)',
                    color: liquidatableAssets.includes(sym) ? 'var(--accent-green)' : 'var(--text-muted)',
                  }}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── Concentration Override ── */}
        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>🎚️ Concentration Override</h3>
            {concentrationOverride ? (
              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.3)' }}>
                ⚡ ACTIVE
              </span>
            ) : (
              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: 'rgba(34,197,94,0.1)', color: 'var(--accent-green)', border: '1px solid rgba(34,197,94,0.2)' }}>
                🎯 Tank &amp; Dozer managing
              </span>
            )}
          </div>

          {concentrationOverride ? (
            <div style={{ padding: '12px', background: 'rgba(239,68,68,0.08)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.25)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>
                {concentrationOverride.asset} — up to <span style={{ color: 'var(--accent-red)' }}>{concentrationOverride.pct}%</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                {concentrationOverride.expiresAt
                  ? `Expires ${new Date(concentrationOverride.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'No expiry set — clear manually'}
              </div>
              <button onClick={clearConcentrationOverride} style={{ width: '100%', padding: '8px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem' }}>
                ✕ Clear Override — Let Tank/Dozer resume control
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Tank &amp; Dozer set concentration limits based on your capital. Use this only when a coin is moving hard and you want CIPHER to swing heavy.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Asset</label>
                  <select value={overrideAsset} onChange={e => setOverrideAsset(e.target.value)} style={inputStyle}>
                    {['BTC','ETH','SOL','XRP','LINK','DOGE','LTC','AVAX','BCH'].map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Expires In</label>
                  <select value={overrideExpiry} onChange={e => setOverrideExpiry(e.target.value)} style={inputStyle}>
                    <option value="2h">2 hours</option>
                    <option value="6h">6 hours</option>
                    <option value="12h">12 hours</option>
                    <option value="24h">24 hours</option>
                    <option value="none">No expiry</option>
                  </select>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Max Concentration</label>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem', color: overridePct >= 80 ? 'var(--accent-red)' : overridePct >= 65 ? '#f59e0b' : 'var(--accent-green)', fontFamily: 'monospace' }}>{overridePct}%</span>
                </div>
                <input
                  type="range" min={50} max={95} step={5}
                  value={overridePct}
                  onChange={e => setOverridePct(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: overridePct >= 80 ? 'var(--accent-red)' : overridePct >= 65 ? '#f59e0b' : 'var(--accent-green)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  <span>50% — Balanced</span>
                  <span>95% — Full Swing</span>
                </div>
              </div>

              <button onClick={saveConcentrationOverride} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                ⚡ Set Override for {overrideAsset}
              </button>
            </div>
          )}
        </section>

        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>🛡️ Risk Controls</h3>

          <div>
            <p className="text-muted" style={{ margin: '0 0 8px', fontSize: '0.8rem', lineHeight: 1.5 }}>
              <strong>Stop-Loss Memory Sync</strong> — Registers all Gemini holdings into the 5% stop-loss tracker. Run this once if the bot has legacy bags it doesn&apos;t know about.
            </p>
            <button
              onClick={runReconcile}
              disabled={reconciling}
              style={{
                width: '100%', padding: '10px', borderRadius: '8px', fontWeight: 600, cursor: reconciling ? 'not-allowed' : 'pointer',
                background: reconciling ? 'var(--bg-tertiary)' : 'rgba(245,158,11,0.15)',
                border: '1px solid #f59e0b', color: '#f59e0b', fontSize: '0.85rem', opacity: reconciling ? 0.6 : 1,
              }}
            >
              {reconciling ? '⏳ Syncing...' : '🔄 Sync Stop-Loss Memory'}
            </button>
            {reconcileResult && (
              <textarea readOnly value={reconcileResult} rows={5}
                style={{ marginTop: '8px', width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', borderRadius: '8px', padding: '10px', fontSize: '0.78rem', fontFamily: 'monospace', boxSizing: 'border-box' }}
              />
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
            <p className="text-muted" style={{ margin: '0 0 8px', fontSize: '0.8rem', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--accent-red)' }}>Portfolio Drain Audit</strong> — Full AI forensic scan of every trade to find where capital is bleeding.
            </p>
            <button
              onClick={runAudit}
              style={{
                width: '100%', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer',
                background: 'rgba(239,68,68,0.1)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', fontSize: '0.85rem',
              }}
            >
              ⚠️ Run Deep Dive Audit
            </button>
            {auditResult && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Audit Results</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => navigator.clipboard.writeText(auditResult)} style={{ padding: '2px 8px', fontSize: '0.72rem', borderRadius: '4px', background: 'var(--accent-blue)', color: '#fff', border: 'none', cursor: 'pointer' }}>Copy</button>
                    <button onClick={() => setAuditResult('')} style={{ padding: '2px 8px', fontSize: '0.72rem', borderRadius: '4px', background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}>✕</button>
                  </div>
                </div>
                <textarea readOnly value={auditResult}
                  style={{ width: '100%', height: '200px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '10px', fontSize: '0.78rem', fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
              </div>
            )}
          </div>
        </section>

        {/* Col 3: Cognitive Rollups + Macro Ledgers */}
        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>🧠 AI Memory</h3>

          <div>
            <label style={labelStyle}>Cognitive Rollups (Hourly Learning)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
              {cognitiveRollups.length === 0 ? (
                <div style={{ padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>No rollups yet — generates hourly.</div>
              ) : cognitiveRollups.map((rollup, idx) => (
                <div key={idx} style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: '8px', borderLeft: '3px solid var(--accent-purple)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '3px' }}>{new Date(rollup.timestamp).toLocaleString()}</div>
                  <div style={{ fontSize: '0.82rem', lineHeight: '1.4' }}>{rollup.text}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
            <label style={labelStyle}>Macro Ledgers (12H & 24H)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
              {macroLedgers.length === 0 ? (
                <div style={{ padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>No ledgers yet — generates every 12 hours.</div>
              ) : macroLedgers.map((ledger, idx) => (
                <div key={idx} style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: '8px', borderLeft: `3px solid ${ledger.type === '24H' ? 'var(--accent-green)' : 'var(--accent-blue)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{new Date(ledger.timestamp).toLocaleString()}</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 'bold', color: ledger.type === '24H' ? 'var(--accent-green)' : 'var(--accent-blue)' }}>{ledger.type}</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', lineHeight: '1.4' }}>{ledger.text}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ── Strategies Drawer (collapsed by default) ── */}
      <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div
          onClick={() => setShowStrategies(v => !v)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 style={{ margin: 0 }}>⚡ Strategies</h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{enabledCount} active · {strategies.length} total</span>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', transition: 'transform 0.2s', transform: showStrategies ? 'rotate(180deg)' : 'none' }}>▼</span>
        </div>

        {showStrategies && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={generateWithAI} disabled={aiGenerating || isHalted}
                style={{ background: aiGenerating ? 'var(--bg-tertiary)' : 'rgba(74,158,255,0.15)', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)', borderRadius: '7px', padding: '7px 12px', cursor: aiGenerating ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 600, opacity: aiGenerating ? 0.6 : 1 }}>
                {aiGenerating ? '🤖 Thinking...' : '🤖 AI Generate'}
              </button>
              <button onClick={runEvaluate} disabled={evaluating || isHalted || enabledCount === 0}
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', borderRadius: '7px', padding: '7px 12px', cursor: evaluating || enabledCount === 0 ? 'not-allowed' : 'pointer', fontSize: '0.82rem', opacity: evaluating ? 0.6 : 1 }}>
                {evaluating ? '⏳ Checking...' : '▶ Evaluate Now'}
              </button>
              <button onClick={openNewForm} className="btn-primary" style={{ fontSize: '0.85rem', padding: '7px 14px' }}>+ New</button>
            </div>

            {evalResults && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: evalResults.triggered.length > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.1)', border: `1px solid ${evalResults.triggered.length > 0 ? 'var(--status-danger)' : 'var(--status-success)'}`, fontSize: '0.85rem' }}>
                {evalResults.triggered.length > 0 ? `🚨 Triggered: ${evalResults.triggered.join(', ')}` : `✅ ${evalResults.evaluated} strategies checked — none triggered.`}
              </div>
            )}

            {loading ? (
              <p className="text-muted" style={{ margin: 0 }}>Loading...</p>
            ) : strategies.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', background: 'var(--bg-tertiary)', borderRadius: '10px' }}>
                <p className="text-muted" style={{ margin: 0 }}>No strategies yet. Click <strong>+ New</strong> to create one, or use <strong>🤖 AI Generate</strong>.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                {strategies.map(s => {
                  const evalResult = evalResults?.results?.find(r => r.strategy.id === s.id);
                  const isTriggered = evalResult?.isTriggered;
                  const isCooling = evalResult?.coolingDown;
                  return (
                    <div key={s.id} style={{ padding: '12px 14px', borderRadius: '10px', background: isTriggered ? 'rgba(239,68,68,0.08)' : isCooling ? 'rgba(245,158,11,0.06)' : 'var(--bg-tertiary)', border: `1px solid ${isTriggered ? 'var(--status-danger)' : isCooling ? '#f59e0b' : 'var(--border-subtle)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.asset} · {s.name}</div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => openEditForm(s)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✏️</button>
                          <button onClick={() => handleDelete(s.id)} style={{ background: 'none', border: 'none', color: 'var(--status-danger)', cursor: 'pointer' }}>🗑</button>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{conditionSummary(s.conditions, s.conditionLogic)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {isTriggered ? '🚨 TRIGGERED' : isCooling ? `⏱ ${evalResult.cooldownRemaining}m left` : `Last: ${timeAgo(s.lastTriggered)}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Strategy Builder Form */}
            {showForm && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ margin: 0 }}>{editing ? '✏️ Edit Strategy' : '+ New Strategy'}</h3>
                {aiSuggestionNote && (
                  <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(74,158,255,0.1)', border: '1px solid var(--accent-blue)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    🤖 {aiSuggestionNote}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Strategy Name</label>
                    <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. Buy the BTC Dip" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Asset</label>
                    <select value={form.asset} onChange={e => setField('asset', e.target.value)} style={inputStyle}>
                      {['BTC','ETH','SOL','XRP','LINK','DOGE','LTC','AVAX','BCH'].map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Conditions</label>
                    <button onClick={addCondition} style={{ background: 'none', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '0.78rem' }}>+ Add</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {form.conditions.map((cond, idx) => {
                      const def = CONDITION_TYPES.find(t => t.value === cond.type);
                      return (
                        <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--bg-tertiary)', padding: '8px 10px', borderRadius: '8px', flexWrap: 'wrap' }}>
                          <select value={cond.type} onChange={e => updateCondition(idx, 'type', e.target.value)} style={{ ...inputStyle, flex: '1 1 160px', margin: 0 }}>
                            {CONDITION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                          {def?.hasValue && <input type="number" value={cond.value} min="0" onChange={e => updateCondition(idx, 'value', parseFloat(e.target.value))} style={{ ...inputStyle, width: '75px', flex: '0 0 75px', margin: 0 }} />}
                          {def?.hasWindow && (
                            <select value={cond.window || '24h'} onChange={e => updateCondition(idx, 'window', e.target.value)} style={{ ...inputStyle, flex: '0 0 70px', margin: 0 }}>
                              <option value="1h">1h</option><option value="4h">4h</option><option value="24h">24h</option>
                            </select>
                          )}
                          {form.conditions.length > 1 && <button onClick={() => removeCondition(idx)} style={{ background: 'none', border: 'none', color: 'var(--status-danger)', cursor: 'pointer', fontSize: '1rem' }}>✕</button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Logic</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {['ALL','ANY'].map(l => (
                        <button key={l} onClick={() => setField('conditionLogic', l)} style={{ flex: 1, padding: '8px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', background: form.conditionLogic === l ? 'var(--accent-blue)' : 'var(--bg-tertiary)', border: `1px solid ${form.conditionLogic === l ? 'var(--accent-blue)' : 'var(--border-subtle)'}`, color: form.conditionLogic === l ? 'white' : 'var(--text-muted)' }}>
                          {l === 'ALL' ? 'AND' : 'OR'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Action</label>
                    <select value={form.action.type} onChange={e => setField('action', { ...form.action, type: e.target.value })} style={inputStyle}>
                      {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} placeholder="Your thesis..." style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={cancelForm} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={saveForm} disabled={saving || !form.name.trim()} className="btn-primary" style={{ flex: 2, opacity: saving || !form.name.trim() ? 0.5 : 1 }}>
                    {saving ? 'Saving...' : editing ? '✅ Update' : '✅ Save Strategy'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
