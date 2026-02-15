/**
 * Integration tests - End-to-end testing with realistic API data
 *
 * Tests the full pipeline from raw API responses to match results.
 */

import { MarketNormalizer } from "../src/matching/normalizer";
import { WaterfallFilter } from "../src/matching/filter";
import { ALL_SPORTS_ALIASES } from "../src/config/entity-aliases";
import { MarketCategory } from "../src/matching/models";

describe("Integration Tests", () => {
  const normalizer = new MarketNormalizer(ALL_SPORTS_ALIASES);
  const filter = new WaterfallFilter({
    temporalThresholdSeconds: 3600,
    lineTolerance: 0.5,
  });

  describe("College Football Scenarios", () => {
    it("should match identical MONEYLINE markets with alias resolution", () => {
      // Polymarket uses nickname, Kalshi uses full name
      const polymarket = {
        id: "pm_cfb_1",
        title: "Longhorns vs Sooners - Winner",
        commence_time: 1700000000,
      };

      const kalshi = {
        ticker: "KX-TEXAS-OK",
        title: "Texas vs Oklahoma - To Win",
        expiration_time: 1700000000,
      };

      const pmNorm = normalizer.normalizePolymarket(polymarket);
      const kalNorm = normalizer.normalizeKalshi(kalshi);

      expect(pmNorm).not.toBeNull();
      expect(kalNorm).not.toBeNull();

      // Verify alias resolution
      expect(pmNorm!.primaryEntity).toBe("Texas");
      expect(kalNorm!.primaryEntity).toBe("Texas");

      const match = filter.match(pmNorm!, kalNorm!);
      expect(match.isMatch).toBe(true);
    });

    it("should match SPREAD markets with same line value", () => {
      const polymarket = {
        id: "pm_spread_1",
        title: "Alabama -7.5 vs Georgia",
        commence_time: 1700000000,
      };

      const kalshi = {
        ticker: "KX-ALA-GEO",
        title: "Alabama -7.5 vs Georgia",
        expiration_time: 1700000000 + 1800, // 30 min later
      };

      const pmNorm = normalizer.normalizePolymarket(polymarket);
      const kalNorm = normalizer.normalizeKalshi(kalshi);

      expect(pmNorm).not.toBeNull();
      expect(kalNorm).not.toBeNull();
      expect(pmNorm!.marketCategory).toBe(MarketCategory.SPREAD);
      expect(pmNorm!.lineValue).toBe(-7.5);

      const match = filter.match(pmNorm!, kalNorm!);
      expect(match.isMatch).toBe(true);
    });

    it("should match TOTAL markets with close line values", () => {
      const polymarket = {
        id: "pm_total_1",
        title: "Ohio State vs Michigan - Over 52.5",
        commence_time: 1700000000,
      };

      const kalshi = {
        ticker: "KX-OSU-MICH",
        title: "Ohio St vs Michigan - Over 52.5",
        expiration_time: 1700000000,
      };

      const pmNorm = normalizer.normalizePolymarket(polymarket);
      const kalNorm = normalizer.normalizeKalshi(kalshi);

      expect(pmNorm).not.toBeNull();
      expect(kalNorm).not.toBeNull();
      expect(pmNorm!.marketCategory).toBe(MarketCategory.TOTAL);

      const match = filter.match(pmNorm!, kalNorm!);
      expect(match.isMatch).toBe(true);
    });

    it("should reject parlay markets at normalization", () => {
      const polymarket = {
        id: "pm_parlay_cfb",
        title: "3-leg parlay: Texas ML + Alabama ML + Georgia ML",
        commence_time: 1700000000,
      };

      const kalshi = {
        ticker: "KX-TEXAS",
        title: "Texas to win",
        expiration_time: 1700000000,
      };

      const pmNorm = normalizer.normalizePolymarket(polymarket);
      const kalNorm = normalizer.normalizeKalshi(kalshi);

      // Polymarket parlay should be rejected
      expect(pmNorm).toBeNull();
      expect(kalNorm).not.toBeNull();
    });
  });

  describe("NFL Scenarios", () => {
    it("should match NFL markets with team abbreviations", () => {
      const polymarket = {
        id: "pm_nfl_1",
        title: "Chiefs vs Bills - Winner",
        commence_time: 1700000000,
      };

      const kalshi = {
        ticker: "KX-KC-BUF",
        title: "Kansas City Chiefs vs Buffalo Bills",
        expiration_time: 1700000000 + 600, // 10 min later
      };

      const pmNorm = normalizer.normalizePolymarket(polymarket);
      const kalNorm = normalizer.normalizeKalshi(kalshi);

      expect(pmNorm).not.toBeNull();
      expect(kalNorm).not.toBeNull();

      // Verify alias resolution
      expect(pmNorm!.primaryEntity).toBe("Kansas City Chiefs");
      expect(kalNorm!.primaryEntity).toBe("Kansas City Chiefs");

      const match = filter.match(pmNorm!, kalNorm!);
      expect(match.isMatch).toBe(true);
    });

    it("should reject mismatched NFL teams", () => {
      const polymarket = {
        id: "pm_nfl_2",
        title: "49ers vs Eagles - Winner",
        commence_time: 1700000000,
      };

      const kalshi = {
        ticker: "KX-DAL-GB",
        title: "Cowboys vs Packers - Winner",
        expiration_time: 1700000000,
      };

      const pmNorm = normalizer.normalizePolymarket(polymarket);
      const kalNorm = normalizer.normalizeKalshi(kalshi);

      expect(pmNorm).not.toBeNull();
      expect(kalNorm).not.toBeNull();

      const match = filter.match(pmNorm!, kalNorm!);
      expect(match.isMatch).toBe(false);
      expect(match.filterStepFailed).toBe("entity");
    });
  });

  describe("NBA Scenarios", () => {
    it("should match NBA markets with team nicknames", () => {
      const polymarket = {
        id: "pm_nba_1",
        title: "Lakers vs Celtics - Winner",
        commence_time: 1700000000,
      };

      const kalshi = {
        ticker: "KX-LAL-BOS",
        title: "Los Angeles Lakers vs Boston Celtics",
        expiration_time: 1700000000,
      };

      const pmNorm = normalizer.normalizePolymarket(polymarket);
      const kalNorm = normalizer.normalizeKalshi(kalshi);

      expect(pmNorm).not.toBeNull();
      expect(kalNorm).not.toBeNull();

      expect(pmNorm!.primaryEntity).toBe("Los Angeles Lakers");
      expect(kalNorm!.primaryEntity).toBe("Los Angeles Lakers");

      const match = filter.match(pmNorm!, kalNorm!);
      expect(match.isMatch).toBe(true);
    });

    it("should handle LA market disambiguation", () => {
      const polymarket = {
        id: "pm_nba_2",
        title: "Lakers vs Clippers - Winner",
        commence_time: 1700000000,
      };

      const kalshi = {
        ticker: "KX-LAL-LAC",
        title: "LA Lakers vs LA Clippers",
        expiration_time: 1700000000,
      };

      const pmNorm = normalizer.normalizePolymarket(polymarket);
      const kalNorm = normalizer.normalizeKalshi(kalshi);

      expect(pmNorm).not.toBeNull();
      expect(kalNorm).not.toBeNull();

      // Both should resolve to "Los Angeles Lakers"
      expect(pmNorm!.primaryEntity).toBe("Los Angeles Lakers");
      expect(kalNorm!.primaryEntity).toBe("Los Angeles Lakers");

      const match = filter.match(pmNorm!, kalNorm!);
      expect(match.isMatch).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should reject markets with temporal drift beyond threshold", () => {
      const polymarket = {
        id: "pm_edge_1",
        title: "Texas vs Oklahoma - Winner",
        commence_time: 1700000000,
      };

      const kalshi = {
        ticker: "KX-TX-OK",
        title: "Texas vs Oklahoma - Winner",
        expiration_time: 1700000000 + 7200, // 2 hours later (> 1 hour threshold)
      };

      const pmNorm = normalizer.normalizePolymarket(polymarket);
      const kalNorm = normalizer.normalizeKalshi(kalshi);

      expect(pmNorm).not.toBeNull();
      expect(kalNorm).not.toBeNull();

      const match = filter.match(pmNorm!, kalNorm!);
      expect(match.isMatch).toBe(false);
      expect(match.filterStepFailed).toBe("temporal");
    });

    it("should reject SPREAD markets with line drift beyond tolerance", () => {
      const polymarket = {
        id: "pm_edge_2",
        title: "Alabama -7.5 vs Georgia",
        commence_time: 1700000000,
      };

      const kalshi = {
        ticker: "KX-ALA-GEO",
        title: "Alabama -3.5 vs Georgia", // 4 point difference
        expiration_time: 1700000000,
      };

      const pmNorm = normalizer.normalizePolymarket(polymarket);
      const kalNorm = normalizer.normalizeKalshi(kalshi);

      expect(pmNorm).not.toBeNull();
      expect(kalNorm).not.toBeNull();

      const match = filter.match(pmNorm!, kalNorm!);
      expect(match.isMatch).toBe(false);
      expect(match.filterStepFailed).toBe("line");
    });

    it("should reject MONEYLINE vs SPREAD type mismatch", () => {
      const polymarket = {
        id: "pm_edge_3",
        title: "Texas vs Oklahoma - Winner",
        commence_time: 1700000000,
      };

      const kalshi = {
        ticker: "KX-TX-OK",
        title: "Texas -7.5 vs Oklahoma",
        expiration_time: 1700000000,
      };

      const pmNorm = normalizer.normalizePolymarket(polymarket);
      const kalNorm = normalizer.normalizeKalshi(kalshi);

      expect(pmNorm).not.toBeNull();
      expect(kalNorm).not.toBeNull();
      expect(pmNorm!.marketCategory).toBe(MarketCategory.MONEYLINE);
      expect(kalNorm!.marketCategory).toBe(MarketCategory.SPREAD);

      const match = filter.match(pmNorm!, kalNorm!);
      expect(match.isMatch).toBe(false);
      expect(match.filterStepFailed).toBe("type");
    });
  });

  describe("Batch Matching", () => {
    it("should efficiently match multiple markets", () => {
      const polymarkets = [
        {
          id: "pm_batch_1",
          title: "Texas vs Oklahoma - Winner",
          commence_time: 1700000000,
        },
        {
          id: "pm_batch_2",
          title: "Alabama vs Georgia - Winner",
          commence_time: 1700000000,
        },
        {
          id: "pm_batch_3",
          title: "Ohio State vs Michigan - Winner",
          commence_time: 1700000000,
        },
      ];

      const kalshis = [
        {
          ticker: "KX-TX-OK",
          title: "Texas vs Oklahoma - To Win",
          expiration_time: 1700000000,
        },
        {
          ticker: "KX-ALA-GEO",
          title: "Alabama vs Georgia - To Win",
          expiration_time: 1700000000,
        },
        {
          ticker: "KX-FLORIDA",
          title: "Florida vs LSU - To Win", // No match
          expiration_time: 1700000000,
        },
      ];

      const pmNormalized = polymarkets
        .map((pm) => normalizer.normalizePolymarket(pm))
        .filter((m) => m !== null);

      const kalNormalized = kalshis
        .map((kal) => normalizer.normalizeKalshi(kal))
        .filter((m) => m !== null);

      const matches = filter.batchMatch(pmNormalized, kalNormalized);

      // Should match 2 out of 3x3 = 9 combinations (Texas and Alabama)
      expect(matches.length).toBe(2);
      expect(matches[0].polymarketMarket.primaryEntity).toBe("Texas");
      expect(matches[1].polymarketMarket.primaryEntity).toBe("Alabama");
    });
  });
});
