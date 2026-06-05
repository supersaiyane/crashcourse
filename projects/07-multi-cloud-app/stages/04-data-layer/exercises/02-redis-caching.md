# Exercise 2: Redis Caching and Realtime Counters

**Goal:** Configure Redis with LRU eviction, implement query caching with TTL, and build realtime page view counters using sorted sets.

## Step 1: Start Redis locally

```bash
docker run -d --name redis-dev \
  -p 6379:6379 \
  redis:7-alpine \
  redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
```

Expected output:
- A container ID confirming Redis is running

## Step 2: Implement query caching with TTL

```bash
redis-cli SET "cache:events_by_type:2024-01" \
  '{"page_view":2,"click":1,"purchase":1}' EX 300   # 5-minute TTL

redis-cli GET "cache:events_by_type:2024-01"         # retrieve cached result
redis-cli TTL "cache:events_by_type:2024-01"         # check seconds remaining
```

Expected output:
- `OK` on SET
- JSON string on GET
- A number around 295-300 on TTL

## Step 3: Build realtime counters with sorted sets

```bash
redis-cli ZINCRBY "realtime:page_views:2024-01-15" 1 "/dashboard"
redis-cli ZINCRBY "realtime:page_views:2024-01-15" 1 "/dashboard"
redis-cli ZINCRBY "realtime:page_views:2024-01-15" 1 "/settings"
redis-cli ZINCRBY "realtime:page_views:2024-01-15" 1 "/dashboard"

redis-cli ZREVRANGE "realtime:page_views:2024-01-15" 0 9 WITHSCORES
```

Expected output:
- `/dashboard` with score `3`, `/settings` with score `1`

## Step 4: Implement rate limiting

```bash
redis-cli INCR "ratelimit:usr_abc123:202401151000"
redis-cli EXPIRE "ratelimit:usr_abc123:202401151000" 60
redis-cli GET "ratelimit:usr_abc123:202401151000"    # should show "1"
```

Expected output:
- `(integer) 1` for INCR, `(integer) 1` for EXPIRE, `"1"` for GET

## Verify

```bash
redis-cli INFO keyspace                              # shows number of keys
redis-cli CONFIG GET maxmemory-policy                # should show allkeys-lru
```

You should see: keys in database 0 and `allkeys-lru` eviction policy — confirming Redis is configured as a cache.
