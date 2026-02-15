# API Integration Guide

## ✅ Real API Integration Complete

Your backend now fetches **REAL MARKET DATA** from Polymarket and Kalshi APIs!

---

## 🔌 What's Integrated

### 1. **Polymarket API** (✅ Working)
- **Endpoint**: `https://gamma-api.polymarket.com/markets`
- **What it fetches**: Active markets with YES/NO pricing
- **No auth required**: Public API
- **Fetches**: 100 most active markets
- **Data extracted**:
  - Market title/question
  - YES price (in cents)
  - NO price (in cents)
  - Volume (24h)
  - Liquidity
  - Close date

### 2. **Kalshi API** (✅ Working)
- **Endpoint**: `https://trading-api.kalshi.com/trade-api/v2/markets`
- **What it fetches**: Open markets with bid/ask pricing
- **Auth**: Optional (public endpoints work, API key gives more data)
- **Fetches**: 100 open markets
- **Data extracted**:
  - Market ticker & title
  - YES bid/ask prices
  - NO bid/ask prices
  - Volume
  - Open interest
  - Expiration time

### 3. **Entity Resolution Matching** (✅ Working)
- Normalizes market titles using your entity aliases
- Matches Polymarket ↔ Kalshi markets deterministically
- Filters out parlay noise
- Uses waterfall filter (Temporal → Type → Entity → Line)

### 4. **Real Arbitrage Calculation** (✅ Working)
- Uses actual YES/NO prices from both platforms
- Calculates both strategies:
  1. YES on Kalshi + NO on Poly
  2. YES on Poly + NO on Kalshi
- Accounts for fees (2% Kalshi, 1% Poly)
- Returns best ROI strategy
- Shows profit per contract and total ROI

---

## 🚀 How It Works

```
1. Fetch Markets (Parallel)
   ├─ Polymarket: 100 active markets
   └─ Kalshi: 100 open markets

2. Normalize Markets
   ├─ Parse titles
   ├─ Resolve entity aliases (e.g., "Longhorns" → "Texas")
   ├─ Extract categories (MONEYLINE, SPREAD, TOTAL, PROP)
   └─ Filter parlay noise

3. Match Markets (Deterministic)
   ├─ Temporal filter (within 1 hour)
   ├─ Type filter (category must match)
   ├─ Entity filter (100% entity match)
   └─ Line filter (±0.5 tolerance)

4. Calculate Arbitrage (Real Prices)
   ├─ Extract YES/NO prices
   ├─ Try both strategies
   ├─ Account for fees
   └─ Return best ROI

5. Return to Frontend
   └─ Markets with arbitrage opportunities
```

---

## 🔑 Optional: Kalshi API Key

The backend works **without** a Kalshi API key (uses public endpoints).

**To add a key (for more data):**

1. Go to: https://kalshi.com/settings/api
2. Generate API key
3. In Railway Dashboard:
   - Go to your `oddssync-backend` service
   - Settings → Variables
   - Add: `KALSHI_API_KEY` = `your_key_here`
4. Redeploy

**Benefits of API key:**
- More accurate bid/ask spreads
- Access to more market data
- Higher rate limits

---

## 📊 Data Flow

```
Polymarket API Response:
{
  "slug": "texas-vs-oklahoma",
  "question": "Will Texas beat Oklahoma?",
  "tokens": [
    { "outcome": "YES", "price": "0.52" },  // 52 cents
    { "outcome": "NO", "price": "0.48" }    // 48 cents
  ],
  "end_date_iso": "2024-10-12T...",
  "volume": "1500000",
  "liquidity": "500000"
}

↓ Normalize & Match ↓

Kalshi API Response:
{
  "ticker": "KX-TEXAS-OK",
  "title": "Texas to beat Oklahoma",
  "yes_ask": 0.54,    // 54 cents
  "no_ask": 0.46,     // 46 cents
  "volume": 2000000,
  "expiration_time": "2024-10-12T..."
}

↓ Calculate Arbitrage ↓

Arbitrage Result:
{
  "title": "Texas vs Oklahoma",
  "poly": { "yes_price": 52, "no_price": 48 },
  "kalshi": { "yes_price": 54, "no_price": 46 },
  "spread": 2,
  "arb": {
    "strategy": "YES_POLY_NO_KALSHI",
    "cost_per_contract": 0.98,
    "profit_per_contract": 0.01,
    "roi_pct": 1.02
  }
}
```

---

## 🧪 Testing

Test the API:

```bash
# Get markets with real data
curl https://oddssync-backend-production.up.railway.app/markets

# Should return array of markets with:
# - Real Polymarket prices
# - Real Kalshi prices
# - Calculated arbitrage opportunities
```

---

## ⚙️ Configuration

### API Endpoints (Hardcoded)
- Polymarket: `https://gamma-api.polymarket.com`
- Polymarket CLOB: `https://clob.polymarket.com`
- Kalshi: `https://trading-api.kalshi.com/trade-api/v2`

### Fees
- Kalshi: 2% (0.02)
- Polymarket: 1% (0.01)

### Filters
- Temporal threshold: 3600s (1 hour)
- Line tolerance: 0.5
- Market limit: 100 per platform

### Can be changed in:
- `src/services/marketFetcher.ts` (API endpoints, fees)
- `src/matching/filter.ts` (filter thresholds)
- `src/server.ts` (WaterfallFilter config)

---

## 🎯 What You Get

Your frontend will now show:

✅ **Real markets** from Polymarket and Kalshi
✅ **Real prices** (YES/NO in cents)
✅ **Real arbitrage opportunities** (calculated with fees)
✅ **Entity-matched markets** (garbage filtered out)
✅ **Parlay-free results** (100% clean matches)

---

## 🚨 Rate Limits

**Polymarket:** No known limits on public API
**Kalshi:**
- Without key: Lower rate limit
- With key: Higher rate limit

If you hit rate limits, the backend gracefully returns empty arrays and logs errors.

---

## 📝 Logs to Watch

In Railway logs, you'll see:

```
[FETCHER] Starting market fetch...
[FETCHER] Fetched 95 Polymarket, 87 Kalshi markets
[FETCHER] Normalized 92 Polymarket, 84 Kalshi markets
[WATERFALL] 150 rejections:
  temporal: 45
  type: 62
  entity: 38
  line: 5
[WATERFALL] 12 successful matches
[FETCHER] Found 12 matches
```

This shows:
- How many markets were fetched
- How many passed normalization (parlay filter)
- Why markets were rejected (temporal/type/entity/line)
- How many valid arbitrage opportunities were found

---

**Your backend is now fully integrated with real market data!** 🎉
