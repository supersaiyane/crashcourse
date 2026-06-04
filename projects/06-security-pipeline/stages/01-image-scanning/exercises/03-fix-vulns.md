# Exercise 3: Fix Vulnerabilities

**Goal:** Reduce vulnerabilities by changing the base image and updating dependencies.

## Step 1: Scan the current image and count findings

```bash
trivy image --severity HIGH,CRITICAL securebank:local 2>&1 | tail -5
```

## Step 2: The production stage already uses distroless — verify

```bash
grep "FROM gcr.io/distroless" transaction-api/Dockerfile
```

## Step 3: Rebuild and rescan

```bash
make build
trivy image --severity HIGH,CRITICAL securebank:local
```

## Step 4: Compare

How many findings before vs after? The distroless base should have near-zero findings.

## Verify

Run `trivy image --severity HIGH,CRITICAL --exit-code 1 securebank:local` — exit code should be 0 (clean).
