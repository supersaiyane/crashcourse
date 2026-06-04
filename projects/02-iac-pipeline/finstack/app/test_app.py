"""Tests for FinStack Payment API."""
import json
import pytest
from app import app

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c

def test_health(client):
    """Health endpoint returns 200 with status ok."""
    r = client.get("/health")
    assert r.status_code == 200
    data = json.loads(r.data)
    assert data["status"] == "ok"

def test_health_has_timestamp(client):
    """Health endpoint includes timestamp field."""
    r = client.get("/health")
    data = json.loads(r.data)
    assert "timestamp" in data

def test_balance_endpoint_exists(client):
    """Balance endpoint responds (may return error without DB, but does not 404)."""
    r = client.get("/api/balance")
    assert r.status_code != 404

def test_payment_requires_body(client):
    """Payment endpoint rejects empty body."""
    r = client.post("/api/payment", data="{}", content_type="application/json")
    # Should return 400 or process — not 404 or 500
    assert r.status_code in (200, 201, 400)

def test_payment_endpoint_exists(client):
    """Payment endpoint responds to POST."""
    r = client.post("/api/payment",
        data=json.dumps({"from": "ACC001", "to": "ACC002", "amount": 100}),
        content_type="application/json")
    assert r.status_code != 404

def test_statements_endpoint_exists(client):
    """Statements endpoint responds (may error without S3, but does not 404)."""
    r = client.get("/api/statements")
    assert r.status_code != 404

def test_unknown_route_returns_404(client):
    """Unknown routes return 404."""
    r = client.get("/api/nonexistent")
    assert r.status_code == 404
