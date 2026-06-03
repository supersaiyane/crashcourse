# Exercise 4: Deep Dive — Layers & Optimization

**Goal:** Understand Docker image layers and how to optimize image size.

## Step 1: View Image Layers

```bash
cd ../sample-app/backend
docker build -t cutlink-backend .
docker history cutlink-backend
```

Notice the `COPY requirements.txt` layer is tiny, while `RUN pip install` is large — this is why we copy `requirements.txt` first, so the pip cache is cached as long as that file doesn't change.

## Step 2: Inspect a Container's Metadata

```bash
docker run -d --name cutlink-debug cutlink-backend
docker inspect cutlink-debug
```

Pay attention to:
- `Config.Cmd`
- `Config.Env`
- `Config.Healthcheck`
- `NetworkSettings.IPAddress`
- `Mounts`
- `State`

```bash
docker rm -f cutlink-debug
```

## Step 3: Live Resource Monitoring

```bash
docker stats
```

## Step 4: Run Tests Inside the Container

```bash
cd ../sample-app
docker compose up -d postgres redis
docker network ls
docker run --rm -it \
  --network sample-app_cutlink-net \
  -v $(pwd)/tests:/tests \
  cutlink-backend \
  sh -c "pip install pytest && pytest /tests"
```

## Step 5: Compare Image Sizes

```bash
docker images | grep cutlink
```

Compare backend (multi-stage, ~130-150MB) vs frontend (nginx alpine, ~30-40MB).

For bonus insight, build a single-stage version and compare:

```bash
docker build -f Dockerfile.single -t cutlink-backend-fat .
docker images | grep cutlink-backend
```
