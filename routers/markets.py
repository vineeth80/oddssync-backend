"""GET /markets, GET /markets/{id}, GET /markets/arbs — matched market data."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Query

from db import get_all_matched_markets, get_matched_market_by_id, get_last_refresh
from models.schemas import (
    ArbOut,
    KalshiMarketOut,
    LiquidityOut,
    MarketsResponse,
    MatchedMarketOut,
    MetaOut,
    PolyMarketOut,
)
from services.arb_calculator import calculate_arb

logger = logging.getLogger(__name__)

router = APIRouter()


def _build_market_out(row: dict, arb_data: Optional[dict] = None) -> MatchedMarketOut:
    """Convert a joined DB row into the API response model."""
    k_yes = row.get("k_yes_price", 0) or 0
    k_no = row.get("k_no_price", 0) or 0
    p_yes = row.get("p_yes_price", 0) or 0
    p_no = row.get("p_no_price", 0) or 0
    spread = abs(k_yes - p_yes)

    arb_out = None
    if arb_data:
        arb_out = ArbOut(**arb_data)

    kalshi_depth = row.get("k_open_interest", 0) or 0
    poly_depth = int(row.get("p_volume", 0) or 0)
    min_depth = min(kalshi_depth, poly_depth)

    close_date = row.get("k_close_time") or row.get("p_close_time")
    if close_date and "T" in close_date:
        close_date = close_date.split("T")[0]

    last_updated = get_last_refresh("prices") or get_last_refresh("full")

    return MatchedMarketOut(
        id=row["id"],
        title=row.get("title", ""),
        category=row.get("category", ""),
        kalshi=KalshiMarketOut(
            ticker=row["kalshi_ticker"],
            yes_price=k_yes,
            no_price=k_no,
            volume_24h=row.get("k_volume_24h", 0) or 0,
        ),
        poly=PolyMarketOut(
            id=row["poly_id"],
            yes_price=p_yes,
            no_price=p_no,
            volume_24h=row.get("p_volume", 0) or 0,
        ),
        spread=spread,
        arb=arb_out,
        liquidity=LiquidityOut(
            kalshi_depth=kalshi_depth,
            poly_depth=poly_depth,
            min_depth=min_depth,
        ),
        close_date=close_date,
        match_confidence=row.get("match_confidence", 0),
        status="open",
        last_updated=last_updated,
    )


@router.get("/markets", response_model=MarketsResponse)
async def list_markets(
    category: Optional[str] = Query(None, description="Filter by category"),
    min_spread: Optional[float] = Query(None, description="Minimum spread percentage"),
    arbs_only: Optional[bool] = Query(False, description="Only return markets with positive arbs"),
    sort: Optional[str] = Query("spread", description="Sort field: spread, roi, volume, close_date"),
    order: Optional[str] = Query("desc", description="Sort order: asc, desc"),
    search: Optional[str] = Query(None, description="Text search on title"),
    limit: int = Query(50, ge=1, le=200, description="Pagination limit"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
) -> MarketsResponse:
    """Returns all matched markets with current prices from both platforms."""
    matched = await get_all_matched_markets()

    # Build output with arb calculations
    results: list[tuple[MatchedMarketOut, Optional[dict]]] = []
    for row in matched:
        k_yes = row.get("k_yes_price", 0) or 0
        p_yes = row.get("p_yes_price", 0) or 0
        arb = calculate_arb(k_yes, p_yes)
        out = _build_market_out(row, arb)
        results.append((out, arb))

    # --- Filtering ---
    if category:
        results = [(o, a) for o, a in results if category.lower() in (o.category or "").lower()]

    if min_spread is not None:
        results = [(o, a) for o, a in results if o.spread >= min_spread]

    if arbs_only:
        results = [(o, a) for o, a in results if a is not None]

    if search:
        s_lower = search.lower()
        results = [(o, a) for o, a in results if s_lower in o.title.lower()]

    # --- Sorting ---
    reverse = order != "asc"
    if sort == "spread":
        results.sort(key=lambda x: x[0].spread, reverse=reverse)
    elif sort == "roi":
        results.sort(
            key=lambda x: x[1]["roi_pct"] if x[1] else -1,
            reverse=reverse,
        )
    elif sort == "volume":
        results.sort(
            key=lambda x: x[0].kalshi.volume_24h + x[0].poly.volume_24h,
            reverse=reverse,
        )
    elif sort == "close_date":
        results.sort(
            key=lambda x: x[0].close_date or "",
            reverse=reverse,
        )

    total = len(results)
    arb_count = sum(1 for _, a in results if a is not None)

    # --- Pagination ---
    results = results[offset : offset + limit]

    return MarketsResponse(
        markets=[o for o, _ in results],
        meta=MetaOut(
            total=total,
            arb_count=arb_count,
            last_refresh=get_last_refresh("full"),
        ),
    )


@router.get("/markets/{market_id}")
async def get_market(market_id: int) -> MatchedMarketOut:
    """Returns single matched market with full detail."""
    row = await get_matched_market_by_id(market_id)
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Market not found")

    k_yes = row.get("k_yes_price", 0) or 0
    p_yes = row.get("p_yes_price", 0) or 0
    arb = calculate_arb(k_yes, p_yes)
    return _build_market_out(row, arb)
