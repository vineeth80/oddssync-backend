/**
 * WaterfallFilter - Deterministic matching pipeline.
 *
 * Replaces fuzzy matching with a strict 4-stage waterfall:
 * 1. Temporal Filter: Commence times within threshold
 * 2. Type Filter: Market categories must match exactly
 * 3. Entity Filter: Primary entities must match (100% intersection after alias resolution)
 * 4. Line Filter: Line values within tolerance (SPREAD/TOTAL only)
 *
 * If ANY stage fails, the match is rejected (Score = 0).
 */

import { MarketCategory, NormalizedMarket } from "./models";

/**
 * Result of a match attempt
 */
export interface MatchResult {
  isMatch: boolean;
  rejectionReason: string | null; // Required if isMatch=false
  polymarketMarket: NormalizedMarket;
  kalshiMarket: NormalizedMarket;
  filterStepFailed: string | null; // "temporal" | "type" | "entity" | "line"
}

/**
 * Configuration for WaterfallFilter
 */
export interface WaterfallFilterConfig {
  temporalThresholdSeconds?: number; // Default: 3600 (1 hour)
  lineTolerance?: number; // Default: 0.5
}

export class WaterfallFilter {
  private readonly temporalThreshold: number;
  private readonly lineTolerance: number;

  constructor(config: WaterfallFilterConfig = {}) {
    this.temporalThreshold = config.temporalThresholdSeconds ?? 3600;
    this.lineTolerance = config.lineTolerance ?? 0.5;
  }

  /**
   * Execute the waterfall matching pipeline.
   *
   * Returns MatchResult with explicit rejection reason if any filter fails.
   *
   * @param polymarket Normalized Polymarket market
   * @param kalshi Normalized Kalshi market
   * @returns Match result with pass/fail and rejection reason
   */
  match(polymarket: NormalizedMarket, kalshi: NormalizedMarket): MatchResult {
    // FILTER 1: Temporal
    if (!this.temporalFilter(polymarket, kalshi)) {
      const drift = Math.abs(polymarket.commenceTime - kalshi.commenceTime);
      return {
        isMatch: false,
        rejectionReason: `Temporal drift ${drift}s exceeds threshold ${this.temporalThreshold}s`,
        filterStepFailed: "temporal",
        polymarketMarket: polymarket,
        kalshiMarket: kalshi,
      };
    }

    // FILTER 2: Type
    if (!this.typeFilter(polymarket, kalshi)) {
      return {
        isMatch: false,
        rejectionReason: `Category mismatch: ${polymarket.marketCategory} != ${kalshi.marketCategory}`,
        filterStepFailed: "type",
        polymarketMarket: polymarket,
        kalshiMarket: kalshi,
      };
    }

    // FILTER 3: Entity
    if (!this.entityFilter(polymarket, kalshi)) {
      return {
        isMatch: false,
        rejectionReason: `Primary entity mismatch: "${polymarket.primaryEntity}" != "${kalshi.primaryEntity}"`,
        filterStepFailed: "entity",
        polymarketMarket: polymarket,
        kalshiMarket: kalshi,
      };
    }

    // FILTER 4: Line (only for SPREAD/TOTAL)
    if (
      polymarket.marketCategory === MarketCategory.SPREAD ||
      polymarket.marketCategory === MarketCategory.TOTAL
    ) {
      if (!this.lineFilter(polymarket, kalshi)) {
        const pmLine = polymarket.lineValue ?? 0;
        const kalLine = kalshi.lineValue ?? 0;
        const diff = Math.abs(pmLine - kalLine);
        return {
          isMatch: false,
          rejectionReason: `Line difference ${diff.toFixed(
            2
          )} exceeds tolerance ${this.lineTolerance} (PM: ${pmLine}, Kalshi: ${kalLine})`,
          filterStepFailed: "line",
          polymarketMarket: polymarket,
          kalshiMarket: kalshi,
        };
      }
    }

    // ALL FILTERS PASSED
    return {
      isMatch: true,
      rejectionReason: null,
      filterStepFailed: null,
      polymarketMarket: polymarket,
      kalshiMarket: kalshi,
    };
  }

  /**
   * Temporal Filter
   * Returns true if markets are within temporal threshold
   */
  private temporalFilter(m1: NormalizedMarket, m2: NormalizedMarket): boolean {
    const drift = Math.abs(m1.commenceTime - m2.commenceTime);
    return drift <= this.temporalThreshold;
  }

  /**
   * Type Filter
   * Returns true if market categories match exactly
   */
  private typeFilter(m1: NormalizedMarket, m2: NormalizedMarket): boolean {
    return m1.marketCategory === m2.marketCategory;
  }

  /**
   * Entity Filter
   * Returns true if primary entities match exactly (100% intersection)
   *
   * Note: Aliases are already resolved in NormalizedMarket,
   * so we can do simple string equality
   */
  private entityFilter(m1: NormalizedMarket, m2: NormalizedMarket): boolean {
    return m1.primaryEntity === m2.primaryEntity;
  }

  /**
   * Line Filter
   * Returns true if line values are within tolerance
   *
   * Handles null line values (shouldn't happen for SPREAD/TOTAL due to validation)
   */
  private lineFilter(m1: NormalizedMarket, m2: NormalizedMarket): boolean {
    // Both markets should have line values if we're in this filter
    if (m1.lineValue === null || m2.lineValue === null) {
      return false;
    }

    const diff = Math.abs(m1.lineValue - m2.lineValue);
    return diff <= this.lineTolerance;
  }

  /**
   * Batch match multiple Polymarket markets against multiple Kalshi markets
   *
   * @param polymarkets Array of normalized Polymarket markets
   * @param kalshis Array of normalized Kalshi markets
   * @returns Array of successful matches
   */
  batchMatch(
    polymarkets: NormalizedMarket[],
    kalshis: NormalizedMarket[]
  ): MatchResult[] {
    const matches: MatchResult[] = [];
    const rejections: MatchResult[] = [];

    for (const pm of polymarkets) {
      for (const kal of kalshis) {
        const result = this.match(pm, kal);
        if (result.isMatch) {
          matches.push(result);
        } else {
          rejections.push(result);
        }
      }
    }

    // Log rejections for debugging
    if (rejections.length > 0) {
      console.log(`[WATERFALL] ${rejections.length} rejections:`);
      const rejectionsByReason = this.groupBy(
        rejections,
        (r) => r.filterStepFailed!
      );
      for (const [step, rejects] of Object.entries(rejectionsByReason)) {
        console.log(`  ${step}: ${rejects.length}`);
      }
    }

    console.log(`[WATERFALL] ${matches.length} successful matches`);
    return matches;
  }

  /**
   * Helper to group results by a key
   */
  private groupBy<T>(
    items: T[],
    keyFn: (item: T) => string
  ): Record<string, T[]> {
    return items.reduce((acc, item) => {
      const key = keyFn(item);
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    }, {} as Record<string, T[]>);
  }
}
