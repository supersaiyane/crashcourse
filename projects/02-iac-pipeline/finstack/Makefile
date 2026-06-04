.PHONY: dev test lint build run scan up down logs clean all tf-plan tf-apply

# -- Development ---------------------------------------------------------------
dev:
	cd app && pip install -r requirements.txt && python app.py

test:
	cd app && python -m pytest -v test_app.py

lint:
	cd app && ruff check . 2>/dev/null || python -m py_compile app.py && echo "syntax ok"

# -- Docker --------------------------------------------------------------------
build:
	docker build -t finstack-api:local ./app

run: build
	docker run -d -p 8080:8080 --name finstack-api finstack-api:local

scan: build
	trivy image --severity HIGH,CRITICAL finstack-api:local

# -- Compose -------------------------------------------------------------------
up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f payment-api

# -- Terraform (via LocalStack) ------------------------------------------------
tf-plan:
	cd terraform && terraform init && terraform plan

tf-apply:
	cd terraform && terraform init && terraform apply -auto-approve

# -- OPA policy check ----------------------------------------------------------
opa-check:
	conftest test terraform/main.tf -p policies/

# -- Full pipeline -------------------------------------------------------------
all: test lint build scan
	@echo "Full local pipeline passed"

clean:
	docker compose down -v 2>/dev/null || true
	docker rmi finstack-api:local 2>/dev/null || true
