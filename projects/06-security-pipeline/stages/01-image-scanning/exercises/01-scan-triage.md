# Exercise 1: Scan and Triage

**Goal:** Scan the SecureBank image, understand the findings, and decide which to fix.

## Step 1: Build and scan

```bash
cd SecureBank
make build
trivy image securebank:local
```

## Step 2: Filter by severity

```bash
trivy image --severity HIGH,CRITICAL securebank:local
```

Record: how many HIGH? How many CRITICAL?

## Step 3: Scan the source code

```bash
trivy fs --severity HIGH,CRITICAL ./transaction-api
```

Are there any vulnerable Go dependencies?

## Step 4: CI gate test

```bash
trivy image --severity HIGH,CRITICAL --exit-code 1 securebank:local
echo $?
```

Would this block your CI pipeline?

## Verify

You should be able to explain: which vulnerabilities are in your base image vs your code, and which you would fix vs accept.
