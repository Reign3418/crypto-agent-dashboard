# Intelligence Ring 📰

The Intelligence Ring exists to separate "news gathering" from "tactical execution." It builds a persistent narrative of the crypto market and tells the Combat Ring exactly how wide their analytical lens should be.

## Ring Architecture

```
KENT  (every 30 minutes)
│  Chief Market Analyst / News Anchor. 
│  Watches the news, defines the market narrative, and sizes the analytical lens.
│  Writes `kentBriefing` to DynamoDB.
│
└── feeds into → NULL  (reads Kent's macro narrative before issuing strategic commands)
└── feeds into → CIPHER (reads Kent's catalyst data and uses Kent's recommended candle depth)
```

---

## The Agents

### KENT — Chief Market Analyst
**Named after:** Kent Brockman / The Daily Planet News Desk
**Model:** `gemini-2.5-flash` (with Google Search Grounding)
**Cadence:** Every 30 minutes
**File:** `api/kent.js`

**Identity:** Kent is the news anchor. He doesn't trade. He doesn't give financial advice. He just reports what is happening right now in the world and how it specifically impacts the 9 core assets.

**Core Responsibilities:**
1. **Persistent Memory:** Kent reads his *own* previous briefing every cycle. This allows him to track a developing story (e.g., "The lawsuit from 2 hours ago is now causing liquidations"). CIPHER cannot do this, as CIPHER operates with zero memory between ticks.
2. **Asset Catalysts:** He maps real-world news directly to the 9 core assets (BTC, ETH, SOL, XRP, LINK, DOGE, LTC, AVAX, BCH).
3. **The "Lens" (Dynamic Technical Sizing):** This is Kent's most powerful feature. Based on market volatility and news density, Kent tells CIPHER how far back to look at the chart:
   - **Quiet Market:** Lens = `6h`. CIPHER focuses on immediate micro-trends.
   - **Moderate News:** Lens = `12h`. 
   - **Breaking Macro Event:** Lens = `24h`. CIPHER is forced to zoom out and see the full impact of the event, preventing it from making rash decisions based only on the immediate aftermath.

**Data Flow:**
Kent writes to `settings.kentBriefing`:
```json
{
  "timestamp": "ISO",
  "macroNarrative": "Feds announced rate cuts. Market is highly volatile.",
  "catalysts": {
    "BTC": "Surging on ETF inflows.",
    "ETH": "null"
  },
  "recommendedCandleDepth": 24, 
  "volatilityState": "HIGH"
}
```

**Guardrails:**
- Kent **must not** suggest trades.
- Kent **must not** alter the mission.
- Kent **must** provide a catalyst entry (or `null`) for all 9 core assets every time, ensuring the array matches what CIPHER expects.
