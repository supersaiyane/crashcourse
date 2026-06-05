"""CloudPlatform — Real-time analytics API for multi-cloud event ingestion."""
import hashlib
import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone

from flask import Flask, request, jsonify
from flask_cors import CORS

# ---------------------------------------------------------------------------
# Structured JSON logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}',
)
log = logging.getLogger("cloudplatform-api")

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app)  # allow frontend on different origin

# ---------------------------------------------------------------------------
# Infrastructure connections (lazy — created on first request)
# ---------------------------------------------------------------------------
_pg = None   # PostgreSQL connection
_redis = None  # Redis client
_kafka = None  # Kafka producer


def _get_pg():
    """Return a PostgreSQL connection, creating tables on first call."""
    global _pg
    if _pg is None:
        import psycopg2
        _pg = psycopg2.connect(
            host=os.getenv("POSTGRES_HOST", "postgres"),
            port=int(os.getenv("POSTGRES_PORT", "5432")),
            dbname=os.getenv("POSTGRES_DB", "cloudplatform"),
            user=os.getenv("POSTGRES_USER", "cloudplatform"),
            password=os.getenv("POSTGRES_PASSWORD", "changeme"),
        )
        _pg.autocommit = True
        with _pg.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id          TEXT PRIMARY KEY,
                    event_type  TEXT NOT NULL,
                    source      TEXT NOT NULL,
                    payload     JSONB,
                    event_hash  TEXT,
                    created_at  TIMESTAMPTZ DEFAULT NOW(),
                    processed_at TIMESTAMPTZ
                );
                CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
                CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
                CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
            """)
        log.info("PostgreSQL connected and tables ensured")
    return _pg


def _get_redis():
    """Return a Redis client."""
    global _redis
    if _redis is None:
        import redis
        _redis = redis.Redis(
            host=os.getenv("REDIS_HOST", "redis"),
            port=int(os.getenv("REDIS_PORT", "6379")),
            decode_responses=True,
        )
        log.info("Redis connected")
    return _redis


def _get_kafka():
    """Return a Kafka producer."""
    global _kafka
    if _kafka is None:
        from confluent_kafka import Producer
        _kafka = Producer({
            "bootstrap.servers": os.getenv("KAFKA_BOOTSTRAP", "kafka:9092"),
            "client.id": "cloudplatform-api",
        })
        log.info("Kafka producer created")
    return _kafka


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.route("/api/health")
def health():
    """Check connectivity to PostgreSQL, Redis, and Kafka."""
    checks = {}

    # PostgreSQL
    try:
        conn = _get_pg()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        checks["postgres"] = "ok"
    except Exception as exc:
        checks["postgres"] = f"error: {exc}"

    # Redis
    try:
        _get_redis().ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"

    # Kafka
    try:
        producer = _get_kafka()
        # list_topics blocks briefly but confirms broker connectivity
        meta = producer.list_topics(timeout=5)
        checks["kafka"] = "ok"
    except Exception as exc:
        checks["kafka"] = f"error: {exc}"

    all_ok = all(v == "ok" for v in checks.values())
    status_code = 200 if all_ok else 503
    return jsonify({
        "status": "healthy" if all_ok else "degraded",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": checks,
    }), status_code


# ---------------------------------------------------------------------------
# POST /api/events — ingest an analytics event
# ---------------------------------------------------------------------------
@app.route("/api/events", methods=["POST"])
def ingest_event():
    """Accept an analytics event, validate, store, and publish to Kafka."""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "request body must be valid JSON"}), 400

    # --- Input validation ---------------------------------------------------
    event_type = (body.get("event_type") or "").strip()
    source = (body.get("source") or "").strip()
    if not event_type:
        return jsonify({"error": "event_type is required"}), 400
    if not source:
        return jsonify({"error": "source is required"}), 400
    if len(event_type) > 100:
        return jsonify({"error": "event_type must be under 100 characters"}), 400
    if len(source) > 100:
        return jsonify({"error": "source must be under 100 characters"}), 400

    payload = body.get("payload", {})
    timestamp = body.get("timestamp") or datetime.now(timezone.utc).isoformat()

    event_id = str(uuid.uuid4())
    event_hash = hashlib.sha256(
        json.dumps({"type": event_type, "source": source, "payload": payload},
                   sort_keys=True).encode()
    ).hexdigest()[:16]

    event = {
        "id": event_id,
        "event_type": event_type,
        "source": source,
        "payload": payload,
        "timestamp": timestamp,
        "event_hash": event_hash,
    }

    # --- Publish to Kafka for async processing ------------------------------
    try:
        producer = _get_kafka()
        producer.produce(
            topic=os.getenv("KAFKA_TOPIC", "analytics-events"),
            key=event_type,
            value=json.dumps(event),
        )
        producer.flush(timeout=5)  # ensure delivery
    except Exception as exc:
        log.error("Kafka publish failed: %s", exc)
        # Fall back: write directly to PostgreSQL so data is not lost
        _store_event_directly(event)

    # --- Update Redis realtime counters ------------------------------------
    try:
        r = _get_redis()
        now = time.time()
        r.zadd("realtime:events", {json.dumps(event): now})
        # Trim events older than 120 seconds to keep the set small
        r.zremrangebyscore("realtime:events", "-inf", now - 120)
        # Increment per-type counter with 1-hour TTL
        type_key = f"counter:type:{event_type}"
        r.incr(type_key)
        r.expire(type_key, 3600)
    except Exception as exc:
        log.warning("Redis update failed (non-fatal): %s", exc)

    log.info("Event ingested id=%s type=%s source=%s", event_id, event_type, source)
    return jsonify(event), 201


def _store_event_directly(event: dict) -> None:
    """Fallback: write event straight to PostgreSQL when Kafka is down."""
    try:
        conn = _get_pg()
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO events (id, event_type, source, payload, event_hash, processed_at)
                   VALUES (%s, %s, %s, %s, %s, NOW())
                   ON CONFLICT (id) DO NOTHING""",
                (event["id"], event["event_type"], event["source"],
                 json.dumps(event.get("payload", {})), event["event_hash"]),
            )
    except Exception as exc:
        log.error("Direct PostgreSQL write also failed: %s", exc)


# ---------------------------------------------------------------------------
# GET /api/events — list events with optional filters
# ---------------------------------------------------------------------------
@app.route("/api/events", methods=["GET"])
def list_events():
    """Return events from PostgreSQL with optional type/source/limit filters."""
    event_type = request.args.get("type")
    source = request.args.get("source")
    limit = min(int(request.args.get("limit", 50)), 500)  # cap at 500

    query = "SELECT id, event_type, source, payload, event_hash, created_at FROM events WHERE 1=1"
    params = []

    if event_type:
        query += " AND event_type = %s"
        params.append(event_type)
    if source:
        query += " AND source = %s"
        params.append(source)

    query += " ORDER BY created_at DESC LIMIT %s"
    params.append(limit)

    try:
        conn = _get_pg()
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
    except Exception as exc:
        log.error("Failed to list events: %s", exc)
        return jsonify({"error": "database query failed"}), 500

    events = [
        {
            "id": r[0],
            "event_type": r[1],
            "source": r[2],
            "payload": r[3],
            "event_hash": r[4],
            "created_at": r[5].isoformat() if r[5] else None,
        }
        for r in rows
    ]
    return jsonify({"events": events, "total": len(events)})


# ---------------------------------------------------------------------------
# GET /api/analytics/summary — aggregated stats
# ---------------------------------------------------------------------------
@app.route("/api/analytics/summary")
def analytics_summary():
    """Return event counts by type, by source, and events per hour."""
    try:
        conn = _get_pg()
        with conn.cursor() as cur:
            # Counts by event_type
            cur.execute("""
                SELECT event_type, COUNT(*) FROM events
                GROUP BY event_type ORDER BY COUNT(*) DESC LIMIT 20
            """)
            by_type = {r[0]: r[1] for r in cur.fetchall()}

            # Counts by source
            cur.execute("""
                SELECT source, COUNT(*) FROM events
                GROUP BY source ORDER BY COUNT(*) DESC LIMIT 20
            """)
            by_source = {r[0]: r[1] for r in cur.fetchall()}

            # Events per hour (last 24 hours)
            cur.execute("""
                SELECT date_trunc('hour', created_at) AS hour, COUNT(*)
                FROM events
                WHERE created_at > NOW() - INTERVAL '24 hours'
                GROUP BY hour ORDER BY hour
            """)
            per_hour = [
                {"hour": r[0].isoformat(), "count": r[1]}
                for r in cur.fetchall()
            ]

            # Total count
            cur.execute("SELECT COUNT(*) FROM events")
            total = cur.fetchone()[0]

    except Exception as exc:
        log.error("Analytics query failed: %s", exc)
        return jsonify({"error": "analytics query failed"}), 500

    return jsonify({
        "total_events": total,
        "by_type": by_type,
        "by_source": by_source,
        "events_per_hour": per_hour,
    })


# ---------------------------------------------------------------------------
# GET /api/analytics/realtime — last 60 seconds of events
# ---------------------------------------------------------------------------
@app.route("/api/analytics/realtime")
def analytics_realtime():
    """Return events from the last 60 seconds via Redis sorted set."""
    try:
        r = _get_redis()
        cutoff = time.time() - 60
        raw = r.zrangebyscore("realtime:events", cutoff, "+inf")
        events = [json.loads(item) for item in raw]
    except Exception as exc:
        log.warning("Redis realtime query failed: %s", exc)
        events = []

    return jsonify({
        "window_seconds": 60,
        "count": len(events),
        "events": events,
    })


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
