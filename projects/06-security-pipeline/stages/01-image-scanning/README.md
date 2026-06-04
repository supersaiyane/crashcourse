# Stage 1: Image Scanning

**Goal:** Scan the SecureBank container image for vulnerabilities, generate a Software Bill of Materials (SBOM), and set up image scanning as a CI gate that blocks vulnerable images from reaching production.

**Prerequisites:** Docker installed. Trivy CLI installed (`brew install trivy` or download from GitHub releases). The SecureBank app built: `cd SecureBank && make build`.

---

## 1. Theory (What & Why)

### The container security problem

A container image is not just your code. It is your code + a base image + system libraries + language runtime + every dependency. The `golang:1.22-alpine` base image alone contains hundreds of packages. Any of them could have a known vulnerability (CVE).

In 2023, the average container image had 127 vulnerabilities. 15% had at least one CRITICAL. These are not hypothetical — they are published exploits with proof-of-concept code. If your image runs an unpatched OpenSSL, an attacker can execute code inside your container.

### What is image scanning?

Image scanning reads every package in a container image and checks it against vulnerability databases (NVD, GitHub Advisory, vendor advisories). It answers: "Does this image contain known security issues?"

```text
+-------------------+     scan      +-------------------+
| Container Image   | -----------> | Trivy Scanner     |
| (layers, packages)|              | (vuln databases)  |
+-------------------+              +-------------------+
                                          |
                                   +------v------+
                                   | Report      |
                                   | - CVE-2024-xxx (HIGH)
                                   | - CVE-2023-xxx (CRITICAL)
                                   | - 0 MEDIUM
                                   +-------------+
```

### Severity levels

| Severity | What it means | Action |
|----------|--------------|--------|
| **CRITICAL** | Remote code execution, data breach, no auth needed | Block immediately. Do not deploy. |
| **HIGH** | Significant impact, may need specific conditions | Block in CI. Fix before next release. |
| **MEDIUM** | Limited impact or requires local access | Fix when convenient. Do not block CI. |
| **LOW** | Minimal impact, theoretical risk | Track for awareness. |
| **UNKNOWN** | No severity assigned yet | Investigate manually. |

For SecureBank (a banking API), we block on HIGH and CRITICAL. Medium and below are tracked but do not block deployments.

### Why Trivy?

Trivy is the most popular open-source scanner because it is:
- **Fast** — scans in seconds (local vulnerability database, no API calls per package)
- **Comprehensive** — scans OS packages, language dependencies, IaC configs, and Kubernetes manifests
- **Zero-config** — `trivy image myapp:latest` works immediately
- **CI-friendly** — exit code 1 on findings, easy to gate pipelines

Alternatives: Grype (Anchore), Snyk Container, AWS ECR scanning, Docker Scout. Trivy wins on speed and breadth.

### What is an SBOM?

A Software Bill of Materials (SBOM) lists every component in your image — like a nutrition label for software. Formats: CycloneDX (JSON), SPDX (industry standard).

SBOMs matter for:
- **Compliance** — regulations (EU Cyber Resilience Act, US Executive Order 14028) increasingly require SBOMs
- **Incident response** — when a new CVE drops, search your SBOMs to find affected images in minutes, not days
- **Supply chain transparency** — know exactly what you ship

### The shift-left principle

Traditional security: scan in production, find issues after deployment, scramble to patch.

Shift-left security: scan in CI, find issues before deployment, block bad images from reaching production.

```text
Traditional:  Code --> Build --> Deploy --> SCAN (too late)
Shift-left:   Code --> SCAN --> Build --> SCAN --> Deploy (blocked if vulnerable)
```

SecureBank implements shift-left: Trivy runs in CI (Stage 7) and blocks the pipeline if HIGH or CRITICAL vulnerabilities are found.

---

## 2. Hands-On: Scan SecureBank

### 2.1 Build the image

```bash
cd SecureBank
docker build -t securebank:local ./transaction-api
```

### 2.2 Basic image scan

```bash
trivy image securebank:local
```

Expected output (abbreviated):

```text
securebank:local (debian 12.5)

Total: 3 (UNKNOWN: 0, LOW: 1, MEDIUM: 1, HIGH: 1, CRITICAL: 0)

+------------------+----------+----------+-------------------+
|     LIBRARY      | SEVERITY |  CVE     | INSTALLED VERSION |
+------------------+----------+----------+-------------------+
| libssl3          | HIGH     | CVE-...  | 3.0.13-1          |
| zlib1g           | MEDIUM   | CVE-...  | 1:1.2.13          |
| libc6            | LOW      | CVE-...  | 2.36-9            |
+------------------+----------+----------+-------------------+
```

Trivy found vulnerabilities in the base image packages — not in your Go code, but in the Debian packages that come with `golang:1.22-alpine`.

### 2.3 Filter by severity

```bash
# Only HIGH and CRITICAL (what we care about for CI gates)
trivy image --severity HIGH,CRITICAL securebank:local
```

### 2.4 CI gate mode (exit code)

```bash
# Exit code 1 if any HIGH or CRITICAL found (use in CI)
trivy image --severity HIGH,CRITICAL --exit-code 1 securebank:local
echo $?
# 1 = vulnerabilities found (CI pipeline should stop)
# 0 = clean (CI pipeline continues)
```

### 2.5 Scan the source code (filesystem scan)

Trivy also scans source code — finds vulnerable dependencies in go.mod, requirements.txt, package.json:

```bash
trivy fs --severity HIGH,CRITICAL ./transaction-api
```

### 2.6 Generate an SBOM

```bash
# Generate CycloneDX SBOM
trivy image --format cyclonedx --output sbom.json securebank:local

# View the SBOM
cat sbom.json | python3 -m json.tool | head -50
```

The SBOM lists every package, version, and license in the image. Store this alongside your release artifacts.

### 2.7 Scan Kubernetes manifests

```bash
trivy config ./k8s
```

Trivy checks for K8s misconfigurations: missing resource limits, running as root, missing security context, etc.

### 2.8 Fix vulnerabilities

The most common fix: update the base image.

```dockerfile
# Before: uses an older base with known CVEs
FROM golang:1.22-alpine AS build

# After: use distroless (minimal, fewer packages, fewer CVEs)
FROM gcr.io/distroless/static-debian12:nonroot
```

SecureBank already uses distroless for the production stage. Rebuild and rescan:

```bash
docker build -t securebank:local ./transaction-api
trivy image --severity HIGH,CRITICAL securebank:local
# Total: 0 (distroless has almost nothing to be vulnerable)
```

### 2.9 Ignore known false positives

Some findings are false positives or accepted risks. Create `.trivyignore`:

```text
# Accepted risk: this CVE does not affect our usage pattern
CVE-2024-12345

# Will be fixed in next base image update (tracked in JIRA-789)
CVE-2024-67890
```

```bash
trivy image --ignorefile .trivyignore securebank:local
```

---

## 3. Key patterns

### Registry scanning

Scan images in your container registry (not just locally):

```bash
trivy image ghcr.io/supersaiyane/securebank:v1.0.0
```

### Scheduled scanning

New CVEs are published daily. An image that was clean yesterday might be vulnerable today. Set up a daily scan cron:

```yaml
# GitHub Actions — scan on schedule
on:
  schedule:
    - cron: '0 6 * * *'    # daily at 06:00 UTC
```

### BFSI context

In banking, regulators (RBI, PRA, OCC) require proof that you scan for known vulnerabilities. Trivy reports + SBOMs stored as CI artifacts provide this evidence. During an audit:

"Show me your vulnerability scanning reports for the last 90 days." — you hand them the CI artifacts.

---

## 4. Common mistakes

- **Scanning only in production:** Too late. Shift left — scan in CI before deployment.
- **Blocking on all severities:** LOW and MEDIUM will generate hundreds of findings you cannot fix (upstream packages). Block on HIGH/CRITICAL only.
- **Ignoring SBOM:** When the next Log4Shell drops, you need to know which images are affected. Generate and store SBOMs.
- **Not rescanning after updates:** Rebuilding the image does not mean rescanning. Always scan after every build.
- **Using :latest base images:** `FROM python:latest` means your scan results are not reproducible. Pin versions.
- **Ignoring Go/Python dependency vulns:** Trivy scans go.mod and requirements.txt too. Update vulnerable libraries, not just OS packages.

---

## Exercises

1. [Exercise 1 — Scan and triage](exercises/01-scan-triage.md)
2. [Exercise 2 — Generate and inspect SBOM](exercises/02-sbom.md)
3. [Exercise 3 — Fix vulnerabilities](exercises/03-fix-vulns.md)

**Next stage:** [02-iac-scanning](../02-iac-scanning/README.md) — scan Terraform configs for misconfigurations.
