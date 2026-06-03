import os
import string
import random
import redis
import psycopg2
import psycopg2.extras
from flask import Flask, request, jsonify, redirect
from prometheus_flask_exporter import PrometheusMetrics

app = Flask(__name__)
metrics = PrometheusMetrics(app, group_by='endpoint')

metrics.info('app_info', 'Cutlink URL Shortener', version='1.0.0')

DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_NAME = os.getenv('DB_NAME', 'cutlink')
DB_USER = os.getenv('DB_USER', 'cutlink')
DB_PASS = os.getenv('DB_PASS', 'cutlink')
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
BASE_URL = os.getenv('BASE_URL', 'http://localhost:8080')

def get_db():
    return psycopg2.connect(host=DB_HOST, dbname=DB_NAME, user=DB_USER, password=DB_PASS)

def get_redis():
    return redis.Redis(host=REDIS_HOST, port=6379, decode_responses=True)

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS urls (
            id SERIAL PRIMARY KEY,
            short_code VARCHAR(10) UNIQUE NOT NULL,
            original_url TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            click_count INTEGER DEFAULT 0
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS clicks (
            id SERIAL PRIMARY KEY,
            short_code VARCHAR(10) NOT NULL,
            clicked_at TIMESTAMP DEFAULT NOW(),
            user_agent TEXT,
            ip_address VARCHAR(45)
        )
    ''')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_clicks_short_code ON clicks(short_code)')
    conn.commit()
    cur.close()
    conn.close()

def generate_short_code(length=6):
    chars = string.ascii_letters + string.digits
    return ''.join(random.choices(chars, k=length))

@app.route('/health')
def health():
    db_ok = False
    redis_ok = False
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT 1')
        cur.close()
        conn.close()
        db_ok = True
    except Exception:
        pass
    try:
        r = get_redis()
        r.ping()
        redis_ok = True
    except Exception:
        pass
    status = 200 if db_ok and redis_ok else 503
    return jsonify(status='healthy' if status == 200 else 'degraded',
                   database='up' if db_ok else 'down',
                   redis='up' if redis_ok else 'down'), status

@app.route('/api/shorten', methods=['POST'])
def shorten():
    data = request.get_json()
    if not data or 'url' not in data:
        return jsonify(error='url is required'), 400
    original_url = data['url']
    custom_code = data.get('custom_code')
    if custom_code:
        short_code = custom_code
    else:
        r = get_redis()
        cached = r.get(f'url:{original_url}')
        if cached:
            return jsonify(short_url=f'{BASE_URL}/{cached}',
                           short_code=cached), 200
        short_code = generate_short_code()
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute('INSERT INTO urls (short_code, original_url) VALUES (%s, %s)',
                    (short_code, original_url))
        conn.commit()
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        cur.close()
        conn.close()
        return jsonify(error='custom code already taken'), 409
    cur.close()
    conn.close()
    r = get_redis()
    r.setex(f'code:{short_code}', 86400, original_url)
    r.setex(f'url:{original_url}', 86400, short_code)
    return jsonify(short_url=f'{BASE_URL}/{short_code}',
                   short_code=short_code), 201

@app.route('/<short_code>')
def redirect_url(short_code):
    r = get_redis()
    original = r.get(f'code:{short_code}')
    if not original:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute('SELECT original_url FROM urls WHERE short_code = %s', (short_code,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify(error='not found'), 404
        original = row['original_url']
        r.setex(f'code:{short_code}', 86400, original)
        cur.close()
        conn.close()
    conn = get_db()
    cur = conn.cursor()
    cur.execute('UPDATE urls SET click_count = click_count + 1 WHERE short_code = %s',
                (short_code,))
    cur.execute('INSERT INTO clicks (short_code, user_agent, ip_address) VALUES (%s, %s, %s)',
                (short_code, request.headers.get('User-Agent'),
                 request.headers.get('X-Forwarded-For', request.remote_addr)))
    conn.commit()
    cur.close()
    conn.close()
    return redirect(original, code=302)

@app.route('/stats/<short_code>')
def stats(short_code):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute('SELECT * FROM urls WHERE short_code = %s', (short_code,))
    url_data = cur.fetchone()
    if not url_data:
        cur.close()
        conn.close()
        return jsonify(error='not found'), 404
    cur.execute('SELECT COUNT(*) as total FROM clicks WHERE short_code = %s', (short_code,))
    total = cur.fetchone()['total']
    cur.execute('''
        SELECT DATE(clicked_at) as day, COUNT(*) as count
        FROM clicks WHERE short_code = %s
        GROUP BY day ORDER BY day DESC LIMIT 7
    ''', (short_code,))
    daily = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(
        short_code=url_data['short_code'],
        original_url=url_data['original_url'],
        created_at=url_data['created_at'].isoformat(),
        total_clicks=total,
        daily_clicks=[{'date': d['day'].isoformat(), 'count': d['count']} for d in daily]
    )

@app.route('/api/urls')
def list_urls():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute('SELECT * FROM urls ORDER BY created_at DESC LIMIT 100')
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(urls=[{
        'short_code': r['short_code'],
        'original_url': r['original_url'],
        'click_count': r['click_count'],
        'created_at': r['created_at'].isoformat()
    } for r in rows])

init_db()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
