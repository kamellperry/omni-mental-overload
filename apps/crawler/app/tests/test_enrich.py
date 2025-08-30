from datetime import timezone

from app.core.enrich import _parse_dt


def test_parse_dt_z():
    dt = _parse_dt('2025-08-29T12:34:56Z')
    assert dt is not None and dt.tzinfo is not None and dt.tzinfo.utcoffset(dt) == timezone.utc.utcoffset(dt)


def test_parse_dt_offset():
    dt = _parse_dt('2025-08-29T12:34:56+02:00')
    assert dt is not None and dt.tzinfo is not None


def test_parse_dt_none():
    assert _parse_dt(None) is None

