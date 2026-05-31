# 12-Factor App — A 2-Day Crash Course

The 12-Factor methodology is a set of principles for building cloud-native applications that deploy cleanly, scale horizontally, and run reliably on any platform.

---

## Part 0 — Why This Matters

Apps built without these principles fight their deployment platform instead of working with it. You end up with servers you cannot replace, configs baked into images, logs you cannot search, and deployments that only work on one engineer's laptop. The 12-Factor methodology solves those problems at the source — not by bolting on tooling, but by shaping how the app itself is structured.

The principles were first articulated by the Heroku team around 2011, drawn from observing what made apps portable, maintainable, and operable at scale. They remain the clearest distillation of what "cloud-native" actually means in practice.

---

## Vocabulary

Before walking through the factors, align on the terms.

**Codebase** — a single repository tracked in version control. One codebase, many deploys.

**Dependencies** — all external libraries and tools the app needs to run. Declared explicitly, never assumed to be present in the environment.

**Config** — anything that varies between deploys: credentials, hostnames, feature flags. Stored in environment variables, never in code.

**Backing Services** — any attached resource the app consumes over the network: databases, caches, queues, email services. Treated as interchangeable attachments.

**Build / Release / Run** — three strictly separated stages of taking source code to a running process. Each stage has a distinct output and is not reversible.

**Processes (stateless)** — application processes that share nothing and persist no local state between requests. Sticky sessions and local file storage violate this.

**Port Binding** — the app exports its service by binding to a port directly. No dependency on an external web server being injected at runtime.

**Concurrency** — scale out by adding more processes of the right type, not by making individual processes larger or more complex.

**Disposability** — processes start fast, shut down gracefully, and can be killed at any moment without corrupting state.

**Dev/Prod Parity** — the development, staging, and production environments are as similar as possible — same services, same versions, same data shapes.

**Logs (event streams)** — the app writes unbuffered, ordered events to stdout. The execution environment is responsible for routing and storing them.

**Admin Processes** — one-off management tasks (migrations, scripts, console sessions) run in identical environments to the app itself, from the same codebase.

---

## DAY 1 — Factors I Through VI

### I. Codebase — One Repo, Many Deploys

One codebase per app. If you have two codebases, you have a distributed system — two apps, each of which is itself 12-factor.

A single codebase is deployed to multiple environments: development on a laptop, a staging cluster, and production. The code is the same. What varies is the config (covered in Factor III).

Sharing code across apps via submodules or copy-paste is a smell. Extract shared code into a library and declare it as a dependency.

**Practical check:** Can you deploy your app to a new environment by pointing at the same git SHA and providing different environment variables? If not, the codebase boundary is leaking config.

---

### II. Dependencies — Declare and Isolate Everything

Never rely on system-wide packages being present. Declare all dependencies explicitly in a manifest — `package.json`, `requirements.txt`, `go.mod`, `Gemfile` — and use an isolation mechanism (virtualenv, node_modules, Go modules) so the declared set is the only set used.

This applies to system tools too. If your app shells out to `curl` or `imagemagick`, either bundle them or declare them. Do not assume the host provides them.

**Example — Python:**
```
# requirements.txt
fastapi==0.111.0
uvicorn==0.29.0
psycopg2-binary==2.9.9
```

Running `pip install -r requirements.txt` in a fresh virtualenv should be all anyone needs to reproduce your dependency set.

**Practical check:** Clone the repo on a machine with only the language runtime installed. Can you install dependencies and run the app without hitting a "command not found" error?

---

### III. Config — Environment Variables Only

Config is everything that changes between deploys. The test for whether something belongs in config: would committing it to a public repo cause a problem? If yes, it is config.

Store config in environment variables. Not in config files committed to the repo. Not in a `config/production.rb` checked into source control. Not in a `.env` file shipped inside the Docker image.

Environment variables are language-agnostic, OS-agnostic, and impossible to accidentally commit when you treat them as external to the codebase.

**What belongs in env vars:**
- Database connection strings
- API keys and secrets
- Service hostnames and ports
- Feature flags that vary per environment
- Log levels

**What does not belong in env vars:**
- Internal constants that never change across deploys
- Business logic configuration managed by the application itself

**Example — Node.js:**
```js
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});
```

⚠️ Grouping env vars into named environments like `RAILS_ENV=production` is an anti-pattern. It leads to combinatorial explosion. A new environment means editing code, not just providing different values.

**Practical check:** Can you deploy the same artifact to staging and production by providing different env vars, with zero code changes?

---

### IV. Backing Services — Treat Them as Attached Resources

A backing service is any service the app consumes over the network: PostgreSQL, Redis, S3, SendGrid, an internal payment API. Treat all of them — local and third-party alike — as attached resources, referenced by a URL or locator stored in config.

This means you can swap a local MySQL instance for an RDS instance by changing `DATABASE_URL` in config. No code changes. The app does not care whether the database is running on localhost or in a managed cloud service.

**Example:**
```
DATABASE_URL=postgres://user:pass@localhost:5432/myapp
# later, swap to RDS:
DATABASE_URL=postgres://user:pass@myapp.rds.amazonaws.com:5432/myapp
```

The application code is identical in both cases.

**Practical check:** Can you point your app at a different instance of any backing service — different host, different provider — purely by changing environment variables?

---

### V. Build, Release, Run — Strictly Separate Stages

These three stages must be distinct and non-reversible.

**Build** — transforms source code into an executable artifact (compiled binary, Docker image, JAR). The build stage fetches dependencies, compiles assets, and produces a build artifact. Builds happen on a specific commit.

**Release** — combines the build artifact with a specific config set for a specific environment. A release is immutable. Every release has a unique ID (timestamp, semantic version, git SHA). You cannot modify a release — you create a new one.

**Run** (also called "runtime") — starts one or more processes from a release in the execution environment.

```
git push → build (artifact) → release (artifact + config) → run (processes)
```

⚠️ You cannot run `git pull` on a running production server and consider that a deployment. That collapses build, release, and run into one uncontrolled step.

**Practical check:** Does your CI system produce an artifact that gets promoted through environments unchanged? Or does each environment rebuild from source?

---

### VI. Processes — Stateless and Share-Nothing

App processes are stateless. They do not share anything with each other. Any data that needs to persist between requests goes in a backing service — the database, Redis, an object store.

This means:
- No local file system used for durable storage (temp files for a single request are fine)
- No in-process caches that are expected to survive a restart
- No sticky sessions where a user must be routed to the same instance

**Common violation — PHP session files on disk:**
```
# Wrong: session data stored locally
session_save_path('/var/lib/php/sessions');

# Correct: session data stored in Redis
$redis = new Redis();
$redis->connect(getenv('REDIS_HOST'));
```

Stateless processes can be started, stopped, and replaced freely. This is what makes horizontal scaling and self-healing systems possible.

**Practical check:** Can you kill any running process and restart it on a different host without users noticing, assuming the new process can reach the backing services?

---

## DAY 2 — Factors VII Through XII, and Beyond

### VII. Port Binding — Self-Contained Services

The app is self-contained. It exports HTTP (or any protocol) by binding to a port. It does not rely on a runtime-injected web server. A Python app does not need Apache to be installed — it runs its own HTTP server.

This is what makes one app able to become a backing service for another. App A exports itself on port 5000. App B consumes App A via `http://localhost:5000` (or a DNS name in production).

**Example — Python with uvicorn:**
```python
# main.py
import uvicorn, os

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
```

The port comes from config. The web server is a dependency declared in `requirements.txt`.

**Practical check:** Does your app start serving traffic by executing a single command, with no prerequisite web server configuration on the host?

---

### VIII. Concurrency — Scale Out via the Process Model

Scale by running more processes, not by making individual processes heavier. Organize work into process types — web processes handle HTTP requests, worker processes consume job queues, clock processes run scheduled tasks.

```
web:    gunicorn app:app --workers 4
worker: celery -A tasks worker --concurrency 8
clock:  python scheduler.py
```

Each process type scales independently. If the job queue is backing up, add worker processes. If HTTP latency is climbing, add web processes. You do not need to scale everything together.

This contrasts with threading-heavy models where you scale by adding threads inside a single process. Thread-based concurrency is harder to reason about and limits portability.

**Practical check:** Is your `Procfile` (or equivalent) organized by process type? Can you scale each type independently?

---

### IX. Disposability — Fast Startup, Graceful Shutdown

Processes are disposable. They start in seconds, not minutes. They handle `SIGTERM` gracefully — finishing in-flight requests, releasing connections, and exiting cleanly.

**Startup:** A slow startup makes deployments painful and defeats auto-scaling. If your app takes 4 minutes to start, you cannot respond to a traffic spike. Target under 10 seconds.

**Graceful shutdown:**
```python
import signal, sys

def handle_sigterm(sig, frame):
    # finish in-flight work
    server.shutdown()
    sys.exit(0)

signal.signal(signal.SIGTERM, handle_sigterm)
```

**For worker processes:** Use a job queue that supports visibility timeouts and requeuing. If a worker dies mid-job, the job goes back to the queue — not into a void.

**Practical check:** Can you send `SIGTERM` to any running process and have it exit cleanly within 30 seconds without corrupting data?

---

### X. Dev/Prod Parity — Close the Gaps

Three gaps typically exist between development and production:

- **Time gap** — code written weeks ago finally reaches production
- **Personnel gap** — developers write code, ops deploys it
- **Tools gap** — developers use SQLite locally, production uses PostgreSQL

The 12-Factor app minimizes all three. Deploy frequently (closes the time gap). Developers own deployment (closes the personnel gap). Use the same backing services locally as in production (closes the tools gap).

⚠️ The tools gap is the most dangerous. "It works on SQLite" does not mean it works on PostgreSQL. Subtle differences in transaction semantics, case sensitivity, and date handling cause production-only bugs.

**Use Docker Compose or similar:**
```yaml
services:
  db:
    image: postgres:16
  redis:
    image: redis:7
  app:
    build: .
    environment:
      DATABASE_URL: postgres://user:pass@db:5432/myapp
      REDIS_URL: redis://redis:6379
```

Every developer runs identical services to production.

**Practical check:** Are you using the same database engine, cache engine, and message broker in development as in production?

---

### XI. Logs — Treat Them as Event Streams

The app writes log events to stdout, one event per line, unbuffered. It does not manage log files. It does not rotate logs. It does not know or care where its output goes.

The execution environment — Docker, Kubernetes, systemd, Heroku — captures stdout and routes it to wherever logs need to go: a log aggregator, an S3 bucket, a SIEM.

**Example — Python structured logging to stdout:**
```python
import logging, sys

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s %(message)s'
)
```

In production, a log router like Fluentd, Logstash, or the Kubernetes logging driver picks up stdout and ships it to Elasticsearch or Loki. The app does not change.

**Practical check:** Does your app write to stdout/stderr exclusively for logs? No `open('app.log', 'w')` anywhere in production paths?

---

### XII. Admin Processes — Run Them in Identical Environments

One-off tasks — database migrations, data fixes, REPL sessions — must run in the same environment as the app's long-running processes. Same codebase, same config, same dependencies.

**Example — Django migration:**
```bash
# Wrong: running migrations from a developer laptop with different config
python manage.py migrate

# Correct: running migrations as a one-off process in the same environment
kubectl run migrate --image=myapp:v1.2.3 --rm -it -- python manage.py migrate
```

Admin processes are run against a release — the same release being deployed, not a slightly different local checkout.

**Practical check:** Do your database migrations run as part of the deployment pipeline using the same image as the application?

---

## Beyond 12-Factor — The 15-Factor Model for Kubernetes

The original 12 factors assume a PaaS-like runtime. In the Kubernetes era, three additional factors have emerged as practical requirements.

**XIII. API-First** — Services communicate via versioned, documented APIs. Internal services are designed with the same care as public APIs. This enables independent deployability and clear contracts between teams.

**XIV. Telemetry** — Distributed systems require more than logs. Metrics (latency, error rate, saturation), traces (request flow across services), and health check endpoints are first-class concerns, not afterthoughts. Instrument with OpenTelemetry from day one.

**XV. Auth and Security as First-Class** — In a distributed, multi-tenant environment, every service authenticates inbound requests and authorizes actions explicitly. No implicit trust between services on the same network.

These three do not replace the original 12 — they extend them for the current deployment landscape.

---

## Auditing an Existing App

When you inherit a legacy app and need to understand where it stands, work through each factor systematically.

**Step 1 — Codebase audit**
- Is there one repo? Are there multiple repos for what is conceptually one app?
- Are there shared modules copied between repos?

**Step 2 — Dependency audit**
```bash
# Python: find undeclared imports not in requirements.txt
pip install pipreqs && pipreqs . --print

# Node: find packages used but not in package.json
npx depcheck
```

**Step 3 — Config audit**
```bash
# Search for hardcoded credentials or hostnames
grep -r "localhost\|password\|secret\|api_key" --include="*.py" src/
```

**Step 4 — Backing services audit**
- List every external service the app touches
- For each: is the connection string in an env var or hardcoded?

**Step 5 — Build pipeline audit**
- Is there a CI system that builds artifacts?
- Are artifacts promoted between environments, or rebuilt per environment?

**Step 6 — State audit**
- Does the app write to the local filesystem for anything other than ephemeral temp files?
- Does it use in-memory caches that must survive restarts?
- Are there sticky session requirements?

**Step 7 — Log audit**
```bash
# Does the app write to files instead of stdout?
find . -name "*.log" -not -path "*/vendor/*"
grep -r "logging.FileHandler\|open.*\.log" --include="*.py" src/
```

---

## Worked Example — Auditing a Monolith

You inherit a Python/Flask app with the following characteristics:

- Config stored in `config/production.py` checked into git
- PostgreSQL connection string hardcoded to `localhost`
- Sessions stored in `/tmp/flask_sessions/` on the server
- Logs written to `/var/log/myapp/app.log`
- Deploys done by SSHing into a server and running `git pull && sudo systemctl restart myapp`
- Database migrations run manually from a developer's laptop

**Violations found:**

| Factor | Violation | Fix |
|--------|-----------|-----|
| III — Config | `config/production.py` in repo | Move all values to env vars |
| IV — Backing Services | `localhost` hardcoded | Use `DATABASE_URL` env var |
| V — Build/Release/Run | `git pull` on production server | CI builds image, deploys artifact |
| VI — Processes | Sessions in `/tmp` | Move sessions to Redis |
| XI — Logs | Writing to `/var/log` | Write to stdout |
| XII — Admin Processes | Migrations from laptop | Run migrations as part of deploy pipeline |

**Remediation order:**

Start with Factor III — moving config to env vars — because it unblocks almost everything else. Once config is externalized, Factor IV is often fixed as a side effect. Then tackle Factor VI (stateless processes) because it is a prerequisite for safe horizontal scaling. Factor V (build pipeline) and Factor XII (admin processes) come next. Factor XI (logs) is often the quickest win and can be done in parallel.

---

## Pitfalls

**Treating 12-Factor as all-or-nothing.** You can apply the factors incrementally. Moving from `config/production.py` to env vars is valuable even if you have not yet fixed your logging. Pick the highest-leverage violation and fix it.

**Using a `.env` file as a substitute.** A `.env` file committed to the repo violates Factor III as surely as a config file does. `.env` files are fine for local development — they must never be committed or baked into images.

**Conflating stateless processes with no persistence.** Stateless means no process-local state that must survive a restart. Data absolutely gets persisted — in backing services. The app is stateless; the backing services are not.

**Over-engineering Factor VIII.** Not every app needs a separate worker process type from day one. The point is that when you need to scale one dimension independently, the process model supports it cleanly.

**Ignoring Factor X in favor of convenience.** "I'll use SQLite locally, it's just for dev" is a tax you pay later — usually as a production incident. The tools gap compounds over time.

**Treating logs as something ops handles.** The decision of where to route logs is operational. The decision of what format to emit and whether to write to stdout is a development decision. Own it.

---

## Quick Reference — 12-Factor Compliance Checklist

| # | Factor | Compliance Check |
|---|--------|-----------------|
| I | Codebase | One repo per app, multiple deploys from same codebase |
| II | Dependencies | All dependencies declared in a manifest, isolation tool in use |
| III | Config | All env-specific values in env vars, none in committed code |
| IV | Backing Services | All services referenced via env var URL, swappable without code changes |
| V | Build/Release/Run | CI produces artifact; artifact + config = release; no rebuilds per env |
| VI | Processes | No local file state between requests; no in-memory state that must survive restart |
| VII | Port Binding | App binds a port itself; no external web server required at runtime |
| VIII | Concurrency | Work divided into process types; each type scales independently |
| IX | Disposability | Starts in under 10s; handles SIGTERM gracefully; workers requeue on crash |
| X | Dev/Prod Parity | Same DB engine, cache, and broker in dev and production |
| XI | Logs | All log output to stdout/stderr; no log files written by the app |
| XII | Admin Processes | Migrations and scripts run as one-off processes from the same release |

---

## Next Steps

These documents build directly on the 12-Factor principles:

- `Cloud-Native-Patterns.md` — patterns that emerge when you apply 12-Factor at scale: circuit breakers, sidecars, service meshes
- `Docker.md` — containers are the natural packaging mechanism for 12-Factor apps; Factor V, VI, and IX map directly onto container primitives
- `Kubernetes.md` — orchestration that operationalizes Factors VIII, IX, and the 15-Factor extensions
- `Microservices-Patterns.md` — distributing a 12-Factor app across services, with the tradeoffs that introduces

---

## The Mantra

> One codebase. Explicit dependencies. Config in the environment. Backing services as attachments. Build once, release with config, run anywhere. Stateless processes. Self-binding ports. Scale by process type. Fast start, clean stop. Dev matches prod. Log to stdout. Admin tasks from the same release.

That is the 12-Factor app. Every principle serves one goal: an app that is easy to deploy, easy to scale, and easy to operate — because it cooperates with the platform instead of working around it.

---

*Reads: 0/4. Tier reached: PEAK. Lessons added: 0.*
