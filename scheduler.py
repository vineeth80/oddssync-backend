"""APScheduler job definitions.

Schedule:
  - Every 60 seconds:  Fetch updated prices from both platforms concurrently
  - Every 5 minutes:   Full market list refresh from both platforms, re-run matcher
  - Every 1 hour:      Full orderbook depth refresh for top 20 arb opportunities

Never crash on a single failed request — log and continue.
"""

from __future__ import annotations

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from config import settings
from db import set_last_refresh, get_all_matched_markets
from routers.health import record_error

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def _price_refresh_job() -> None:
    """Fetch updated prices for matched markets (every 60s).

    Fetches from both APIs concurrently with asyncio.gather.
    """
    try:
        from services.kalshi import fetch_and_store as kalshi_fetch
        from services.polymarket import fetch_and_store as poly_fetch

        # Fetch from both APIs concurrently
        k_count, p_count = await asyncio.gather(
            kalshi_fetch(),
            poly_fetch(),
        )
        set_last_refresh("prices")
        logger.info("Price refresh: kalshi=%d, poly=%d", k_count, p_count)
    except Exception as e:
        msg = f"Price refresh failed: {e}"
        logger.error(msg, exc_info=True)
        record_error(msg)


async def _full_refresh_job() -> None:
    """Full market list refresh + re-run matcher (every 5 min).

    Fetches from both APIs concurrently, then runs matcher.
    """
    try:
        from services.kalshi import fetch_and_store as kalshi_fetch
        from services.polymarket import fetch_and_store as poly_fetch
        from services.matcher import run_matching

        # Fetch concurrently, then match (matching needs both datasets)
        k_count, p_count = await asyncio.gather(
            kalshi_fetch(),
            poly_fetch(),
        )
        m_count = await run_matching()
        set_last_refresh("full")
        logger.info("Full refresh: kalshi=%d, poly=%d, matches=%d", k_count, p_count, m_count)
    except Exception as e:
        msg = f"Full refresh failed: {e}"
        logger.error(msg, exc_info=True)
        record_error(msg)


async def _depth_refresh_job() -> None:
    """Orderbook depth refresh for top arb opportunities (every 1 hour).

    Fetches orderbooks concurrently in batches of 5 to avoid rate limiting.
    """
    try:
        from services.kalshi import fetch_orderbook as kalshi_orderbook
        from services.polymarket import fetch_orderbook as poly_orderbook
        from services.arb_calculator import calculate_arb

        matched = await get_all_matched_markets()

        # Find top 20 by arb ROI
        arb_markets = []
        for m in matched:
            arb = calculate_arb(m.get("k_yes_price", 0) or 0, m.get("p_yes_price", 0) or 0)
            if arb:
                arb_markets.append((m, arb))
        arb_markets.sort(key=lambda x: x[1]["roi_pct"], reverse=True)
        top_20 = arb_markets[:20]

        # Fetch orderbooks concurrently in batches of 5
        batch_size = 5
        for i in range(0, len(top_20), batch_size):
            batch = top_20[i : i + batch_size]
            tasks = []
            for m, _ in batch:
                tasks.append(kalshi_orderbook(m["kalshi_ticker"]))
                token_yes = m.get("clob_token_yes", "")
                if token_yes:
                    tasks.append(poly_orderbook(token_yes))
            await asyncio.gather(*tasks, return_exceptions=True)

        set_last_refresh("depth")
        logger.info("Depth refresh: checked %d markets", len(top_20))
    except Exception as e:
        msg = f"Depth refresh failed: {e}"
        logger.error(msg, exc_info=True)
        record_error(msg)


def start_scheduler() -> None:
    """Register all jobs and start the scheduler."""
    scheduler.add_job(
        _price_refresh_job,
        trigger=IntervalTrigger(seconds=settings.price_refresh_interval),
        id="price_refresh",
        name="Price refresh (60s)",
        replace_existing=True,
    )
    scheduler.add_job(
        _full_refresh_job,
        trigger=IntervalTrigger(seconds=settings.full_refresh_interval),
        id="full_refresh",
        name="Full refresh (5min)",
        replace_existing=True,
    )
    scheduler.add_job(
        _depth_refresh_job,
        trigger=IntervalTrigger(seconds=settings.depth_refresh_interval),
        id="depth_refresh",
        name="Depth refresh (1hr)",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        "Scheduler started: price=%ds, full=%ds, depth=%ds",
        settings.price_refresh_interval,
        settings.full_refresh_interval,
        settings.depth_refresh_interval,
    )


def stop_scheduler() -> None:
    """Shutdown the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
