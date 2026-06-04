# Stage 1: The App

**Goal:** Build a production-ready Flask API with tests, linting, and a multi-stage Dockerfile — the foundation that every CI pipeline in this project will build, test, scan, and deploy.

**Prerequisites:** Python 3.11+ installed. Docker installed. A text editor.

---

## 1. Theory (What & Why)

### Why start with the app?

Every CI/CD pipeline does the same five things in the same order:

```text
1. Checkout    <- get the code
2. Install     <- install dependencies
3. Test        <- run tests, fail fast if broken
4. Build       <- create a deployable artifact (Docker image)
5. Deploy      <- ship it somewhere
```

The app determines what each stage looks like. A well-structured app with tests, linting, and a good Dockerfile makes CI straightforward. A messy app makes CI painful regardless of which system you use.

PipelineAPI is designed to exercise every CI stage. It is deliberately simple (a CRUD API) so you can focus on the pipeline, not the application logic.

### What makes an app CI-ready?

| Requirement | Why CI needs it | PipelineAPI implementation |
|------------|-----------------|---------------------------|
| **Tests** | CI must answer "is this code broken?" | pytest with 6 tests covering all endpoints |
| **Linting** | CI must enforce code quality standards | ruff (fast Python linter) |
| **Dockerfile** | CI must produce a deployable artifact | Multi-stage: test stage + production stage |
| **Health check** | Deployment must know if the app is alive | `GET /health` returns status + version |
| **Input validation** | Security scans flag unvalidated input | Name required, max 100 chars |
| **Dependencies pinned** | Reproducible builds across CI runs | `requirements.txt` with exact versions |

### The PipelineAPI structure

```text
api/
  app.py              <- Flask API (health, CRUD items)
  test_app.py         <- pytest tests (6 tests)
  requirements.txt    <- pinned dependencies (flask, pytest, ruff)
  Dockerfile          <- multi-stage (test then production)
```

Four files. That is all a CI pipeline needs. The simplicity is deliberate — in the next five stages you will build the same pipeline four different ways, and the app should not distract from the pipeline.

### Multi-stage Dockerfile explained

The Dockerfile has two stages:

**Stage 1 (test):** Installs everything (flask, pytest, ruff), copies code, runs `pytest -v` and `ruff check .`. If either fails, the build fails. This stage is then discarded.

**Stage 2 (production):** Starts fresh from `python:3.11-slim`, installs only flask, copies only `app.py`, runs as `nobody` (non-root). The final image is ~120 MB (vs ~350 MB with test deps).

This means `docker build` is a complete CI pipeline in one command. If it succeeds, you have a tested, linted, production-ready image.

---

## 2. Hands-On: Build and Test PipelineAPI

### 2.1 Run locally

```bash
cd PipelineAPI/api

# Install dependencies
pip install -r requirements.txt

# Run tests
python -m pytest -v
# test_app.py::test_health PASSED
# test_app.py::test_create_item PASSED
# test_app.py::test_create_item_no_name PASSED
# test_app.py::test_list_items PASSED
# test_app.py::test_get_item_not_found PASSED
# test_app.py::test_delete_item PASSED
# 6 passed

# Run linter
ruff check .
# All checks passed!

# Start the server
python app.py
# Running on http://0.0.0.0:5000
```

### 2.2 Test the API endpoints

```bash
# Health check
curl http://localhost:5000/health
# {"status":"ok","version":"1.0.0","timestamp":1718000000.0}

# Create an item
curl -X POST http://localhost:5000/api/items \
  -H "Content-Type: application/json" \
  -d '{"name": "Widget"}'
# {"id":"a1b2c3d4","name":"Widget","created":1718000001.0}

# List items
curl http://localhost:5000/api/items
# {"items":[...],"total":1}

# Delete an item
curl -X DELETE http://localhost:5000/api/items/a1b2c3d4
# {"deleted":true}

# Validation: empty name returns 400
curl -X POST http://localhost:5000/api/items \
  -H "Content-Type: application/json" -d '{"name": ""}'
# {"error":"name is required"}
```

### 2.3 Build the Docker image

```bash
docker build -t pipelineapi:local ./PipelineAPI/api
```

Watch the output — pytest and ruff run during the build. If any test fails or ruff finds an issue, the build stops. No image is produced.

### 2.4 Run the containerised app

```bash
docker run -d -p 5000:5000 --name pipelineapi pipelineapi:local

curl http://localhost:5000/health
# {"status":"ok","version":"1.0.0"}

# Check image size
docker images pipelineapi:local
# ~120MB (slim, no test deps)

# Confirm non-root
docker exec pipelineapi whoami
# nobody
```

### 2.5 Security scan

```bash
# Scan with Trivy (if installed)
trivy image pipelineapi:local
# Total: 0 (no HIGH or CRITICAL vulnerabilities)
```

---

## 3. Understanding the test suite

| Test | What it validates | Why CI cares |
|------|------------------|-------------|
| `test_health` | GET /health returns 200 with status "ok" | Deployment health checks depend on this |
| `test_create_item` | POST with valid name returns 201 | Core functionality works |
| `test_create_item_no_name` | POST with empty name returns 400 | Input validation works |
| `test_list_items` | GET /api/items returns a list | Read path works |
| `test_get_item_not_found` | GET with bad id returns 404 | Error handling works |
| `test_delete_item` | DELETE returns 200 | Delete path works |

These tests are fast (under 1 second) because they use Flask's test client — no network, no server startup. In CI, every second costs money.

### Writing tests that CI loves

- **Fast:** Under 10 seconds for the full suite.
- **Deterministic:** Same result every run. No randomness, no external dependencies.
- **Independent:** Each test can run alone. No ordering dependencies.
- **Descriptive:** When a test fails, the name tells you what is broken.

---

## 4. Key patterns

### Dependency pinning

`requirements.txt` pins exact versions: `flask==3.0.3`, `pytest==8.2.0`, `ruff==0.5.0`. Because `flask>=3.0` might install 3.1 tomorrow with a breaking change. Pinning ensures reproducibility.

### Non-root containers

`USER nobody` in the Dockerfile. If a vulnerability allows code execution, the attacker gets `nobody` permissions — cannot install packages, modify system files, or escape the container. Defense in depth.

### The health endpoint contract

```json
{"status": "ok", "version": "1.0.0", "timestamp": 1718000000.0}
```

- `status: ok` — app is running and ready
- `version` — confirms which version is deployed
- `timestamp` — confirms the response is fresh

Kubernetes probes, load balancers, and deployment pipelines all use this.

---

## 5. Common mistakes

- **No tests:** A CI pipeline without tests is just a deployment pipeline. It ships code but does not validate it.
- **Tests depending on external services:** If your test needs a database, it fails when that service is down. Use test clients for unit tests.
- **Unpinned dependencies:** `flask>=3.0` means your build is not reproducible.
- **Running as root:** Default Docker behavior is root. Always add `USER nobody`.
- **Giant images:** Including test deps in production wastes space and increases attack surface. Use multi-stage builds.
- **No linting:** Code style arguments waste review time. Let ruff enforce style automatically.

---

## Exercises

1. [Exercise 1 — Run tests and build the image](exercises/01-build-test.md)
2. [Exercise 2 — Add a new endpoint with test](exercises/02-add-endpoint.md)

**Next stage:** [02-github-actions](../02-github-actions/README.md) — build the first CI pipeline.
