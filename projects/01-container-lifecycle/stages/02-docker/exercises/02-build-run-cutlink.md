# Exercise 2: Build and Run Cutlink Backend

**Goal:** Build a Docker image from a Dockerfile and run it.

## Step 1: Build the Image

```bash
cd ../sample-app/backend
docker build -t cutlink-backend .
```

The `-t` flag tags the image. The `.` is the build context. Watch the output — each Dockerfile instruction executes as a step. The second time you build (after a small change), Docker uses the cache for unchanged layers.

## Step 2: Run It

```bash
docker run -d --name cutlink-backend cutlink-backend
```

## Step 3: Check the Logs

```bash
docker logs cutlink-backend
```

The container will crash because PostgreSQL and Redis aren't available — this is expected.

## Step 4: Execute a Command Inside the Container

```bash
docker exec -it cutlink-backend sh
```

Explore:

```bash
ls /app
whoami
env
cat /etc/passwd | grep cutlink
exit
```

## Step 5: Stop, Start, Remove

```bash
docker stop cutlink-backend
docker start cutlink-backend
docker rm -f cutlink-backend
```
