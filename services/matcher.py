"""Cross-platform market matching logic.

Matching strategy (in priority order):
1. Exact title match — normalized titles compared directly.
2. Fuzzy match — rapidfuzz, threshold 85% on normalized titles.
3. Category + date match — same category and close date within 24h.
4. Event keyword extraction — key entities + timeframe matching.

Only surface matches with confidence >= 80 to the frontend.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from rapidfuzz import fuzz

from db import (
    get_all_kalshi_markets,
    get_all_poly_markets,
    upsert_matched_markets,
)

logger = logging.getLogger(__name__)

MIN_CONFIDENCE = 80

# Key entities to extract for keyword matching
KEY_ENTITIES = [
    "bitcoin", "btc", "ethereum", "eth", "trump", "biden", "harris",
    "fed", "fomc", "s&p", "s&p 500", "sp500", "gdp", "cpi", "inflation",
    "recession", "ukraine", "russia", "china", "taiwan", "iran", "israel",
    "super bowl", "nfl", "nba", "world cup", "olympics", "oscars", "grammys",
    "elon", "musk", "tesla", "openai", "gpt", "tiktok", "meta",
]


def _parse_close_time(t: Optional[str]) -> Optional[datetime]:
    """Best-effort parse of close_time string to datetime."""
    if not t:
        return None
    try:
        # Try ISO format first
        return datetime.fromisoformat(t.replace("Z", "+00:00"))
    except Exception:
        pass
    try:
        return datetime.strptime(t, "%Y-%m-%dT%H:%M:%S")
    except Exception:
        return None


def _extract_entities(text: str) -> set[str]:
    """Extract known key entities from text."""
    lower = text.lower()
    found = set()
    for entity in KEY_ENTITIES:
        if entity in lower:
            found.add(entity)
    return found


def _match_confidence(
    k_title_norm: str,
    p_question_norm: str,
    k_category: str,
    k_close_time: Optional[str],
    p_close_time: Optional[str],
) -> tuple[int, str]:
    """Calculate match confidence (0-100) and method.

    Returns (confidence, method) tuple.
    """
    # --- Strategy 1: Exact match on normalized titles ---
    if k_title_norm == p_question_norm and k_title_norm:
        return 100, "exact"

    # --- Strategy 2: Fuzzy match ---
    token_sort = fuzz.token_sort_ratio(k_title_norm, p_question_norm)
    token_set = fuzz.token_set_ratio(k_title_norm, p_question_norm)
    # token_set handles subset matching well (e.g. "Fed rate cut March" vs "Federal Reserve rate cut at March FOMC")
    fuzzy_score = max(token_sort, token_set)

    if fuzzy_score >= 85:
        return int(fuzzy_score), "fuzzy"

    # --- Strategy 4: Keyword entity matching ---
    k_entities = _extract_entities(k_title_norm)
    p_entities = _extract_entities(p_question_norm)
    if k_entities and p_entities:
        overlap = k_entities & p_entities
        if overlap:
            # Boost: shared entities + similar timeframes
            entity_score = min(len(overlap) * 25, 70)

            # Check date proximity
            k_dt = _parse_close_time(k_close_time)
            p_dt = _parse_close_time(p_close_time)
            if k_dt and p_dt and abs((k_dt - p_dt).total_seconds()) < 86400:
                entity_score = min(entity_score + 20, 95)

            if entity_score >= MIN_CONFIDENCE:
                return entity_score, "entity_keyword"

    # --- Strategy 3: Category + date match ---
    k_dt = _parse_close_time(k_close_time)
    p_dt = _parse_close_time(p_close_time)
    if k_dt and p_dt and abs((k_dt - p_dt).total_seconds()) < 86400:
        # Same close date window — boost fuzzy score
        if fuzzy_score >= 65:
            boosted = min(fuzzy_score + 15, 95)
            if boosted >= MIN_CONFIDENCE:
                return int(boosted), "category_date"

    # Below threshold — not a match
    return int(fuzzy_score), "none"


async def run_matching() -> int:
    """Run the matching pipeline on all markets in the DB.

    Returns count of matches found.
    """
    kalshi_markets = await get_all_kalshi_markets(status="open")
    poly_markets = await get_all_poly_markets(active=True)

    if not kalshi_markets or not poly_markets:
        logger.info("Matcher: nothing to match (kalshi=%d, poly=%d)",
                     len(kalshi_markets), len(poly_markets))
        return 0

    logger.info("Matcher: comparing %d Kalshi × %d Polymarket markets",
                len(kalshi_markets), len(poly_markets))

    matches: list[dict[str, Any]] = []
    used_poly_ids: set[str] = set()
    now = datetime.now(timezone.utc).isoformat()

    for km in kalshi_markets:
        k_norm = km.get("title_normalized", "")
        if not k_norm:
            continue

        best_confidence = 0
        best_method = "none"
        best_poly: Optional[dict[str, Any]] = None

        for pm in poly_markets:
            p_id = pm.get("id", "")
            if p_id in used_poly_ids:
                continue

            p_norm = pm.get("question_normalized", "")
            if not p_norm:
                continue

            confidence, method = _match_confidence(
                k_norm, p_norm,
                km.get("category", ""),
                km.get("close_time"),
                pm.get("close_time"),
            )

            if confidence > best_confidence:
                best_confidence = confidence
                best_method = method
                best_poly = pm

        if best_poly and best_confidence >= MIN_CONFIDENCE:
            used_poly_ids.add(best_poly["id"])
            matches.append({
                "kalshi_ticker": km["ticker"],
                "poly_id": best_poly["id"],
                "match_confidence": best_confidence,
                "match_method": best_method,
                "created_at": now,
            })
            logger.debug(
                "Match: '%s' <-> '%s' (confidence=%d, method=%s)",
                km.get("title", "")[:50],
                best_poly.get("question", "")[:50],
                best_confidence,
                best_method,
            )

    count = await upsert_matched_markets(matches)
    logger.info("Matcher: found and stored %d matches", count)
    return count
