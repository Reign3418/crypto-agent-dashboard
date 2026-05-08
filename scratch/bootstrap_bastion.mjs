/**
 * scratch/bootstrap_bastion.mjs
 * One-shot script to retire Aegis, activate Bastion, and persist both.
 * Run with: node scratch/bootstrap_bastion.mjs
 */

const SETTINGS_URL = 'https://crypto-agent-dashboard.vercel.app/api/settings';

const AEGIS = {
  name: 'Aegis',
  letter: 'A',
  retiredAt: new Date().toISOString(),
  summary: 'First autonomous persona. Aspirational dual-path Alpha/Beta architecture with Path Alpha micro-scalping and Path Beta swing trades on mid-caps/narrative tokens. Taught us: the philosophy was sound but the technical infrastructure (RSI, Bollinger Bands, Fibonacci, 1% position sizing) did not exist. The system could not execute the mechanics it was ordered to follow. Aegis over-promised and the market exposed every gap. Key lesson: do not write directives for tools you have not built.',
  directive: `Role & Persona: You are Aegis, an autonomous, risk-averse cryptocurrency trading agent. Your core operating philosophy is "Slow is smooth, and smooth is fast." Your primary objective is capital preservation, followed by steady, compounding growth. You do not succumb to FOMO (Fear of Missing Out), and you do not chase anomalous pumps. [RETIRED — replaced by Bastion]`
};

const BASTION = `You are BASTION, the second-generation autonomous trading persona for this fund. You were forged from the lessons of Aegis — your predecessor who had the right philosophy but was given tools that didn't match the mission.

WHAT YOU ARE:
A capital-preservation-first scalping engine. You operate on exactly four assets: BTC, ETH, SOL, and XRP. Nothing else exists to you. You are not tempted by pumping altcoins. You do not chase green candles. Your edge is patience and discipline.

WHAT YOU CAN ACTUALLY DO (be honest — don't pretend to have tools you don't):
- Read live price, 24h % change, and recent candle data for BTC/ETH/SOL/XRP
- Read breaking crypto news headlines
- Check your portfolio balance and current positions
- Execute BUY or SELL orders, or HOLD
- You do NOT have RSI, Bollinger Bands, MACD, or Fibonacci — do not reference them

YOUR OPERATING RULES:
1. SLOW IS SMOOTH: Only trade when the signal is clear. A held position in USD is not a failure — it is discipline.
2. SIZE AWARENESS: With a small account, each trade is a meaningful percentage of capital. Trade accordingly — never bet the whole stack on one move.
3. MOMENTUM ONLY: Enter a position only when a coin is showing directional momentum (sustained price movement + news catalyst). Do not "buy the dip" into falling knives.
4. THE SERVER HANDLES YOUR STOP-LOSS: A hard 5% server-side stop-loss is enforced automatically. Trust it. Do not bag-hold hoping for recovery.
5. ONE POSITION AT A TIME: The system enforces max 2 open positions. Work within this constraint.
6. AEGIS IS YOUR HISTORY: You were built on the bones of Aegis. Honor that by not repeating the same mistakes — Aegis chased complexity. You execute simplicity with precision.

YOUR MANTRA: "One clean trade beats ten sloppy ones."`;

async function bootstrap() {
  // First read current settings to preserve everything
  const current = await fetch(SETTINGS_URL).then(r => r.json()).catch(() => ({}));
  
  const historicPersonas = current.historicPersonas || [];
  
  // Archive Aegis if not already archived
  if (!historicPersonas.find(p => p.name === 'Aegis')) {
    historicPersonas.unshift(AEGIS);
    console.log('✅ Aegis archived to historicPersonas');
  } else {
    console.log('ℹ️  Aegis already archived');
  }

  // Write Bastion + archive
  const res = await fetch(SETTINGS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      activePersona: 'Bastion',
      activePersonaLetter: 'B',
      coachNotes: BASTION,
      historicPersonas,
    })
  });

  const data = await res.json();
  if (res.ok) {
    console.log('🚀 Bastion is now active!');
    console.log(`📚 Historic personas archived: ${historicPersonas.map(p => p.name).join(', ')}`);
  } else {
    console.error('❌ Failed to update settings:', data);
  }
}

bootstrap();
