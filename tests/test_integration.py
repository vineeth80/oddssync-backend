"""Integration tests — verify the full pipeline:
DB storage, matching, arb calculation, and API endpoints.

Uses mock market data since external APIs aren't available in test env.
"""

from __future__ import annotations

import asyncio
import os
import sys

import pytest
import pytest_asyncio

# Ensure project root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Use a test database to avoid corrupting real data
import db as db_module
db_module.DB_PATH = ":memory:"

from db import (
    init_db, close_db,
    upsert_kalshi_markets, upsert_poly_markets, upsert_matched_markets,
    get_all_kalshi_markets, get_all_poly_markets,
    get_all_matched_markets, get_matched_markets_filtered,
    get_matched_market_by_id,
    count_kalshi_markets, count_poly_markets, count_matched_markets,
    set_last_refresh, get_last_refresh,
)
from services.arb_calculator import calculate_arb

# ---------------------------------------------------------------------------
# Sample data — realistic market pairs that should match
# ---------------------------------------------------------------------------

KALSHI_MARKETS = [
    {
        "ticker": "KXBTC-25FEB14-100K",
        "title": "Will Bitcoin exceed $100k by Feb 14?",
        "title_normalized": "bitcoin exceed 100k feb 14",
        "category": "Crypto",
        "event_ticker": "KXBTC",
        "yes_price": 65,
        "no_price": 35,
        "volume": 150000,
        "volume_24h": 25000,
        "open_interest": 8000,
        "close_time": "2026-02-14T23:59:00Z",
        "status": "open",
    },
    {
        "ticker": "KXFED-25MAR-CUT",
        "title": "Will the Fed cut rates in March 2025?",
        "title_normalized": "fed cut rates march 2025",
        "category": "Economics",
        "event_ticker": "KXFED",
        "yes_price": 30,
        "no_price": 70,
        "volume": 80000,
        "volume_24h": 12000,
        "open_interest": 5000,
        "close_time": "2025-03-20T18:00:00Z",
        "status": "open",
    },
    {
        "ticker": "KXNFL-SB-CHIEFS",
        "title": "Will the Chiefs win the Super Bowl?",
        "title_normalized": "chiefs win super bowl",
        "category": "Sports",
        "event_ticker": "KXNFL",
        "yes_price": 45,
        "no_price": 55,
        "volume": 200000,
        "volume_24h": 50000,
        "open_interest": 15000,
        "close_time": "2026-02-09T23:59:00Z",
        "status": "open",
    },
    {
        "ticker": "KXELEC-NO-MATCH",
        "title": "Will it rain in Seattle tomorrow?",
        "title_normalized": "rain seattle tomorrow",
        "category": "Weather",
        "event_ticker": "KXWEA",
        "yes_price": 80,
        "no_price": 20,
        "volume": 5000,
        "volume_24h": 1000,
        "open_interest": 200,
        "close_time": "2026-02-15T23:59:00Z",
        "status": "open",
    },
]

POLY_MARKETS = [
    {
        "id": "poly-btc-100k",
        "question": "Bitcoin to exceed $100,000 by February 14?",
        "question_normalized": "bitcoin exceed 100 000 february 14",
        "slug": "bitcoin-100k-feb",
        "event_id": "evt-btc",
        "yes_price": 60,
        "no_price": 40,
        "volume": 500000,
        "clob_token_yes": "tok-btc-yes",
        "clob_token_no": "tok-btc-no",
        "active": True,
        "close_time": "2026-02-14T23:59:00Z",
    },
    {
        "id": "poly-fed-rate-cut",
        "question": "Federal Reserve rate cut at March FOMC meeting?",
        "question_normalized": "federal reserve rate cut march fomc meeting",
        "slug": "fed-rate-cut-march",
        "event_id": "evt-fed",
        "yes_price": 25,
        "no_price": 75,
        "volume": 300000,
        "clob_token_yes": "tok-fed-yes",
        "clob_token_no": "tok-fed-no",
        "active": True,
        "close_time": "2025-03-20T18:00:00Z",
    },
    {
        "id": "poly-chiefs-sb",
        "question": "Kansas City Chiefs to win Super Bowl?",
        "question_normalized": "kansas city chiefs win super bowl",
        "slug": "chiefs-super-bowl",
        "event_id": "evt-nfl",
        "yes_price": 50,
        "no_price": 50,
        "volume": 1000000,
        "clob_token_yes": "tok-chiefs-yes",
        "clob_token_no": "tok-chiefs-no",
        "active": True,
        "close_time": "2026-02-09T23:59:00Z",
    },
    {
        "id": "poly-unique",
        "question": "Will Dogecoin reach $1 by December 2025?",
        "question_normalized": "dogecoin reach december 2025",
        "slug": "dogecoin-1-dollar",
        "event_id": "evt-doge",
        "yes_price": 10,
        "no_price": 90,
        "volume": 50000,
        "clob_token_yes": "tok-doge-yes",
        "clob_token_no": "tok-doge-no",
        "active": True,
        "close_time": "2025-12-31T23:59:00Z",
    },
]

MATCHED_PAIRS = [
    {
        "kalshi_ticker": "KXBTC-25FEB14-100K",
        "poly_id": "poly-btc-100k",
        "match_confidence": 85,
        "match_method": "fuzzy",
    },
    {
        "kalshi_ticker": "KXFED-25MAR-CUT",
        "poly_id": "poly-fed-rate-cut",
        "match_confidence": 78,
        "match_method": "entity_keyword",
    },
    {
        "kalshi_ticker": "KXNFL-SB-CHIEFS",
        "poly_id": "poly-chiefs-sb",
        "match_confidence": 92,
        "match_method": "fuzzy",
    },
]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Initialize a fresh in-memory DB for each test."""
    db_module._db = None
    await init_db()
    yield
    await close_db()


# ---------------------------------------------------------------------------
# 1. Database storage tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_upsert_kalshi_markets():
    """Kalshi markets should be stored and retrievable."""
    count = await upsert_kalshi_markets(KALSHI_MARKETS)
    assert count == 4

    markets = await get_all_kalshi_markets(status="open")
    assert len(markets) == 4

    # Should be ordered by volume_24h DESC
    assert markets[0]["ticker"] == "KXNFL-SB-CHIEFS"  # 50000
    assert markets[1]["ticker"] == "KXBTC-25FEB14-100K"  # 25000

    total = await count_kalshi_markets()
    assert total == 4


@pytest.mark.asyncio
async def test_upsert_poly_markets():
    """Polymarket markets should be stored and retrievable."""
    count = await upsert_poly_markets(POLY_MARKETS)
    assert count == 4

    markets = await get_all_poly_markets(active=True)
    assert len(markets) == 4

    total = await count_poly_markets()
    assert total == 4


@pytest.mark.asyncio
async def test_upsert_updates_existing():
    """Upserting the same market should update it, not duplicate."""
    await upsert_kalshi_markets(KALSHI_MARKETS)
    assert await count_kalshi_markets() == 4

    # Update one market's price
    updated = [dict(KALSHI_MARKETS[0], yes_price=70, no_price=30)]
    await upsert_kalshi_markets(updated)

    # Count should still be 4
    assert await count_kalshi_markets() == 4

    # Price should be updated
    from db import get_kalshi_market
    m = await get_kalshi_market("KXBTC-25FEB14-100K")
    assert m["yes_price"] == 70


@pytest.mark.asyncio
async def test_empty_upsert():
    """Upserting empty list should return 0."""
    assert await upsert_kalshi_markets([]) == 0
    assert await upsert_poly_markets([]) == 0


# ---------------------------------------------------------------------------
# 2. Matched markets and filtering tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_upsert_matched_markets():
    """Matched pairs should be stored correctly."""
    await upsert_kalshi_markets(KALSHI_MARKETS)
    await upsert_poly_markets(POLY_MARKETS)

    count = await upsert_matched_markets(MATCHED_PAIRS)
    assert count == 3
    assert await count_matched_markets() == 3


@pytest.mark.asyncio
async def test_get_all_matched_markets_joined():
    """Matched markets should join data from both tables."""
    await upsert_kalshi_markets(KALSHI_MARKETS)
    await upsert_poly_markets(POLY_MARKETS)
    await upsert_matched_markets(MATCHED_PAIRS)

    matched = await get_all_matched_markets()
    assert len(matched) == 3

    # Should be ordered by confidence DESC
    assert matched[0]["match_confidence"] == 92  # Chiefs
    assert matched[1]["match_confidence"] == 85  # BTC

    # Should have joined data
    btc = next(m for m in matched if m["kalshi_ticker"] == "KXBTC-25FEB14-100K")
    assert btc["k_yes_price"] == 65
    assert btc["p_yes_price"] == 60
    assert btc["title"] == "Will Bitcoin exceed $100k by Feb 14?"
    assert btc["question"] == "Bitcoin to exceed $100,000 by February 14?"


@pytest.mark.asyncio
async def test_get_matched_market_by_id():
    """Single matched market lookup should work."""
    await upsert_kalshi_markets(KALSHI_MARKETS)
    await upsert_poly_markets(POLY_MARKETS)
    await upsert_matched_markets(MATCHED_PAIRS)

    matched = await get_all_matched_markets()
    first_id = matched[0]["id"]

    result = await get_matched_market_by_id(first_id)
    assert result is not None
    assert result["id"] == first_id

    # Non-existent ID should return None
    assert await get_matched_market_by_id(99999) is None


@pytest.mark.asyncio
async def test_filtered_markets_category():
    """SQL-level category filtering should work."""
    await upsert_kalshi_markets(KALSHI_MARKETS)
    await upsert_poly_markets(POLY_MARKETS)
    await upsert_matched_markets(MATCHED_PAIRS)

    rows, total = await get_matched_markets_filtered(category="Crypto")
    assert total == 1
    assert rows[0]["kalshi_ticker"] == "KXBTC-25FEB14-100K"


@pytest.mark.asyncio
async def test_filtered_markets_search():
    """SQL-level text search should work."""
    await upsert_kalshi_markets(KALSHI_MARKETS)
    await upsert_poly_markets(POLY_MARKETS)
    await upsert_matched_markets(MATCHED_PAIRS)

    rows, total = await get_matched_markets_filtered(search="Bitcoin")
    assert total == 1

    rows, total = await get_matched_markets_filtered(search="Super Bowl")
    assert total == 1
    assert rows[0]["kalshi_ticker"] == "KXNFL-SB-CHIEFS"


@pytest.mark.asyncio
async def test_filtered_markets_sort_spread():
    """Sorting by spread should order by price difference."""
    await upsert_kalshi_markets(KALSHI_MARKETS)
    await upsert_poly_markets(POLY_MARKETS)
    await upsert_matched_markets(MATCHED_PAIRS)

    rows, _ = await get_matched_markets_filtered(sort="spread", order="desc")
    spreads = [abs(r["k_yes_price"] - r["p_yes_price"]) for r in rows]
    assert spreads == sorted(spreads, reverse=True)


@pytest.mark.asyncio
async def test_filtered_markets_pagination():
    """SQL-level pagination should work."""
    await upsert_kalshi_markets(KALSHI_MARKETS)
    await upsert_poly_markets(POLY_MARKETS)
    await upsert_matched_markets(MATCHED_PAIRS)

    # Get first page
    rows, total = await get_matched_markets_filtered(limit=2, offset=0)
    assert total == 3
    assert len(rows) == 2

    # Get second page
    rows2, total2 = await get_matched_markets_filtered(limit=2, offset=2)
    assert total2 == 3
    assert len(rows2) == 1

    # No overlap
    ids_page1 = {r["id"] for r in rows}
    ids_page2 = {r["id"] for r in rows2}
    assert ids_page1.isdisjoint(ids_page2)


# ---------------------------------------------------------------------------
# 3. Arb calculation on stored data
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_arb_on_matched_data():
    """Arb calculation should work correctly on stored matched data."""
    await upsert_kalshi_markets(KALSHI_MARKETS)
    await upsert_poly_markets(POLY_MARKETS)
    await upsert_matched_markets(MATCHED_PAIRS)

    matched = await get_all_matched_markets()

    for m in matched:
        k_yes = m["k_yes_price"]
        p_yes = m["p_yes_price"]
        arb = calculate_arb(k_yes, p_yes)

        if arb:
            assert "roi_pct" in arb
            assert "strategy" in arb
            assert arb["cost_per_contract"] > 0


@pytest.mark.asyncio
async def test_arb_with_large_spread():
    """Markets with large spread should produce positive arb."""
    arb = calculate_arb(65, 60)
    assert arb is not None
    assert arb["roi_pct"] > 0
    assert arb["profit_per_contract"] > 0


# ---------------------------------------------------------------------------
# 4. API endpoint tests (via TestClient)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_health_endpoint():
    """Health endpoint should return correct counts."""
    from httpx import AsyncClient, ASGITransport
    from main import app

    await upsert_kalshi_markets(KALSHI_MARKETS)
    await upsert_poly_markets(POLY_MARKETS)
    await upsert_matched_markets(MATCHED_PAIRS)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["kalshi_markets"] == 4
        assert data["poly_markets"] == 4
        assert data["matched_markets"] == 3


@pytest.mark.asyncio
async def test_markets_endpoint():
    """Markets endpoint should return matched markets with arb data."""
    from httpx import AsyncClient, ASGITransport
    from main import app

    await upsert_kalshi_markets(KALSHI_MARKETS)
    await upsert_poly_markets(POLY_MARKETS)
    await upsert_matched_markets(MATCHED_PAIRS)
    set_last_refresh("full")
    set_last_refresh("prices")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/markets")
        assert resp.status_code == 200
        data = resp.json()

        assert "markets" in data
        assert "meta" in data
        assert data["meta"]["total"] == 3

        markets = data["markets"]
        assert len(markets) == 3

        # Each market should have the expected structure
        for m in markets:
            assert "id" in m
            assert "title" in m
            assert "kalshi" in m
            assert "poly" in m
            assert "spread" in m
            assert "match_confidence" in m
            assert m["kalshi"]["ticker"] != ""
            assert m["poly"]["id"] != ""


@pytest.mark.asyncio
async def test_markets_endpoint_category_filter():
    """Markets endpoint category filter should work."""
    from httpx import AsyncClient, ASGITransport
    from main import app

    await upsert_kalshi_markets(KALSHI_MARKETS)
    await upsert_poly_markets(POLY_MARKETS)
    await upsert_matched_markets(MATCHED_PAIRS)
    set_last_refresh("full")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/markets?category=Sports")
        data = resp.json()
        assert data["meta"]["total"] == 1
        assert data["markets"][0]["category"] == "Sports"


@pytest.mark.asyncio
async def test_markets_endpoint_search():
    """Markets endpoint search should work."""
    from httpx import AsyncClient, ASGITransport
    from main import app

    await upsert_kalshi_markets(KALSHI_MARKETS)
    await upsert_poly_markets(POLY_MARKETS)
    await upsert_matched_markets(MATCHED_PAIRS)
    set_last_refresh("full")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/markets?search=Bitcoin")
        data = resp.json()
        assert data["meta"]["total"] == 1
        assert "Bitcoin" in data["markets"][0]["title"]


@pytest.mark.asyncio
async def test_markets_endpoint_pagination():
    """Markets endpoint pagination should work."""
    from httpx import AsyncClient, ASGITransport
    from main import app

    await upsert_kalshi_markets(KALSHI_MARKETS)
    await upsert_poly_markets(POLY_MARKETS)
    await upsert_matched_markets(MATCHED_PAIRS)
    set_last_refresh("full")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/markets?limit=1&offset=0")
        data = resp.json()
        assert data["meta"]["total"] == 3
        assert len(data["markets"]) == 1

        resp2 = await client.get("/markets?limit=1&offset=1")
        data2 = resp2.json()
        assert len(data2["markets"]) == 1
        assert data2["markets"][0]["id"] != data["markets"][0]["id"]


@pytest.mark.asyncio
async def test_single_market_endpoint():
    """Single market endpoint should return full detail."""
    from httpx import AsyncClient, ASGITransport
    from main import app

    await upsert_kalshi_markets(KALSHI_MARKETS)
    await upsert_poly_markets(POLY_MARKETS)
    await upsert_matched_markets(MATCHED_PAIRS)
    set_last_refresh("full")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Get the first market ID
        all_resp = await client.get("/markets")
        market_id = all_resp.json()["markets"][0]["id"]

        resp = await client.get(f"/markets/{market_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == market_id
        assert "kalshi" in data
        assert "poly" in data


@pytest.mark.asyncio
async def test_single_market_not_found():
    """Single market endpoint should return 404 for non-existent ID."""
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/markets/99999")
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_arbs_only_filter():
    """arbs_only filter should only return markets with positive arb."""
    from httpx import AsyncClient, ASGITransport
    from main import app

    await upsert_kalshi_markets(KALSHI_MARKETS)
    await upsert_poly_markets(POLY_MARKETS)
    await upsert_matched_markets(MATCHED_PAIRS)
    set_last_refresh("full")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/markets?arbs_only=true")
        data = resp.json()
        for market in data["markets"]:
            assert market["arb"] is not None
            assert market["arb"]["roi_pct"] > 0


# ---------------------------------------------------------------------------
# 5. CORS test
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cors_headers():
    """CORS headers should be present for allowed origins."""
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert resp.status_code == 200
        assert "access-control-allow-origin" in resp.headers
        assert resp.headers["access-control-allow-origin"] == "http://localhost:3000"


# ---------------------------------------------------------------------------
# 6. Metadata tracking
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_last_refresh_tracking():
    """Last refresh timestamps should be tracked correctly."""
    # Check that a never-set key returns None
    assert get_last_refresh("test_key_never_set") is None

    set_last_refresh("test_prices")
    assert get_last_refresh("test_prices") is not None

    set_last_refresh("test_full")
    assert get_last_refresh("test_full") is not None


# ---------------------------------------------------------------------------
# 7. Debug endpoint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_debug_sample_titles():
    """Debug endpoint should return sample titles."""
    from httpx import AsyncClient, ASGITransport
    from main import app

    await upsert_kalshi_markets(KALSHI_MARKETS)
    await upsert_poly_markets(POLY_MARKETS)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/debug/sample-titles")
        assert resp.status_code == 200
        data = resp.json()
        assert data["kalshi_count"] == 4
        assert data["poly_count"] == 4
        assert len(data["kalshi_samples"]) <= 10
        assert len(data["poly_samples"]) <= 10
        assert "title" in data["kalshi_samples"][0]
        assert "normalized" in data["kalshi_samples"][0]
