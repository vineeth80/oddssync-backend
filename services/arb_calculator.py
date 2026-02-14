"""Arbitrage math (fee-adjusted).

For each matched market pair, we check two strategies:
1. Buy YES on Kalshi + Buy NO on Polymarket
2. Buy YES on Polymarket + Buy NO on Kalshi

Prices are in cents (0-100). Cost = yes_price + no_price (should be < 100 cents / $1).
Fees are charged on the winning leg. Since we guarantee both outcomes,
we pay fee on exactly one leg's purchase price.

Fee model per spec:
  KALSHI_FEE = 0.02 (2% on winnings)
  POLY_FEE = 0.01 (1% on winnings)

  Simplified: fee = yes_price * platform_fee + no_price * platform_fee
  Profit = $1 (guaranteed payout) - cost - fees
  ROI = profit / cost * 100
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from db import get_all_matched_markets

logger = logging.getLogger(__name__)

KALSHI_FEE = 0.02  # 2% on winnings
POLY_FEE = 0.01    # 1% on winnings


def calculate_arb(kalshi_yes: float, poly_yes: float) -> Optional[dict[str, Any]]:
    """Calculate the best arbitrage opportunity for a matched pair.

    kalshi_yes and poly_yes are prices in cents (0-100).
    Returns the best arb opportunity or None if no arb exists.
    """
    if kalshi_yes <= 0 or kalshi_yes >= 100 or poly_yes <= 0 or poly_yes >= 100:
        return None

    k_yes = kalshi_yes / 100
    k_no = (100 - kalshi_yes) / 100
    p_yes = poly_yes / 100
    p_no = (100 - poly_yes) / 100

    # Strategy 1: YES Kalshi + NO Poly
    cost1 = k_yes + p_no
    fee1 = (k_yes * KALSHI_FEE) + (p_no * POLY_FEE)
    profit1 = 1 - cost1 - fee1

    # Strategy 2: YES Poly + NO Kalshi
    cost2 = p_yes + k_no
    fee2 = (p_yes * POLY_FEE) + (k_no * KALSHI_FEE)
    profit2 = 1 - cost2 - fee2

    best = max(
        [(profit1, cost1, fee1, "YES_KALSHI_NO_POLY"),
         (profit2, cost2, fee2, "YES_POLY_NO_KALSHI")],
        key=lambda x: x[0],
    )

    if best[0] <= 0:
        return None

    return {
        "strategy": best[3],
        "cost_per_contract": round(best[1], 4),
        "fee_per_contract": round(best[2], 4),
        "profit_per_contract": round(best[0], 4),
        "roi_pct": round((best[0] / best[1]) * 100, 2) if best[1] > 0 else 0,
    }


async def calculate_all_arbs() -> list[dict[str, Any]]:
    """Calculate arbs for all matched pairs in the DB.

    Returns list of matched market dicts enriched with arb data.
    Each item has: id, title, kalshi data, poly data, spread, arb, etc.
    """
    matched = await get_all_matched_markets()
    results: list[dict[str, Any]] = []

    for m in matched:
        k_yes = m.get("k_yes_price", 0) or 0
        p_yes = m.get("p_yes_price", 0) or 0

        # Raw spread in cents
        spread = abs(k_yes - p_yes)

        arb = calculate_arb(k_yes, p_yes)

        results.append({
            **m,
            "spread": spread,
            "arb": arb,
        })

    # Sort by ROI descending (arb items first, then by spread)
    results.sort(
        key=lambda x: (
            x["arb"]["roi_pct"] if x["arb"] else -1,
            x["spread"],
        ),
        reverse=True,
    )

    arb_count = sum(1 for r in results if r["arb"])
    logger.info("Arb calculator: %d matches processed, %d arbs found",
                len(results), arb_count)
    return results
