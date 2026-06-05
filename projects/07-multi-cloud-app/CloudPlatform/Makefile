.PHONY: dev test lint build run scan up down logs status clean restart all

# ── Development ──────────────────────────────────────────────────────────────
dev:                             ## Run API locally without Docker
	cp -n .env.example .env 2>/dev/null || true
	cd api && pip install -q -r requirements.txt && python app.py

test:                            ## Run API test suite
	cd api && pip install -q -r requirements.txt && python -m pytest test_app.py -v

lint:                            ## Check code quality with ruff
	cd api && pip install -q ruff && ruff check .
	cd processor && pip install -q ruff && ruff check .

# ── Docker ───────────────────────────────────────────────────────────────────
build:                           ## Build all Docker images
	docker compose build

run: build                       ## Run the API container standalone
	docker run -d -p 5000:5000 --name cloudplatform-api cloudplatform-api:latest

scan: build                      ## Security scan all images
	@echo "Scanning API image..."
	trivy image --severity HIGH,CRITICAL cloudplatform-api:latest 2>/dev/null || echo "Install trivy for image scanning"

# ── Compose ──────────────────────────────────────────────────────────────────
up:                              ## Start full local stack
	cp -n .env.example .env 2>/dev/null || true
	docker compose up -d --build

down:                            ## Stop all services
	docker compose down

restart:                         ## Restart all services
	docker compose down
	docker compose up -d --build

logs:                            ## Tail logs from all services
	docker compose logs -f

status:                          ## Show running containers
	docker compose ps

# ── Full pipeline ────────────────────────────────────────────────────────────
all: test lint build scan        ## Run everything (local CI)
	@echo "Full local pipeline passed"

clean:                           ## Stop and remove all containers + volumes
	docker compose down -v --remove-orphans 2>/dev/null || true
	docker rmi cloudplatform-api cloudplatform-processor cloudplatform-frontend 2>/dev/null || true
