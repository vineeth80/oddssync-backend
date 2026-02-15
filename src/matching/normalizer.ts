/**
 * MarketNormalizer - Transforms raw API data into NormalizedMarket objects.
 *
 * Responsibilities:
 * 1. Parse Polymarket and Kalshi API responses
 * 2. Detect and reject parlay markets
 * 3. Resolve entity aliases to canonical names (e.g., "Longhorns" -> "Texas")
 * 4. Detect market category from title/structure
 * 5. Extract line values for SPREAD/TOTAL markets
 */

import { MarketCategory, NormalizedMarket } from "./models";

/**
 * Raw market data from Polymarket API
 */
export interface PolymarketRawMarket {
  id: string;
  title: string;
  commence_time?: number;
  // Add other Polymarket-specific fields as needed
}

/**
 * Raw market data from Kalshi API
 */
export interface KalshiRawMarket {
  ticker: string;
  title: string;
  expiration_time?: number;
  // Add other Kalshi-specific fields as needed
}

/**
 * Entity alias mapping configuration
 * Maps alternative names to canonical entity names
 *
 * Example:
 * {
 *   "Longhorns": "Texas",
 *   "UT": "Texas",
 *   "Sooners": "Oklahoma"
 * }
 */
export type EntityAliasMap = Record<string, string>;

/**
 * Parlay detection keywords
 * Markets containing these patterns are automatically rejected
 */
const PARLAY_KEYWORDS = [
  "parlay",
  "multi-leg",
  "combo",
  "3-leg",
  "4-leg",
  "5-leg",
  "same game parlay",
  "sgp",
];

/**
 * Market category detection patterns
 */
const CATEGORY_PATTERNS = {
  spread: /spread|point spread|-\d+\.?\d*|\+\d+\.?\d*/i,
  total: /total|over\/under|o\/u|over|under/i,
  moneyline: /winner|moneyline|ml|to win/i,
  prop: /prop|first to score|anytime|touchdown|over \d+\.?\d* |under \d+\.?\d* /i,
};

export class MarketNormalizer {
  private entityAliasMap: EntityAliasMap;

  constructor(entityAliasMap: EntityAliasMap = {}) {
    this.entityAliasMap = entityAliasMap;
  }

  /**
   * Normalize a Polymarket market
   * Returns null if market is invalid (parlay, malformed data, etc.)
   */
  normalizePolymarket(raw: PolymarketRawMarket): NormalizedMarket | null {
    try {
      // Step 1: Parlay detection
      if (this.isParlay(raw.title)) {
        console.log(`[REJECTED] Parlay detected: ${raw.title}`);
        return null;
      }

      // Step 2: Extract entities
      const entities = this.extractEntities(raw.title);
      if (!entities) {
        console.log(`[REJECTED] Could not extract entities: ${raw.title}`);
        return null;
      }

      // Step 3: Resolve aliases
      const primaryEntity = this.resolveEntity(entities.primary);
      const secondaryEntity = entities.secondary
        ? this.resolveEntity(entities.secondary)
        : null;

      // Step 4: Detect category
      const category = this.detectCategory(raw.title);

      // Step 5: Extract line value
      const lineValue = this.extractLineValue(raw.title, category);

      // Step 6: Get commence time (default to current time + 24h if missing)
      const commenceTime = raw.commence_time || Math.floor(Date.now() / 1000) + 86400;

      // Step 7: Construct NormalizedMarket (will throw if parlay flag is true)
      return new NormalizedMarket({
        marketId: raw.id,
        source: "polymarket",
        primaryEntity,
        secondaryEntity,
        marketCategory: category,
        lineValue,
        isParlay: false, // Already filtered above
        commenceTime,
        rawTitle: raw.title,
      });
    } catch (error) {
      console.error(`[ERROR] Failed to normalize Polymarket market: ${raw.title}`, error);
      return null;
    }
  }

  /**
   * Normalize a Kalshi market
   * Returns null if market is invalid
   */
  normalizeKalshi(raw: KalshiRawMarket): NormalizedMarket | null {
    try {
      // Step 1: Parlay detection
      if (this.isParlay(raw.title)) {
        console.log(`[REJECTED] Parlay detected: ${raw.title}`);
        return null;
      }

      // Step 2: Extract entities
      const entities = this.extractEntities(raw.title);
      if (!entities) {
        console.log(`[REJECTED] Could not extract entities: ${raw.title}`);
        return null;
      }

      // Step 3: Resolve aliases
      const primaryEntity = this.resolveEntity(entities.primary);
      const secondaryEntity = entities.secondary
        ? this.resolveEntity(entities.secondary)
        : null;

      // Step 4: Detect category
      const category = this.detectCategory(raw.title);

      // Step 5: Extract line value
      const lineValue = this.extractLineValue(raw.title, category);

      // Step 6: Get commence time
      const commenceTime = raw.expiration_time || Math.floor(Date.now() / 1000) + 86400;

      return new NormalizedMarket({
        marketId: raw.ticker,
        source: "kalshi",
        primaryEntity,
        secondaryEntity,
        marketCategory: category,
        lineValue,
        isParlay: false,
        commenceTime,
        rawTitle: raw.title,
      });
    } catch (error) {
      console.error(`[ERROR] Failed to normalize Kalshi market: ${raw.title}`, error);
      return null;
    }
  }

  /**
   * Detect if a market title contains parlay keywords or patterns
   */
  private isParlay(title: string): boolean {
    const lowerTitle = title.toLowerCase();

    // Check for explicit parlay keywords
    if (PARLAY_KEYWORDS.some((keyword) => lowerTitle.includes(keyword))) {
      return true;
    }

    // Check for multiple game indicators (multiple "vs" or "@" = parlay)
    const vsCount = (lowerTitle.match(/\svs\s/g) || []).length;
    const atCount = (lowerTitle.match(/\s@\s/g) || []).length;
    if (vsCount > 1 || atCount > 1 || (vsCount > 0 && atCount > 0)) {
      return true;
    }

    // Check for betting notation with "&" between distinct propositions
    // Pattern: "Team A ML & Team B +5.5" or "Over 50 & Chiefs win"
    if (lowerTitle.includes(" & ") || lowerTitle.includes(" + ")) {
      // Only flag as parlay if it looks like multiple betting props
      // (has betting terms like ML, spread notation, over/under)
      const hasBettingTerms = /\b(ml|moneyline|spread|\+\d+|-\d+|over|under)\b/i.test(lowerTitle);
      if (hasBettingTerms && (lowerTitle.includes(" & ") || lowerTitle.includes(" + "))) {
        return true;
      }
    }

    // FIX #2: Kalshi comma-separated parlays
    // Pattern: "yes Team1,yes Team2,yes Team3" or "no Over 2.5,yes Under 1.5"
    // Count occurrences of "yes " or "no " - if more than 2, it's a parlay
    const yesCount = (title.match(/\byes\s/gi) || []).length;
    const noCount = (title.match(/\bno\s/gi) || []).length;
    if (yesCount + noCount > 2) {
      return true;
    }

    // Also check for multiple commas indicating list of selections
    const commaCount = (title.match(/,/g) || []).length;
    if (commaCount >= 3) {
      return true;
    }

    return false;
  }

  /**
   * Extract primary and secondary entities from market title
   * Returns null if entities cannot be extracted
   */
  private extractEntities(title: string): { primary: string; secondary: string | null } | null {
    // Pattern 1: "Team A vs Team B"
    let match = title.match(/^([^-]+?)\s+vs\.?\s+([^-]+?)(?:\s+-|$)/i);
    if (match) {
      return {
        primary: match[1].trim(),
        secondary: match[2].trim(),
      };
    }

    // Pattern 2: "Team A - Category" (no opponent)
    match = title.match(/^([^-]+?)\s+-\s+/);
    if (match) {
      return {
        primary: match[1].trim(),
        secondary: null,
      };
    }

    // Pattern 3: "Team A to win" or "Team A ML"
    match = title.match(/^([^-]+?)\s+(to win|ml|moneyline)/i);
    if (match) {
      return {
        primary: match[1].trim(),
        secondary: null,
      };
    }

    // Pattern 4: Just the team name (prop markets)
    const firstPart = title.split(/[-:]/).map(s => s.trim())[0];
    if (firstPart && firstPart.length > 2) {
      return {
        primary: firstPart,
        secondary: null,
      };
    }

    return null;
  }

  /**
   * Resolve entity alias to canonical name
   */
  private resolveEntity(rawEntity: string): string {
    return this.entityAliasMap[rawEntity] || rawEntity;
  }

  /**
   * Detect market category from title
   * For SPREAD/TOTAL, only classify if line value can be extracted
   */
  private detectCategory(title: string): MarketCategory {
    // Check for SPREAD with explicit line value
    if (CATEGORY_PATTERNS.spread.test(title)) {
      // Only classify as SPREAD if we can extract a line value
      const lineValue = this.extractLineValue(title, MarketCategory.SPREAD);
      if (lineValue !== null) {
        return MarketCategory.SPREAD;
      }
    }

    // Check for TOTAL with explicit line value
    if (CATEGORY_PATTERNS.total.test(title)) {
      const lineValue = this.extractLineValue(title, MarketCategory.TOTAL);
      if (lineValue !== null) {
        return MarketCategory.TOTAL;
      }
    }

    // Check for PROP
    if (CATEGORY_PATTERNS.prop.test(title)) {
      return MarketCategory.PROP;
    }

    // Default to MONEYLINE
    return MarketCategory.MONEYLINE;
  }

  /**
   * Extract line value from title (for SPREAD/TOTAL markets)
   */
  private extractLineValue(title: string, category: MarketCategory): number | null {
    if (category !== MarketCategory.SPREAD && category !== MarketCategory.TOTAL) {
      return null;
    }

    if (category === MarketCategory.SPREAD) {
      // Pattern for SPREAD: "-7.5" or "+7.5" (must have +/- sign)
      const match = title.match(/([+-]\d+\.?\d*)/);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    if (category === MarketCategory.TOTAL) {
      // Pattern 1: "over 52.5" or "under 52.5"
      let match = title.match(/(?:over|under)\s+(\d+\.?\d*)/i);
      if (match) {
        return parseFloat(match[1]);
      }

      // Pattern 2: "Total 52.5" or "Total Points 52.5"
      match = title.match(/total\s+(?:points?\s+)?(\d+\.?\d*)/i);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    return null;
  }
}
