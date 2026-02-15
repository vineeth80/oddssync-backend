/**
 * Unit tests for MarketNormalizer
 *
 * Tests:
 * - Parlay detection and rejection
 * - Entity extraction and alias resolution
 * - Category detection (MONEYLINE, SPREAD, TOTAL, PROP)
 * - Line value extraction
 */

import { MarketNormalizer } from "../src/matching/normalizer";
import { MarketCategory } from "../src/matching/models";

describe("MarketNormalizer", () => {
  describe("Parlay Detection", () => {
    const normalizer = new MarketNormalizer();

    it("should reject explicit parlay markets", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_parlay1",
        title: "3-leg parlay: Texas ML + Oklahoma ML + Alabama ML",
        commence_time: 1700000000,
      });

      expect(result).toBeNull();
    });

    it("should reject markets with 'parlay' keyword", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_parlay2",
        title: "Parlay: Texas to win and over 50 points",
        commence_time: 1700000000,
      });

      expect(result).toBeNull();
    });

    it("should reject markets with '+' combinator", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_parlay3",
        title: "Texas ML + Alabama ML",
        commence_time: 1700000000,
      });

      expect(result).toBeNull();
    });

    it("should reject markets with '&' combinator", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_parlay4",
        title: "Texas to win & Over 50.5",
        commence_time: 1700000000,
      });

      expect(result).toBeNull();
    });

    it("should reject 'same game parlay' markets", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_sgp",
        title: "Same Game Parlay: Texas -7 and Over 52",
        commence_time: 1700000000,
      });

      expect(result).toBeNull();
    });
  });

  describe("Entity Extraction", () => {
    const normalizer = new MarketNormalizer();

    it("should extract entities from 'Team A vs Team B' format", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_1",
        title: "Texas vs Oklahoma - Winner",
        commence_time: 1700000000,
      });

      expect(result).not.toBeNull();
      expect(result!.primaryEntity).toBe("Texas");
      expect(result!.secondaryEntity).toBe("Oklahoma");
    });

    it("should extract entities from 'Team A - Category' format", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_2",
        title: "Texas - To Win Championship",
        commence_time: 1700000000,
      });

      expect(result).not.toBeNull();
      expect(result!.primaryEntity).toBe("Texas");
      expect(result!.secondaryEntity).toBeNull();
    });

    it("should extract entity from 'Team A to win' format", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_3",
        title: "Texas to win",
        commence_time: 1700000000,
      });

      expect(result).not.toBeNull();
      expect(result!.primaryEntity).toBe("Texas");
      expect(result!.secondaryEntity).toBeNull();
    });
  });

  describe("Entity Alias Resolution", () => {
    const normalizer = new MarketNormalizer({
      "Longhorns": "Texas",
      "UT": "Texas",
      "Sooners": "Oklahoma",
      "OU": "Oklahoma",
    });

    it("should resolve primary entity alias", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_alias1",
        title: "Longhorns vs Sooners - Winner",
        commence_time: 1700000000,
      });

      expect(result).not.toBeNull();
      expect(result!.primaryEntity).toBe("Texas");
      expect(result!.secondaryEntity).toBe("Oklahoma");
    });

    it("should resolve mixed aliases and canonical names", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_alias2",
        title: "UT vs Oklahoma - Winner",
        commence_time: 1700000000,
      });

      expect(result).not.toBeNull();
      expect(result!.primaryEntity).toBe("Texas");
      expect(result!.secondaryEntity).toBe("Oklahoma");
    });

    it("should pass through entities without aliases", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_alias3",
        title: "Alabama vs Georgia - Winner",
        commence_time: 1700000000,
      });

      expect(result).not.toBeNull();
      expect(result!.primaryEntity).toBe("Alabama");
      expect(result!.secondaryEntity).toBe("Georgia");
    });
  });

  describe("Category Detection", () => {
    const normalizer = new MarketNormalizer();

    it("should detect MONEYLINE markets", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_ml",
        title: "Texas vs Oklahoma - Winner",
        commence_time: 1700000000,
      });

      expect(result).not.toBeNull();
      expect(result!.marketCategory).toBe(MarketCategory.MONEYLINE);
    });

    it("should detect SPREAD markets with negative line", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_spread1",
        title: "Texas -7.5 vs Oklahoma",
        commence_time: 1700000000,
      });

      expect(result).not.toBeNull();
      expect(result!.marketCategory).toBe(MarketCategory.SPREAD);
      expect(result!.lineValue).toBe(-7.5);
    });

    it("should detect SPREAD markets with positive line", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_spread2",
        title: "Oklahoma +7.5 vs Texas",
        commence_time: 1700000000,
      });

      expect(result).not.toBeNull();
      expect(result!.marketCategory).toBe(MarketCategory.SPREAD);
      expect(result!.lineValue).toBe(7.5);
    });

    it("should default to MONEYLINE when spread has no explicit line", () => {
      // Deterministic matching: if we can't extract a line value, default to MONEYLINE
      const result = normalizer.normalizePolymarket({
        id: "pm_spread3",
        title: "Texas vs Oklahoma - Point Spread",
        commence_time: 1700000000,
      });

      expect(result).not.toBeNull();
      expect(result!.marketCategory).toBe(MarketCategory.MONEYLINE);
      expect(result!.lineValue).toBeNull();
    });

    it("should detect TOTAL markets with 'over' keyword", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_total1",
        title: "Texas vs Oklahoma - Over 52.5",
        commence_time: 1700000000,
      });

      expect(result).not.toBeNull();
      expect(result!.marketCategory).toBe(MarketCategory.TOTAL);
      expect(result!.lineValue).toBe(52.5);
    });

    it("should detect TOTAL markets with 'under' keyword", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_total2",
        title: "Texas vs Oklahoma - Under 52.5",
        commence_time: 1700000000,
      });

      expect(result).not.toBeNull();
      expect(result!.marketCategory).toBe(MarketCategory.TOTAL);
      expect(result!.lineValue).toBe(52.5);
    });

    it("should detect TOTAL markets with numeric value after 'total'", () => {
      // Update pattern to extract "Total Points 52.5" format
      const result = normalizer.normalizePolymarket({
        id: "pm_total3",
        title: "Texas vs Oklahoma - Total 52.5 Points",
        commence_time: 1700000000,
      });

      expect(result).not.toBeNull();
      expect(result!.marketCategory).toBe(MarketCategory.TOTAL);
      expect(result!.lineValue).toBe(52.5);
    });

    it("should detect PROP markets", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_prop1",
        title: "Patrick Mahomes - Anytime Touchdown Scorer",
        commence_time: 1700000000,
      });

      expect(result).not.toBeNull();
      expect(result!.marketCategory).toBe(MarketCategory.PROP);
      expect(result!.lineValue).toBeNull();
    });
  });

  describe("Kalshi Normalization", () => {
    const normalizer = new MarketNormalizer({
      "Longhorns": "Texas",
    });

    it("should normalize Kalshi markets", () => {
      const result = normalizer.normalizeKalshi({
        ticker: "KX-TEXAS-WIN",
        title: "Texas vs Oklahoma - Winner",
        expiration_time: 1700000000,
      });

      expect(result).not.toBeNull();
      expect(result!.marketId).toBe("KX-TEXAS-WIN");
      expect(result!.source).toBe("kalshi");
      expect(result!.primaryEntity).toBe("Texas");
    });

    it("should reject Kalshi parlay markets", () => {
      const result = normalizer.normalizeKalshi({
        ticker: "KX-PARLAY",
        title: "Parlay: Texas + Oklahoma",
        expiration_time: 1700000000,
      });

      expect(result).toBeNull();
    });

    it("should resolve aliases in Kalshi markets", () => {
      const result = normalizer.normalizeKalshi({
        ticker: "KX-UT-WIN",
        title: "Longhorns to win",
        expiration_time: 1700000000,
      });

      expect(result).not.toBeNull();
      expect(result!.primaryEntity).toBe("Texas");
    });
  });

  describe("Edge Cases", () => {
    const normalizer = new MarketNormalizer();

    it("should handle markets with missing commence time", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_notime",
        title: "Texas vs Oklahoma - Winner",
        // No commence_time
      });

      expect(result).not.toBeNull();
      expect(result!.commenceTime).toBeGreaterThan(0);
    });

    it("should return null for malformed titles", () => {
      const result = normalizer.normalizePolymarket({
        id: "pm_bad",
        title: "",
        commence_time: 1700000000,
      });

      expect(result).toBeNull();
    });
  });
});
