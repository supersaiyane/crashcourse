# Exercise 3: Multi-Service with Compose

**Goal:** Run all Cutlink services together using Docker Compose.

## Step 1: Examine the Compose File

Open `docker-compose.yml` and review:
- How many services? (4: postgres, redis, backend, frontend)
- What volumes are declared?
- What network are they on?
- Why does `depends_on` use `condition: service_healthy`?

## Step 2: Start Everything

```bash
cd ../sample-app
docker compose up -d
```

## Step 3: Verify Everything Is Running

```bash
docker compose ps
```

All 4 services should show "Up" or "Up (healthy)".

## Step 4: Tail Logs

```bash
docker compose logs -f backend
```

## Step 5: Use the Application

Open your browser to **http://localhost:8080**. Shorten a URL, then click the resulting short link.

## Step 6: Inspect Running Services

```bash
docker stats
docker inspect $(docker compose ps -q backend)
docker compose exec postgres psql -U cutlink -d cutlink -c "SELECT * FROM urls;"
```

## Step 7: Tear Down

```bash
docker compose down -v
```

The `-v` flag deletes named volumes (`pgdata`, `redisdata`). Without it, data persists for next time.
