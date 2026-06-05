"""CloudPlatform — Kafka consumer that processes analytics events."""
import hashlib
import json
import logging
import os
import signal
import sys
import time
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Structured JSON logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}',
)
log = logging.getLogger("cloudplatform-processor")

# ---------------------------------------------------------------------------
# Graceful shutdown
# ---------------------------------------------------------------------------
running = True


def _shutdown(signum, frame):
    """Handle SIGTERM/SIGINT for clean container shutdown."""
    global running
    log.info("Shutdown signal received (sig=%s), draining...", signum)
    running = False


signal.signal(signal.SIGTERM, _shutdown)
signal.signal(signal.SIGINT, _shutdown)

# ---------------------------------------------------------------------------
# Infrastructure helpers
# ---------------------------------------------------------------------------


def get_pg():
    """Create and return a PostgreSQL connection with the events table."""
    import psycopg2
    conn = psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "postgres"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "cloudplatform"),
        user=os.getenv("POSTGRES_USER", "cloudplatform"),
        password=os.getenv("POSTGRES_PASSWORD", "changeme"),
    )
    conn.autocommit = True
    with conn.cursor() as cur:
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
        """)
    log.info("PostgreSQL connected")
    return conn


def get_redis():
    """Create and return a Redis client."""
    import redis
    r = redis.Redis(
        host=os.getenv("REDIS_HOST", "redis"),
        port=int(os.getenv("REDIS_PORT", "6379")),
        decode_responses=True,
    )
    r.ping()
    log.info("Redis connected")
    return r


def get_consumer():
    """Create and return a Kafka consumer subscribed to the events topic."""
    from confluent_kafka import Consumer
    topic = os.getenv("KAFKA_TOPIC", "analytics-events")
    consumer = Consumer({
        "bootstrap.servers": os.getenv("KAFKA_BOOTSTRAP", "kafka:9092"),
        "group.id": os.getenv("KAFKA_GROUP_ID", "cloudplatform-processor"),
        "auto.offset.reset": "earliest",
        "enable.auto.commit": True,
    })
    consumer.subscribe([topic])
    log.info("Kafka consumer subscribed to topic=%s", topic)
    return consumer


# ---------------------------------------------------------------------------
# Event processing
# ---------------------------------------------------------------------------


def enrich_event(raw: dict) -> dict:
    """Add processed_at timestamp and compute/verify event_hash."""
    raw["processed_at"] = datetime.now(timezone.utc).isoformat()
    # Recompute hash for integrity verification
    raw["event_hash"] = hashlib.sha256(
        json.dumps({
            "type": raw.get("event_type", ""),
            "source": raw.get("source", ""),
            "payload": raw.get("payload", {}),
        }, sort_keys=True).encode()
    ).hexdigest()[:16]
    return raw


def store_event(conn, event: dict) -> None:
    """Insert or update event in PostgreSQL."""
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO events (id, event_type, source, payload, event_hash, processed_at)
               VALUES (%s, %s, %s, %s, %s, %s)
               ON CONFLICT (id) DO UPDATE
               SET processed_at = EXCLUDED.processed_at,
                   event_hash   = EXCLUDED.event_hash""",
            (
                event["id"],
                event["event_type"],
                event["source"],
                json.dumps(event.get("payload", {})),
                event["event_hash"],
                event["processed_at"],
            ),
        )


def update_realtime(redis_client, event: dict) -> None:
    """Update Redis sorted sets for realtime counters."""
    now = time.time()

    # Add to realtime window (sorted set scored by timestamp)
    redis_client.zadd("realtime:events", {json.dumps(event): now})
    # Trim entries older than 120 seconds
    redis_client.zremrangebyscore("realtime:events", "-inf", now - 120)

    # Per-type counter with 1-hour TTL
    type_key = f"counter:type:{event['event_type']}"
    redis_client.incr(type_key)
    redis_client.expire(type_key, 3600)

    # Per-source counter with 1-hour TTL
    source_key = f"counter:source:{event['source']}"
    redis_client.incr(source_key)
    redis_client.expire(source_key, 3600)


# ---------------------------------------------------------------------------
# Main consumer loop
# ---------------------------------------------------------------------------


def main() -> None:
    """Run the Kafka consumer loop: consume -> enrich -> store -> update cache."""
    log.info("Starting CloudPlatform event processor...")

    # Wait for dependencies to be ready (simple retry with backoff)
    pg, r, consumer = None, None, None
    for attempt in range(1, 31):  # up to 30 retries (~60 seconds)
        try:
            if pg is None:
                pg = get_pg()
            if r is None:
                r = get_redis()
            if consumer is None:
                consumer = get_consumer()
            break
        except Exception as exc:
            log.warning("Waiting for dependencies (attempt %d): %s", attempt, exc)
            time.sleep(2)
    else:
        log.error("Could not connect to all dependencies after 30 attempts, exiting")
        sys.exit(1)

    processed = 0
    errors = 0

    while running:
        msg = consumer.poll(timeout=1.0)  # 1-second poll
        if msg is None:
            continue
        if msg.error():
            log.error("Kafka consumer error: %s", msg.error())
            errors += 1
            continue

        try:
            raw = json.loads(msg.value().decode("utf-8"))
            event = enrich_event(raw)
            store_event(pg, event)
            update_realtime(r, event)
            processed += 1

            if processed % 100 == 0:
                log.info("Processed %d events (%d errors)", processed, errors)

        except json.JSONDecodeError as exc:
            log.error("Invalid JSON in message: %s", exc)
            errors += 1
        except Exception as exc:
            log.error("Failed to process event: %s", exc)
            errors += 1
            # Reconnect PostgreSQL on connection errors
            try:
                pg = get_pg()
            except Exception:
                pass

    # Clean shutdown
    consumer.close()
    log.info("Processor stopped. Total processed=%d errors=%d", processed, errors)


if __name__ == "__main__":
    main()
