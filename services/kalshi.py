"""Kalshi API client — fetch and store all open markets.

Uses a shared httpx.AsyncClient for connection reuse across requests.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

import httpx

from config import settings
from db import upsert_kalshi_markets

logger = logging.getLogger(__name__)

BASE = settings.kalshi_base_url.rstrip("/")
TIMEOUT = 30.0

# Shared HTTP client — created once, reused across all requests
_client: Optional[httpx.AsyncClient] = None

# Pre-compiled regex for title normalization
_PUNCT_RE = re.compile(r"[^\w\s]")
_STOPWORDS = frozenset({
    "will", "the", "a", "an", "be", "in", "on", "at", "to", "of",
    "by", "for", "is", "it", "or", "and", "this", "that",
})


def _get_client() -> httpx.AsyncClient:
    """Return the shared HTTP client, creating it if needed."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=BASE,
            timeout=TIMEOUT,
            headers={"Accept": "application/json"},
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )
    return _client


async def close_client() -> None:
    """Close the shared HTTP client."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
        _client = None


def _normalize_title(title: str) -> str:
    """Lowercase, strip punctuation, remove common stopwords."""
    t = _PUNCT_RE.sub(" ", title.lower().strip())
    words = [w for w in t.split() if w not in _STOPWORDS and len(w) > 1]
    return " ".join(words)


async def fetch_all_markets(max_pages: int = 10) -> list[dict[str, Any]]:
    """Fetch all open markets from Kalshi, paginating with cursor.

    Returns list of normalised dicts ready for db insertion.
    """
    all_markets: list[dict[str, Any]] = []
    cursor: Optional[str] = None
    client = _get_client()

    for page in range(max_pages):
        try:
            params: dict[str, Any] = {"limit": 1000, "status": "open"}
            if cursor:
                params["cursor"] = cursor

            resp = await client.get("/markets", params=params)
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            logger.error("Kalshi /markets page %d failed", page + 1, exc_info=True)
            break

        raw = data.get("markets", [])
        if not raw:
            break

        for m in raw:
            normalised = _parse_market(m)
            if normalised:
                all_markets.append(normalised)

        cursor = data.get("cursor")
        if not cursor:
            break

        logger.debug("Kalshi page %d: %d markets (total %d)",
                     page + 1, len(raw), len(all_markets))

    logger.info("Kalshi: fetched %d open markets", len(all_markets))
    return all_markets


def _parse_market(raw: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Parse raw Kalshi market into our schema."""
    try:
        ticker = raw.get("ticker", "")
        title = raw.get("title") or raw.get("subtitle") or ticker
        if not title or not ticker:
            return None

        yes_price = raw.get("yes_ask") or raw.get("yes_bid") or raw.get("last_price") or 0
        no_price = raw.get("no_ask") or raw.get("no_bid") or 0

        # Kalshi prices are in cents 0-100
        if isinstance(yes_price, (int, float)) and yes_price > 1:
            # Already in cents
            pass
        elif isinstance(yes_price, float) and yes_price <= 1:
            yes_price = round(yes_price * 100)

        if no_price == 0 and yes_price > 0:
            no_price = 100 - yes_price

        if yes_price == 0 and no_price == 0:
            return None

        return {
            "ticker": ticker,
            "title": title,
            "title_normalized": _normalize_title(title),
            "category": raw.get("category", "") or "",
            "event_ticker": raw.get("event_ticker", "") or "",
            "yes_price": yes_price,
            "no_price": no_price,
            "volume": raw.get("volume", 0) or 0,
            "volume_24h": raw.get("volume_24h", 0) or 0,
            "open_interest": raw.get("open_interest", 0) or 0,
            "close_time": raw.get("close_time") or raw.get("expiration_time"),
            "status": "open",  # We only fetch open markets from the API
        }
    except Exception:
        logger.debug("Failed to parse Kalshi market %s", raw.get("ticker"), exc_info=True)
        return None


async def fetch_and_store() -> int:
    """Fetch all markets and store in DB. Returns count stored."""
    markets = await fetch_all_markets()
    count = await upsert_kalshi_markets(markets)
    logger.info("Kalshi: stored %d markets in DB", count)
    return count


async def fetch_market_detail(ticker: str) -> Optional[dict[str, Any]]:
    """Fetch a single market's detail including orderbook."""
    client = _get_client()
    try:
        resp = await client.get(f"/markets/{ticker}")
        resp.raise_for_status()
        data = resp.json()
        market = data.get("market", data)
        return _parse_market(market)
    except Exception:
        logger.error("Kalshi detail fetch failed for %s", ticker, exc_info=True)
        return None


async def fetch_orderbook(ticker: str) -> Optional[dict[str, Any]]:
    """Fetch orderbook depth for a ticker."""
    client = _get_client()
    try:
        resp = await client.get(f"/markets/{ticker}/orderbook")
        resp.raise_for_status()
        return resp.json()
    except Exception:
        logger.debug("Kalshi orderbook fetch failed for %s", ticker, exc_info=True)
        return None
