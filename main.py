"""FastAPI app entry point — CORS, startup events, scheduler."""

from __future__ import annotations

import asyncio
import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from config import settings
from db import init_db, close_db, set_last_refresh
from routers import health, markets
from routers.health import record_error
from scheduler import start_scheduler, stop_scheduler

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=getattr(logging, "DEBUG" if settings.debug else "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------

limiter = Limiter(key_func=get_remote_address, default_limits=[settings.rate_limit])

# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------


async def _initial_data_load() -> None:
    """Fetch data from both APIs on startup, then match and calculate arbs."""
    try:
        from services.kalshi import fetch_and_store as kalshi_fetch
        from services.polymarket import fetch_and_store as poly_fetch
        from services.matcher import run_matching

        logger.info("Starting initial data load...")
        # Fetch from both APIs concurrently
        k_count, p_count = await asyncio.gather(
            kalshi_fetch(),
            poly_fetch(),
        )
        m_count = await run_matching()
        set_last_refresh("full")
        set_last_refresh("prices")
        logger.info(
            "Initial load complete: kalshi=%d, poly=%d, matches=%d",
            k_count, p_count, m_count,
        )
    except Exception as e:
        msg = f"Initial data load failed: {e}"
        logger.error(msg, exc_info=True)
        record_error(msg)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    # Startup
    await init_db()
    logger.info("Database initialised")

    # Kick off initial data load in background so server starts fast
    asyncio.create_task(_initial_data_load())

    # Start scheduled refresh jobs
    start_scheduler()

    yield

    # Shutdown — clean up all resources
    stop_scheduler()

    from services.kalshi import close_client as close_kalshi
    from services.polymarket import close_clients as close_poly
    await close_kalshi()
    await close_poly()
    await close_db()
    logger.info("Server shutting down")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="OddsSync API",
    description="Cross-platform prediction market aggregator",
    version="0.1.0",
    lifespan=lifespan,
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — credentials cannot be used with wildcard origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials="*" not in settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router, tags=["health"])
app.include_router(markets.router, tags=["markets"])


@app.get("/")
async def root():
    """Root endpoint — confirms the API is reachable."""
    return {"status": "ok", "docs": "/docs", "health": "/health"}


# ---------------------------------------------------------------------------
# Global error handler — never expose stack traces
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled error: %s", exc, exc_info=True)
    record_error(str(exc))
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# ---------------------------------------------------------------------------
# Run with uvicorn
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="debug" if settings.debug else "info",
    )
