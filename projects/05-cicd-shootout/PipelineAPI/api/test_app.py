"""Tests for PipelineAPI."""
import json
import pytest
from app import app

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json["status"] == "ok"

def test_create_item(client):
    r = client.post("/api/items", json={"name": "Widget"})
    assert r.status_code == 201
    assert r.json["name"] == "Widget"
    assert "id" in r.json

def test_create_item_no_name(client):
    r = client.post("/api/items", json={"name": ""})
    assert r.status_code == 400

def test_list_items(client):
    client.post("/api/items", json={"name": "A"})
    r = client.get("/api/items")
    assert r.status_code == 200
    assert r.json["total"] >= 1

def test_get_item_not_found(client):
    r = client.get("/api/items/nonexistent")
    assert r.status_code == 404

def test_delete_item(client):
    r = client.post("/api/items", json={"name": "ToDelete"})
    item_id = r.json["id"]
    r = client.delete(f"/api/items/{item_id}")
    assert r.status_code == 200
    assert r.json["deleted"] is True
