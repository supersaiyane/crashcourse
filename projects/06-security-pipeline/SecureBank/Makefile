.PHONY: dev test lint build run scan up down logs clean all

# ── Development ──────────────────────────────────────────────────────────────
dev:                                     # run locally without Docker
	cd transaction-api && go run .

test:                                    # run test suite (7 tests)
	cd transaction-api && go test -v ./...

lint:                                    # static analysis
	cd transaction-api && go vet ./...

# ── Docker ───────────────────────────────────────────────────────────────────
build:                                   # build production image
	docker build -t securebank:local ./transaction-api

run: build                               # run containerised
	docker run -d -p 8080:8080 --name securebank securebank:local

scan: build                              # security scan image
	trivy image --severity HIGH,CRITICAL securebank:local

scan-fs:                                 # scan source code
	trivy fs --severity HIGH,CRITICAL ./transaction-api

scan-iac:                                # scan terraform configs
	trivy config ./terraform

# ── Compose ──────────────────────────────────────────────────────────────────
up:                                      # start full local stack
	docker-compose up -d

down:                                    # stop stack
	docker-compose down

logs:                                    # follow logs
	docker-compose logs -f transaction-api

# ── Full pipeline ────────────────────────────────────────────────────────────
all: test lint build scan scan-fs scan-iac
	@echo "Full local security pipeline passed"

clean:                                   # remove everything
	docker-compose down -v 2>/dev/null || true
	docker rm -f securebank 2>/dev/null || true
	docker rmi securebank:local 2>/dev/null || true
