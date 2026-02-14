"""Polymarket API client — fetch and store all active events/markets."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from config import settings
from db import upsert_poly_markets

logger = logging.getLogger(__name__)

GAMMA_BASE = settings.poly_gamma_url.rstrip("/")
CLOB_BASE = settings.poly_clob_url.rstrip("/")
TIMEOUT = 30.0


def _normalize_question(question: str) -> str:
    """Lowercase, strip punctuation, remove common stopwords."""
    t = question.lower().strip()
    t = re.sub(r"[^\w\s]", " ", t)
    stopwords = {"will", "the", "a", "an", "be", "in", "on", "at", "to", "of",
                 "by", "for", "is", "it", "or", "and", "this", "that"}
    words = [w for w in t.split() if w not in stopwords and len(w) > 1]
    return " ".join(words)


async def fetch_all_markets(max_pages: int = 20) -> list[dict[str, Any]]:
    """Fetch all active markets from Polymarket Gamma API.

    Gamma returns events with nested markets. We flatten to individual markets.
    Returns list of normalised dicts ready for db insertion.
    """
    all_markets: list[dict[str, Any]] = []

    async with httpx.AsyncClient(
        base_url=GAMMA_BASE, timeout=TIMEOUT, headers={"Accept": "application/json"}
    ) as client:
        for page in range(max_pages):
            offset = page * 100
            try:
                resp = await client.get(
                    "/events",
                    params={"active": "true", "closed": "false", "limit": 100, "offset": offset},
                )
                resp.raise_for_status()
                data = resp.json()
            except Exception:
                logger.error("Polymarket /events page %d failed", page + 1, exc_info=True)
                break

            events = data if isinstance(data, list) else data.get("data", data.get("events", []))
            if not events:
                break

            for event in events:
                markets = event.get("markets", [])
                for m in markets:
                    normalised = _parse_market(m, event)
                    if normalised:
                        all_markets.append(normalised)

            logger.debug("Polymarket page %d: %d events (total markets %d)",
                         page + 1, len(events), len(all_markets))

            if len(events) < 100:
                break

    logger.info("Polymarket: fetched %d active markets", len(all_markets))
    return all_markets


def _parse_market(raw: dict[str, Any], event: dict[str, Any] = None) -> Optional[dict[str, Any]]:
    """Parse raw Polymarket market into our schema."""
    try:
        market_id = raw.get("id") or raw.get("condition_id") or ""
        question = raw.get("question") or raw.get("title") or ""
        if not question or not market_id:
            return None

        # Parse outcomePrices — JSON string like '["0.65", "0.35"]'
        yes_price = 0.0
        no_price = 0.0

        outcome_prices = raw.get("outcomePrices")
        if outcome_prices:
            if isinstance(outcome_prices, str):
                try:
                    prices = json.loads(outcome_prices)
                except Exception:
                    prices = []
            else:
                prices = outcome_prices

            if isinstance(prices, list) and len(prices) >= 2:
                yes_price = float(prices[0])
                no_price = float(prices[1])

        # Prices from Polymarket are 0-1, convert to cents (0-100) to match our schema
        yes_cents = round(yes_price * 100) if yes_price <= 1 else round(yes_price)
        no_cents = round(no_price * 100) if no_price <= 1 else round(no_price)

        if yes_cents == 0 and no_cents == 0:
            return None

        if no_cents == 0 and yes_cents > 0:
            no_cents = 100 - yes_cents

        # Parse CLOB token IDs
        clob_token_ids = raw.get("clobTokenIds")
        clob_token_yes = ""
        clob_token_no = ""
        if clob_token_ids:
            if isinstance(clob_token_ids, str):
                try:
                    tokens = json.loads(clob_token_ids)
                except Exception:
                    tokens = []
            else:
                tokens = clob_token_ids
            if isinstance(tokens, list):
                if len(tokens) >= 1:
                    clob_token_yes = tokens[0]
                if len(tokens) >= 2:
                    clob_token_no = tokens[1]

        volume = 0
        vol_raw = raw.get("volume") or raw.get("volumeNum") or 0
        try:
            volume = float(vol_raw)
        except (ValueError, TypeError):
            volume = 0

        slug = raw.get("slug", "")
        event_id = ""
        close_time = raw.get("endDate") or raw.get("end_date_iso")

        if event:
            event_id = event.get("id", "") or ""
            if not slug:
                slug = event.get("slug", "")
            if not close_time:
                close_time = event.get("endDate") or event.get("end_date_iso")

        active = raw.get("active", True)
        if isinstance(active, str):
            active = active.lower() == "true"

        return {
            "id": str(market_id),
            "question": question,
            "question_normalized": _normalize_question(question),
            "slug": slug,
            "event_id": str(event_id),
            "yes_price": yes_cents,
            "no_price": no_cents,
            "volume": volume,
            "clob_token_yes": clob_token_yes,
            "clob_token_no": clob_token_no,
            "active": active,
            "close_time": close_time,
        }
    except Exception:
        logger.debug("Failed to parse Polymarket market", exc_info=True)
        return None


async def fetch_and_store() -> int:
    """Fetch all markets and store in DB. Returns count stored."""
    markets = await fetch_all_markets()
    count = await upsert_poly_markets(markets)
    logger.info("Polymarket: stored %d markets in DB", count)
    return count


async def fetch_clob_prices(token_ids: list[str]) -> dict[str, float]:
    """Batch fetch prices from the CLOB API."""
    if not token_ids:
        return {}
    async with httpx.AsyncClient(
        base_url=CLOB_BASE, timeout=TIMEOUT, headers={"Accept": "application/json"}
    ) as client:
        try:
            resp = await client.get(
                "/prices",
                params={"token_ids": ",".join(token_ids)},
            )
            resp.raise_for_status()
            return resp.json()
        except Exception:
            logger.debug("CLOB /prices failed", exc_info=True)
            return {}


async def fetch_orderbook(token_id: str) -> Optional[dict[str, Any]]:
    """Fetch orderbook depth for a token."""
    async with httpx.AsyncClient(
        base_url=CLOB_BASE, timeout=TIMEOUT, headers={"Accept": "application/json"}
    ) as client:
        try:
            resp = await client.get("/book", params={"token_id": token_id})
            resp.raise_for_status()
            return resp.json()
        except Exception:
            logger.debug("CLOB orderbook fetch failed for %s", token_id, exc_info=True)
            return None
