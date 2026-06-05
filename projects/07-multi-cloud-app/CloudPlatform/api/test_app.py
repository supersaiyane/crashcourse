"""Tests for CloudPlatform analytics API."""
import json
import pytest
from unittest.mock import patch, MagicMock

# Patch infrastructure before importing app
with patch("psycopg2.connect") as mock_pg, \
     patch("redis.Redis") as mock_redis, \
     patch("confluent_kafka.Producer") as mock_kafka:

    # Set up mock returns
    mock_cursor = MagicMock()
    mock_conn = MagicMock()
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    mock_pg.return_value = mock_conn

    mock_redis_instance = MagicMock()
    mock_redis_instance.ping.return_value = True
    mock_redis_instance.zrangebyscore.return_value = []
    mock_redis.return_value = mock_redis_instance

    mock_producer = MagicMock()
    mock_producer.list_topics.return_value = MagicMock()
    mock_kafka.return_value = mock_producer

    from app import app


@pytest.fixture
def client():
    """Create a Flask test client."""
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
def test_health_check(client):
    """Health endpoint returns status and checks."""
    resp = client.get("/api/health")
    data = resp.get_json()
    assert resp.status_code in (200, 503)
    assert "status" in data
    assert "checks" in data
    assert "version" in data


# ---------------------------------------------------------------------------
# Event ingestion
# ---------------------------------------------------------------------------
def test_ingest_event_success(client):
    """POST /api/events with valid data returns 201."""
    resp = client.post("/api/events", json={
        "event_type": "page_view",
        "source": "web",
        "payload": {"url": "/home"},
    })
    data = resp.get_json()
    assert resp.status_code == 201
    assert data["event_type"] == "page_view"
    assert data["source"] == "web"
    assert "id" in data
    assert "event_hash" in data


def test_ingest_event_missing_type(client):
    """POST /api/events without event_type returns 400."""
    resp = client.post("/api/events", json={
        "source": "mobile",
    })
    assert resp.status_code == 400
    assert "event_type" in resp.get_json()["error"]


def test_ingest_event_missing_source(client):
    """POST /api/events without source returns 400."""
    resp = client.post("/api/events", json={
        "event_type": "click",
    })
    assert resp.status_code == 400
    assert "source" in resp.get_json()["error"]


def test_ingest_event_invalid_json(client):
    """POST /api/events with non-JSON body returns 400."""
    resp = client.post("/api/events", data="not json",
                       content_type="text/plain")
    assert resp.status_code == 400


def test_ingest_event_type_too_long(client):
    """POST /api/events with oversized event_type returns 400."""
    resp = client.post("/api/events", json={
        "event_type": "x" * 101,
        "source": "web",
    })
    assert resp.status_code == 400
    assert "100" in resp.get_json()["error"]


# ---------------------------------------------------------------------------
# Event listing
# ---------------------------------------------------------------------------
def test_list_events(client):
    """GET /api/events returns event list."""
    with patch("app._get_pg") as mock_get_pg:
        mock_cur = MagicMock()
        mock_cur.fetchall.return_value = []
        mock_get_pg.return_value.cursor.return_value.__enter__ = MagicMock(return_value=mock_cur)
        mock_get_pg.return_value.cursor.return_value.__exit__ = MagicMock(return_value=False)

        resp = client.get("/api/events")
        data = resp.get_json()
        assert resp.status_code == 200
        assert "events" in data
        assert "total" in data


# ---------------------------------------------------------------------------
# Analytics summary
# ---------------------------------------------------------------------------
def test_analytics_summary(client):
    """GET /api/analytics/summary returns aggregated stats."""
    with patch("app._get_pg") as mock_get_pg:
        mock_cur = MagicMock()
        # Four queries: by_type, by_source, per_hour, total
        mock_cur.fetchall.side_effect = [
            [("page_view", 10)],        # by_type
            [("web", 8), ("mobile", 2)], # by_source
            [],                          # per_hour
        ]
        mock_cur.fetchone.return_value = (10,)  # total
        mock_get_pg.return_value.cursor.return_value.__enter__ = MagicMock(return_value=mock_cur)
        mock_get_pg.return_value.cursor.return_value.__exit__ = MagicMock(return_value=False)

        resp = client.get("/api/analytics/summary")
        data = resp.get_json()
        assert resp.status_code == 200
        assert "total_events" in data
        assert "by_type" in data
        assert "by_source" in data


# ---------------------------------------------------------------------------
# Realtime analytics
# ---------------------------------------------------------------------------
def test_analytics_realtime(client):
    """GET /api/analytics/realtime returns recent events."""
    resp = client.get("/api/analytics/realtime")
    data = resp.get_json()
    assert resp.status_code == 200
    assert "window_seconds" in data
    assert data["window_seconds"] == 60
    assert "events" in data
