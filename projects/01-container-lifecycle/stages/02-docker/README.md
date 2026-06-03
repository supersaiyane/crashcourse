# Stage 2: Docker — Containers From Scratch

**Goal:** Build, ship, and run containers confidently.

**Prerequisites:** Stage 1 (Linux Foundations) or equivalent familiarity with the Linux command line. Docker installed on your machine — if you don't have it yet, install [Docker Desktop](https://docs.docker.com/get-docker/) (macOS/Windows) or run `sudo apt install docker.io` on Ubuntu.

**Sample App:** Cutlink — a URL shortener with a Flask backend, PostgreSQL database, Redis cache, and nginx frontend. All code lives in `../sample-app/`.

---

## 1. Theory

### What Is a Container?

A container is **not a virtual machine**. This is the single most important idea in this stage.

| | Virtual Machine | Container |
|---|---|---|
| Kernel | Each VM runs its own full OS kernel | All containers **share** the host kernel |
| Isolation | Hardware-level (hypervisor) | Kernel-level (cgroups + namespaces) |
| Boot time | Minutes | Milliseconds |
| Size | Gigabytes | Megabytes |
| Footprint | Heavy — each VM duplicates system libraries | Light — containers share the kernel and often the base userspace |

**Analogy:** VMs are like separate houses — each has its own foundation, plumbing, and electrical system. Containers are like apartments in a single building — they share the building's core infrastructure (the kernel) but each has its own locked door, windows, and living space (its userspace).

Technically, a container is a **set of processes** isolated from the rest of the system using two Linux kernel features you encountered in Stage 1:

- **Namespaces** — give each container its own view of the system: its own process tree (PID namespace), network stack (NET namespace), mount points (MNT namespace), and user IDs (USER namespace). A process inside a container can only see its own namespace.
- **Cgroups** (control groups) — limit how much CPU, memory, disk I/O, and network bandwidth a container can use. Without cgroups, one noisy container could starve every other process on the host.

> **Why this matters for Kubernetes:** Kubernetes runs containers, not VMs. Every Pod is one or more containers sharing a kernel. When you learn Pod resource requests and limits (`spec.containers[].resources`), you're configuring cgroups. When you learn Pod networking (each Pod gets its own IP), you're working with network namespaces.

### Images vs Containers

Think of the difference between a **recipe** and a **cake you're actually baking**.

| | Image | Container |
|---|---|---|
| State | Immutable — read-only filesystem snapshot | Mutable — a running instance with a writable layer |
| Lifecycle | Static — exists in a registry or on disk | Dynamic — can be started, stopped, restarted, deleted |
| Analogy | A class definition in OOP | An instance of that class |

An image is a **filesystem snapshot** plus **metadata** (which command to run, which port to expose, which user to run as). A container is that image **executed** — the kernel creates the namespaces and cgroups, mounts the image filesystem, and runs the command specified in the image.

```bash
# The image is just data on disk
docker pull python:3.12-slim

# Running the image creates a container
docker run python:3.12-slim python --version
```

### Docker Architecture

Docker is not a single binary. It's a stack of cooperating components:

```
┌──────────────┐
│   docker CLI │  ← You type commands here
└──────┬───────┘
       │ HTTP (REST API)
       ▼
┌──────────────┐
│  dockerd     │  ← The daemon — orchestrates everything
└──────┬───────┘
       │ gRPC
       ▼
┌──────────────┐
│  containerd  │  ← Industry-standard container runtime (used by K8s too)
└──────┬───────┘
       │ runc
       ▼
┌──────────────┐
│  runc        │  ← The low-level OCI runtime — creates cgroups & namespaces
└──────────────┘
```

1. **docker CLI** — what you type in the terminal. It sends HTTP requests to dockerd.
2. **dockerd** — the Docker daemon. Manages images, containers, networks, volumes. Talks to containerd.
3. **containerd** — the industry-standard container runtime. Also used by Kubernetes (via CRI). Handles image pulling, container lifecycle, and storage.
4. **runc** — the OCI runtime spec implementation. Creates the actual cgroups and namespaces, then runs the process.

> **Why this matters for Kubernetes:** Kubernetes doesn't use dockerd. It talks directly to containerd (or CRI-O). The containers you build with Docker run the same way on Kubernetes — same images, same OCI spec. Understanding this stack means understanding that Docker is just a tool on top of the same runtimes Kubernetes uses.

### Image Layers

Every Dockerfile instruction creates a **layer** — a diff of filesystem changes from the previous state.

```dockerfile
FROM python:3.12-slim          # Layer 1: ~120MB base
WORKDIR /app                    # Layer 2: metadata (near-zero space)
COPY requirements.txt .         # Layer 3: ~100 bytes
RUN pip install -r requirements.txt  # Layer 4: ~50MB of Python packages
COPY app.py .                   # Layer 5: ~5KB
```

Layers are **immutable** and **cached**. If you rebuild the image after changing `app.py` but not `requirements.txt`, Docker reuses layers 1-4 and only rebuilds layer 5. This is why you should put things that change rarely (like OS packages and dependencies) **early** in the Dockerfile, and things that change frequently (application code) **late**.

```bash
# See every layer with timing and size
docker history cutlink-backend
```

**Why Alpine images are small:** Alpine Linux uses musl libc instead of glibc and BusyBox instead of GNU coreutils. A typical `python:3.12-slim` is ~120MB; `python:3.12-alpine` is ~60MB. The tradeoff is that some Python C extensions may need compilation against musl, which can be a hassle.

### Dockerfile Instructions

Your Dockerfile is a receipt for building an image. Here are the instructions you'll use most:

| Instruction | Purpose |
|-------------|---------|
| `FROM` | Sets the base image. Every Dockerfile starts with this. |
| `RUN` | Executes a command **during build** (e.g., install packages) |
| `COPY` | Copies files from your host into the image |
| `ADD` | Like COPY but can also unpack tar files and fetch URLs (prefer COPY unless you need those features) |
| `CMD` | Default command when the container starts. Can be overridden. |
| `ENTRYPOINT` | Like CMD but harder to override. Often paired with CMD as default args. |
| `EXPOSE` | Documents which port the container listens on (purely informational) |
| `ENV` | Sets environment variables |
| `WORKDIR` | Sets the working directory (like `cd`) |
| `USER` | Switches to a non-root user for security |
| `HEALTHCHECK` | Tells Docker how to check if the container is healthy |
| `ARG` | Build-time variable (not available in the running container) |

**CMD vs ENTRYPOINT — the rule of thumb:**

- Use `CMD` when you want users to easily override the command: `docker run myimage my-own-command`
- Use `ENTRYPOINT` when your container should always run a specific program, optionally with `CMD` as default arguments
- The most common pattern: `ENTRYPOINT` for the binary, `CMD` for default flags

**HEALTHCHECK** is especially important for production. Docker will mark the container as `unhealthy` if the check fails repeatedly, and Docker Compose (and Kubernetes) can use this to decide when to restart a container.

### Multi-Stage Builds

A multi-stage build uses multiple `FROM` instructions to separate the **build environment** from the **runtime environment**. This keeps final images small by excluding compilers, headers, and other build-only files.

Here's the Cutlink backend's Dockerfile, which uses this pattern:

```dockerfile
# === STAGE 1: Builder ===
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# === STAGE 2: Runtime ===
FROM python:3.12-slim
WORKDIR /app
RUN groupadd -r cutlink && useradd -r -g cutlink cutlink
COPY --from=builder /root/.local /root/.local
COPY app.py .
ENV PATH=/root/.local/bin:$PATH
EXPOSE 5000
USER cutlink
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')"
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
```

Stage 1 (`builder`) installs all Python dependencies. Stage 2 copies only the installed packages (`/root/.local`) and the application code — nothing else. The final image contains **only** what's needed to run the app.

Compare with a naive single-stage Dockerfile:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app.py .
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
```

This works, but the final image includes pip, the package cache, build tooling, and everything else — ~200MB vs ~130MB with the multi-stage approach.

> **Why this matters for Kubernetes:** Smaller images mean faster pulls on node startup, which means faster Pod scheduling. In a cluster with 100 nodes, a 70MB savings per image saves 7GB of bandwidth per deployment. Image size directly impacts rollout speed.

### Networking

Docker offers several networking modes:

| Network | Behavior |
|---------|----------|
| **bridge** (default) | Containers get their own IP on a private subnet. Communicate via IP or (with `--link`, now legacy) by name. |
| **host** | The container shares the host's network stack. No port isolation. Performance is best but security is worst. |
| **none** | No network at all. Used for offline or security-sensitive containers. |

**Port mapping** (`-p` or `--publish`) makes a container's port accessible from the host:

```bash
docker run -p 8080:80 nginx
# Host port 8080 → container port 80
```

**User-defined networks** give you automatic DNS resolution between containers. When you put containers on the same user-defined bridge network, they can reach each other by **service name** — no IP lookup needed. This is how the Cutlink backend connects to `postgres` and `redis` by hostname:

```python
DB_HOST = os.getenv('DB_HOST', 'localhost')    # "postgres" in the compose file
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')  # "redis" in the compose file
```

### Volumes & Bind Mounts

Containers are ephemeral by design. When you delete a container, all data written inside it is gone. **Volumes** and **bind mounts** give you persistent storage.

| Method | Lives in | Managed by | Use case |
|--------|----------|------------|----------|
| **Named volume** | `/var/lib/docker/volumes/` | Docker | Persistent data (databases, caches) |
| **Bind mount** | Any host path | You | Development (hot-reload code) |
| **tmpfs** | RAM | Kernel | Temporary data (secrets, scratch) |

Named volumes are the recommended approach for production:

```yaml
# In docker-compose.yml
volumes:
  pgdata:          # declared at the top level
    driver: local

services:
  postgres:
    volumes:
      - pgdata:/var/lib/postgresql/data  # mounted into the container
```

Bind mounts are ideal for development because you can mount your source code directly:

```bash
docker run -v $(pwd)/backend:/app cutlink-backend
# Changes to your local code appear instantly in the container
```

> **Why this matters for Kubernetes:** Kubernetes uses the same concepts but calls them **Volumes** (pod-scoped, similar to Docker volumes) and **PersistentVolumeClaims** (cluster-scoped, managed independently of Pods). Understanding Docker volumes first makes K8s PersistentVolumes far less mysterious.

### Docker Compose

Docker Compose defines multi-container applications in a YAML file. Instead of running five `docker run` commands, you write one `docker-compose.yml` and run `docker compose up -d`.

Here's the Cutlink compose file — read through it carefully:

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: cutlink
      POSTGRES_USER: cutlink
      POSTGRES_PASSWORD: cutlink
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cutlink"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - cutlink-net
    deploy:
      resources:
        limits: { memory: 256M }
        reservations: { memory: 128M }

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - cutlink-net
    deploy:
      resources:
        limits: { memory: 128M }
        reservations: { memory: 64M }

  backend:
    build: ./backend
    environment:
      DB_HOST: postgres
      DB_NAME: cutlink
      DB_USER: cutlink
      DB_PASS: cutlink
      REDIS_HOST: redis
      BASE_URL: http://localhost:8080
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    networks:
      - cutlink-net
    deploy:
      resources:
        limits: { memory: 256M }
        reservations: { memory: 128M }

  frontend:
    build: ./frontend
    ports:
      - "8080:80"
    depends_on:
      - backend
    networks:
      - cutlink-net
    deploy:
      resources:
        limits: { memory: 64M }
        reservations: { memory: 32M }

volumes:
  pgdata:
  redisdata:

networks:
  cutlink-net:
    driver: bridge
```

Key concepts in this file:

- **Services** — each service maps to a container (or a replicated set of containers in swarm/K8s)
- **`build: ./backend`** — Docker Compose will run `docker build` on that directory
- **`depends_on`** — startup ordering. The `condition: service_healthy` variant waits for the healthcheck to pass before starting dependent services
- **`environment`** — environment variables passed to the container. The backend uses these to find postgres and redis by **service name** (DNS resolution via the user-defined network)
- **`networks: cutlink-net`** — all services on the same network so they can talk to each other
- **`volumes: pgdata: /redisdata:`** — named volumes declared at the top level and mounted into containers
- **`deploy.resources`** — resource limits and reservations (memory only here; CPU is also possible)
- **`ports: "8080:80"`** — expose the frontend on the host at port 8080

The nginx config in the frontend proxies `/api/` requests to the backend:

```nginx
location /api/ {
    proxy_pass http://backend:5000/;    # "backend" resolves via Docker DNS
}
```

### Security

**Running as root inside a container is still dangerous** — if an attacker escapes the container via a kernel vulnerability, they have root on the host. Always use the `USER` instruction:

```dockerfile
RUN groupadd -r cutlink && useradd -r -g cutlink cutlink
USER cutlink
```

Other security practices:

- **Read-only rootfs** — mount the container's filesystem as read-only. Only writable volumes can be modified.
  ```yaml
  services:
    backend:
      read_only: true
      tmpfs:
        - /tmp   # but allow writing to /tmp
  ```
- **Resource limits** — prevent DoS by capping memory and CPU:
  ```yaml
  deploy:
    resources:
      limits: { memory: 256M, cpus: '0.5' }
  ```
- **Drop capabilities** — remove Linux capabilities the container doesn't need:
  ```yaml
  services:
    backend:
      cap_drop:
        - ALL
      cap_add:
        - NET_BIND_SERVICE  # only allow binding to low ports
  ```

> **Why this matters for Kubernetes:** Kubernetes enforces the same security patterns through `securityContext`: `runAsNonRoot: true`, `readOnlyRootFilesystem: true`, `capabilities.drop: ["ALL"]`. The USER instruction in your Dockerfile directly maps to `securityContext.runAsUser`. Getting security right at the image level means less work at the orchestration level.

---

## 2. Hands-On Exercises

Open a terminal and follow along. Each exercise builds on the previous one.

### Exercise 1: Run Your First Container

**Step 1: Hello, World**

```bash
docker run hello-world
```

You should see a message from Docker explaining what just happened. Behind the scenes:
1. Docker checked if the `hello-world` image existed locally
2. It didn't, so Docker pulled it from Docker Hub
3. Docker created a container from that image
4. The container ran, printed its message, and exited

**Step 2: Interactive Ubuntu**

```bash
docker run -it ubuntu:22.04 bash
```

The `-it` flag combines `-i` (interactive, keep STDIN open) and `-t` (allocate a pseudo-TTY). You're now **inside** an Ubuntu 22.04 container. Look around:

```bash
# It's a fresh filesystem — no projects, no home folder
ls /
cat /etc/os-release
ps aux   # notice how few processes — just bash and ps
hostname # it's a random container ID, not your machine's hostname
```

Type `exit` or press Ctrl+D to leave the container. The container stops because its main process (`bash`) exited.

**Step 3: List and Clean Up**

Open another terminal (or use your host after exiting):

```bash
# List running containers
docker ps

# List all containers (including stopped ones)
docker ps -a

# List downloaded images
docker images

# Remove the Ubuntu container (use the container ID or name from docker ps -a)
docker rm <container-id>
```

If you want to automatically remove a container when it exits, use `--rm`:

```bash
docker run --rm -it ubuntu:22.04 bash
# The container disappears automatically after exit
```

### Exercise 2: Build and Run Cutlink Backend

**Step 1: Build the Image**

Navigate to the backend directory and build:

```bash
cd ../sample-app/backend
docker build -t cutlink-backend .
```

The `-t` flag tags the image with a name (`cutlink-backend`). The `.` is the build context — Docker sends everything in the current directory to the daemon for the build.

Watch the output. You'll see each Dockerfile instruction executing as a step. The second time you build (after changing something small), notice how Docker uses the cache for unchanged layers.

**Step 2: Run It**

```bash
docker run -d --name cutlink-backend cutlink-backend
```

- `-d` — detached mode (runs in the background)
- `--name` — gives the container a friendly name instead of a random one

**Step 3: Check the Logs**

```bash
docker logs cutlink-backend
```

You should see gunicorn startup messages. The container is running but will crash because PostgreSQL and Redis aren't available. This is normal — in Exercise 3 we'll start everything together.

**Step 4: Execute a Command Inside the Container**

```bash
docker exec -it cutlink-backend sh
```

Now you're inside the running container. Explore:

```bash
ls /app
whoami       # should show "cutlink" — the non-root user from the Dockerfile
env          # shows PATH and any ENV variables
cat /etc/passwd | grep cutlink
exit
```

**Step 5: Stop, Start, Remove**

```bash
# Stop the container (sends SIGTERM, then SIGKILL after timeout)
docker stop cutlink-backend

# Start it again (uses the same filesystem state)
docker start cutlink-backend

# Force-stop and delete in one command
docker rm -f cutlink-backend
```

### Exercise 3: Multi-Service with Compose

**Step 1: Examine the Compose File**

Open `docker-compose.yml` and read through every section:

- How many services are there? (4: postgres, redis, backend, frontend)
- What images do they use?
- What volumes are declared?
- What network are they on?
- Why does `depends_on` have `condition: service_healthy`?
- What happens if postgres's `pg_isready` healthcheck fails?

**Step 2: Start Everything**

```bash
cd ../sample-app
docker compose up -d
```

The `-d` flag runs in detached mode. Watch as Docker pulls images for postgres and redis, builds images for backend and frontend, creates the network, and starts all containers in dependency order.

**Step 3: Verify Everything Is Running**

```bash
docker compose ps
```

You should see all 4 services with status "Up" or "Up (healthy)".

**Step 4: Tail Logs**

```bash
docker compose logs -f backend
```

The `-f` flag follows the log stream. Open another terminal and make a request to see logs in real time (do this in the next step).

**Step 5: Use the Application**

Open your browser to **[http://localhost:8080](http://localhost:8080)**.

You should see the Cutlink URL shortener:
- Enter a URL (e.g., `https://en.wikipedia.org/wiki/Containerization_(computing)`)
- Optionally add a custom short code
- Click "Shorten"
- Click the resulting short link — it should redirect you

Back in your terminal, check the logs:

```bash
docker compose logs -f backend
```

You'll see the HTTP requests logged by gunicorn.

**Step 6: Inspect Running Services**

```bash
# Check resource usage across all containers
docker stats

# Inspect the backend container's config
docker inspect $(docker compose ps -q backend)

# Execute a command in the postgres container
docker compose exec postgres psql -U cutlink -d cutlink -c "SELECT * FROM urls;"
```

**Step 7: Tear Down**

```bash
docker compose down -v
```

The `-v` flag deletes named volumes (`pgdata`, `redisdata`) along with the containers. Without `-v`, the data would persist and be available next time you run `docker compose up`.

> **Why this matters for Kubernetes:** Docker Compose is essentially a mini-orchestrator. Its concepts — services, health checks, resource limits, networks, volumes — map almost one-to-one to Kubernetes resources: Services, Deployments, Readiness/Liveness Probes, Resource Requests/Limits, NetworkPolicies, and PersistentVolumeClaims.

### Exercise 4: Deep Dive — Layers & Optimization

**Step 1: View Image Layers**

First rebuild the backend image (if you tore down in the previous exercise):

```bash
cd ../sample-app/backend
docker build -t cutlink-backend .
```

Now examine its layers:

```bash
docker history cutlink-backend
```

Each line corresponds to a Dockerfile instruction. The `SIZE` column shows how much space each layer adds. Notice that the `COPY` of `requirements.txt` is tiny, while `RUN pip install` is large — this is exactly why we put `COPY requirements.txt` before `RUN pip install`, so the huge pip layer is cached as long as `requirements.txt` doesn't change.

**Step 2: Inspect a Container's Metadata**

```bash
docker run -d --name cutlink-debug cutlink-backend
docker inspect cutlink-debug
```

This returns a massive JSON object. Pay attention to:
- `Config.Cmd` — the command that runs
- `Config.Env` — environment variables (including those set via `ENV`)
- `Config.Healthcheck` — the HEALTHCHECK definition
- `NetworkSettings.IPAddress` — the container's IP
- `Mounts` — any mounted volumes
- `State` — running status, start time, exit code

**Step 3: Live Resource Monitoring**

```bash
docker stats
```

This shows live CPU, memory, network, and disk I/O for all running containers. The limits you set in `deploy.resources` in the compose file will be reflected in the "MEM % / LIMIT" column.

Press Ctrl+C to exit.

**Step 4: Run Tests Inside the Container**

```bash
cd ../sample-app

# Start just the dependencies (no app)
docker compose up -d postgres redis

# Run tests using a one-off container on the same network
docker compose run --rm backend pytest tests/
```

Wait — this won't work because the test files is at `sample-app/tests/test_app.py`, not inside the backend container. Let's do it properly:

```bash
# Copy tests into the backend service context and rebuild, or run tests locally
docker compose run --rm backend sh -c "pip install pytest && pytest -x /app"
```

Actually, the test imports the app module. Since we're running inside the container, we need the test file there. A better approach:

```bash
# Bind-mount the tests directory
docker run --rm -it \
  --network sample-app_cutlink-net \
  -v $(pwd)/tests:/tests \
  cutlink-backend \
  sh -c "pip install pytest && pytest /tests"
```

You need to find the correct network name first:

```bash
docker network ls
# Look for sample-app_cutlink-net (or similar)
```

**Step 5: Compare Image Sizes**

```bash
docker images | grep cutlink
```

You should see `cutlink-backend` and `cutlink_frontend` (or similar). Compare their sizes. The backend image should be around 130-150MB (Python runtime + gunicorn + dependencies). The frontend image should be about 30-40MB (nginx alpine + static files).

For the truly curious, compare the multi-stage backend image with a single-stage version by writing a `Dockerfile.single`:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app.py .
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
```

```bash
docker build -f Dockerfile.single -t cutlink-backend-fat .
docker images | grep cutlink-backend
```

The single-stage image is noticeably larger — all the pip cache and build tools are included.

---

## 3. Solutions

### Exercise 1 Solutions

**What `docker run hello-world` did:**

```
Hello from Docker!
This message shows that your installation appears to be working correctly.

To generate this message, Docker took the following steps:
 1. The Docker client contacted the Docker daemon.
 2. The Docker daemon pulled the "hello-world" image from the Docker Hub.
    (amd64)
 3. The Docker daemon created a new container from that image which runs the
    executable that produces the output you are currently reading.
 4. The Docker daemon streamed that output to the Docker client, which sent it
    to your terminal.
```

**Interactive Ubuntu session:**

```bash
# Look at the process tree inside the container — it's minimal
root@abc123:/# ps aux
USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  0.0  0.0   4116  3480 pts/0    Ss   12:00   0:00 bash
root        15  0.0  0.0   5892  2888 pts/0    R+   12:00   0:00 ps aux

# The OS identifies itself as Ubuntu 22.04
root@abc123:/# cat /etc/os-release
PRETTY_NAME="Ubuntu 22.04.3 LTS"
NAME="Ubuntu"
VERSION_ID="22.04"
VERSION="22.04.3 LTS (Jammy Jellyfish)"

# The filesystem is minimal — no user data, no projects
root@abc123:/# ls /
bin  boot  dev  etc  home  lib  lib32  lib64  libx32  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var
```

Cleaning up:

```bash
$ docker ps -a
CONTAINER ID   IMAGE          COMMAND   CREATED          STATUS
abc123         ubuntu:22.04   "bash"    2 minutes ago    Exited (0) 1 minute ago
$ docker rm abc123
abc123
```

### Exercise 2 Solutions

**Building the image:**

```bash
$ docker build -t cutlink-backend .
[+] Building 15.2s (10/10) FINISHED
 => [internal] load build definition from Dockerfile
 => => transferring dockerfile: 339B
 => [internal] load .dockerignore
 => => transferring context: 2B
 => [internal] load metadata for docker.io/library/python:3.12-slim
 => [auth] library/python:pull token for registry-1.docker.io
 => [internal] load build context
 => => transferring context: 1.03kB
 => [builder 1/3] FROM python:3.12-slim@sha256:...
 => [builder 2/3] WORKDIR /app
 => [builder 3/3] RUN pip install --user --no-cache-dir -r requirements.txt
 => [stage-1 3/5] COPY --from=builder /root/.local /root/.local
 => [stage-1 4/5] COPY app.py .
 => [stage-1 5/5] CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
 => exporting to image
 => => exporting layers
 => => writing image sha256:...
 => => naming to docker.io/library/cutlink-backend
```

**Running and inspecting:**

```bash
$ docker run -d --name cutlink-backend cutlink-backend
a1b2c3d4e5f6...

$ docker logs cutlink-backend
[2026-06-03 12:05:00 +0000] [1] INFO Starting gunicorn 23.0.0
[2026-06-03 12:05:00 +0000] [1] INFO Listening at: http://0.0.0.0:5000 (1)
[2026-06-03 12:05:00 +0000] [1] INFO Using worker: sync
[2026-06-03 12:05:00 +0000] [7] INFO Booting worker with pid: 7
[2026-06-03 12:05:00 +0000] [8] INFO Booting worker with pid: 8
[2026-06-03 12:05:00 +0000] [9] INFO Booting worker with pid: 9
[2026-06-03 12:05:00 +0000] [10] INFO Booting worker with pid: 10

$ docker exec -it cutlink-backend sh
$ whoami
cutlink
$ ls -la /app
total 16
drwxr-xr-x    1 root root    4096 Jun  3 12:05 .
drwxr-xr-x    1 root root    4096 Jun  3 12:04 ..
-rw-rw-r--    1 1000 1000  11021 Jun  3 12:04 app.py
$ env
PATH=/root/.local/bin:/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/sbin:/bin
$ exit
```

**Stopping and removing:**

```bash
$ docker stop cutlink-backend
cutlink-backend
$ docker rm -f cutlink-backend
cutlink-backend
```

### Exercise 3 Solutions

After `docker compose up -d`:

```bash
$ docker compose ps
NAME                   IMAGE                      COMMAND                  SERVICE    STATUS              PORTS
sample-app-postgres-1   postgres:16-alpine         "docker-entrypoint.s…"   postgres   Up (healthy)        5432/tcp
sample-app-redis-1      redis:7-alpine             "docker-entrypoint.s…"   redis      Up (healthy)        6379/tcp
sample-app-backend-1    sample-app-backend         "gunicorn -w 4 -b 0…"   backend    Up (healthy)        5000/tcp
sample-app-frontend-1   sample-app-frontend        "/docker-entrypoint.…"   frontend   Up (healthy)        0.0.0.0:8080->80/tcp
```

All four services reporting "(healthy)" — the healthchecks are passing.

**Querying the database directly:**

```bash
$ docker compose exec postgres psql -U cutlink -d cutlink -c "SELECT * FROM urls;"
 short_code |          original_url          |         created_at         | click_count
------------+--------------------------------+----------------------------+-------------
 aB3xK9     | https://example.com/long/url   | 2026-06-03 12:10:00.123456 |           1
```

**Checking the Redis cache:**

```bash
$ docker compose exec redis redis-cli keys '*'
1) "code:aB3xK9"
2) "url:https://example.com/long/url"
```

### Exercise 4 Solutions

**Image layers:**

```bash
$ docker history cutlink-backend
IMAGE          CREATED          CREATED BY                                     SIZE
a1b2c3d4e5f6   2 minutes ago    CMD ["gunicorn" "-w" "4" "-b" "0.0.0.0:5...   0B
<missing>      2 minutes ago    HEALTHCHECK --interval=15s --timeout=5s ...   0B
<missing>      2 minutes ago    EXPOSE map[5000/tcp:{}]                        0B
<missing>      2 minutes ago    ENV PATH=/root/.local/bin:/usr/local/bin:...   0B
<missing>      2 minutes ago    COPY app.py /app/app.py                        11kB
<missing>      2 minutes ago    COPY --from=builder /root/.local /root/.local  52MB
<missing>      2 minutes ago    RUN /bin/sh -c groupadd -r cutlink && use...   330kB
<missing>      2 minutes ago    WORKDIR /app                                   0B
<missing>      2 minutes ago    FROM python:3.12-slim                          119MB
```

Notice that `COPY app.py` is only 11kB, while the pip-installed packages are 52MB. The base Python image is 119MB — that's your starting point.

**docker inspect output (condensed):**

```json
[
    {
        "Id": "a1b2c3d4e5f6...",
        "Created": "2026-06-03T12:05:00.123456789Z",
        "Path": "gunicorn",
        "Args": ["-w", "4", "-b", "0.0.0.0:5000", "app:app"],
        "State": {
            "Status": "running",
            "Running": true,
            "StartedAt": "2026-06-03T12:05:01.123456789Z"
        },
        "Config": {
            "User": "cutlink",
            "Env": [
                "PATH=/root/.local/bin:/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/sbin:/bin"
            ],
            "Cmd": ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
        },
        "NetworkSettings": {
            "IPAddress": "172.18.0.4"
        }
    }
]
```

**Image size comparison:**

```bash
$ docker images | grep cutlink
cutlink-backend           latest    a1b2c3d4e5f6   2 minutes ago    133MB
cutlink-backend-fat       latest    f6e5d4c3b2a1   1 minute ago     185MB
sample-app_frontend       latest    x1y2z3a4b5c6   2 minutes ago    42.4MB
```

The multi-stage build saves about 52MB vs the single-stage version — exactly the pip cache and build tooling that the builder stage discards.

> **Why this matters for Kubernetes:** Every megabyte saved on an image multiplies across every node in your cluster. On a 10-node cluster, saving 50MB per image saves 500MB of pull bandwidth per deployment. For frequently updated images (common in microservice architectures), this translates directly to faster rollout times and lower network costs.

---

## Further Reading

- [Docker's official Dockerfile reference](https://docs.docker.com/engine/reference/builder/)
- [Docker Compose file reference](https://docs.docker.com/compose/compose-file/)
- [Multi-stage builds (Docker docs)](https://docs.docker.com/build/building/multi-stage/)
- [OCI image spec](https://github.com/opencontainers/image-spec) — what Docker images really are under the hood
- [Understanding the Docker stack (containerd, runc)](https://docs.docker.com/get-started/overview/)

**Coming up in Stage 3:** Multi-node Docker — overlay networking, docker swarm, and why we need a better orchestrator. The limitations of a single host lead directly to Kubernetes.
