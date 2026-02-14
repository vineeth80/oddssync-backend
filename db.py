"""SQLite setup, table creation, query helpers."""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional

import aiosqlite

logger = logging.getLogger(__name__)

DB_PATH = "oddssync.db"

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS kalshi_markets (
    ticker TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    title_normalized TEXT NOT NULL,
    category TEXT,
    event_ticker TEXT,
    yes_price REAL,
    no_price REAL,
    volume INTEGER,
    volume_24h INTEGER,
    open_interest INTEGER,
    close_time TEXT,
    status TEXT,
    last_updated TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS poly_markets (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    question_normalized TEXT NOT NULL,
    slug TEXT,
    event_id TEXT,
    yes_price REAL,
    no_price REAL,
    volume REAL,
    clob_token_yes TEXT,
    clob_token_no TEXT,
    active BOOLEAN,
    close_time TEXT,
    last_updated TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matched_markets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kalshi_ticker TEXT NOT NULL,
    poly_id TEXT NOT NULL,
    match_confidence INTEGER NOT NULL,
    match_method TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (kalshi_ticker) REFERENCES kalshi_markets(ticker),
    FOREIGN KEY (poly_id) REFERENCES poly_markets(id),
    UNIQUE(kalshi_ticker, poly_id)
);

CREATE INDEX IF NOT EXISTS idx_matched_confidence ON matched_markets(match_confidence DESC);
CREATE INDEX IF NOT EXISTS idx_kalshi_status ON kalshi_markets(status);
CREATE INDEX IF NOT EXISTS idx_poly_active ON poly_markets(active);
"""


async def init_db() -> None:
    """Create tables if they don't exist."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA_SQL)
        await db.commit()
    logger.info("Database initialised at %s", DB_PATH)


# ---------------------------------------------------------------------------
# Kalshi helpers
# ---------------------------------------------------------------------------

async def upsert_kalshi_markets(markets: list[dict[str, Any]]) -> int:
    """Insert or replace Kalshi markets. Returns count."""
    if not markets:
        return 0
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executemany(
            """INSERT OR REPLACE INTO kalshi_markets
               (ticker, title, title_normalized, category, event_ticker,
                yes_price, no_price, volume, volume_24h, open_interest,
                close_time, status, last_updated)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                (
                    m["ticker"],
                    m["title"],
                    m["title_normalized"],
                    m.get("category", ""),
                    m.get("event_ticker", ""),
                    m.get("yes_price", 0),
                    m.get("no_price", 0),
                    m.get("volume", 0),
                    m.get("volume_24h", 0),
                    m.get("open_interest", 0),
                    m.get("close_time"),
                    m.get("status", "open"),
                    now,
                )
                for m in markets
            ],
        )
        await db.commit()
    return len(markets)


async def get_all_kalshi_markets(status: str = "open") -> list[dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM kalshi_markets WHERE status = ? ORDER BY volume_24h DESC",
            (status,),
        )
        return [dict(r) for r in await cursor.fetchall()]


async def get_kalshi_market(ticker: str) -> Optional[dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM kalshi_markets WHERE ticker = ?", (ticker,)
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


async def count_kalshi_markets() -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM kalshi_markets")
        row = await cursor.fetchone()
        return row[0] if row else 0


# ---------------------------------------------------------------------------
# Polymarket helpers
# ---------------------------------------------------------------------------

async def upsert_poly_markets(markets: list[dict[str, Any]]) -> int:
    """Insert or replace Polymarket markets. Returns count."""
    if not markets:
        return 0
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executemany(
            """INSERT OR REPLACE INTO poly_markets
               (id, question, question_normalized, slug, event_id,
                yes_price, no_price, volume, clob_token_yes, clob_token_no,
                active, close_time, last_updated)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                (
                    m["id"],
                    m["question"],
                    m["question_normalized"],
                    m.get("slug", ""),
                    m.get("event_id", ""),
                    m.get("yes_price", 0),
                    m.get("no_price", 0),
                    m.get("volume", 0),
                    m.get("clob_token_yes", ""),
                    m.get("clob_token_no", ""),
                    m.get("active", True),
                    m.get("close_time"),
                    now,
                )
                for m in markets
            ],
        )
        await db.commit()
    return len(markets)


async def get_all_poly_markets(active: bool = True) -> list[dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM poly_markets WHERE active = ? ORDER BY volume DESC",
            (active,),
        )
        return [dict(r) for r in await cursor.fetchall()]


async def get_poly_market(market_id: str) -> Optional[dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM poly_markets WHERE id = ?", (market_id,)
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


async def count_poly_markets() -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM poly_markets")
        row = await cursor.fetchone()
        return row[0] if row else 0


# ---------------------------------------------------------------------------
# Matched markets helpers
# ---------------------------------------------------------------------------

async def upsert_matched_markets(matches: list[dict[str, Any]]) -> int:
    """Insert or ignore matched markets. Returns count inserted."""
    if not matches:
        return 0
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executemany(
            """INSERT OR REPLACE INTO matched_markets
               (kalshi_ticker, poly_id, match_confidence, match_method, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            [
                (
                    m["kalshi_ticker"],
                    m["poly_id"],
                    m["match_confidence"],
                    m.get("match_method", "fuzzy"),
                    m.get("created_at", datetime.now(timezone.utc).isoformat()),
                )
                for m in matches
            ],
        )
        await db.commit()
    return len(matches)


async def get_all_matched_markets() -> list[dict[str, Any]]:
    """Return matched markets with joined data from both tables."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT mm.id, mm.kalshi_ticker, mm.poly_id,
                      mm.match_confidence, mm.match_method, mm.created_at,
                      k.title, k.category, k.yes_price AS k_yes_price,
                      k.no_price AS k_no_price, k.volume_24h AS k_volume_24h,
                      k.open_interest AS k_open_interest, k.close_time AS k_close_time,
                      k.event_ticker, k.volume AS k_volume,
                      p.question, p.yes_price AS p_yes_price,
                      p.no_price AS p_no_price, p.volume AS p_volume,
                      p.slug, p.clob_token_yes, p.clob_token_no,
                      p.close_time AS p_close_time
               FROM matched_markets mm
               JOIN kalshi_markets k ON mm.kalshi_ticker = k.ticker
               JOIN poly_markets p ON mm.poly_id = p.id
               ORDER BY mm.match_confidence DESC"""
        )
        return [dict(r) for r in await cursor.fetchall()]


async def get_matched_market_by_id(market_id: int) -> Optional[dict[str, Any]]:
    """Return single matched market with joined data."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT mm.id, mm.kalshi_ticker, mm.poly_id,
                      mm.match_confidence, mm.match_method, mm.created_at,
                      k.title, k.category, k.yes_price AS k_yes_price,
                      k.no_price AS k_no_price, k.volume_24h AS k_volume_24h,
                      k.open_interest AS k_open_interest, k.close_time AS k_close_time,
                      k.event_ticker, k.volume AS k_volume,
                      p.question, p.yes_price AS p_yes_price,
                      p.no_price AS p_no_price, p.volume AS p_volume,
                      p.slug, p.clob_token_yes, p.clob_token_no,
                      p.close_time AS p_close_time
               FROM matched_markets mm
               JOIN kalshi_markets k ON mm.kalshi_ticker = k.ticker
               JOIN poly_markets p ON mm.poly_id = p.id
               WHERE mm.id = ?""",
            (market_id,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


async def count_matched_markets() -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM matched_markets")
        row = await cursor.fetchone()
        return row[0] if row else 0


# ---------------------------------------------------------------------------
# Metadata tracking
# ---------------------------------------------------------------------------

_last_refresh: dict[str, str] = {}


def set_last_refresh(key: str) -> None:
    _last_refresh[key] = datetime.now(timezone.utc).isoformat()


def get_last_refresh(key: str = "full") -> Optional[str]:
    return _last_refresh.get(key)
