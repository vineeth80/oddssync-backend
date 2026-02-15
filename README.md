# OddsSync Backend - Entity Resolution Matching Engine

**Deterministic arbitrage matching system** that replaces fuzzy string matching with a strict waterfall pipeline, eliminating parlay noise and garbage matches.

## 🎯 Problem Statement

The previous fuzzy matching system (`MIN_CONFIDENCE` scoring) produced:
- **Parlay noise**: Multi-leg parlays incorrectly matched to single markets
- **Entity mismatches**: Similar team names causing false matches (e.g., Miami FL vs Miami OH)
- **Type confusion**: MONEYLINE markets matched to SPREAD markets
- **Line drift**: Spread/Total markets with significantly different line values

## 🏗️ Architecture

### Core Components

```
┌─────────────────────┐
│   Raw API Data      │
│ (Polymarket/Kalshi) │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  MarketNormalizer   │ ◄── Entity Alias Map
│  • Parlay rejection │
│  • Entity resolution│
│  • Category detection│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  NormalizedMarket   │
│  (Typed, Validated) │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  WaterfallFilter    │
│  1. Temporal ✓      │
│  2. Type ✓          │
│  3. Entity ✓        │
│  4. Line ✓          │
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
  MATCH       REJECT
             (with reason)
```

### 1. **MarketNormalizer**
Transforms raw API data into strictly-typed `NormalizedMarket` objects.

**Key Features:**
- **Parlay Detection**: Rejects markets containing `parlay`, `sgp`, `+`, `&`, `and`
- **Entity Aliasing**: Maps "Longhorns" → "Texas", "Sooners" → "Oklahoma"
- **Category Detection**: MONEYLINE, SPREAD, TOTAL, PROP
- **Line Extraction**: Parses `-7.5`, `Over 52.5`, etc.

**Example:**
```typescript
const normalizer = new MarketNormalizer({
  "Longhorns": "Texas",
  "UT": "Texas",
});

const market = normalizer.normalizePolymarket({
  id: "pm_123",
  title: "Longhorns -7.5 vs Oklahoma",
  commence_time: 1700000000,
});

// market.primaryEntity === "Texas" (aliased)
// market.marketCategory === MarketCategory.SPREAD
// market.lineValue === -7.5
```

### 2. **WaterfallFilter**
4-stage deterministic pipeline. **Any failure = Score 0 (no match).**

| Stage | Filter | Logic | Example Rejection |
|-------|--------|-------|-------------------|
| 1 | **Temporal** | `|t1 - t2| ≤ 3600s` | Markets 3 hours apart |
| 2 | **Type** | Category exact match | MONEYLINE ≠ SPREAD |
| 3 | **Entity** | Primary entity exact match | "Texas" ≠ "Alabama" |
| 4 | **Line** | `|line1 - line2| ≤ 0.5` | -7.5 vs -3.5 (diff: 4.0) |

**Example:**
```typescript
const filter = new WaterfallFilter({
  temporalThresholdSeconds: 3600, // 1 hour
  lineTolerance: 0.5,
});

const result = filter.match(polymarketMarket, kalshiMarket);

if (result.isMatch) {
  console.log("Valid arbitrage opportunity!");
} else {
  console.log(`Rejected at ${result.filterStepFailed}: ${result.rejectionReason}`);
  // Example: "Rejected at entity: Primary entity mismatch: 'Texas' != 'Alabama'"
}
```

## 📊 Validation Results

Run `npm run verify` to test against known garbage matches:

```
=== VALIDATION SUMMARY ===

Garbage Match Testing:
  Total samples: 10
  Correctly rejected: 10
  False positives: 0
  Success rate: 100.0%

Good Match Testing:
  Total samples: 3
  Correctly matched: 3
  False negatives: 0
  Success rate: 100.0%

OVERALL: 13/13 tests passed (100.0%)
✓ ALL TESTS PASSED - Entity resolution working correctly!
```

### Test Categories
1. **Parlay Noise** (3 tests): 3-leg parlays, SGP, combo operators
2. **Entity Mismatches** (2 tests): Different teams, similar names
3. **Type Mismatches** (2 tests): ML vs SPREAD, TOTAL vs ML
4. **Temporal Drift** (1 test): Markets >3600s apart
5. **Line Mismatches** (2 tests): Spread/Total lines >0.5 apart
6. **Good Matches** (3 tests): Legitimate market pairs

## 🚀 Usage

### Installation
```bash
npm install
```

### Run Tests
```bash
npm test              # Run full test suite (61 tests)
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

### Validate Logic
```bash
npm run verify  # Test against known garbage matches
```

### Build
```bash
npm run build  # Compile TypeScript to dist/
```

## 📁 Project Structure

```
oddssync-backend/
├── src/
│   └── matching/
│       ├── models.ts         # NormalizedMarket, MarketCategory
│       ├── normalizer.ts     # MarketNormalizer
│       ├── filter.ts         # WaterfallFilter
│       └── index.ts          # Public exports
├── tests/
│   ├── models.test.ts        # 11 tests
│   ├── normalizer.test.ts    # 24 tests
│   └── filter.test.ts        # 26 tests
├── scripts/
│   └── verify_logic.ts       # Validation rig (13 scenarios)
└── package.json
```

## 🔧 Configuration

### Entity Alias Map
Define in your application:
```typescript
const aliasMap = {
  // College Football
  "Longhorns": "Texas",
  "UT": "Texas",
  "Sooners": "Oklahoma",
  "OU": "Oklahoma",

  // NBA
  "Lakers": "Los Angeles Lakers",
  "LA Lakers": "Los Angeles Lakers",
};
```

### Filter Thresholds
```typescript
const filter = new WaterfallFilter({
  temporalThresholdSeconds: 7200,  // 2 hours (more lenient)
  lineTolerance: 1.0,               // 1 point tolerance
});
```

## 🎯 Design Principles

1. **Immutability**: `NormalizedMarket` uses `readonly` properties
2. **Fail Fast**: Validation errors throw at construction time
3. **Explicit Rejections**: Every rejection has a logged reason
4. **Zero Parlay Tolerance**: Hard rejection at normalization stage
5. **Deterministic**: No fuzzy scoring, no confidence thresholds

## 🛠️ Integration Example

```typescript
import { MarketNormalizer, WaterfallFilter } from './src/matching';

// 1. Initialize with your entity mappings
const normalizer = new MarketNormalizer({
  "Longhorns": "Texas",
  "Sooners": "Oklahoma",
});

const filter = new WaterfallFilter({
  temporalThresholdSeconds: 3600,
  lineTolerance: 0.5,
});

// 2. Fetch markets from APIs
const polymarketMarkets = await fetchPolymarketAPI();
const kalshiMarkets = await fetchKalshiAPI();

// 3. Normalize
const pmNormalized = polymarketMarkets
  .map(m => normalizer.normalizePolymarket(m))
  .filter(m => m !== null);

const kalNormalized = kalshiMarkets
  .map(m => normalizer.normalizeKalshi(m))
  .filter(m => m !== null);

// 4. Batch match
const matches = filter.batchMatch(pmNormalized, kalNormalized);

// 5. Process arbitrage opportunities
for (const match of matches) {
  console.log(`Arbitrage found: ${match.polymarketMarket.toString()}`);
  // Execute arbitrage logic...
}
```

## 📈 Performance

- **Test Suite**: 61 tests in ~4s
- **Validation Rig**: 13 scenarios in ~100ms
- **Batch Matching**: O(n*m) where n=Polymarket markets, m=Kalshi markets
  - Early rejection at each filter stage minimizes computation

## 🚧 Future Enhancements

1. **Secondary Entity Matching**: Currently only primary entities are checked
2. **Fuzzy Temporal Windows**: Different thresholds for different sports
3. **Line Value Normalization**: Handle American odds, decimal odds conversion
4. **Caching Layer**: Memoize normalization results
5. **Telemetry**: Track rejection reasons for optimization

## 📝 License

ISC

---

**Built with TypeScript, Jest, and deterministic logic.**
