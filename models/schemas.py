"""Pydantic models for all API responses."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class KalshiMarketOut(BaseModel):
    ticker: str
    yes_price: float
    no_price: float
    volume_24h: int = 0
    price_change_24h: float = 0


class PolyMarketOut(BaseModel):
    id: str
    yes_price: float
    no_price: float
    volume_24h: float = 0
    price_change_24h: float = 0


class ArbOut(BaseModel):
    strategy: str
    cost_per_contract: float
    fee_per_contract: float
    profit_per_contract: float
    roi_pct: float


class LiquidityOut(BaseModel):
    kalshi_depth: int = 0
    poly_depth: int = 0
    min_depth: int = 0


class MatchedMarketOut(BaseModel):
    id: int
    title: str
    category: str = ""
    kalshi: KalshiMarketOut
    poly: PolyMarketOut
    spread: float
    arb: Optional[ArbOut] = None
    liquidity: LiquidityOut
    close_date: Optional[str] = None
    match_confidence: int
    status: str = "open"
    last_updated: Optional[str] = None


class MetaOut(BaseModel):
    total: int
    arb_count: int
    last_refresh: Optional[str] = None


class MarketsResponse(BaseModel):
    markets: list[MatchedMarketOut]
    meta: MetaOut


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"
    kalshi_markets: int = 0
    poly_markets: int = 0
    matched_markets: int = 0
    last_price_refresh: Optional[str] = None
    last_full_refresh: Optional[str] = None
    errors: list[str] = []
