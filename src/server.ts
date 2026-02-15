/**
 * OddsSync Backend - Production API Server
 *
 * RESTful API for arbitrage matching using entity resolution engine.
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { MarketNormalizer } from "./matching/normalizer";
import { WaterfallFilter } from "./matching/filter";
import { ALL_SPORTS_ALIASES, getAliasMapForSport } from "./config/entity-aliases";
import type { PolymarketRawMarket, KalshiRawMarket } from "./matching/normalizer";
import { fetchAndMatchMarkets } from "./services/marketFetcher";

// Environment configuration
const PORT = parseInt(process.env.PORT || "8080", 10);
const NODE_ENV = process.env.NODE_ENV || "development";

// Initialize Express
const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // CORS support
app.use(compression()); // Response compression
app.use(express.json({ limit: "10mb" })); // JSON body parser

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Initialize matching components
const normalizer = new MarketNormalizer(ALL_SPORTS_ALIASES);
const filter = new WaterfallFilter({
  temporalThresholdSeconds: 2592000, // 30 days - prediction markets have long horizons
  lineTolerance: 0.5,
});

/**
 * Health check endpoint
 */
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
  });
});

/**
 * API info endpoint
 */
app.get("/", (req: Request, res: Response) => {
  res.json({
    name: "OddsSync Backend - Entity Resolution Matching Engine",
    version: "2.0.0",
    description: "Deterministic arbitrage matching with waterfall filtering",
    endpoints: {
      health: "GET /health",
      match: "POST /api/match",
      batchMatch: "POST /api/match/batch",
      config: "GET /api/config",
    },
    documentation: "https://github.com/yourusername/oddssync-backend",
  });
});

/**
 * Get current configuration
 */
app.get("/api/config", (req: Request, res: Response) => {
  res.json({
    temporalThreshold: 3600,
    lineTolerance: 0.5,
    aliasCount: Object.keys(ALL_SPORTS_ALIASES).length,
    sports: ["cfb", "nfl", "nba", "mlb"],
  });
});

/**
 * Get markets with arbitrage opportunities (for frontend compatibility)
 *
 * GET /markets
 * Query params:
 *   - sort: "roi" | "spread" | "volume" (default: "roi")
 *   - order: "asc" | "desc" (default: "desc")
 *   - limit: number (default: 100)
 *   - arbs_only: "true" | "false"
 *   - search: string
 */
app.get("/markets", async (req: Request, res: Response) => {
  try {
    const { sort = "roi", order = "desc", limit = "100", arbs_only, search } = req.query;

    // Fetch and match markets
    const data = await fetchAndMatchMarkets();

    let filtered = data.markets;

    // Filter: arbs only
    if (arbs_only === "true") {
      filtered = filtered.filter((m) => m.arb !== null);
    }

    // Filter: search query
    if (search && typeof search === "string") {
      const query = search.toLowerCase();
      filtered = filtered.filter((m) =>
        m.title.toLowerCase().includes(query)
      );
    }

    // Sort
    const sortField = sort as string;
    filtered.sort((a, b) => {
      let aVal = 0;
      let bVal = 0;

      if (sortField === "roi") {
        aVal = a.arb?.roi_pct || 0;
        bVal = b.arb?.roi_pct || 0;
      } else if (sortField === "spread") {
        aVal = a.spread || 0;
        bVal = b.spread || 0;
      } else if (sortField === "volume") {
        aVal = a.kalshi?.volume_24h || 0;
        bVal = b.kalshi?.volume_24h || 0;
      } else if (sortField === "close_date") {
        aVal = new Date(a.close_date).getTime();
        bVal = new Date(b.close_date).getTime();
      }

      return order === "desc" ? bVal - aVal : aVal - bVal;
    });

    // Limit results
    const limitNum = parseInt(limit as string, 10) || 100;
    filtered = filtered.slice(0, limitNum);

    res.json({
      markets: filtered,
      meta: {
        ...data.meta,
        total: filtered.length,
        arb_count: filtered.filter((m) => m.arb).length,
      },
    });
  } catch (error: any) {
    console.error("[ERROR] /markets endpoint:", error);
    res.status(500).json({
      error: "Failed to fetch markets",
      message: error.message,
      markets: [],
      meta: { total: 0, arb_count: 0, last_refresh: null },
    });
  }
});

/**
 * Match a single Polymarket market against a single Kalshi market
 *
 * POST /api/match
 * Body:
 * {
 *   "polymarket": { "id": "...", "title": "...", "commence_time": ... },
 *   "kalshi": { "ticker": "...", "title": "...", "expiration_time": ... }
 * }
 */
app.post("/api/match", (req: Request, res: Response) => {
  try {
    const { polymarket, kalshi } = req.body;

    if (!polymarket || !kalshi) {
      return res.status(400).json({
        error: "Missing required fields",
        message: "Request must include 'polymarket' and 'kalshi' objects",
      });
    }

    // Normalize markets
    const pmNormalized = normalizer.normalizePolymarket(polymarket as PolymarketRawMarket);
    const kalNormalized = normalizer.normalizeKalshi(kalshi as KalshiRawMarket);

    // Check if normalization failed (parlay rejection, etc.)
    if (!pmNormalized) {
      return res.status(200).json({
        isMatch: false,
        reason: "Polymarket normalization failed (likely parlay or malformed data)",
        polymarket: null,
        kalshi: kalNormalized ? kalNormalized.toString() : null,
      });
    }

    if (!kalNormalized) {
      return res.status(200).json({
        isMatch: false,
        reason: "Kalshi normalization failed (likely parlay or malformed data)",
        polymarket: pmNormalized.toString(),
        kalshi: null,
      });
    }

    // Run through waterfall filter
    const matchResult = filter.match(pmNormalized, kalNormalized);

    res.json({
      isMatch: matchResult.isMatch,
      reason: matchResult.rejectionReason || "All filters passed",
      filterStepFailed: matchResult.filterStepFailed,
      polymarket: {
        id: pmNormalized.marketId,
        entity: pmNormalized.primaryEntity,
        category: pmNormalized.marketCategory,
        line: pmNormalized.lineValue,
        time: pmNormalized.commenceTime,
      },
      kalshi: {
        id: kalNormalized.marketId,
        entity: kalNormalized.primaryEntity,
        category: kalNormalized.marketCategory,
        line: kalNormalized.lineValue,
        time: kalNormalized.commenceTime,
      },
    });
  } catch (error: any) {
    console.error("[ERROR] Match endpoint:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * Batch match multiple Polymarket markets against multiple Kalshi markets
 *
 * POST /api/match/batch
 * Body:
 * {
 *   "polymarkets": [...],
 *   "kalshis": [...]
 * }
 */
app.post("/api/match/batch", (req: Request, res: Response) => {
  try {
    const { polymarkets, kalshis } = req.body;

    if (!Array.isArray(polymarkets) || !Array.isArray(kalshis)) {
      return res.status(400).json({
        error: "Invalid input",
        message: "Both 'polymarkets' and 'kalshis' must be arrays",
      });
    }

    console.log(`[BATCH] Processing ${polymarkets.length} Polymarket × ${kalshis.length} Kalshi markets`);

    // Normalize all markets
    const pmNormalized = polymarkets
      .map((pm) => normalizer.normalizePolymarket(pm as PolymarketRawMarket))
      .filter((m) => m !== null);

    const kalNormalized = kalshis
      .map((kal) => normalizer.normalizeKalshi(kal as KalshiRawMarket))
      .filter((m) => m !== null);

    console.log(`[BATCH] Normalized: ${pmNormalized.length} Polymarket, ${kalNormalized.length} Kalshi`);

    // Batch match
    const matches = filter.batchMatch(pmNormalized, kalNormalized);

    // Format response
    const formattedMatches = matches.map((match) => ({
      polymarket: {
        id: match.polymarketMarket.marketId,
        entity: match.polymarketMarket.primaryEntity,
        category: match.polymarketMarket.marketCategory,
        line: match.polymarketMarket.lineValue,
        rawTitle: match.polymarketMarket.rawTitle,
      },
      kalshi: {
        id: match.kalshiMarket.marketId,
        entity: match.kalshiMarket.primaryEntity,
        category: match.kalshiMarket.marketCategory,
        line: match.kalshiMarket.lineValue,
        rawTitle: match.kalshiMarket.rawTitle,
      },
    }));

    res.json({
      totalPolymarkets: polymarkets.length,
      totalKalshis: kalshis.length,
      normalizedPolymarkets: pmNormalized.length,
      normalizedKalshis: kalNormalized.length,
      matches: formattedMatches,
      matchCount: formattedMatches.length,
      rejectedCount: (pmNormalized.length * kalNormalized.length) - formattedMatches.length,
    });
  } catch (error: any) {
    console.error("[ERROR] Batch match endpoint:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Not found",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

/**
 * Global error handler
 */
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("[FATAL ERROR]", err);
  res.status(500).json({
    error: "Internal server error",
    message: NODE_ENV === "development" ? err.message : "Something went wrong",
  });
});

/**
 * Start server
 */
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("=".repeat(60));
  console.log("🚀 OddsSync Backend - Entity Resolution Engine");
  console.log("=".repeat(60));
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Port: ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`API: http://localhost:${PORT}/api/match`);
  console.log(`Entity aliases loaded: ${Object.keys(ALL_SPORTS_ALIASES).length}`);
  console.log("=".repeat(60));
});

/**
 * Graceful shutdown
 */
process.on("SIGTERM", () => {
  console.log("\n[SIGTERM] Shutting down gracefully...");
  server.close(() => {
    console.log("[SHUTDOWN] Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("\n[SIGINT] Shutting down gracefully...");
  server.close(() => {
    console.log("[SHUTDOWN] Server closed");
    process.exit(0);
  });
});

export default app;
