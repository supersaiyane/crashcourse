.PHONY: install test lint build run scan clean all

# ── Development ──────────────────────────────────────────────────────────────
install:
	cd api && pip install -r requirements.txt

test:
	cd api && python -m pytest -v

lint:
	cd api && ruff check .

run:
	cd api && python app.py

# ── Docker ───────────────────────────────────────────────────────────────────
build:
	docker build -t pipelineapi:local ./api

run-docker: build
	docker run -d -p 5000:5000 --name pipelineapi pipelineapi:local

scan: build
	trivy image --severity HIGH,CRITICAL pipelineapi:local

# ── Compose ──────────────────────────────────────────────────────────────────
up:
	docker-compose up -d

down:
	docker-compose down

# ── Full pipeline locally ────────────────────────────────────────────────────
all: install test lint build scan
	@echo "Full local pipeline passed"

clean:
	docker-compose down 2>/dev/null || true
	docker rm -f pipelineapi 2>/dev/null || true
	docker rmi pipelineapi:local 2>/dev/null || true
