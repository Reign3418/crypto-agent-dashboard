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

  return (
    <div className="stack-mobile" style={{ display: 'flex', gap: '20px', height: '100%' }}>

      {/* ── Left Column ──────────────────────────────────────────────── */}
      <div className={showForm ? "desktop-only" : "full-width-mobile"} style={{ flex: '0 0 400px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>

        {/* Global Autopilot Toggle */}
        <section className="glass-panel" style={{ 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
          border: autopilotEnabled ? '1px solid var(--accent-green)' : '1px solid var(--border-subtle)',
          background: autopilotEnabled ? 'rgba(34, 197, 94, 0.05)' : 'var(--bg-secondary)',
          transition: 'all 0.3s ease'
        }}>
          <div>
            <h3 style={{ margin: 0, color: autopilotEnabled ? 'var(--accent-green)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {autopilotEnabled ? '🚀' : '✈️'} AI Autopilot
            </h3>
            <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.8rem', maxWidth: '250px' }}>
              {autopilotEnabled 
                ? "Active. AI will continuously execute its Mission Directive via 60s hyper-scrubs." 
                : "Inactive. Turn on for fully autonomous trading."}
            </p>
          </div>
          <button 
            onClick={toggleAutopilot}
            disabled={isHalted}
            style={{
              padding: '8px 20px', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer',
              background: autopilotEnabled ? 'var(--accent-green)' : 'var(--bg-tertiary)',
              transition: 'all 0.2s',
              opacity: isHalted ? 0.5 : 1
            }}
          >
            {autopilotEnabled ? 'ON' : 'OFF'}
          </button>
        </section>

        {/* Mission Tracker HUD */}
        {missionAssessments.length > 0 && (
          <section className="glass-panel" style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px solid var(--accent-blue)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🎯 Mission Progress Tracker
              </h3>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{timeAgo(missionAssessments[0].timestamp)}</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>
              {missionAssessments[0].text}
            </p>
          </section>
        )}

        {/* Capital Management Panel */}
        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              💼 Capital Management
            </h3>
            <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>
              Define CIPHER's core objective. The AI will read this directive before every autonomous execution.
            </p>
            <textarea
              value={missionDirective}
              onChange={(e) => setMissionDirective(e.target.value)}
              onBlur={saveMissionDirective}
              placeholder="e.g. Make 10 trades and secure $25 in profit."
              style={{
                width: '100%',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                padding: '10px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                marginTop: '10px',
                resize: 'vertical',
                minHeight: '60px'
              }}
            />
            <p className="text-muted" style={{ margin: '12px 0 4px', fontSize: '0.8rem' }}>
              <strong>Coach's Notes / Live Overrides:</strong> Give CIPHER immediate tactical advice.
            </p>
            <textarea
              value={coachNotes}
              onChange={(e) => setCoachNotes(e.target.value)}
              onBlur={saveCoachNotes}
              placeholder="e.g. Stop trading BTC, the spread is too high. Focus on ETH."
              style={{
                width: '100%',
                background: 'rgba(59, 130, 246, 0.05)',
                border: '1px solid var(--accent-blue)',
                color: 'var(--text-primary)',
                padding: '10px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                resize: 'vertical',
                minHeight: '50px'
              }}
            />
            <p className="text-muted" style={{ margin: '12px 0 4px', fontSize: '0.8rem' }}>
              <strong>Safe Pool:</strong> Select which assets CIPHER is allowed to autonomously sell to free up capital.
            </p>
          </div>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
            {ASSETS.map(sym => (
              <button
                key={sym}
                onClick={() => toggleLiquidatableAsset(sym)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '16px',
                  border: liquidatableAssets.includes(sym) ? '1px solid var(--accent-blue)' : '1px solid var(--border-subtle)',
                  background: liquidatableAssets.includes(sym) ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-tertiary)',
                  color: liquidatableAssets.includes(sym) ? 'var(--accent-blue)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
              >
                {sym}
              </button>
            ))}
          </div>
        </section>

        {/* Cognitive Rollups Panel */}
        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              🧠 Cognitive Rollups (Learning Diary)
            </h3>
            <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>
              CIPHER's hourly summary of how it is adapting its algorithm to the market.
            </p>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
            {cognitiveRollups.length === 0 ? (
              <div style={{ padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>No rollups generated yet.</div>
            ) : (
              cognitiveRollups.map((rollup, idx) => (
                <div key={idx} style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', borderLeft: '3px solid var(--accent-purple)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{new Date(rollup.timestamp).toLocaleString()}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: '1.4' }}>{rollup.text}</div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Deep Dive Audit Panel */}
        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '3px solid var(--accent-red)' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-red)' }}>
              ⚠️ Portfolio Drain Audit
            </h3>
            <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>
              Run a complete, raw database scan of every trade and fee to determine exactly where capital is bleeding.
            </p>
          </div>
          <button 
            onClick={async () => {
              if (!window.confirm("This will scan the entire database and run a brutal, honest AI analysis on our failures. Proceed?")) return;
              try {
                setAuditResult('Scanning database... this may take a moment.');
                const res = await fetch('/api/rollup?task=analyze', { method: 'POST' });
                const json = await res.json();
                if (json.analysis) {
                  const text = "Raw DB Results:\n" + JSON.stringify(json.data, null, 2) + "\n\nAI Analysis:\n" + json.analysis;
                  setAuditResult(text);
                } else {
                  setAuditResult("Audit failed: " + JSON.stringify(json));
                }
              } catch (e) {
                setAuditResult("Error running audit: " + e.message);
              }
            }}
            style={{
              padding: '10px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid var(--accent-red)',
              color: 'var(--accent-red)',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Run Deep Dive Audit Now
          </button>
          
          {auditResult && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <strong>Audit Results:</strong>
                <button 
                  onClick={() => navigator.clipboard.writeText(auditResult)}
                  style={{
                    padding: '2px 8px', fontSize: '0.75rem', borderRadius: '4px', background: 'var(--accent-blue)', color: '#fff', border: 'none', cursor: 'pointer'
                  }}>
                  Copy Text
                </button>
              </div>
              <textarea 
                readOnly 
                value={auditResult} 
                style={{
                  width: '100%', height: '300px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '10px', fontSize: '0.8rem', fontFamily: 'monospace'
                }} 
              />
              <button 
                onClick={() => setAuditResult('')}
                style={{
                  marginTop: '8px', padding: '4px 10px', fontSize: '0.8rem', borderRadius: '4px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', cursor: 'pointer'
                }}>
                Close Report
              </button>
            </div>
          )}
        </section>

        {/* Macro Trends Ledgers Panel */}
        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              📚 Macro Trend Ledgers (12H & 24H)
            </h3>
            <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>
              High-level historical analysis compiled by the AI to track long-term trends and fee impact.
            </p>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
            {macroLedgers.length === 0 ? (
              <div style={{ padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>No macro ledgers generated yet. Wait 12 hours.</div>
            ) : (
              macroLedgers.map((ledger, idx) => (
                <div key={idx} style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', borderLeft: `3px solid ${ledger.type === '24H' ? 'var(--accent-green)' : 'var(--accent-blue)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(ledger.timestamp).toLocaleString()}</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: ledger.type === '24H' ? 'var(--accent-green)' : 'var(--accent-blue)' }}>{ledger.type} LEDGER</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: '1.4' }}>{ledger.text}</div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Strategy List Panel */}
        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Header */}
          <div className="stack-mobile" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <div>
              <h2 style={{ margin: 0 }}>⚡ Strategies</h2>
              <p className="text-muted" style={{ margin: '2px 0 0', fontSize: '0.8rem' }}>
                {enabledCount} active · {strategies.length} total
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={generateWithAI}
                disabled={aiGenerating || isHalted}
                title="Let AI analyze the market and suggest a strategy"
                style={{
                  background: aiGenerating ? 'var(--bg-tertiary)' : 'rgba(74,158,255,0.15)',
                  border: '1px solid var(--accent-blue)',
                  color: 'var(--accent-blue)',
                  borderRadius: '7px', padding: '7px 12px',
                  cursor: aiGenerating ? 'not-allowed' : 'pointer',
                  fontSize: '0.82rem', fontWeight: 600,
                  opacity: aiGenerating ? 0.6 : 1,
                }}
              >
                {aiGenerating ? '🤖 Thinking...' : '🤖 AI Generate'}
              </button>
              <button
                onClick={runEvaluate}
                disabled={evaluating || isHalted || enabledCount === 0}
                style={{
                  background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)', borderRadius: '7px', padding: '7px 12px',
                  cursor: evaluating || enabledCount === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '0.82rem', opacity: evaluating ? 0.6 : 1,
                }}
              >
                {evaluating ? '⏳ Checking...' : '▶ Evaluate Now'}
              </button>
              <button onClick={openNewForm} className="btn-primary" style={{ fontSize: '0.85rem', padding: '7px 14px' }}>
                + New
              </button>
            </div>
          </div>

          {/* Eval results banner */}
          {evalResults && (
            <div style={{
              padding: '10px 14px', borderRadius: '8px',
              background: evalResults.triggered.length > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.1)',
              border: `1px solid ${evalResults.triggered.length > 0 ? 'var(--status-danger)' : 'var(--status-success)'}`,
              fontSize: '0.85rem', lineHeight: 1.5,
            }}>
              {evalResults.triggered.length > 0
                ? `🚨 Triggered: ${evalResults.triggered.join(', ')}`
                : `✅ ${evalResults.evaluated} strategies checked — none triggered.`}
              {evalResults.skipped?.length > 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
                  ⏱ {evalResults.skipped.length} cooling down
                </div>
              )}
            </div>
          )}

          {/* Strategy cards */}
          {loading ? (
            <p className="text-muted" style={{ margin: 0 }}>Loading strategies...</p>
          ) : strategies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', background: 'var(--bg-tertiary)', borderRadius: '10px' }}>
              <p className="text-muted" style={{ margin: 0, lineHeight: 1.7 }}>
                No strategies yet.<br />Click <strong>+ New</strong> to create your first rule.
              </p>
            </div>
          ) : (
            strategies.map(s => {
              const evalResult = evalResults?.results?.find(r => r.strategy.id === s.id);
              const isTriggered = evalResult?.isTriggered;
              const isCooling = evalResult?.coolingDown;
              return (
                <div key={s.id} style={{
                  padding: '14px', borderRadius: '10px',
                  background: isTriggered ? 'rgba(239,68,68,0.08)' : isCooling ? 'rgba(245,158,11,0.06)' : 'var(--bg-tertiary)',
                  border: `1px solid ${isTriggered ? 'var(--status-danger)' : isCooling ? '#f59e0b' : 'var(--border-subtle)'}`,
                  display: 'flex', flexDirection: 'column', gap: '8px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '36px', height: '36px', borderRadius: '50%',
                        background: 'var(--bg-primary)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem',
                        color: s.enabled ? 'var(--accent-blue)' : 'var(--text-muted)',
                      }}>{s.asset?.slice(0, 3)}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{s.name}</div>
                        <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                          {isTriggered ? '🚨 TRIGGERED' : isCooling ? `⏱ Cooldown: ${evalResult.cooldownRemaining}m left` : `Last: ${timeAgo(s.lastTriggered)}`}
                          {s.triggerCount > 0 && ` · ${s.triggerCount}× total`}
                        </div>
                      </div>
                    </div>
                    {/* Toggle pill */}
                    <div
                      onClick={() => !isHalted && handleToggle(s.id, s.enabled)}
                      title={s.enabled ? 'Click to disable' : 'Click to enable'}
                      style={{
                        width: '42px', height: '22px', borderRadius: '11px',
                        cursor: isHalted ? 'not-allowed' : 'pointer',
                        background: s.enabled ? 'var(--accent-blue)' : 'var(--bg-primary)',
                        border: '1px solid var(--border-subtle)', position: 'relative', transition: 'background 0.2s',
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: '2px', width: '16px', height: '16px',
                        borderRadius: '50%', background: 'white', transition: 'left 0.2s',
                        left: s.enabled ? '22px' : '2px',
                      }} />
                    </div>
                  </div>

                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {conditionSummary(s.conditions, s.conditionLogic)}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '10px', fontSize: '0.78rem' }}>
                      <span style={{ color: 'var(--accent-blue)' }}>→ {s.action?.type || 'alert'}</span>
                      <span className="text-muted">⏱ {s.cooldownMinutes || 60}m cooldown</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => openEditForm(s)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>✏️</button>
                      <button onClick={() => handleDelete(s.id)} style={{ background: 'none', border: 'none', color: 'var(--status-danger)', cursor: 'pointer', fontSize: '0.8rem' }}>🗑</button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>

        {/* Trigger History Panel */}
        {triggerHistory.length > 0 && (
          <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--accent-blue)' }}>🕐 Recent Triggers</h3>
            {triggerHistory.map((log, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {log.action?.replace('⚡ Strategy triggered: ', '') || log.action}
                </span>
                <span className="text-muted" style={{ fontSize: '0.75rem', flexShrink: 0 }}>{log.time}</span>
              </div>
            ))}
          </section>
        )}
      </div>

      {/* ── Right Column: Builder ─────────────────────────────────────── */}
      {showForm ? (
        <section className="glass-panel full-width-mobile" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h2 style={{ margin: 0 }}>{editing ? '✏️ Edit Strategy' : '+ New Strategy'}</h2>

          {/* AI Suggestion Banner */}
          {aiSuggestionNote && (
            <div style={{
              padding: '12px 16px', borderRadius: '10px',
              background: 'rgba(74,158,255,0.1)', border: '1px solid var(--accent-blue)',
              display: 'flex', flexDirection: 'column', gap: '6px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.9rem', color: 'var(--accent-blue)' }}>
                🤖 AI-Generated Strategy
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {aiSuggestionNote}
              </p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Review all fields below. Edit anything before saving.
              </p>
            </div>
          )}

          {/* Name */}
          <div>
            <label style={labelStyle}>Strategy Name</label>
            <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. Buy the BTC Dip" style={inputStyle} />
          </div>

          {/* Asset */}
          <div>
            <label style={labelStyle}>Asset to Watch</label>
            <select value={form.asset} onChange={e => setField('asset', e.target.value)} style={inputStyle}>
              {ASSETS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Conditions */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Conditions</label>
              <button onClick={addCondition} style={{ background: 'none', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem' }}>+ Add Condition</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {form.conditions.map((cond, idx) => {
                const def = CONDITION_TYPES.find(t => t.value === cond.type);
                return (
                  <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--bg-tertiary)', padding: '10px 12px', borderRadius: '8px', flexWrap: 'wrap' }}>
                    <select value={cond.type} onChange={e => updateCondition(idx, 'type', e.target.value)} style={{ ...inputStyle, flex: '1 1 160px', margin: 0 }}>
                      {CONDITION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {def?.hasValue && (
                      <input type="number" value={cond.value} min="0"
                        onChange={e => updateCondition(idx, 'value', parseFloat(e.target.value))}
                        style={{ ...inputStyle, width: '80px', flex: '0 0 80px', margin: 0 }} />
                    )}
                    {def?.hasWindow && (
                      <select value={cond.window || '24h'} onChange={e => updateCondition(idx, 'window', e.target.value)} style={{ ...inputStyle, flex: '0 0 75px', margin: 0 }}>
                        <option value="1h">1h</option>
                        <option value="4h">4h</option>
                        <option value="24h">24h</option>
                      </select>
                    )}
                    {form.conditions.length > 1 && (
                      <button onClick={() => removeCondition(idx)} style={{ background: 'none', border: 'none', color: 'var(--status-danger)', cursor: 'pointer', fontSize: '1.1rem', padding: '0 4px', flexShrink: 0 }}>✕</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Condition Logic */}
          <div>
            <label style={labelStyle}>Condition Logic</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              {['ALL', 'ANY'].map(l => (
                <button key={l} onClick={() => setField('conditionLogic', l)} style={{
                  flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
                  background: form.conditionLogic === l ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                  border: `1px solid ${form.conditionLogic === l ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                  color: form.conditionLogic === l ? 'white' : 'var(--text-muted)',
                }}>
                  {l === 'ALL' ? '🔗 ALL must be true (AND)' : '⚡ ANY can be true (OR)'}
                </button>
              ))}
            </div>
          </div>

          {/* Cooldown */}
          <div>
            <label style={labelStyle}>Cooldown Period</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[15, 30, 60, 120, 360, 1440].map(m => (
                <button key={m} onClick={() => setField('cooldownMinutes', m)} style={{
                  padding: '8px 14px', borderRadius: '7px', cursor: 'pointer', fontSize: '0.85rem',
                  background: form.cooldownMinutes === m ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                  border: `1px solid ${form.cooldownMinutes === m ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                  color: form.cooldownMinutes === m ? 'white' : 'var(--text-muted)',
                }}>
                  {m < 60 ? `${m}m` : m === 1440 ? '24h' : `${m / 60}h`}
                </button>
              ))}
            </div>
            <p className="text-muted" style={{ margin: '6px 0 0', fontSize: '0.8rem' }}>
              Strategy won't re-alert until {form.cooldownMinutes < 60 ? `${form.cooldownMinutes} minutes` : `${form.cooldownMinutes / 60} hour${form.cooldownMinutes > 60 ? 's' : ''}`} have passed since the last trigger.
            </p>
          </div>

          {/* Action */}
          <div>
            <label style={labelStyle}>Action When Triggered</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select 
                value={form.action.type} 
                onChange={e => setField('action', { ...form.action, type: e.target.value })} 
                style={{ ...inputStyle, flex: 2 }}
              >
                {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
              
              {form.action.type !== 'alert' && (
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '0 12px', flex: 1 }}>
                  <span style={{ color: 'var(--text-muted)' }}>$</span>
                  <input 
                    type="number" 
                    min="0.10" 
                    max="2.00" 
                    step="0.10"
                    value={form.action.amount || ''} 
                    onChange={e => setField('action', { ...form.action, amount: parseFloat(e.target.value) })} 
                    placeholder="2.00"
                    style={{ ...inputStyle, border: 'none', background: 'transparent', padding: '10px 4px', width: '100%' }} 
                  />
                </div>
              )}
            </div>
            {form.action.type !== 'alert' && (
              <p className="text-muted" style={{ margin: '6px 0 0', fontSize: '0.8rem' }}>
                Note: Hardcoded safety limit caps trades at $2.00 max.
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes (optional)</label>
            <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={3} placeholder="Why are you watching this? What's your thesis?" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {/* Save/Cancel */}
          <div style={{ display: 'flex', gap: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
            <button onClick={cancelForm} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={saveForm} disabled={saving || !form.name.trim()} className="btn-primary" style={{ flex: 2, opacity: saving || !form.name.trim() ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving...' : editing ? '✅ Update Strategy' : '✅ Save Strategy'}
            </button>
          </div>
        </section>
      ) : (
        <section className="glass-panel desktop-only" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', opacity: 0.55 }}>
          <div style={{ fontSize: '3.5rem' }}>⚡</div>
          <p className="text-muted" style={{ textAlign: 'center', maxWidth: '300px', lineHeight: 1.7 }}>
            Select <strong>+ New</strong> to build a strategy rule, or click <strong>✏️</strong> on a strategy card to edit it.
          </p>
        </section>
      )}
    </div>
  );
}
