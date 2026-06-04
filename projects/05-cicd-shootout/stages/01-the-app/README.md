# Stage 1: The App

**Goal:** Build a production-ready Flask API with tests, linting, and a multi-stage Dockerfile — the foundation every CI pipeline will build.

**Prerequisites:** Python 3.11+, Docker installed.

---

## 1. Theory (What & Why)

### Why start with the app?

Every CI pipeline does the same things: checkout, install, test, lint, build image, scan, deploy. The app determines what those stages look like. A well-structured app with tests and a Dockerfile makes CI straightforward. A messy app makes CI painful.

### PipelineAPI structure

```text
api/
├── app.py              ← Flask API (health, CRUD items)
├── test_app.py         ← pytest tests (6 tests)
├── requirements.txt    ← dependencies (flask, pytest, ruff)
└── Dockerfile          ← multi-stage (test → production)
```

### Multi-stage Dockerfile

The Dockerfile has two stages:
1. **Test stage** — installs all dependencies, runs pytest and ruff. If tests fail, the build fails.
2. **Production stage** — installs only flask, copies only app.py. Smaller, safer image.

This means `docker build` is itself a CI step — if the image builds, tests passed.

---

## 2. Hands-On

### 2.1 Run locally

```bash
cd PipelineAPI/api
pip install -r requirements.txt
python -m pytest -v        # all 6 tests pass
ruff check .               # no lint issues
python app.py              # http://localhost:5000/health
```

### 2.2 Build the Docker image

```bash
docker build -t pipelineapi:local ./PipelineAPI/api
docker run -p 5000:5000 pipelineapi:local
curl http://localhost:5000/health
```

### 2.3 Test the API

```bash
# Create an item
curl -X POST http://localhost:5000/api/items -H "Content-Type: application/json" -d '{"name": "Widget"}'

# List items
curl http://localhost:5000/api/items

# Delete an item
curl -X DELETE http://localhost:5000/api/items/<id>
```

---

## Exercises

1. [Exercise 1 — Run tests and build the image](exercises/01-build-test.md)
2. [Exercise 2 — Add a new endpoint with test](exercises/02-add-endpoint.md)

**Next stage:** [02-github-actions](../02-github-actions/README.md)
