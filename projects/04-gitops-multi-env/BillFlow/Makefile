.PHONY: dev test build push clean kustomize-dev kustomize-staging kustomize-prod

# ── Local development ────────────────────────────────────────────────────────
dev:
	cd billing-service && npm install && npm start

test:
	cd billing-service && npm test

# ── Docker ───────────────────────────────────────────────────────────────────
build:
	docker build -t billflow:local ./billing-service

push: build
	docker tag billflow:local ghcr.io/supersaiyane/billflow:latest
	docker push ghcr.io/supersaiyane/billflow:latest

# ── Kustomize ────────────────────────────────────────────────────────────────
kustomize-dev:
	kustomize build k8s/overlays/dev

kustomize-staging:
	kustomize build k8s/overlays/staging

kustomize-prod:
	kustomize build k8s/overlays/production

diff-envs:
	diff <(kustomize build k8s/overlays/dev) <(kustomize build k8s/overlays/production) || true

# ── Compose ──────────────────────────────────────────────────────────────────
up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f billflow

clean:
	docker-compose down -v
	docker rmi billflow:local 2>/dev/null || true
