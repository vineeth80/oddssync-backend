"""GET /health — server status, refresh timestamps, market counts, errors."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter

from db import (
    count_kalshi_markets, count_poly_markets, count_matched_markets,
    get_last_refresh,
)
from models.schemas import HealthResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# Collect non-fatal API errors for the health endpoint
_recent_errors: list[str] = []
MAX_ERRORS = 20


def record_error(msg: str) -> None:
    """Record a non-fatal error for health reporting."""
    _recent_errors.append(msg)
    if len(_recent_errors) > MAX_ERRORS:
        _recent_errors.pop(0)


def clear_errors() -> None:
    _recent_errors.clear()


@router.get("/debug/sample-titles")
async def debug_sample_titles():
    """Return sample titles from both platforms for debugging matching."""
    from db import _get_db
    db = await _get_db()

    # Fetch only 10 samples from each table using SQL LIMIT
    k_cursor = await db.execute(
        "SELECT title, title_normalized FROM kalshi_markets WHERE status = 'open' ORDER BY volume_24h DESC LIMIT 10"
    )
    k_samples = [
        {"title": r[0], "normalized": r[1]}
        for r in await k_cursor.fetchall()
    ]

    p_cursor = await db.execute(
        "SELECT question, question_normalized FROM poly_markets WHERE active = 1 ORDER BY volume DESC LIMIT 10"
    )
    p_samples = [
        {"question": r[0], "normalized": r[1]}
        for r in await p_cursor.fetchall()
    ]

    k_count = await count_kalshi_markets()
    p_count = await count_poly_markets()

    return {
        "kalshi_count": k_count,
        "poly_count": p_count,
        "kalshi_samples": k_samples,
        "poly_samples": p_samples,
    }


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Returns server status, last data refresh timestamps, market counts, any API errors."""
    # Run all three count queries concurrently
    k_count, p_count, m_count = await asyncio.gather(
        count_kalshi_markets(),
        count_poly_markets(),
        count_matched_markets(),
    )
    return HealthResponse(
        status="ok",
        version="0.1.0",
        kalshi_markets=k_count,
        poly_markets=p_count,
        matched_markets=m_count,
        last_price_refresh=get_last_refresh("prices"),
        last_full_refresh=get_last_refresh("full"),
        errors=list(_recent_errors),
    )
