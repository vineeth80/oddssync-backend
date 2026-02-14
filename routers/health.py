"""GET /health — server status, refresh timestamps, market counts, errors."""

from __future__ import annotations

import logging

from fastapi import APIRouter

from db import count_kalshi_markets, count_poly_markets, count_matched_markets, get_last_refresh
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


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Returns server status, last data refresh timestamps, market counts, any API errors."""
    return HealthResponse(
        status="ok",
        version="0.1.0",
        kalshi_markets=await count_kalshi_markets(),
        poly_markets=await count_poly_markets(),
        matched_markets=await count_matched_markets(),
        last_price_refresh=get_last_refresh("prices"),
        last_full_refresh=get_last_refresh("full"),
        errors=list(_recent_errors),
    )
