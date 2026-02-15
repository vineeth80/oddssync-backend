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

    const markets = await response.json() as any[];

    // Parse outcomes and outcomePrices from strings to arrays
    const parsedMarkets = markets.map((m) => {
      try {
        return {
          ...m,
          outcomes: typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : m.outcomes,
          outcomePrices: typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices,
        };
      } catch (e) {
        return m; // Return as-is if parsing fails
      }
    }) as PolymarketMarketResponse[];

    // Filter for markets with valid data and track rejection reasons
    let rejectionReasons = { active: 0, outcomes: 0, outcomePrices: 0, endDateIso: 0 };
    const filtered = parsedMarkets.filter((m: PolymarketMarketResponse) => {
      if (!m.active) { rejectionReasons.active++; return false; }
      if (!m.outcomes || !Array.isArray(m.outcomes) || m.outcomes.length !== 2) { rejectionReasons.outcomes++; return false; }
      if (!m.outcomePrices || !Array.isArray(m.outcomePrices) || m.outcomePrices.length !== 2) { rejectionReasons.outcomePrices++; return false; }
      if (!m.endDateIso) { rejectionReasons.endDateIso++; return false; }
      return true;
    });
    console.log(`[POLYMARKET] Got ${markets.length} raw markets, ${filtered.length} valid`);
    console.log(`[POLYMARKET] Rejections: active=${rejectionReasons.active}, outcomes=${rejectionReasons.outcomes}, outcomePrices=${rejectionReasons.outcomePrices}, endDateIso=${rejectionReasons.endDateIso}`);
    return filtered;
  } catch (error) {
    console.error("[POLYMARKET] Fetch error:", error);
    return [];
  }
}

/**
 * Login to Kalshi and get session token
 */
async function kalshiLogin(): Promise<string | null> {
  try {
    const KALSHI_EMAIL = process.env.KALSHI_EMAIL || "";

    if (!KALSHI_EMAIL || !KALSHI_API_KEY) {
      console.error("[KALSHI] Missing email or API key");
      return null;
    }

    console.log(`[KALSHI] Logging in with email: ${KALSHI_EMAIL}`);

    const response = await fetch(`${KALSHI_API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: KALSHI_EMAIL,
        password: KALSHI_API_KEY,
      }),
    });

    if (!response.ok) {
      console.error(`[KALSHI] Login failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json() as { token?: string };
    if (data.token) {
      console.log("[KALSHI] Login successful");
      return data.token;
    }

    console.error("[KALSHI] No token in login response");
    return null;
  } catch (error) {
    console.error("[KALSHI] Login error:", error);
    return null;
  }
}

/**
 * Fetch markets from Kalshi API
 */
async function fetchKalshiMarkets(): Promise<KalshiMarketResponse[]> {
  try {
    console.log(`[KALSHI] Fetching up to ${KALSHI_LIMIT} markets...`);

    // Login to get session token
    const token = await kalshiLogin();
    if (!token) {
      console.error("[KALSHI] Cannot fetch markets without authentication");
      return [];
    }

    const response = await fetch(
      `${KALSHI_API}/markets?limit=${KALSHI_LIMIT}&status=open`,
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
      }
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
