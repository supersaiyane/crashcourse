# Exercise 4: Full Pipeline Integration Test

**Goal:** Run the complete CloudPlatform data pipeline end-to-end: send an event via the API, verify it flows through Kafka, gets stored in PostgreSQL, and is cached in Redis.

## Step 1: Send an event to the API

```bash
curl -X POST http://localhost:8080/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "page_view",
    "source": "web",
    "user_id": "usr_test001",
    "properties": {"page": "/pricing", "duration_ms": 3200}
  }'
```

Expected output:
- `{"status": "accepted", "event_id": "evt_..."}` — API accepted the event

## Step 2: Verify the event in Kafka

```bash
docker exec -it kafka kafka-console-consumer \
  --topic analytics-events --from-beginning \
  --max-messages 1 \
  --bootstrap-server localhost:9092              # read the latest event
```

Expected output:
- JSON showing the event with `event_type`, `user_id`, and `cloud` fields

## Step 3: Verify the event in PostgreSQL

```bash
psql -h localhost -U dbadmin -d analytics -c \
  "SELECT event_type, source, user_id, cloud
   FROM events WHERE user_id = 'usr_test001'
   ORDER BY created_at DESC LIMIT 1;"
```

Expected output:
- One row: `page_view | web | usr_test001 | <cloud>`

## Step 4: Query the API and verify Redis cache

```bash
# First call — cache miss, queries PostgreSQL
curl http://localhost:8080/api/analytics/events-by-type?month=2024-01

# Verify cache was populated
redis-cli GET "cache:events_by_type:2024-01"     # should show JSON result
redis-cli TTL "cache:events_by_type:2024-01"     # should show ~295 seconds
```

Expected output:
- API returns JSON with event counts
- Redis shows the same JSON cached with ~5 minute TTL

## Verify

```bash
# Second API call should be faster (cache hit)
curl -w "\nTotal time: %{time_total}s\n" \
  http://localhost:8080/api/analytics/events-by-type?month=2024-01
```

You should see: total time under 10ms on the second call (cache hit) vs 50ms+ on the first (cache miss). The full data pipeline is operational.
