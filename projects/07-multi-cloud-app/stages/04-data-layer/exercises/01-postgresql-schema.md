# Exercise 1: PostgreSQL Schema with Partitioning

**Goal:** Create the CloudPlatform events table with monthly partitioning, insert test data, and verify partition pruning with EXPLAIN ANALYZE.

## Step 1: Start PostgreSQL locally

```bash
docker run -d --name pg-dev \
  -e POSTGRES_DB=analytics \
  -e POSTGRES_USER=dbadmin \
  -e POSTGRES_PASSWORD=devpassword \
  -p 5432:5432 \
  postgres:16-alpine                             # lightweight PostgreSQL for dev
```

Expected output:
- A container ID confirming the database is running

## Step 2: Create the partitioned events table

```bash
psql -h localhost -U dbadmin -d analytics
```

Inside psql, run:
```sql
CREATE TABLE events (
    id BIGSERIAL, event_type VARCHAR(50) NOT NULL,
    source VARCHAR(20) NOT NULL, user_id VARCHAR(64),
    properties JSONB NOT NULL DEFAULT '{}',
    cloud VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2024_01 PARTITION OF events
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE events_2024_02 PARTITION OF events
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE events_2024_03 PARTITION OF events
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

CREATE INDEX idx_events_type ON events (event_type);
CREATE INDEX idx_events_props ON events USING GIN (properties);
```

Expected output:
- `CREATE TABLE`, `CREATE INDEX` for each statement

## Step 3: Insert test data

```sql
INSERT INTO events (event_type, source, user_id, properties, cloud, created_at)
VALUES
    ('page_view', 'web', 'usr_abc123', '{"page":"/dashboard"}', 'aws', '2024-01-15 10:00:00+00'),
    ('click', 'web', 'usr_abc123', '{"button":"export"}', 'gcp', '2024-01-15 10:00:05+00'),
    ('purchase', 'api', 'usr_def456', '{"amount":99.99}', 'azure', '2024-02-01 09:00:00+00'),
    ('page_view', 'mobile', 'usr_ghi789', '{"page":"/settings"}', 'aws', '2024-03-01 08:00:00+00');
```

## Step 4: Verify partition pruning

```sql
EXPLAIN ANALYZE
SELECT count(*) FROM events
WHERE created_at >= '2024-01-01' AND created_at < '2024-02-01';
```

Expected output:
- `Seq Scan on events_2024_01` — only January partition is scanned
- `events_2024_02` and `events_2024_03` are not mentioned (pruned)

## Verify

```sql
SELECT cloud, count(*) FROM events GROUP BY cloud ORDER BY count DESC;
```

You should see: `aws: 2, gcp: 1, azure: 1` — confirming data is distributed across partitions correctly.
