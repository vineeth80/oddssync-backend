"""Tests for services/matcher.py matching logic."""

from services.matcher import _match_confidence, _extract_entities, _parse_close_time, MIN_CONFIDENCE


def test_exact_match():
    """Identical normalized titles => 100 confidence."""
    conf, method = _match_confidence("bitcoin price above 100k", "bitcoin price above 100k", "", None, None)
    assert conf == 100
    assert method == "exact"


def test_exact_match_empty():
    """Empty strings don't match as exact."""
    conf, method = _match_confidence("", "", "", None, None)
    assert conf != 100 or method != "exact"


def test_fuzzy_high_similarity():
    """Very similar titles should fuzzy match above threshold."""
    conf, method = _match_confidence(
        "bitcoin price above 100k end year",
        "bitcoin price above 100000 end year",
        "", None, None,
    )
    assert conf >= 85
    assert method == "fuzzy"


def test_fuzzy_low_similarity():
    """Completely different titles should not match."""
    conf, method = _match_confidence(
        "bitcoin price above 100k",
        "super bowl winner chiefs",
        "", None, None,
    )
    assert conf < MIN_CONFIDENCE
    assert method == "none" or method == "fuzzy"


def test_entity_keyword_match():
    """Shared entity keywords should boost score."""
    conf, method = _match_confidence(
        "trump win election 2024",
        "donald trump win presidential election",
        "", None, None,
    )
    # "trump" is a shared entity, plus fuzzy score from shared words
    assert conf >= MIN_CONFIDENCE


def test_category_date_boost():
    """Close dates within 24h should boost fuzzy score."""
    conf, method = _match_confidence(
        "fed rate cut march meeting",
        "federal reserve rate cut march fomc",
        "economics",
        "2025-03-19T12:00:00Z",
        "2025-03-19T18:00:00Z",
    )
    assert conf >= MIN_CONFIDENCE


def test_extract_entities_bitcoin():
    """Should find bitcoin/btc entities."""
    entities = _extract_entities("Will Bitcoin hit 100k by end of year")
    assert "bitcoin" in entities


def test_extract_entities_multiple():
    """Should find multiple entities."""
    entities = _extract_entities("Trump vs Biden election race and Bitcoin to 100k")
    assert "trump" in entities
    assert "biden" in entities
    assert "bitcoin" in entities


def test_extract_entities_none():
    """Random text shouldn't match known entities."""
    entities = _extract_entities("random text about nothing special")
    assert len(entities) == 0


def test_parse_close_time_iso():
    """ISO datetime parsing."""
    dt = _parse_close_time("2025-03-19T12:00:00Z")
    assert dt is not None
    assert dt.year == 2025
    assert dt.month == 3
    assert dt.day == 19


def test_parse_close_time_none():
    """None input returns None."""
    assert _parse_close_time(None) is None


def test_parse_close_time_empty():
    """Empty string returns None."""
    assert _parse_close_time("") is None


def test_dissimilar_markets_below_threshold():
    """Very different markets should score below MIN_CONFIDENCE."""
    conf, method = _match_confidence(
        "nba finals winner",
        "inflation rate above 3 percent",
        "", None, None,
    )
    assert conf < MIN_CONFIDENCE
