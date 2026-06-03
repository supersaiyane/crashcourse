import pytest
import sys
sys.path.insert(0, '../backend')
app = __import__('app')

@pytest.fixture
def client():
    app.app.config['TESTING'] = True
    with app.app.test_client() as client:
        yield client

def test_health_endpoint(client):
    resp = client.get('/health')
    assert resp.status_code in (200, 503)

def test_shorten_missing_url(client):
    resp = client.post('/shorten', json={})
    assert resp.status_code == 400

def test_shorten_and_redirect(client):
    resp = client.post('/shorten', json={'url': 'https://example.com'})
    assert resp.status_code == 201
    data = resp.get_json()
    assert 'short_code' in data
    short_code = data['short_code']
    resp2 = client.get(f'/{short_code}')
    assert resp2.status_code == 302
    assert resp2.headers['Location'] == 'https://example.com'

def test_stats_endpoint(client):
    resp = client.post('/shorten', json={'url': 'https://stats-test.com'})
    data = resp.get_json()
    short_code = data['short_code']
    client.get(f'/{short_code}')
    resp = client.get(f'/stats/{short_code}')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_clicks'] >= 1

def test_404(client):
    resp = client.get('/nonexistent')
    assert resp.status_code == 404
