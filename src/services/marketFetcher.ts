/**
 * Market Fetcher Service
 *
 * Fetches markets from Polymarket and Kalshi APIs,
 * normalizes them, matches them, and calculates arbitrage opportunities.
 */

import { MarketNormalizer } from "../matching/normalizer";
import { WaterfallFilter } from "../matching/filter";
import { ALL_SPORTS_ALIASES } from "../config/entity-aliases";
import type { NormalizedMarket } from "../matching/models";

const normalizer = new MarketNormalizer(ALL_SPORTS_ALIASES);
const filter = new WaterfallFilter({
  temporalThresholdSeconds: 3600,
  lineTolerance: 0.5,
});

// Mock data for now - replace with real API calls
export async function fetchAndMatchMarkets() {
  try {
    // TODO: Replace with real Polymarket API call
    const polymarketMarkets = await fetchPolymarketMarkets();

    // TODO: Replace with real Kalshi API call
    const kalshiMarkets = await fetchKalshiMarkets();

    // Normalize markets
    const pmNormalized = polymarketMarkets
      .map((m) => normalizer.normalizePolymarket(m))
      .filter((m) => m !== null);

    const kalNormalized = kalshiMarkets
      .map((m) => normalizer.normalizeKalshi(m))
      .filter((m) => m !== null);

    console.log(`[FETCHER] Normalized ${pmNormalized.length} Polymarket, ${kalNormalized.length} Kalshi markets`);

    // Match markets
    const matches = filter.batchMatch(pmNormalized, kalNormalized);

    // Calculate arbitrage opportunities
    const marketsWithArb = matches.map((match) => {
      return calculateArbitrage(match.polymarketMarket, match.kalshiMarket);
    });

    return {
      markets: marketsWithArb,
      meta: {
        total: marketsWithArb.length,
        arb_count: marketsWithArb.filter(m => m.arb).length,
        last_refresh: new Date().toISOString(),
        polymarket_count: pmNormalized.length,
        kalshi_count: kalNormalized.length,
        matches_found: matches.length,
      },
    };
  } catch (error) {
    console.error("[FETCHER ERROR]", error);
    throw error;
  }
}

/**
 * Fetch markets from Polymarket API
 * TODO: Replace with real API integration
 */
async function fetchPolymarketMarkets() {
  // Mock data - replace with actual Polymarket API call
  // Example: const response = await fetch('https://gamma-api.polymarket.com/markets');

  return [
    {
      id: "pm_demo_1",
      title: "Texas vs Oklahoma - Winner",
      commence_time: Math.floor(Date.now() / 1000) + 86400,
    },
    {
      id: "pm_demo_2",
      title: "Alabama vs Georgia - Winner",
      commence_time: Math.floor(Date.now() / 1000) + 86400,
    },
  ];
}

/**
 * Fetch markets from Kalshi API
 * TODO: Replace with real API integration
 */
async function fetchKalshiMarkets() {
  // Mock data - replace with actual Kalshi API call
  // Example: const response = await fetch('https://api.kalshi.com/v1/markets');

  return [
    {
      ticker: "kx_demo_1",
      title: "Texas vs Oklahoma - To Win",
      expiration_time: Math.floor(Date.now() / 1000) + 86400,
    },
    {
      ticker: "kx_demo_2",
      title: "Alabama vs Georgia - To Win",
      expiration_time: Math.floor(Date.now() / 1000) + 86400,
    },
  ];
}

/**
 * Calculate arbitrage opportunity between two matched markets
 */
function calculateArbitrage(polymarket: NormalizedMarket, kalshi: NormalizedMarket) {
  // Mock pricing data - replace with real market data
  const poly_yes = 52; // cents
  const poly_no = 48;
  const kalshi_yes = 54;
  const kalshi_no = 46;

  const KALSHI_FEE = 0.02;
  const POLY_FEE = 0.01;

  // Strategy 1: YES on Kalshi, NO on Poly
  const strategy1_cost = kalshi_yes + poly_no;
  const strategy1_fees = kalshi_yes * KALSHI_FEE + poly_no * POLY_FEE;
  const strategy1_profit = 100 - strategy1_cost - strategy1_fees;

  // Strategy 2: YES on Poly, NO on Kalshi
  const strategy2_cost = poly_yes + kalshi_no;
  const strategy2_fees = poly_yes * POLY_FEE + kalshi_no * KALSHI_FEE;
  const strategy2_profit = 100 - strategy2_cost - strategy2_fees;

  const bestStrategy = strategy1_profit > strategy2_profit ?
    {
      strategy: "YES_KALSHI_NO_POLY" as const,
      cost_per_contract: strategy1_cost / 100,
      fee_per_contract: strategy1_fees / 100,
      profit_per_contract: strategy1_profit / 100,
      roi_pct: (strategy1_profit / strategy1_cost) * 100,
    } : {
      strategy: "YES_POLY_NO_KALSHI" as const,
      cost_per_contract: strategy2_cost / 100,
      fee_per_contract: strategy2_fees / 100,
      profit_per_contract: strategy2_profit / 100,
      roi_pct: (strategy2_profit / strategy2_cost) * 100,
    };

  const hasArb = bestStrategy.profit_per_contract > 0;

  return {
    id: `${polymarket.marketId}_${kalshi.marketId}`,
    title: polymarket.rawTitle,
    category: polymarket.marketCategory,
    kalshi: {
      yes_price: kalshi_yes,
      no_price: kalshi_no,
      volume_24h: 1000000,
    },
    poly: {
      yes_price: poly_yes,
      no_price: poly_no,
      volume_24h: 500000,
    },
    spread: Math.abs(kalshi_yes - poly_yes),
    arb: hasArb ? bestStrategy : null,
    liquidity: {
      min_depth: 50000,
    },
    close_date: new Date(polymarket.commenceTime * 1000).toISOString(),
  };
}
