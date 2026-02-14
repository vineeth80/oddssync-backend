"""Tests for services/arb_calculator.py."""

from services.arb_calculator import calculate_arb, KALSHI_FEE, POLY_FEE


def test_positive_arb_yes_kalshi_no_poly():
    """When Kalshi YES is cheap and Poly NO is cheap, arb exists."""
    # Kalshi YES=30c, Poly YES=80c => Poly NO=20c
    # Strategy 1: cost = 0.30 + 0.20 = 0.50, fee = 0.30*0.02 + 0.20*0.01 = 0.008
    # profit = 1 - 0.50 - 0.008 = 0.492
    result = calculate_arb(30, 80)
    assert result is not None
    assert result["strategy"] == "YES_KALSHI_NO_POLY"
    assert result["profit_per_contract"] > 0
    assert result["roi_pct"] > 0


def test_positive_arb_yes_poly_no_kalshi():
    """When Poly YES is cheap and Kalshi NO is cheap, arb exists."""
    # Kalshi YES=80c, Poly YES=30c => Kalshi NO=20c
    # Strategy 2: cost = 0.30 + 0.20 = 0.50, fee = 0.30*0.01 + 0.20*0.02 = 0.007
    # profit = 1 - 0.50 - 0.007 = 0.493
    result = calculate_arb(80, 30)
    assert result is not None
    assert result["strategy"] == "YES_POLY_NO_KALSHI"
    assert result["profit_per_contract"] > 0
    assert result["roi_pct"] > 0


def test_no_arb_when_prices_similar():
    """When prices are close, no profitable arb."""
    result = calculate_arb(50, 50)
    assert result is None


def test_no_arb_when_prices_overlap():
    """Standard case: prices sum > 100 => no arb."""
    result = calculate_arb(55, 55)
    assert result is None


def test_edge_prices_zero():
    """Zero prices return None."""
    assert calculate_arb(0, 50) is None
    assert calculate_arb(50, 0) is None


def test_edge_prices_100():
    """Price at 100 returns None."""
    assert calculate_arb(100, 50) is None
    assert calculate_arb(50, 100) is None


def test_arb_result_fields():
    """Verify all expected fields are present in result."""
    result = calculate_arb(25, 85)
    assert result is not None
    assert "strategy" in result
    assert "cost_per_contract" in result
    assert "fee_per_contract" in result
    assert "profit_per_contract" in result
    assert "roi_pct" in result


def test_arb_math_accuracy():
    """Verify the math is correct for a known case."""
    # Kalshi YES=40c, Poly YES=70c => Poly NO=30c
    # Strategy 1 (YES Kalshi + NO Poly): cost=0.40+0.30=0.70, fee=0.40*0.02+0.30*0.01=0.011
    # profit = 1 - 0.70 - 0.011 = 0.289
    result = calculate_arb(40, 70)
    assert result is not None
    assert result["strategy"] == "YES_KALSHI_NO_POLY"
    assert abs(result["cost_per_contract"] - 0.70) < 0.001
    assert abs(result["fee_per_contract"] - 0.011) < 0.001
    assert abs(result["profit_per_contract"] - 0.289) < 0.001
    expected_roi = (0.289 / 0.70) * 100
    assert abs(result["roi_pct"] - round(expected_roi, 2)) < 0.1


def test_symmetric_large_spread():
    """Very large spread should yield big arb."""
    result = calculate_arb(10, 95)
    assert result is not None
    assert result["profit_per_contract"] > 0.5
    assert result["roi_pct"] > 100
