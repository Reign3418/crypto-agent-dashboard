import { getStrategies, markStrategyTriggered } from './db.js';
import { logAction } from './db.js';

// ─── Condition Registry ────────────────────────────────────────────────────
function evaluateCondition(condition, ticker, scoutAsset) {
  const val = parseFloat(condition.value);
  const change = parseFloat(ticker?.change24h ?? 0);
  const price = parseFloat(ticker?.price ?? 0);

  switch (condition.type) {
    case 'price_drop_pct':
      return change <= -Math.abs(val);
    case 'price_rise_pct':
      return change >= Math.abs(val);
    case 'price_below':
      return price > 0 && price <= val;
    case 'price_above':
      return price > 0 && price >= val;
    case 'change_exceeds':
      return Math.abs(change) >= Math.abs(val);
    case 'scout_bearish':
      return scoutAsset?.direction === 'bearish';
    case 'scout_bullish':
      return scoutAsset?.direction === 'bullish';
    case 'scout_risk_high':
      return scoutAsset?.riskLevel === 'high';
    default:
      console.warn(`[Evaluator] Unknown condition type: ${condition.type}`);
      return false;
  }
}

function isCoolingDown(strategy) {
  if (!strategy.lastTriggered || !strategy.cooldownMinutes) return false;
  const cooldownMs = (strategy.cooldownMinutes || 60) * 60 * 1000;
  const elapsed = Date.now() - new Date(strategy.lastTriggered).getTime();
  return elapsed < cooldownMs;
}

/**
 * Core evaluation engine.
 * @param {Object} options
 * @param {Object} options.tickerMap   - { "BTC": { price, change24h }, ... }
 * @param {Array}  options.scoutReport - Optional Scout report with direction/riskLevel
 */
export async function runEvaluation({ tickerMap, scoutReport = [] }) {
  const scoutMap = {};
  for (const asset of scoutReport) {
    const sym = (asset.symbol || '').toUpperCase();
    if (sym) scoutMap[sym] = asset;
  }

  const allStrategies = await getStrategies();
  const active = allStrategies.filter(s => s.enabled);

  if (active.length === 0) {
    return { evaluated: 0, triggered: [], skipped: [], results: [] };
  }

  const results = [];
  const triggered = [];
  const skipped = [];

  for (const strategy of active) {
    const sym = (strategy.asset || '').toUpperCase();
    const ticker = tickerMap[sym] || null;
    const scoutAsset = scoutMap[sym] || null;

    // Cooldown check — don't re-trigger within the cooldown window
    if (isCoolingDown(strategy)) {
      const remaining = Math.ceil(
        (strategy.cooldownMinutes * 60 * 1000 - (Date.now() - new Date(strategy.lastTriggered).getTime())) / 60000
      );
      skipped.push({ name: strategy.name, reason: `Cooling down — ${remaining}m remaining` });
      results.push({
        strategy: { id: strategy.id, name: strategy.name, asset: sym },
        ticker, scoutAsset,
        conditionResults: [],
        isTriggered: false,
        coolingDown: true,
        cooldownRemaining: remaining,
      });
      continue;
    }

    const conditionResults = (strategy.conditions || []).map(cond => ({
      condition: cond,
      met: evaluateCondition(cond, ticker, scoutAsset),
    }));

    const isTriggered = strategy.conditionLogic === 'ANY'
      ? conditionResults.some(c => c.met)
      : conditionResults.every(c => c.met);

    results.push({
      strategy: { id: strategy.id, name: strategy.name, asset: sym },
      ticker, scoutAsset, conditionResults, isTriggered, coolingDown: false,
    });

    if (isTriggered) {
      triggered.push(strategy);
      await logAction(
        `⚡ Strategy triggered: "${strategy.name}" (${sym}) — Action: ${strategy.action?.type || 'alert'}`,
        true
      );
      await markStrategyTriggered(strategy.id, strategy.triggerCount);
    }
  }

  return {
    evaluated: active.length,
    triggered: triggered.map(s => s.name),
    skipped,
    results,
  };
}

/**
 * Fetch live Gemini pricefeed and run evaluation.
 * Accepts optional pre-loaded scoutReport to avoid double-fetching.
 */
export async function runEvaluationWithLivePrices(scoutReport = []) {
  const pfRes = await fetch('https://api.gemini.com/v1/pricefeed');
  if (!pfRes.ok) throw new Error('Failed to fetch Gemini pricefeed');
  const pfData = await pfRes.json();

  const tickerMap = {};
  for (const item of pfData) {
    if (item.pair.toUpperCase().endsWith('USD')) {
      const sym = item.pair.replace(/USD$/i, '').toUpperCase();
      tickerMap[sym] = {
        price: parseFloat(item.price),
        change24h: parseFloat(item.percentChange24h) * 100,
      };
    }
  }

  return runEvaluation({ tickerMap, scoutReport });
}
