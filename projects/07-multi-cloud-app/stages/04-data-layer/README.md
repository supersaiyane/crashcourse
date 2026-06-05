# Stage 4: Data Layer

**Goal:** Design and deploy the data layer that powers the multi-cloud analytics application — PostgreSQL for persistent storage with proper schema design, Redis for caching and realtime counters, and Kafka for event streaming between services. By the end, you have a complete data pipeline: events flow through Kafka, get processed into PostgreSQL, and are served through a Redis cache.

**Prerequisites:** Stages 1-3 complete (at least one cloud cluster running with PostgreSQL). Docker Compose installed for local development. Basic familiarity with SQL, key-value stores, and messaging — see `PostgreSQL.md`, `Redis.md`, `Kafka.md`.

---

## 1. Theory (What & Why)

### Why three data systems?

Each system solves a different problem. Using all three together is a standard pattern for event-driven analytics platforms. No single database can handle high-throughput writes, sub-millisecond reads, and durable ordered event streams simultaneously.

### The data flow architecture

```text
+----------+     publish      +----------+     consume      +------------+
|  API     | --------------> |  Kafka   | --------------> |  Processor |
|  Server  |                  |  Topic   |                  |  Service   |
+----------+                  +----------+                  +-----+------+
     |                                                            |
     | query (cache miss)                                    write |
     v                                                            v
+----------+     cache hit    +----------+                  +----------+
|  Redis   | <-------------- |  Client  |                  | Postgres |
|  Cache   |                  |  Request |                  | (durable)|
+----------+                  +----------+                  +----------+
```

### What each system does best

| System | Role | Strength | Weakness |
|--------|------|----------|----------|
| **PostgreSQL** | Durable storage, complex queries | ACID transactions, SQL, joins, aggregations | Slow for high-frequency reads (10-50ms per query) |
| **Redis** | Cache, realtime counters, rate limiting | Sub-millisecond reads, atomic operations | Volatile — data lost on restart without persistence config |
| **Kafka** | Event streaming, service decoupling | Ordered, durable, replayable event log | Not a database — cannot query by key or run aggregations |

**Mental model:** Kafka is the conveyor belt (events flow through it in order), PostgreSQL is the warehouse (events are stored permanently and can be searched), Redis is the counter at the front desk (fast answers to frequent questions, rebuilt from the warehouse if lost).

### Why not just use PostgreSQL for everything?

You could — and for low-traffic applications, you should. But analytics workloads have specific patterns that break single-database architectures:

- **Write volume:** Thousands of events per second overwhelm a single PostgreSQL instance. Kafka absorbs writes at any rate and lets PostgreSQL consume at its own pace — a natural backpressure mechanism.
- **Read latency:** Dashboard queries hitting PostgreSQL directly add 10-50ms per query. Redis returns the same data in <1ms. For a dashboard refreshing every 5 seconds with 20 panels, that is the difference between 200ms and 1000ms total load time.
- **Decoupling:** Multiple consumers can read from Kafka independently. Adding a new analytics pipeline (fraud detection, compliance reporting) does not touch the existing ones.
- **Replay:** Kafka retains events for a configurable period (default 7 days). If a processor has a bug, fix it and replay from the beginning — the events are still there.

In BFSI, this pattern is common for transaction monitoring, fraud detection pipelines, and realtime dashboard feeds during salary-day traffic spikes when write volume can 10x in minutes.

### How the three systems interact

```text
                    Event Lifecycle
                    ===============

  1. API receives event          2. Kafka persists event
     (validation, auth)             (ordered by user_id)
          |                              |
          v                              v
  +---------------+            +------------------+
  | POST /events  |  ------->  | analytics-events |
  | { type, user, |   publish  | partition 0: usr_a|
  |   properties }|            | partition 1: usr_b|
  +---------------+            | partition 2: usr_c|
                               +------------------+
                                         |
                                    consume |
                                         v
                               +------------------+
                               | Processor reads  |
                               | from each        |
                               | partition         |
                               +--------+---------+
                                        |
                          +-------------+-------------+
                          |                           |
                          v                           v
                   +------------+             +------------+
                   | PostgreSQL |             |   Redis    |
                   | INSERT     |             | ZINCRBY    |
                   | events ... |             | counters   |
                   +------------+             +------------+

  3. Processor writes to           4. Processor updates
     PostgreSQL (durable)             Redis counters (fast)

  5. Client queries API  --->  Check Redis cache first
                               Cache hit?  --> return (<1ms)
                               Cache miss? --> query PostgreSQL (10-50ms)
                                              --> cache result in Redis
                                              --> return
```

### Key vocabulary

| Term | Meaning |
|------|---------|
| **Table partitioning** | Splitting a large table into smaller pieces by range (e.g. by month) — faster queries, easier maintenance |
| **JSONB** | PostgreSQL's binary JSON type — queryable, indexable, flexible schema within a column |
| **TTL** | Time To Live — how long a Redis key exists before automatic deletion |
| **Sorted set (ZSET)** | Redis data structure — members with scores, automatically sorted. Perfect for leaderboards and counters |
| **Kafka topic** | Named stream of events — producers write to it, consumers read from it |
| **Kafka partition** | A topic is split into partitions for parallelism. Events within a partition are strictly ordered |
| **Consumer group** | A set of consumers that share the work of reading partitions — each partition goes to exactly one consumer |
| **Consumer lag** | How far behind a consumer is from the latest event. Lag = 0 means caught up. Growing lag means the consumer is too slow |
| **Idempotent write** | A write that can be safely repeated without duplicating data (e.g. `INSERT ... ON CONFLICT DO NOTHING`) |

---

## 2. Hands-On: Build the Data Layer

### 2.1 PostgreSQL schema design

Connect to your PostgreSQL instance (from any of the three clouds, or use a local Docker instance for development):

```bash
# Local development — start PostgreSQL with Docker
docker run -d --name pg-dev \
  -e POSTGRES_DB=analytics \
  -e POSTGRES_USER=dbadmin \
  -e POSTGRES_PASSWORD=devpassword \
  -p 5432:5432 \
  postgres:16-alpine
# Output: <container_id>

# Connect with psql
psql -h localhost -U dbadmin -d analytics
# Output: psql (16.2) ... analytics=>
```

Create the analytics events table with partitioning:

```sql
-- events table — the core of CloudPlatform's analytics storage
-- Partitioned by created_at (month) for query performance and maintenance
CREATE TABLE events (
    id          BIGSERIAL,                       -- auto-incrementing ID
    event_type  VARCHAR(50)   NOT NULL,          -- 'page_view', 'click', 'purchase'
    source      VARCHAR(20)   NOT NULL,          -- 'web', 'mobile', 'api'
    user_id     VARCHAR(64),                     -- hashed user identifier (PII-safe)
    properties  JSONB         NOT NULL DEFAULT '{}',  -- flexible event data (no schema migration needed)
    cloud       VARCHAR(10)   NOT NULL,          -- 'aws', 'gcp', 'azure' — which cloud processed this
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(), -- when the event occurred
    PRIMARY KEY (id, created_at)                 -- partition key MUST be in the primary key
) PARTITION BY RANGE (created_at);               -- one partition per month

-- Create monthly partitions — must exist BEFORE inserts for that month
-- In production, automate this with pg_partman or a cron job
CREATE TABLE events_2024_01 PARTITION OF events
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE events_2024_02 PARTITION OF events
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE events_2024_03 PARTITION OF events
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
-- Add more as needed — one partition per month

-- Indexes for common query patterns (created on each partition automatically)
CREATE INDEX idx_events_type   ON events (event_type);       -- WHERE event_type = 'purchase'
CREATE INDEX idx_events_source ON events (source);           -- WHERE source = 'mobile'
CREATE INDEX idx_events_user   ON events (user_id);          -- WHERE user_id = 'usr_abc123'
CREATE INDEX idx_events_cloud  ON events (cloud);            -- WHERE cloud = 'aws'
CREATE INDEX idx_events_props  ON events USING GIN (properties); -- JSONB queries: properties->>'page'
```

Why partitioning matters — demonstrate with EXPLAIN:

```sql
-- Without partitioning: scans ALL rows in the entire table
-- With partitioning: scans ONLY the January partition

EXPLAIN ANALYZE
SELECT count(*) FROM events
WHERE created_at >= '2024-01-01' AND created_at < '2024-02-01';
-- Look for "Seq Scan on events_2024_01" in the output
-- Other partitions (events_2024_02, events_2024_03) are PRUNED — not touched at all
-- This is the key benefit: queries over time ranges only touch relevant months
```

Insert test data and verify:

```sql
-- Insert sample events across different months, sources, and clouds
INSERT INTO events (event_type, source, user_id, properties, cloud, created_at)
VALUES
    ('page_view', 'web',    'usr_abc123', '{"page": "/dashboard", "duration_ms": 1200}',     'aws',   '2024-01-15 10:00:00+00'),
    ('click',     'web',    'usr_abc123', '{"button": "export", "section": "reports"}',       'gcp',   '2024-01-15 10:00:05+00'),
    ('purchase',  'api',    'usr_def456', '{"amount": 99.99, "currency": "USD", "item": "pro_plan"}', 'azure', '2024-01-15 10:01:00+00'),
    ('page_view', 'mobile', 'usr_ghi789', '{"page": "/settings", "duration_ms": 800}',       'aws',   '2024-02-01 09:00:00+00'),
    ('page_view', 'web',    'usr_abc123', '{"page": "/billing", "duration_ms": 2100}',        'gcp',   '2024-01-20 14:30:00+00'),
    ('click',     'mobile', 'usr_def456', '{"button": "pay_now", "section": "checkout"}',     'azure', '2024-02-15 11:00:00+00'),
    ('purchase',  'web',    'usr_ghi789', '{"amount": 49.99, "currency": "GBP", "item": "basic_plan"}', 'aws', '2024-03-01 08:00:00+00');

-- Query: events by type in January (only scans events_2024_01)
SELECT event_type, count(*), avg((properties->>'duration_ms')::int) as avg_duration
FROM events
WHERE created_at >= '2024-01-01' AND created_at < '2024-02-01'
GROUP BY event_type;
-- Expected:
-- event_type | count | avg_duration
-- page_view  |   2   |    1650
-- click      |   1   |    null
-- purchase   |   1   |    null

-- Query: events by cloud provider (across all partitions)
SELECT cloud, count(*) as event_count
FROM events
GROUP BY cloud
ORDER BY event_count DESC;
-- Expected:
-- cloud  | event_count
-- aws    |     3
-- gcp    |     2
-- azure  |     2

-- Query: JSONB — find all purchases over $50
SELECT user_id, (properties->>'amount')::numeric as amount, properties->>'currency' as currency
FROM events
WHERE event_type = 'purchase'
  AND (properties->>'amount')::numeric > 50;
-- Expected: usr_def456 | 99.99 | USD
```

### 2.2 Redis setup and patterns

Start Redis and configure caching:

```bash
# Local development — start Redis with Docker
docker run -d --name redis-dev \
  -p 6379:6379 \
  redis:7-alpine \
  redis-server \
    --maxmemory 128mb \
    --maxmemory-policy allkeys-lru                # evict least-recently-used keys when full
# Output: <container_id>

# Connect with redis-cli
redis-cli
# Output: 127.0.0.1:6379>
```

Implement the three Redis patterns used in CloudPlatform:

```bash
# Pattern 1: QUERY CACHE — store expensive query results with TTL
# Key format: cache:<query_identifier>
# TTL: 300 seconds (5 minutes) — stale data is acceptable for dashboards

redis-cli SET "cache:events_by_type:2024-01" \
  '{"page_view":2,"click":1,"purchase":1}' \
  EX 300                                         # auto-deletes after 5 minutes
# Output: OK

redis-cli GET "cache:events_by_type:2024-01"     # retrieve cached result
# Output: {"page_view":2,"click":1,"purchase":1}

redis-cli TTL "cache:events_by_type:2024-01"     # seconds until expiry
# Output: (integer) 295
```

```bash
# Pattern 2: REALTIME COUNTERS — sorted sets for leaderboards
# Key format: realtime:<metric>:<period>
# Use ZINCRBY for atomic increments — safe under concurrent writes from multiple pods

redis-cli ZINCRBY "realtime:page_views:2024-01-15" 1 "/dashboard"
redis-cli ZINCRBY "realtime:page_views:2024-01-15" 1 "/dashboard"
redis-cli ZINCRBY "realtime:page_views:2024-01-15" 1 "/settings"
redis-cli ZINCRBY "realtime:page_views:2024-01-15" 1 "/dashboard"
redis-cli ZINCRBY "realtime:page_views:2024-01-15" 1 "/billing"
# Each ZINCRBY is atomic — no race conditions even with 100 concurrent writers

# Top pages today (descending order by count)
redis-cli ZREVRANGE "realtime:page_views:2024-01-15" 0 9 WITHSCORES
# Expected:
# 1) "/dashboard"
# 2) "3"
# 3) "/settings"
# 4) "1"
# 5) "/billing"
# 6) "1"

# Set daily expiry — counters reset automatically at midnight
redis-cli EXPIRE "realtime:page_views:2024-01-15" 86400    # 24 hours in seconds
# Output: (integer) 1
```

```bash
# Pattern 3: RATE LIMITING — sliding window counter per user
# Key format: ratelimit:<user_id>:<minute_bucket>
# Used to protect the CloudPlatform API from abuse

redis-cli INCR "ratelimit:usr_abc123:202401151000"           # increment counter
redis-cli EXPIRE "ratelimit:usr_abc123:202401151000" 60      # expire after 1 minute
# Output: (integer) 1, (integer) 1

# Simulate multiple requests
redis-cli INCR "ratelimit:usr_abc123:202401151000"
redis-cli INCR "ratelimit:usr_abc123:202401151000"
redis-cli INCR "ratelimit:usr_abc123:202401151000"

# Check: if count > 100, reject the request (HTTP 429)
redis-cli GET "ratelimit:usr_abc123:202401151000"
# Output: "4"
# Application logic: if (count > 100) return 429 Too Many Requests
```

Verify Redis memory and configuration:

```bash
redis-cli INFO memory                            # used_memory, maxmemory, eviction stats
redis-cli INFO keyspace                          # number of keys per database
redis-cli CONFIG GET maxmemory-policy            # should be allkeys-lru
# allkeys-lru = when maxmemory is reached, evict the least recently used key
# This is correct for a cache — old/unused cache entries are evicted first
```

### 2.3 Kafka cluster

Start Kafka with Docker Compose (local development):

```yaml
# docker-compose.kafka.yml — Kafka in KRaft mode (no Zookeeper)
services:
  kafka:
    image: confluentinc/cp-kafka:7.6.0
    ports:
      - "9092:9092"                              # client connections
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller     # single node acts as both
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
      KAFKA_LOG_DIRS: /var/lib/kafka/data
      CLUSTER_ID: MkU3OEVBNTcwNTJENDM2Qk         # static cluster ID for dev
```

```bash
# Start Kafka
docker compose -f docker-compose.kafka.yml up -d
# Output: [+] Running 1/1 Container kafka Started

# Create the analytics events topic
docker exec -it kafka kafka-topics --create \
  --topic analytics-events \
  --partitions 3 \
  --replication-factor 1 \
  --bootstrap-server localhost:9092
# Output: Created topic analytics-events.

# List topics — verify creation
docker exec -it kafka kafka-topics --list \
  --bootstrap-server localhost:9092
# Output: analytics-events

# Describe topic — check partitions and replication
docker exec -it kafka kafka-topics --describe \
  --topic analytics-events \
  --bootstrap-server localhost:9092
# Expected:
# Topic: analytics-events  PartitionCount: 3  ReplicationFactor: 1
# Partition: 0  Leader: 1  Replicas: 1  Isr: 1
# Partition: 1  Leader: 1  Replicas: 1  Isr: 1
# Partition: 2  Leader: 1  Replicas: 1  Isr: 1
```

Produce and consume test messages:

```bash
# Terminal 1: Start a consumer (reads all existing + new messages)
docker exec -it kafka kafka-console-consumer \
  --topic analytics-events \
  --from-beginning \
  --bootstrap-server localhost:9092
# (leave running — it will display messages as they arrive)

# Terminal 2: Produce messages (type each line, press Enter)
docker exec -it kafka kafka-console-producer \
  --topic analytics-events \
  --bootstrap-server localhost:9092
# Paste these lines one at a time:
# {"event_type":"page_view","source":"web","user_id":"usr_abc123","page":"/dashboard","timestamp":"2024-01-15T10:00:00Z"}
# {"event_type":"click","source":"web","user_id":"usr_abc123","button":"export","timestamp":"2024-01-15T10:00:05Z"}
# {"event_type":"purchase","source":"api","user_id":"usr_def456","amount":99.99,"timestamp":"2024-01-15T10:01:00Z"}
# Ctrl+C to stop producing

# Terminal 1 should show all three messages — confirm Kafka delivery
# Ctrl+C to stop consuming
```

Understanding partitions and consumer lag:

```bash
# Check consumer group lag (how far behind the consumer is)
docker exec -it kafka kafka-consumer-groups \
  --group analytics-processor \
  --describe \
  --bootstrap-server localhost:9092
# Expected output:
# TOPIC              PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
# analytics-events   0          10              10              0
# analytics-events   1          8               8               0
# analytics-events   2          12              12              0
# LAG = 0 means the consumer is caught up
# LAG > 0 means the consumer is behind — events are waiting to be processed

# Why this matters in BFSI:
# During salary-day traffic (10x normal volume), lag will grow if the processor
# cannot keep up. Alert when lag exceeds 1000 messages across all partitions.
```

### 2.4 Integration test — the full CloudPlatform pipeline

Run the complete data flow: event enters via API, flows through Kafka, gets stored in PostgreSQL, and is served from Redis cache.

```bash
# Step 1: Send an event to the CloudPlatform API (publishes to Kafka internally)
curl -X POST http://localhost:8080/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "page_view",
    "source": "web",
    "user_id": "usr_test001",
    "properties": {"page": "/pricing", "duration_ms": 3200}
  }'
# Expected: {"status": "accepted", "event_id": "evt_..."}
```

```bash
# Step 2: Verify the event reached Kafka
docker exec -it kafka kafka-console-consumer \
  --topic analytics-events \
  --from-beginning \
  --max-messages 1 \
  --bootstrap-server localhost:9092
# Should show the event JSON with cloud field added by the API
```

```bash
# Step 3: Verify the processor wrote to PostgreSQL
psql -h localhost -U dbadmin -d analytics -c \
  "SELECT id, event_type, source, user_id, cloud, created_at
   FROM events
   WHERE user_id = 'usr_test001'
   ORDER BY created_at DESC
   LIMIT 5;"
# Expected: one row with event_type=page_view, source=web
```

```bash
# Step 4: Query the CloudPlatform API (first call = cache miss, hits PostgreSQL)
curl http://localhost:8080/api/analytics/events-by-type?month=2024-01
# Expected: {"page_view": 3, "click": 1, "purchase": 1}

# Step 5: Verify the cache was populated in Redis
redis-cli GET "cache:events_by_type:2024-01"
# Should show the same JSON as the API response

redis-cli TTL "cache:events_by_type:2024-01"
# Should show ~295 (5-minute TTL minus elapsed seconds)

# Step 6: Query API again (this time = cache hit, returns from Redis in <1ms)
curl http://localhost:8080/api/analytics/events-by-type?month=2024-01
# Same result, but response time drops from ~50ms to <5ms
```

```bash
# Step 7: Verify realtime counters were updated
redis-cli ZREVRANGE "realtime:page_views:2024-01-15" 0 4 WITHSCORES
# Should show /pricing with a count of 1
```

---

## 3. Key patterns

### Data flow summary

```text
1. Client sends event to CloudPlatform API
2. API validates event, publishes to Kafka topic "analytics-events"
3. Kafka persists the event, distributes across partitions by user_id hash
4. Processor service consumes from Kafka:
   a. Writes event to PostgreSQL (durable storage, partitioned by month)
   b. Updates Redis realtime counters (ZINCRBY — atomic, no locks)
5. Client queries API for analytics
6. API checks Redis cache first:
   a. Cache hit  --> return cached result (<1ms)
   b. Cache miss --> query PostgreSQL, cache result with 5-min TTL, return (10-50ms)
```

### When to use each system

| Question | Answer | System |
|----------|--------|--------|
| "Store this permanently" | Durable, queryable, ACID | PostgreSQL |
| "How many X happened today?" | Realtime counter | Redis (sorted set with ZINCRBY) |
| "Cache this query result for 5 minutes" | Temporary, fast retrieval | Redis (SET with EX) |
| "Limit API calls to 100/minute/user" | Rate limiting | Redis (INCR + EXPIRE) |
| "Send this to multiple consumers" | Event stream, fan-out | Kafka |
| "Replay events from last Tuesday" | Event log with retention | Kafka (reset consumer offset) |
| "Join events with user profiles" | Complex relational query | PostgreSQL |

### Partition strategy for Kafka

Events are partitioned by `user_id` hash to ensure all events for a user go to the same partition. This guarantees ordering per user — important for event sequences (view, click, purchase).

```text
Partition 0: usr_abc123 events (strictly ordered within partition)
Partition 1: usr_def456 events (strictly ordered within partition)
Partition 2: usr_ghi789 events (strictly ordered within partition)

No ordering guarantee ACROSS partitions — only WITHIN each partition.
```

If you partition by event_type instead, you get ordering by type but lose per-user ordering. Choose based on your query patterns. For CloudPlatform's user-centric analytics, user_id is the right partition key.

### PostgreSQL partitioning maintenance

```sql
-- Automate partition creation — run monthly via cron or pg_cron
-- This creates the next 3 months of partitions
DO $$
DECLARE
    start_date DATE := date_trunc('month', NOW());
    i INT;
BEGIN
    FOR i IN 0..2 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS events_%s PARTITION OF events
             FOR VALUES FROM (%L) TO (%L)',
            to_char(start_date + (i || ' months')::interval, 'YYYY_MM'),
            start_date + (i || ' months')::interval,
            start_date + ((i+1) || ' months')::interval
        );
    END LOOP;
END $$;
-- Run this on the 1st of each month to ensure partitions exist before inserts arrive
```

---

## 4. Common mistakes

- **No TTL on Redis cache keys:** Without TTL, the cache grows until maxmemory is reached, then LRU eviction kicks in unpredictably. Worse, stale data is served indefinitely. Always set `EX` (seconds) or `PX` (milliseconds) on every cache key.
- **Missing partitions in PostgreSQL:** Without a partition for a given month, inserts for that month fail with `ERROR: no partition of relation "events" found for row`. Create partitions ahead of time — automate with pg_cron or a monthly job.
- **Kafka consumer not committing offsets:** If the consumer crashes after processing but before committing the offset, it reprocesses the same events on restart. Use idempotent writes (`INSERT ... ON CONFLICT DO NOTHING` in PostgreSQL) to handle duplicates safely.
- **Single Kafka partition:** One partition means one consumer maximum. With 3 partitions, you can have up to 3 consumers processing in parallel. More partitions than consumers is fine (some consumers handle 2 partitions). Fewer partitions than consumers means idle consumers.
- **Redis as primary storage:** Redis is volatile by default. A restart loses all data unless RDB/AOF persistence is configured. Use Redis only for caches and counters that can be rebuilt from PostgreSQL. Never store the only copy of data in Redis.
- **Not monitoring consumer lag:** If lag grows, your processor is falling behind. In BFSI during salary-day spikes (10x normal event volume), growing lag means dashboards show stale data and fraud alerts arrive late. Set alerts at lag > 1000 and scale processor instances horizontally.
- **No JSONB index:** Without a GIN index on the `properties` column, queries like `WHERE properties->>'page' = '/dashboard'` perform a full table scan. The GIN index makes JSONB queries fast but adds write overhead — acceptable for analytics workloads where reads dominate.
- **Forgetting partition key in primary key:** PostgreSQL requires the partition column (`created_at`) to be part of the primary key. Omitting it causes `ERROR: unique constraint on partitioned table must include all partitioning columns`.

---

## Exercises

See the `exercises/` directory for detailed, step-by-step walkthroughs:

- [Exercise 1 — PostgreSQL schema](exercises/01-postgresql-schema.md): Create events table with partitioning, test queries.
- [Exercise 2 — Redis caching](exercises/02-redis-caching.md): Configure Redis caching and realtime counters.
- [Exercise 3 — Kafka streaming](exercises/03-kafka-streaming.md): Create Kafka topics, test producer/consumer.
- [Exercise 4 — Integration test](exercises/04-integration-test.md): Full pipeline from Kafka to PostgreSQL to API to Redis.

---

## What you have learned

- How to design a PostgreSQL schema with table partitioning for time-series analytics data
- How partition pruning dramatically improves query performance on time-range queries
- How Redis serves three distinct roles: query cache (SET/GET + TTL), realtime counters (sorted sets), and rate limiting (INCR + EXPIRE)
- How Kafka provides durable, ordered event streaming with partition-based parallelism
- How the three systems compose into a complete data pipeline: ingest, stream, process, store, cache, serve
- The failure modes and operational concerns for each system (TTL, consumer lag, partition maintenance)
- Why this architecture handles salary-day traffic spikes that would overwhelm a single PostgreSQL instance

**Next stage:** [05-app-deployment](../05-app-deployment/README.md) — deploy the CloudPlatform analytics application across all three clouds, using the data layer you just built.
