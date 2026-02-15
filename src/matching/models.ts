/**
 * Core data models for the Entity Resolution Matching Engine.
 *
 * This module defines the strict type system that eliminates fuzzy matching noise.
 * All markets must be normalized into this schema before entering the matching pipeline.
 */

/**
 * Strict market type classification.
 *
 * Each category has different matching requirements:
 * - MONEYLINE: Win/loss outcome, no line value
 * - SPREAD: Point differential, requires line_value
 * - TOTAL: Over/under scoring, requires line_value
 * - PROP: Proposition bet, no line value (e.g., "Player X scores first")
 */
export enum MarketCategory {
  MONEYLINE = "MONEYLINE",
  SPREAD = "SPREAD",
  TOTAL = "TOTAL",
  PROP = "PROP",
}

/**
 * Strictly-typed market representation.
 *
 * This is the single source of truth for matching. All raw API data
 * must be transformed into this structure via MarketNormalizer.
 *
 * Design principles:
 * - Readonly properties to prevent accidental mutations
 * - Canonical entity names only (aliases resolved upstream)
 * - Hard parlay rejection (constructor throws if is_parlay=true)
 * - Explicit validation in constructor
 */
export class NormalizedMarket {
  // Identifiers
  readonly marketId: string;
  readonly source: "polymarket" | "kalshi";

  // Core Entities (Deterministic Resolution)
  readonly primaryEntity: string;
  readonly secondaryEntity: string | null;

  // Market Classification
  readonly marketCategory: MarketCategory;
  readonly lineValue: number | null;

  // Parlay Filter - HARD REJECTION
  readonly isParlay: boolean;

  // Temporal Data
  readonly commenceTime: number; // Unix timestamp (UTC)

  // Metadata (for debugging/logging)
  readonly rawTitle: string;

  constructor(params: {
    marketId: string;
    source: "polymarket" | "kalshi";
    primaryEntity: string;
    secondaryEntity: string | null;
    marketCategory: MarketCategory;
    lineValue: number | null;
    isParlay: boolean;
    commenceTime: number;
    rawTitle: string;
  }) {
    this.marketId = params.marketId;
    this.source = params.source;
    this.primaryEntity = params.primaryEntity;
    this.secondaryEntity = params.secondaryEntity;
    this.marketCategory = params.marketCategory;
    this.lineValue = params.lineValue;
    this.isParlay = params.isParlay;
    this.commenceTime = params.commenceTime;
    this.rawTitle = params.rawTitle;

    // Validation logic
    this.validate();
  }

  /**
   * Validation logic enforced at construction time.
   *
   * Rules:
   * 1. SPREAD/TOTAL markets MUST have lineValue
   * 2. Parlay markets are NEVER allowed (strategic noise filter)
   * 3. Source must be valid platform
   * 4. Commence time must be positive
   *
   * @throws Error if validation fails
   */
  private validate(): void {
    // Rule 1: Line value validation
    if (
      (this.marketCategory === MarketCategory.SPREAD ||
        this.marketCategory === MarketCategory.TOTAL) &&
      this.lineValue === null
    ) {
      throw new Error(
        `${this.marketCategory} markets require lineValue. Market: ${this.marketId}`
      );
    }

    // Rule 2: Hard parlay rejection
    if (this.isParlay) {
      throw new Error(
        `Parlay markets cannot be normalized (strategic noise filter). ` +
          `Market: ${this.marketId} - '${this.rawTitle}'`
      );
    }

    // Rule 3: Source validation (TypeScript enforces this at compile time)
    // But we still check for runtime safety
    if (this.source !== "polymarket" && this.source !== "kalshi") {
      throw new Error(
        `Invalid source '${this.source}'. Must be 'polymarket' or 'kalshi'`
      );
    }

    // Rule 4: Temporal validation
    if (this.commenceTime <= 0) {
      throw new Error(
        `Commence time must be positive Unix timestamp. Got: ${this.commenceTime}`
      );
    }
  }

  /**
   * Human-readable representation for logging
   */
  toString(): string {
    let entities = this.primaryEntity;
    if (this.secondaryEntity) {
      entities += ` vs ${this.secondaryEntity}`;
    }

    const lineStr = this.lineValue !== null ? ` ${this.lineValue}` : "";
    return `[${this.source}] ${entities} - ${this.marketCategory}${lineStr}`;
  }
}
