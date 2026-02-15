# OddsSync Feasibility Study: Polymarket ↔ Kalshi Arbitrage
**Date:** February 15, 2026
**Status:** CRITICAL FINDINGS - Platform Viability Reassessment Required

---

## Executive Summary

After comprehensive analysis of both Polymarket and Kalshi APIs with maximum market coverage, we have discovered **fundamental platform compatibility issues** that severely impact the viability of this arbitrage matching engine.

### Key Findings
1. ✅ **APIs Verified**: Both Polymarket and Kalshi APIs are 100% correct and official
2. ⚠️ **Kalshi Market Composition**: 90% of Kalshi's activity is sports betting (89% of revenue)
3. 🔴 **Parlay Dominance**: Initial fetch of 1,000 Kalshi markets showed 100% were multi-event parlays
4. 🔍 **Filter Discovery**: Found `multivariate=exclude` parameter to filter out parlays
5. ❓ **Overlap Unknown**: Need to re-test with parlay filter to determine actual single-event market overlap

---

## API Verification (100% Confirmed)

### Polymarket API ✅
- **Endpoint**: `https://gamma-api.polymarket.com`
- **Documentation**: [docs.polymarket.com](https://docs.polymarket.com/developers/gamma-markets-api/overview)
- **Status**: Official Gamma API for market metadata
- **Total Markets**: 6,660+ active markets
- **Categories**: Politics, Sports (NFL, NBA, MLB), Crypto, Culture, Economy, Weather
- **Sports Volume**: $701M+ traded on Super Bowl 2026 alone
- **API Limit**: 500 markets per request (hard limit)

### Kalshi API ✅
- **Endpoint**: `https://api.elections.kalshi.com/trade-api/v2`
- **Documentation**: [docs.kalshi.com](https://docs.kalshi.com/welcome)
- **Note**: Despite "elections" subdomain, provides access to ALL market categories
- **Categories**: Politics, Sports, Economics, Weather, Culture
- **Sports Dominance**: 90% of platform activity (89% of 2025 revenue)
- **Sports Markets Added**: January 2025 (now fastest-growing segment)
- **Parlay Focus**: Heavy emphasis on multi-event combo markets

---

## Critical Discovery: The Parlay Problem

### Initial Analysis (Without Filter)
**Fetch Parameters:**
```
Polymarket: /markets?closed=false&active=true&limit=10000
Kalshi: /markets?limit=1000&status=open
```

**Results:**
- **Polymarket**: 473 valid markets (mostly political prediction markets)
- **Kalshi**: 1,000 markets fetched, **ALL rejected as sports parlays**
- **Overlap**: ZERO matches

**Sample Rejected Titles:**
```
"yes Murray St.,yes Charleston,yes Dayton,yes Grand Canyon"
"yes Leipzig,yes Real Betis,yes Bilbao,yes Benfica"
"yes Over 2.5,yes Paderborn,yes Phoenix,yes Dresden"
```

### Root Cause Analysis

**Issue #1: Platform Business Models Diverging**
- Polymarket: Broad prediction markets across all categories
- Kalshi: 90% sports betting focus with heavy parlay offerings
- Different target audiences and use cases

**Issue #2: Missing API Filter**
- Kalshi API returns ALL markets by default (including parlays)
- Parlays cannot be matched 1:1 with single-event markets
- No category filtering in initial implementation

**Issue #3: API Pagination Limits**
- Polymarket: 500 market hard limit per request
- With 6,660 active markets, we're only seeing ~7.5% of catalog
- Likely sorted/filtered by category (politics first?)

---

## Solution Implemented: API Filter

### Kalshi Multivariate Parameter
Per [official documentation](https://docs.kalshi.com/api-reference/market/get-markets):

```
GET /markets?status=open&limit=1000&multivariate=exclude
```

**Parameter Options:**
- `multivariate=exclude` - Returns ONLY single-event markets (filters out parlays)
- `multivariate=only` - Returns ONLY combo/parlay markets

**Updated Implementation:**
```typescript
// Both direct auth and login flow paths now include:
`${KALSHI_API}/markets?limit=${KALSHI_LIMIT}&status=open&multivariate=exclude`
```

---

## Expected Results After Filter

### Scenario A: Significant Single-Event Markets
If Kalshi has a meaningful number of single-event sports/politics markets:
- Should see 100-500+ Kalshi markets (vs 0 before)
- Potential for overlap in sports categories (NFL, NBA, MLB)
- Potential for overlap in politics/election markets
- **Viability**: PROCEED with development

### Scenario B: Minimal Single-Event Markets
If Kalshi's business model has shifted to parlay-focus:
- May see 0-50 single-event markets
- Limited overlap potential
- Heavy manual curation required
- **Viability**: PIVOT to different platform combination

### Scenario C: Different Category Focus
If Kalshi's single-event markets are in different categories than Polymarket's API returns:
- Need to implement category-based filtering
- Fetch sports markets from Polymarket specifically
- Fetch politics markets from Kalshi specifically
- **Viability**: REQUIRES additional API work

---

## Platform Comparison

| Metric | Polymarket | Kalshi |
|--------|-----------|--------|
| **Total Markets** | 6,660+ | Unknown |
| **API Limit** | 500/request | 1,000+/request |
| **Sports Focus** | Multi-category | 90% sports |
| **Parlay Support** | Yes (limited) | Heavy (primary offering) |
| **Single-Event Sports** | Yes (NFL, NBA, MLB) | Unknown (need to test filter) |
| **Politics Markets** | Extensive | Yes |
| **API Quality** | Excellent | Excellent |
| **Documentation** | Complete | Complete |

---

## Risk Assessment

### HIGH RISK ⚠️
1. **Business Model Misalignment**: Kalshi's 90% sports + parlay focus may not overlap with Polymarket's diversified approach
2. **Market Category Mismatch**: Polymarket API may default to politics, Kalshi to sports
3. **Parlay Dominance**: If Kalshi's single-event market count is low, arbitrage opportunities will be minimal

### MEDIUM RISK ⚠️
1. **API Pagination**: Need to implement multi-page fetching for Polymarket (500 limit)
2. **Category Filtering**: May need to filter by sport/category to find comparable markets
3. **Temporal Windows**: Prediction markets (30-day horizons) vs live sports (hours)

### LOW RISK ✅
1. **API Reliability**: Both APIs are stable and well-documented
2. **Authentication**: Resolved Kalshi auth issues
3. **Normalization Logic**: Parlay detection working correctly
4. **Entity Resolution**: Alias system in place

---

## Recommended Next Steps

### IMMEDIATE (Deploy & Test)
1. **Deploy to Railway** with updated `multivariate=exclude` filter
2. **Run comprehensive analysis** to see actual single-event Kalshi market count
3. **Determine definitive overlap** between platforms

### IF OVERLAP EXISTS (Scenario A)
1. Implement category-based filtering for targeted matching
2. Add multi-page fetching for Polymarket (500+ markets)
3. Optimize waterfall filters for sport-specific rules
4. Build frontend dashboard
5. Proceed to production

### IF MINIMAL OVERLAP (Scenario B/C)
**PIVOT OPTIONS:**
1. **Replace Kalshi** with another platform:
   - PredictIt (politics-focused, US-regulated)
   - Augur (decentralized, broad categories)
   - Insight Prediction (sports + politics)

2. **Replace Polymarket** (less recommended - excellent API):
   - Unlikely to find better alternative with similar market diversity

3. **Add Third Platform** (triangular arbitrage):
   - Keep both Polymarket + Kalshi
   - Add PredictIt or similar
   - Match across all three platforms
   - More complex but higher opportunity coverage

4. **Focus on Single Platform** (different product):
   - Build Polymarket-only dashboard/analytics
   - Build Kalshi-only parlay analyzer
   - Not an arbitrage engine, but still valuable

---

## Cost-Benefit Analysis

### Current Investment
- ✅ Entity resolution system (complete)
- ✅ Waterfall filtering (complete)
- ✅ Market normalization (complete)
- ✅ API integration (Polymarket + Kalshi)
- ✅ Parlay detection (enhanced)
- ⏳ Frontend (not started)

### Sunk Cost
- ~20-30 hours of development
- Working codebase with solid architecture
- **Reusable** for any two prediction market platforms

### Decision Point
**BEFORE building frontend**, we must confirm:
- Kalshi single-event market count > 50
- At least 5-10 actual matches found
- ROI opportunities justify development effort

**If no overlap**, pivot costs:
- API integration for new platform: 4-8 hours
- Testing and validation: 2-4 hours
- **Total pivot cost**: 6-12 hours (vs 40+ hours for full frontend)

---

## Technical Status

### ✅ Completed
- [x] Entity resolution with alias mapping (147 aliases)
- [x] Waterfall filtering (Temporal, Type, Entity, Line)
- [x] Parlay detection (multiple pattern matching)
- [x] Polymarket API integration (with JSON parsing fixes)
- [x] Kalshi API integration (with auth + multivariate filter)
- [x] Expired market filtering
- [x] Temporal threshold adjustment (30 days for predictions)
- [x] RESTful API endpoints (/markets, /api/match, /api/match/batch)

### 🔄 In Progress
- [ ] Deploy to Railway with multivariate=exclude filter
- [ ] Run comprehensive feasibility test
- [ ] Analyze single-event Kalshi market count
- [ ] Determine actual platform overlap

### ⏸️ Blocked (Pending Feasibility)
- [ ] Frontend development
- [ ] Production deployment
- [ ] User acquisition
- [ ] Monetization strategy

---

## Conclusion

**The viability of Polymarket ↔ Kalshi arbitrage is UNCONFIRMED pending final test.**

### Critical Question
**When filtering out Kalshi's parlays, how many single-event markets remain?**

**If >100 markets:** Project is viable, proceed with development
**If 50-100 markets:** Marginal viability, consider adding third platform
**If <50 markets:** PIVOT to different platform combination immediately

### Recommendation
**DO NOT proceed with frontend development until we have deployed the multivariate filter and confirmed actual market overlap.**

The architecture is sound and reusable, so a pivot to different platforms is low-risk and low-cost compared to building a full frontend for a non-viable platform combination.

---

## Data Sources

- [Polymarket Official Documentation](https://docs.polymarket.com/developers/gamma-markets-api/overview)
- [Kalshi Official Documentation](https://docs.kalshi.com/welcome)
- [Kalshi API: Get Markets Endpoint](https://docs.kalshi.com/api-reference/market/get-markets)
- [Polymarket Sports Markets](https://polymarket.com/predictions/sports)
- [Kalshi Market Categories](https://news.kalshi.com/p/what-is-kalshi-f573)
- Live API Testing (February 15, 2026)

---

**Next Action Required:** Deploy to Railway and run `/markets` endpoint test to determine final viability.
