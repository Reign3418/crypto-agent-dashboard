import { useState, useEffect, useRef } from 'react';

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes — don't re-call AI on every tab switch

export default function MarketIntelligence({ isHalted }) {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const lastFetchedAt = useRef(null);

  useEffect(() => {
    if (isHalted) return;

    // Only re-fetch if cache is stale or empty
    const now = Date.now();
    const isFresh = lastFetchedAt.current && (now - lastFetchedAt.current) < CACHE_TTL;
    if (isFresh && briefing) return;

    async function fetchBriefing() {
      setLoading(true);
      setError(null);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: "Use the getScoutReport tool to fetch live market data, then in 2 concise sentences, give a professional market intelligence briefing on the current crypto market — what is leading, what is lagging, and what traders are watching. Be analytical, not generic." }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          const text = data.response || data.error;
          if (text) {
            setBriefing(text);
            lastFetchedAt.current = Date.now();
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError('Market briefing unavailable.');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchBriefing();

    // Refresh every 10 minutes
    const interval = setInterval(fetchBriefing, CACHE_TTL);
    return () => clearInterval(interval);
  }, [isHalted]);

  return (
    <section className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          🌐 Market Intelligence
        </h3>
        {!isHalted && !loading && briefing && (
          <div className="pulse-dot" />
        )}
      </div>

      {isHalted ? (
        <p style={{ color: 'var(--status-danger)', fontWeight: 600, margin: 0, fontSize: '0.9rem' }}>
          SYSTEM HALTED — SCANNING SUSPENDED
        </p>
      ) : loading ? (
        <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
          Scanning global markets...
        </p>
      ) : error ? (
        <p style={{ color: 'var(--status-danger)', margin: 0, fontSize: '0.9rem' }}>{error}</p>
      ) : briefing ? (
        <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
          {briefing}
        </p>
      ) : null}
    </section>
  );
}
