/**
 * Unit tests for core data models (NormalizedMarket, MarketCategory).
 *
 * Tests validation logic and business rules:
 * - Parlay rejection
 * - Line value requirements for SPREAD/TOTAL
 * - Source validation
 */

import { MarketCategory, NormalizedMarket } from "../src/matching/models";

describe("MarketCategory", () => {
  it("should have all expected enum values", () => {
    expect(MarketCategory.MONEYLINE).toBe("MONEYLINE");
    expect(MarketCategory.SPREAD).toBe("SPREAD");
    expect(MarketCategory.TOTAL).toBe("TOTAL");
    expect(MarketCategory.PROP).toBe("PROP");
  });
});

describe("NormalizedMarket", () => {
  describe("Valid Markets", () => {
    it("should construct valid MONEYLINE market", () => {
      const market = new NormalizedMarket({
        marketId: "pm_123",
        source: "polymarket",
        primaryEntity: "Texas",
        secondaryEntity: "Oklahoma",
        marketCategory: MarketCategory.MONEYLINE,
        lineValue: null,
        isParlay: false,
        commenceTime: 1700000000,
        rawTitle: "Texas vs Oklahoma - Winner",
      });

      expect(market.primaryEntity).toBe("Texas");
      expect(market.toString()).toBe("[polymarket] Texas vs Oklahoma - MONEYLINE");
    });

    it("should construct valid SPREAD market with line value", () => {
      const market = new NormalizedMarket({
        marketId: "kal_456",
        source: "kalshi",
        primaryEntity: "Texas",
        secondaryEntity: "Oklahoma",
        marketCategory: MarketCategory.SPREAD,
        lineValue: -7.5,
        isParlay: false,
        commenceTime: 1700000000,
        rawTitle: "Texas -7.5 vs Oklahoma",
      });

      expect(market.lineValue).toBe(-7.5);
      expect(market.toString()).toBe("[kalshi] Texas vs Oklahoma - SPREAD -7.5");
    });

    it("should construct valid TOTAL market with line value", () => {
      const market = new NormalizedMarket({
        marketId: "pm_789",
        source: "polymarket",
        primaryEntity: "Texas",
        secondaryEntity: "Oklahoma",
        marketCategory: MarketCategory.TOTAL,
        lineValue: 52.5,
        isParlay: false,
        commenceTime: 1700000000,
        rawTitle: "Texas vs Oklahoma - Over 52.5",
      });

      expect(market.lineValue).toBe(52.5);
      expect(market.toString()).toBe("[polymarket] Texas vs Oklahoma - TOTAL 52.5");
    });

    it("should construct valid PROP market", () => {
      const market = new NormalizedMarket({
        marketId: "kal_101",
        source: "kalshi",
        primaryEntity: "Patrick Mahomes",
        secondaryEntity: null,
        marketCategory: MarketCategory.PROP,
        lineValue: null,
        isParlay: false,
        commenceTime: 1700000000,
        rawTitle: "Patrick Mahomes to throw 3+ TDs",
      });

      expect(market.secondaryEntity).toBeNull();
      expect(market.toString()).toBe("[kalshi] Patrick Mahomes - PROP");
    });
  });

  describe("Validation Rules", () => {
    it("should throw error when SPREAD market missing line value", () => {
      expect(() => {
        new NormalizedMarket({
          marketId: "pm_bad1",
          source: "polymarket",
          primaryEntity: "Texas",
          secondaryEntity: "Oklahoma",
          marketCategory: MarketCategory.SPREAD,
          lineValue: null, // Missing!
          isParlay: false,
          commenceTime: 1700000000,
          rawTitle: "Texas vs Oklahoma - Spread",
        });
      }).toThrow("SPREAD markets require lineValue");
    });

    it("should throw error when TOTAL market missing line value", () => {
      expect(() => {
        new NormalizedMarket({
          marketId: "kal_bad2",
          source: "kalshi",
          primaryEntity: "Texas",
          secondaryEntity: "Oklahoma",
          marketCategory: MarketCategory.TOTAL,
          lineValue: null, // Missing!
          isParlay: false,
          commenceTime: 1700000000,
          rawTitle: "Texas vs Oklahoma - Total",
        });
      }).toThrow("TOTAL markets require lineValue");
    });

    it("should throw error for parlay markets (hard rejection)", () => {
      expect(() => {
        new NormalizedMarket({
          marketId: "pm_parlay",
          source: "polymarket",
          primaryEntity: "Texas",
          secondaryEntity: null,
          marketCategory: MarketCategory.MONEYLINE,
          lineValue: null,
          isParlay: true, // REJECTED!
          commenceTime: 1700000000,
          rawTitle: "3-leg parlay: Texas ML + Oklahoma ML + Alabama ML",
        });
      }).toThrow("Parlay markets cannot be normalized");
    });

    it("should throw error for negative commence time", () => {
      expect(() => {
        new NormalizedMarket({
          marketId: "pm_bad3",
          source: "polymarket",
          primaryEntity: "Texas",
          secondaryEntity: "Oklahoma",
          marketCategory: MarketCategory.MONEYLINE,
          lineValue: null,
          isParlay: false,
          commenceTime: -1, // Invalid!
          rawTitle: "Texas vs Oklahoma",
        });
      }).toThrow("Commence time must be positive");
    });

    it("should throw error for zero commence time", () => {
      expect(() => {
        new NormalizedMarket({
          marketId: "pm_bad4",
          source: "polymarket",
          primaryEntity: "Texas",
          secondaryEntity: "Oklahoma",
          marketCategory: MarketCategory.MONEYLINE,
          lineValue: null,
          isParlay: false,
          commenceTime: 0, // Invalid!
          rawTitle: "Texas vs Oklahoma",
        });
      }).toThrow("Commence time must be positive");
    });
  });

  describe("Immutability", () => {
    it("should have readonly properties enforced by TypeScript", () => {
      const market = new NormalizedMarket({
        marketId: "pm_readonly",
        source: "polymarket",
        primaryEntity: "Texas",
        secondaryEntity: "Oklahoma",
        marketCategory: MarketCategory.MONEYLINE,
        lineValue: null,
        isParlay: false,
        commenceTime: 1700000000,
        rawTitle: "Texas vs Oklahoma",
      });

      // TypeScript enforces readonly at compile time
      // Verify properties exist and are accessible
      expect(market.primaryEntity).toBe("Texas");
      expect(market.marketId).toBe("pm_readonly");
    });
  });
});
