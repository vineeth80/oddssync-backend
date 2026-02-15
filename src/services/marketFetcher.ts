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

const KALSHI_FEE = 0.02; // 2%
const POLY_FEE = 0.01; // 1%

// Polymarket API endpoints
const POLYMARKET_API = "https://gamma-api.polymarket.com";
const POLYMARKET_CLOB_API = "https://clob.polymarket.com";

// Kalshi API endpoint
const KALSHI_API = "https://trading-api.kalshi.com/trade-api/v2";
const KALSHI_API_KEY = process.env.KALSHI_API_KEY || "";

// Configuration
const POLYMARKET_LIMIT = 500; // Increased from 100
const KALSHI_LIMIT = 500; // Increased from 100

interface PolymarketMarketResponse {
  slug: string;
  question: string;
  endDateIso: string; // Changed from end_date_iso to match API
  outcomes: string[]; // e.g., ["Yes", "No"]
  outcomePrices: string[]; // Prices as strings (e.g., ["0.52", "0.48"])
  clobTokenIds: string[]; // Token IDs for order book
  volume: string;
  liquidity: string;
  active: boolean;
}

interface KalshiMarketResponse {
  ticker: string;
  title: string;
  expiration_time: string;
  close_time: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  volume: number;
  open_interest: number;
  liquidity: number;
  status: string;
}

/**
 * Main function to fetch and match markets
 */
export async function fetchAndMatchMarkets() {
  try {
    console.log("[FETCHER] Starting market fetch...");

    // Fetch markets from both platforms in parallel
    const [polymarketMarkets, kalshiMarkets] = await Promise.all([
      fetchPolymarketMarkets(),
      fetchKalshiMarkets(),
    ]);

    console.log(`[FETCHER] Fetched ${polymarketMarkets.length} Polymarket, ${kalshiMarkets.length} Kalshi markets`);

    // Normalize markets
    const pmNormalized = polymarketMarkets
      .map((m) => {
        try {
          return normalizer.normalizePolymarket({
            id: m.slug,
            title: m.question,
            commence_time: Math.floor(new Date(m.endDateIso).getTime() / 1000),
          });
        } catch (e) {
          return null;
        }
      })
      .filter((m) => m !== null);

    const kalNormalized = kalshiMarkets
      .map((m) => {
        try {
          return normalizer.normalizeKalshi({
            ticker: m.ticker,
            title: m.title,
            expiration_time: Math.floor(new Date(m.expiration_time).getTime() / 1000),
          });
        } catch (e) {
          return null;
        }
      })
      .filter((m) => m !== null);

    console.log(`[FETCHER] Normalized ${pmNormalized.length} Polymarket, ${kalNormalized.length} Kalshi markets`);

    // Match markets using entity resolution
    const matches = filter.batchMatch(pmNormalized, kalNormalized);

    console.log(`[FETCHER] Found ${matches.length} matches`);

    // Calculate arbitrage opportunities with real pricing data
    const marketsWithArb = await Promise.all(
      matches.map(async (match) => {
        // Find the original market data
        const polyData = polymarketMarkets.find((m) => m.slug === match.polymarketMarket.marketId);
        const kalshiData = kalshiMarkets.find((m) => m.ticker === match.kalshiMarket.marketId);

        if (!polyData || !kalshiData) {
          return null;
        }

        return calculateArbitrage(
          match.polymarketMarket,
          match.kalshiMarket,
          polyData,
          kalshiData
        );
      })
    );

    const validMarkets = marketsWithArb.filter((m) => m !== null);

    return {
      markets: validMarkets,
      meta: {
        total: validMarkets.length,
        arb_count: validMarkets.filter((m) => m.arb).length,
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
 */
async function fetchPolymarketMarkets(): Promise<PolymarketMarketResponse[]> {
  try {
    console.log(`[POLYMARKET] Fetching up to ${POLYMARKET_LIMIT} markets...`);
    // Fetch active markets
    const response = await fetch(`${POLYMARKET_API}/markets?closed=false&active=true&limit=${POLYMARKET_LIMIT}`);

    if (!response.ok) {
      console.error(`[POLYMARKET] API error: ${response.status}`);
      return [];
    }

    const markets = await response.json() as PolymarketMarketResponse[];

    // Filter for markets with valid data
    const filtered = markets.filter((m: PolymarketMarketResponse) =>
      m.active &&
      m.outcomes &&
      m.outcomes.length === 2 &&
      m.outcomePrices &&
      m.outcomePrices.length === 2 &&
      m.endDateIso
    );
    console.log(`[POLYMARKET] Got ${markets.length} raw markets, ${filtered.length} valid`);
    return filtered;
  } catch (error) {
    console.error("[POLYMARKET] Fetch error:", error);
    return [];
  }
}

/**
 * Fetch markets from Kalshi API
 */
async function fetchKalshiMarkets(): Promise<KalshiMarketResponse[]> {
  try {
    console.log(`[KALSHI] Fetching up to ${KALSHI_LIMIT} markets...`);

    // Prepare headers with API key if available
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (KALSHI_API_KEY) {
      headers["Authorization"] = `Bearer ${KALSHI_API_KEY}`;
      console.log("[KALSHI] Using API key for authentication");
    } else {
      console.log("[KALSHI] Warning: No API key provided, trying public access");
    }

    const response = await fetch(
      `${KALSHI_API}/markets?limit=${KALSHI_LIMIT}&status=open`,
      { headers }
    );

    if (!response.ok) {
      console.error(`[KALSHI] API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json() as { markets?: KalshiMarketResponse[] };
    const markets = data.markets || [];
    console.log(`[KALSHI] Got ${markets.length} markets`);
    return markets;
  } catch (error) {
    console.error("[KALSHI] Fetch error:", error);
    return [];
  }
}

/**
 * Get order book data from Polymarket for a specific market
 */
async function getPolymarketOrderBook(tokenId: string) {
  try {
    const response = await fetch(
      `${POLYMARKET_CLOB_API}/book?token_id=${tokenId}`
    );

    if (!response.ok) {
      return null;
    }

    const book = await response.json() as {
      bids?: Array<{ price: string }>;
      asks?: Array<{ price: string }>;
    };

    // Extract best bid/ask
    const bestBid = book.bids?.[0]?.price || "0";
    const bestAsk = book.asks?.[0]?.price || "0";

    return {
      bid: parseFloat(bestBid),
      ask: parseFloat(bestAsk),
    };
  } catch (error) {
    console.error("[POLYMARKET] Order book error:", error);
    return null;
  }
}

/**
 * Calculate arbitrage opportunity between two matched markets with REAL pricing data
 */
function calculateArbitrage(
  polymarket: NormalizedMarket,
  kalshi: NormalizedMarket,
  polyData: PolymarketMarketResponse,
  kalshiData: KalshiMarketResponse
) {
  // Extract Polymarket prices from new API format
  const yesIndex = polyData.outcomes.findIndex((o) => o.toLowerCase() === "yes");
  const noIndex = polyData.outcomes.findIndex((o) => o.toLowerCase() === "no");

  if (yesIndex === -1 || noIndex === -1) {
    return null;
  }

  // Prices are already in decimal format (0.52 = 52 cents), multiply by 100
  const poly_yes = parseFloat(polyData.outcomePrices[yesIndex]) * 100;
  const poly_no = parseFloat(polyData.outcomePrices[noIndex]) * 100;

  // Extract Kalshi prices (use mid price of bid/ask)
  const kalshi_yes = kalshiData.yes_ask ? kalshiData.yes_ask * 100 : 50; // Convert to cents
  const kalshi_no = kalshiData.no_ask ? kalshiData.no_ask * 100 : 50;

  // Validate prices
  if (poly_yes <= 0 || poly_no <= 0 || kalshi_yes <= 0 || kalshi_no <= 0) {
    return null;
  }

  // Strategy 1: YES on Kalshi, NO on Poly
  const strategy1_cost = kalshi_yes + poly_no;
  const strategy1_fees = kalshi_yes * KALSHI_FEE + poly_no * POLY_FEE;
  const strategy1_profit = 100 - strategy1_cost - strategy1_fees;

  // Strategy 2: YES on Poly, NO on Kalshi
  const strategy2_cost = poly_yes + kalshi_no;
  const strategy2_fees = poly_yes * POLY_FEE + kalshi_no * KALSHI_FEE;
  const strategy2_profit = 100 - strategy2_cost - strategy2_fees;

  // Choose best strategy
  const bestStrategy =
    strategy1_profit > strategy2_profit
      ? {
          strategy: "YES_KALSHI_NO_POLY" as const,
          cost_per_contract: strategy1_cost / 100,
          fee_per_contract: strategy1_fees / 100,
          profit_per_contract: strategy1_profit / 100,
          roi_pct: (strategy1_profit / strategy1_cost) * 100,
        }
      : {
          strategy: "YES_POLY_NO_KALSHI" as const,
          cost_per_contract: strategy2_cost / 100,
          fee_per_contract: strategy2_fees / 100,
          profit_per_contract: strategy2_profit / 100,
          roi_pct: (strategy2_profit / strategy2_cost) * 100,
        };

  const hasArb = bestStrategy.profit_per_contract > 0;

  // Calculate liquidity
  const polyLiquidity = parseFloat(polyData.liquidity || "0");
  const kalshiLiquidity = kalshiData.liquidity || kalshiData.open_interest || 0;
  const minDepth = Math.min(polyLiquidity, kalshiLiquidity);

  return {
    id: `${polymarket.marketId}_${kalshi.marketId}`,
    title: polymarket.rawTitle,
    category: polymarket.marketCategory,
    kalshi: {
      yes_price: Math.round(kalshi_yes),
      no_price: Math.round(kalshi_no),
      volume_24h: kalshiData.volume || 0,
    },
    poly: {
      yes_price: Math.round(poly_yes),
      no_price: Math.round(poly_no),
      volume_24h: parseFloat(polyData.volume || "0"),
    },
    spread: Math.abs(kalshi_yes - poly_yes),
    arb: hasArb ? bestStrategy : null,
    liquidity: {
      min_depth: minDepth,
    },
    close_date: polyData.endDateIso,
  };
}
