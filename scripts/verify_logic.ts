/**
 * Validation Rig - Verify that known garbage matches are rejected
 *
 * This script tests the new entity resolution logic against known problematic
 * market pairs that were causing noise in the old fuzzy matching system.
 *
 * Usage:
 *   npm run verify
 *
 * Expected output:
 *   - All garbage matches should be rejected with logged reasons
 *   - 0 false positives (garbage passing through)
 */

import { MarketNormalizer } from "../src/matching/normalizer";
import { WaterfallFilter } from "../src/matching/filter";
import { MarketCategory, NormalizedMarket } from "../src/matching/models";

/**
 * Known garbage samples from production logs
 * These are real examples of bad matches that were incorrectly paired
 */
const GARBAGE_SAMPLES = [
  // Category 1: Parlay Noise
  {
    description: "Explicit 3-leg parlay should be rejected at normalization",
    polymarket: {
      id: "pm_parlay_1",
      title: "3-leg parlay: Texas ML + Alabama ML + Georgia ML",
      commence_time: 1700000000,
    },
    kalshi: {
      ticker: "KX-TEXAS",
      title: "Texas to win",
      expiration_time: 1700000000,
    },
    expectedRejection: "Parlay detection",
  },

  {
    description: "Same Game Parlay should be rejected",
    polymarket: {
      id: "pm_sgp_1",
      title: "Same Game Parlay: Texas -7 and Over 52",
      commence_time: 1700000000,
    },
    kalshi: {
      ticker: "KX-TEXAS",
      title: "Texas vs Oklahoma",
      expiration_time: 1700000000,
    },
    expectedRejection: "Parlay detection",
  },

  {
    description: "Multi-market combo with + operator",
    polymarket: {
      id: "pm_combo_1",
      title: "Texas ML + Oklahoma ML",
      commence_time: 1700000000,
    },
    kalshi: {
      ticker: "KX-TEXAS",
      title: "Texas to win",
      expiration_time: 1700000000,
    },
    expectedRejection: "Parlay detection",
  },

  // Category 2: Entity Mismatch
  {
    description: "Different teams should fail entity filter",
    polymarket: {
      id: "pm_texas",
      title: "Texas vs Oklahoma - Winner",
      commence_time: 1700000000,
    },
    kalshi: {
      ticker: "KX-ALABAMA",
      title: "Alabama vs Georgia - Winner",
      expiration_time: 1700000000,
    },
    expectedRejection: "Entity mismatch",
  },

  {
    description: "Similar names but different entities",
    polymarket: {
      id: "pm_miami_fl",
      title: "Miami (FL) vs Florida State",
      commence_time: 1700000000,
    },
    kalshi: {
      ticker: "KX-MIAMI-OH",
      title: "Miami (OH) vs Cincinnati",
      expiration_time: 1700000000,
    },
    expectedRejection: "Entity mismatch",
  },

  // Category 3: Market Type Mismatch
  {
    description: "MONEYLINE vs SPREAD mismatch",
    polymarket: {
      id: "pm_ml",
      title: "Texas vs Oklahoma - Winner",
      commence_time: 1700000000,
    },
    kalshi: {
      ticker: "KX-SPREAD",
      title: "Texas -7.5 vs Oklahoma",
      expiration_time: 1700000000,
    },
    expectedRejection: "Type mismatch",
  },

  {
    description: "TOTAL vs MONEYLINE mismatch",
    polymarket: {
      id: "pm_total",
      title: "Texas vs Oklahoma - Over 52.5",
      commence_time: 1700000000,
    },
    kalshi: {
      ticker: "KX-ML",
      title: "Texas vs Oklahoma - Winner",
      expiration_time: 1700000000,
    },
    expectedRejection: "Type mismatch",
  },

  // Category 4: Temporal Drift
  {
    description: "Markets 3 hours apart should fail temporal filter",
    polymarket: {
      id: "pm_early",
      title: "Texas vs Oklahoma - Winner",
      commence_time: 1700000000,
    },
    kalshi: {
      ticker: "KX-LATE",
      title: "Texas vs Oklahoma - Winner",
      expiration_time: 1700000000 + 10800, // 3 hours later
    },
    expectedRejection: "Temporal drift",
  },

  // Category 5: Line Value Mismatch
  {
    description: "SPREAD lines more than 0.5 apart",
    polymarket: {
      id: "pm_spread_7",
      title: "Texas -7.5 vs Oklahoma",
      commence_time: 1700000000,
    },
    kalshi: {
      ticker: "KX-SPREAD-3",
      title: "Texas -3.5 vs Oklahoma",
      expiration_time: 1700000000,
    },
    expectedRejection: "Line mismatch",
  },

  {
    description: "TOTAL lines differing by 4 points",
    polymarket: {
      id: "pm_total_52",
      title: "Texas vs Oklahoma - Over 52.5",
      commence_time: 1700000000,
    },
    kalshi: {
      ticker: "KX-TOTAL-48",
      title: "Texas vs Oklahoma - Over 48.5",
      expiration_time: 1700000000,
    },
    expectedRejection: "Line mismatch",
  },
];

/**
 * Known good samples - these SHOULD match
 */
const GOOD_SAMPLES = [
  {
    description: "Identical MONEYLINE markets",
    polymarket: {
      id: "pm_good_1",
      title: "Texas vs Oklahoma - Winner",
      commence_time: 1700000000,
    },
    kalshi: {
      ticker: "KX-GOOD-1",
      title: "Texas vs Oklahoma - To Win",
      expiration_time: 1700000000,
    },
  },

  {
    description: "SPREAD markets with same line",
    polymarket: {
      id: "pm_spread_good",
      title: "Texas -7.5 vs Oklahoma",
      commence_time: 1700000000,
    },
    kalshi: {
      ticker: "KX-SPREAD-GOOD",
      title: "Texas -7.5 vs Oklahoma",
      expiration_time: 1700000000,
    },
  },

  {
    description: "Markets 30 minutes apart (within threshold)",
    polymarket: {
      id: "pm_time_good",
      title: "Texas vs Oklahoma - Winner",
      commence_time: 1700000000,
    },
    kalshi: {
      ticker: "KX-TIME-GOOD",
      title: "Texas vs Oklahoma - Winner",
      expiration_time: 1700000000 + 1800, // 30 min later
    },
  },
];

/**
 * Validation results
 */
interface ValidationResult {
  totalGarbageSamples: number;
  correctlyRejected: number;
  falsePositives: number; // Garbage that passed
  totalGoodSamples: number;
  correctlyMatched: number;
  falseNegatives: number; // Good that was rejected
  failures: Array<{
    description: string;
    expected: string;
    actual: string;
  }>;
}

/**
 * Run validation suite
 */
function runValidation(): ValidationResult {
  // Create alias map for entity resolution
  const aliasMap = {
    "Longhorns": "Texas",
    "UT": "Texas",
    "Sooners": "Oklahoma",
    "OU": "Oklahoma",
    "Crimson Tide": "Alabama",
    "Bulldogs": "Georgia",
    "Miami (FL)": "Miami Florida",
    "Miami (OH)": "Miami Ohio",
  };

  const normalizer = new MarketNormalizer(aliasMap);
  const filter = new WaterfallFilter({
    temporalThresholdSeconds: 3600,
    lineTolerance: 0.5,
  });

  const result: ValidationResult = {
    totalGarbageSamples: GARBAGE_SAMPLES.length,
    correctlyRejected: 0,
    falsePositives: 0,
    totalGoodSamples: GOOD_SAMPLES.length,
    correctlyMatched: 0,
    falseNegatives: 0,
    failures: [],
  };

  console.log("\n=== GARBAGE MATCH VALIDATION ===\n");

  // Test garbage samples (should all be rejected)
  for (const sample of GARBAGE_SAMPLES) {
    const pmNormalized = normalizer.normalizePolymarket(sample.polymarket);
    const kalNormalized = normalizer.normalizeKalshi(sample.kalshi);

    // Check if rejected at normalization stage
    if (!pmNormalized || !kalNormalized) {
      result.correctlyRejected++;
      console.log(`✓ ${sample.description}`);
      console.log(`  Rejected: Normalization (parlay or malformed)`);
      continue;
    }

    // Check if rejected at filtering stage
    const matchResult = filter.match(pmNormalized, kalNormalized);
    if (!matchResult.isMatch) {
      result.correctlyRejected++;
      console.log(`✓ ${sample.description}`);
      console.log(`  Rejected: ${matchResult.filterStepFailed} - ${matchResult.rejectionReason}`);
    } else {
      result.falsePositives++;
      console.log(`✗ FAILURE: ${sample.description}`);
      console.log(`  Expected rejection but MATCHED`);
      result.failures.push({
        description: sample.description,
        expected: `Rejection: ${sample.expectedRejection}`,
        actual: "Match accepted",
      });
    }
  }

  console.log("\n=== GOOD MATCH VALIDATION ===\n");

  // Test good samples (should all match)
  for (const sample of GOOD_SAMPLES) {
    const pmNormalized = normalizer.normalizePolymarket(sample.polymarket);
    const kalNormalized = normalizer.normalizeKalshi(sample.kalshi);

    if (!pmNormalized || !kalNormalized) {
      result.falseNegatives++;
      console.log(`✗ FAILURE: ${sample.description}`);
      console.log(`  Expected match but rejected at normalization`);
      result.failures.push({
        description: sample.description,
        expected: "Match accepted",
        actual: "Rejected at normalization",
      });
      continue;
    }

    const matchResult = filter.match(pmNormalized, kalNormalized);
    if (matchResult.isMatch) {
      result.correctlyMatched++;
      console.log(`✓ ${sample.description}`);
      console.log(`  Matched successfully`);
    } else {
      result.falseNegatives++;
      console.log(`✗ FAILURE: ${sample.description}`);
      console.log(`  Expected match but rejected: ${matchResult.rejectionReason}`);
      result.failures.push({
        description: sample.description,
        expected: "Match accepted",
        actual: `Rejected: ${matchResult.rejectionReason}`,
      });
    }
  }

  return result;
}

/**
 * Print validation summary
 */
function printSummary(result: ValidationResult): void {
  console.log("\n" + "=".repeat(50));
  console.log("VALIDATION SUMMARY");
  console.log("=".repeat(50));

  console.log("\nGarbage Match Testing:");
  console.log(`  Total samples: ${result.totalGarbageSamples}`);
  console.log(`  Correctly rejected: ${result.correctlyRejected}`);
  console.log(`  False positives: ${result.falsePositives}`);
  console.log(
    `  Success rate: ${((result.correctlyRejected / result.totalGarbageSamples) * 100).toFixed(1)}%`
  );

  console.log("\nGood Match Testing:");
  console.log(`  Total samples: ${result.totalGoodSamples}`);
  console.log(`  Correctly matched: ${result.correctlyMatched}`);
  console.log(`  False negatives: ${result.falseNegatives}`);
  console.log(
    `  Success rate: ${((result.correctlyMatched / result.totalGoodSamples) * 100).toFixed(1)}%`
  );

  if (result.failures.length > 0) {
    console.log("\n⚠️  FAILURES:");
    for (const failure of result.failures) {
      console.log(`\n  ${failure.description}`);
      console.log(`    Expected: ${failure.expected}`);
      console.log(`    Actual: ${failure.actual}`);
    }
  }

  const totalSuccess = result.correctlyRejected + result.correctlyMatched;
  const totalTests = result.totalGarbageSamples + result.totalGoodSamples;
  const overallRate = (totalSuccess / totalTests) * 100;

  console.log("\n" + "=".repeat(50));
  console.log(`OVERALL: ${totalSuccess}/${totalTests} tests passed (${overallRate.toFixed(1)}%)`);
  console.log("=".repeat(50));

  if (result.falsePositives === 0 && result.falseNegatives === 0) {
    console.log("\n✓ ALL TESTS PASSED - Entity resolution working correctly!");
    process.exit(0);
  } else {
    console.log("\n✗ VALIDATION FAILED - Review failures above");
    process.exit(1);
  }
}

// Run validation
const result = runValidation();
printSummary(result);
