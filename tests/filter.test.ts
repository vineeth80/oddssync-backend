/**
 * Unit tests for WaterfallFilter
 *
 * Tests each filter stage:
 * - Temporal filter
 * - Type filter
 * - Entity filter
 * - Line filter
 *
 * And batch matching behavior
 */

import { WaterfallFilter } from "../src/matching/filter";
import { MarketCategory, NormalizedMarket } from "../src/matching/models";

describe("WaterfallFilter", () => {
  const BASE_TIME = 1700000000;

  // Helper to create test markets
  const createMarket = (overrides: Partial<ConstructorParameters<typeof NormalizedMarket>[0]>) => {
    return new NormalizedMarket({
      marketId: "test_id",
      source: "polymarket",
      primaryEntity: "Texas",
      secondaryEntity: "Oklahoma",
      marketCategory: MarketCategory.MONEYLINE,
      lineValue: null,
      isParlay: false,
      commenceTime: BASE_TIME,
      rawTitle: "Test Market",
      ...overrides,
    });
  };

  describe("Temporal Filter", () => {
    const filter = new WaterfallFilter({ temporalThresholdSeconds: 3600 });

    it("should match markets within temporal threshold", () => {
      const pm = createMarket({
        source: "polymarket",
        commenceTime: BASE_TIME,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_1",
        commenceTime: BASE_TIME + 1800, // 30 min later
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(true);
    });

    it("should reject markets beyond temporal threshold", () => {
      const pm = createMarket({
        source: "polymarket",
        commenceTime: BASE_TIME,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_2",
        commenceTime: BASE_TIME + 7200, // 2 hours later (> 3600s threshold)
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(false);
      expect(result.filterStepFailed).toBe("temporal");
      expect(result.rejectionReason).toContain("Temporal drift");
    });

    it("should work with negative time drift", () => {
      const pm = createMarket({
        source: "polymarket",
        commenceTime: BASE_TIME + 7200,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_3",
        commenceTime: BASE_TIME, // 2 hours earlier
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(false);
      expect(result.filterStepFailed).toBe("temporal");
    });

    it("should accept markets at exact threshold boundary", () => {
      const pm = createMarket({
        source: "polymarket",
        commenceTime: BASE_TIME,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_4",
        commenceTime: BASE_TIME + 3600, // Exactly at threshold
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(true);
    });
  });

  describe("Type Filter", () => {
    const filter = new WaterfallFilter();

    it("should match markets with same category", () => {
      const pm = createMarket({
        source: "polymarket",
        marketCategory: MarketCategory.MONEYLINE,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_5",
        marketCategory: MarketCategory.MONEYLINE,
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(true);
    });

    it("should reject markets with different categories", () => {
      const pm = createMarket({
        source: "polymarket",
        marketCategory: MarketCategory.MONEYLINE,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_6",
        marketCategory: MarketCategory.PROP,
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(false);
      expect(result.filterStepFailed).toBe("type");
      expect(result.rejectionReason).toContain("Category mismatch");
    });

    it("should reject MONEYLINE vs SPREAD mismatch", () => {
      const pm = createMarket({
        source: "polymarket",
        marketCategory: MarketCategory.MONEYLINE,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_7",
        marketCategory: MarketCategory.SPREAD,
        lineValue: -7.5,
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(false);
      expect(result.filterStepFailed).toBe("type");
    });
  });

  describe("Entity Filter", () => {
    const filter = new WaterfallFilter();

    it("should match markets with same primary entity", () => {
      const pm = createMarket({
        source: "polymarket",
        primaryEntity: "Texas",
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_8",
        primaryEntity: "Texas",
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(true);
    });

    it("should reject markets with different primary entities", () => {
      const pm = createMarket({
        source: "polymarket",
        primaryEntity: "Texas",
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_9",
        primaryEntity: "Alabama",
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(false);
      expect(result.filterStepFailed).toBe("entity");
      expect(result.rejectionReason).toContain("Primary entity mismatch");
    });

    it("should be case-sensitive for entity matching", () => {
      const pm = createMarket({
        source: "polymarket",
        primaryEntity: "Texas",
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_10",
        primaryEntity: "texas", // lowercase
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(false);
      expect(result.filterStepFailed).toBe("entity");
    });
  });

  describe("Line Filter", () => {
    const filter = new WaterfallFilter({ lineTolerance: 0.5 });

    it("should match SPREAD markets with same line", () => {
      const pm = createMarket({
        source: "polymarket",
        marketCategory: MarketCategory.SPREAD,
        lineValue: -7.5,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_11",
        marketCategory: MarketCategory.SPREAD,
        lineValue: -7.5,
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(true);
    });

    it("should match SPREAD markets within line tolerance", () => {
      const pm = createMarket({
        source: "polymarket",
        marketCategory: MarketCategory.SPREAD,
        lineValue: -7.5,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_12",
        marketCategory: MarketCategory.SPREAD,
        lineValue: -7.0, // 0.5 difference (at tolerance)
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(true);
    });

    it("should reject SPREAD markets beyond line tolerance", () => {
      const pm = createMarket({
        source: "polymarket",
        marketCategory: MarketCategory.SPREAD,
        lineValue: -7.5,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_13",
        marketCategory: MarketCategory.SPREAD,
        lineValue: -6.5, // 1.0 difference (> 0.5 tolerance)
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(false);
      expect(result.filterStepFailed).toBe("line");
      expect(result.rejectionReason).toContain("Line difference");
    });

    it("should match TOTAL markets within tolerance", () => {
      const pm = createMarket({
        source: "polymarket",
        marketCategory: MarketCategory.TOTAL,
        lineValue: 52.5,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_14",
        marketCategory: MarketCategory.TOTAL,
        lineValue: 52.5,
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(true);
    });

    it("should not apply line filter to MONEYLINE markets", () => {
      const pm = createMarket({
        source: "polymarket",
        marketCategory: MarketCategory.MONEYLINE,
        lineValue: null,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_15",
        marketCategory: MarketCategory.MONEYLINE,
        lineValue: null,
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(true);
      // Line filter should not be reached
    });

    it("should not apply line filter to PROP markets", () => {
      const pm = createMarket({
        source: "polymarket",
        marketCategory: MarketCategory.PROP,
        lineValue: null,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_16",
        marketCategory: MarketCategory.PROP,
        lineValue: null,
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(true);
    });
  });

  describe("Waterfall Priority", () => {
    const filter = new WaterfallFilter({
      temporalThresholdSeconds: 3600,
      lineTolerance: 0.5,
    });

    it("should fail at temporal filter even if other filters would pass", () => {
      const pm = createMarket({
        source: "polymarket",
        commenceTime: BASE_TIME,
        primaryEntity: "Texas",
        marketCategory: MarketCategory.MONEYLINE,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_17",
        commenceTime: BASE_TIME + 7200, // Temporal failure
        primaryEntity: "Texas",
        marketCategory: MarketCategory.MONEYLINE,
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(false);
      expect(result.filterStepFailed).toBe("temporal"); // Fails first
    });

    it("should fail at type filter if temporal passes", () => {
      const pm = createMarket({
        source: "polymarket",
        commenceTime: BASE_TIME,
        primaryEntity: "Texas",
        marketCategory: MarketCategory.MONEYLINE,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_18",
        commenceTime: BASE_TIME + 1800, // Temporal pass
        primaryEntity: "Texas",
        marketCategory: MarketCategory.SPREAD, // Type failure
        lineValue: -7.5,
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(false);
      expect(result.filterStepFailed).toBe("type");
    });

    it("should fail at entity filter if temporal and type pass", () => {
      const pm = createMarket({
        source: "polymarket",
        commenceTime: BASE_TIME,
        primaryEntity: "Texas",
        marketCategory: MarketCategory.MONEYLINE,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_19",
        commenceTime: BASE_TIME + 1800, // Temporal pass
        primaryEntity: "Alabama", // Entity failure
        marketCategory: MarketCategory.MONEYLINE, // Type pass
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(false);
      expect(result.filterStepFailed).toBe("entity");
    });

    it("should fail at line filter if all other filters pass", () => {
      const pm = createMarket({
        source: "polymarket",
        commenceTime: BASE_TIME,
        primaryEntity: "Texas",
        marketCategory: MarketCategory.SPREAD,
        lineValue: -7.5,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_20",
        commenceTime: BASE_TIME + 1800, // Temporal pass
        primaryEntity: "Texas", // Entity pass
        marketCategory: MarketCategory.SPREAD, // Type pass
        lineValue: -6.0, // Line failure (1.5 difference > 0.5 tolerance)
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(false);
      expect(result.filterStepFailed).toBe("line");
    });
  });

  describe("Batch Matching", () => {
    const filter = new WaterfallFilter();

    it("should find all valid matches in batch", () => {
      const polymarkets = [
        createMarket({
          source: "polymarket",
          marketId: "pm_1",
          primaryEntity: "Texas",
        }),
        createMarket({
          source: "polymarket",
          marketId: "pm_2",
          primaryEntity: "Alabama",
        }),
      ];

      const kalshis = [
        createMarket({
          source: "kalshi",
          marketId: "kal_1",
          primaryEntity: "Texas",
        }),
        createMarket({
          source: "kalshi",
          marketId: "kal_2",
          primaryEntity: "Alabama",
        }),
        createMarket({
          source: "kalshi",
          marketId: "kal_3",
          primaryEntity: "Georgia",
        }),
      ];

      const matches = filter.batchMatch(polymarkets, kalshis);
      expect(matches.length).toBe(2); // Texas and Alabama match
      expect(matches[0].polymarketMarket.primaryEntity).toBe("Texas");
      expect(matches[1].polymarketMarket.primaryEntity).toBe("Alabama");
    });

    it("should handle empty arrays", () => {
      const matches = filter.batchMatch([], []);
      expect(matches.length).toBe(0);
    });

    it("should handle no matches found", () => {
      const polymarkets = [
        createMarket({
          source: "polymarket",
          primaryEntity: "Texas",
        }),
      ];

      const kalshis = [
        createMarket({
          source: "kalshi",
          primaryEntity: "Alabama",
        }),
      ];

      const matches = filter.batchMatch(polymarkets, kalshis);
      expect(matches.length).toBe(0);
    });
  });

  describe("Configuration", () => {
    it("should use default thresholds when not specified", () => {
      const filter = new WaterfallFilter();
      const pm = createMarket({
        source: "polymarket",
        commenceTime: BASE_TIME,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_default",
        commenceTime: BASE_TIME + 3600, // Exactly at default 1 hour threshold
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(true);
    });

    it("should use custom temporal threshold", () => {
      const filter = new WaterfallFilter({ temporalThresholdSeconds: 7200 }); // 2 hours
      const pm = createMarket({
        source: "polymarket",
        commenceTime: BASE_TIME,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_custom",
        commenceTime: BASE_TIME + 5400, // 1.5 hours (within custom threshold)
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(true);
    });

    it("should use custom line tolerance", () => {
      const filter = new WaterfallFilter({ lineTolerance: 1.0 }); // Higher tolerance
      const pm = createMarket({
        source: "polymarket",
        marketCategory: MarketCategory.SPREAD,
        lineValue: -7.5,
      });
      const kal = createMarket({
        source: "kalshi",
        marketId: "kal_custom_line",
        marketCategory: MarketCategory.SPREAD,
        lineValue: -6.5, // 1.0 difference (within custom tolerance)
      });

      const result = filter.match(pm, kal);
      expect(result.isMatch).toBe(true);
    });
  });
});
