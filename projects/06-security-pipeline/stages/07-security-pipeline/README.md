# Stage 7: Security Pipeline

**Goal:** Combine all six previous stages into a single automated CI/CD pipeline that scans, signs, enforces, and monitors the SecureBank application from commit to runtime.

**Prerequisites:** Stages 1-6 complete.

---

## 1. Theory (What & Why)

### The complete shift-left pipeline

Each stage addresses one layer of security. The pipeline chains them:

```text
Developer pushes code
   |
   v
+----------+   +----------+   +---------+   +---------+   +----------+
| 1. Test  |-->| 2. Image |-->| 3. IaC  |-->| 4. Sign |-->| 5. Deploy|
| (go test)|   | Scan     |   | Scan    |   | (Cosign)|   | (kubectl)|
|          |   | (Trivy)  |   | (Trivy/ |   |         |   |          |
|          |   |          |   | Checkov)|   |         |   |          |
+----------+   +----------+   +---------+   +---------+   +----------+
                                                               |
                                                               v
                                                      +----------------+
                                                      | 6. Runtime     |
                                                      | (Falco watches)|
                                                      +----------------+
```

If any gate fails, the pipeline stops. Code never reaches production without passing every check.

### What the GitHub Actions pipeline does

The project ships with `.github/workflows/security.yml`:

| Job | What it does | Blocks on |
|-----|-------------|-----------|
| **test** | `go test` + `go vet` | Test failure, vet warnings |
| **image-scan** | Build image, Trivy scan | Any HIGH/CRITICAL CVE |
| **iac-scan** | Trivy config scan on Terraform | Any HIGH/CRITICAL misconfig |
| **sbom** | Generate CycloneDX SBOM, upload artifact | Never blocks (informational) |
| **sign** | Sign image with Cosign (main branch only) | Signing failure |

### Defense in depth

No single tool catches everything. The pipeline layers defenses:

| Threat | Caught by | Stage |
|--------|----------|-------|
| Vulnerable Go dependency | Trivy image scan | 1 |
| Unencrypted S3 bucket | Trivy/Checkov IaC scan | 2 |
| Privileged container | OPA Gatekeeper admission | 3 |
| Tampered image in registry | Cosign signature check | 4 |
| Shell spawned in container | Falco runtime detection | 5 |
| Static database password | Vault dynamic secrets | 6 |
| All of the above in CI | GitHub Actions pipeline | 7 |

### BFSI compliance mapping

| Regulation | Requirement | SecureBank implementation |
|-----------|------------|--------------------------|
| RBI Cyber Security | Vulnerability management | Trivy image + IaC scanning in CI |
| PRA SS2/21 | Supply chain integrity | Cosign image signing + Sigstore transparency |
| ISO 27001 A.12.6 | Technical vuln management | Automated scanning + SBOM generation |
| PCI DSS 6.3 | Secure development lifecycle | Full security pipeline commit to runtime |
| SOC 2 CC7.1 | System monitoring | Falco runtime detection + audit logging |

---

## 2. Hands-On: Run the Full Pipeline

### 2.1 Review the pipeline

Open `SecureBank/.github/workflows/security.yml` and trace the flow:

1. **test** — Go tests and vet (quality gate)
2. **image-scan** — builds image, scans with Trivy (vulnerability gate)
3. **iac-scan** — scans Terraform with Trivy (infrastructure gate)
4. **sbom** — generates SBOM, uploads as artifact (compliance evidence)
5. **sign** — signs image with Cosign (supply chain integrity)

### 2.2 Run locally with Make

```bash
cd SecureBank
make all
# Runs: test -> lint -> build -> scan -> scan-fs -> scan-iac
# If everything passes: "Full local security pipeline passed"
```

### 2.3 Push to GitHub and watch

```bash
git add .
git commit -m "feat: SecureBank with full security pipeline"
git push origin main
```

Open the Actions tab. Watch all jobs execute:
- test (30s) -> image-scan (60s) -> iac-scan (30s) -> sbom (30s) -> sign (15s)

### 2.4 Break a gate

Introduce a vulnerability or misconfiguration. Push. Watch the pipeline fail at the correct gate. This confirms each gate works independently.

### 2.5 Review the SBOM artifact

After the pipeline completes, download the SBOM artifact from the Actions run. It lists all components in the image.

### 2.6 The runtime layer

After deployment, Falco continues watching:

```bash
kubectl logs -n falco -l app.kubernetes.io/name=falco --tail 50
```

The pipeline secured the code and image. Falco secures the running container. Together they cover the full lifecycle.

---

## 3. Key patterns

### Pipeline-as-code versioning

The security pipeline is in Git, reviewed in PRs, versioned alongside code. Changes to security policies go through the same review process as code changes.

### Fail closed

If a scanner crashes or times out, the pipeline should FAIL, not pass. Security gates must not be skippable on error.

### Evidence collection

Store all scan results, SBOMs, and signing logs as CI artifacts with 90-day retention. These are compliance evidence for auditors.

### Scheduled rescanning

New CVEs appear daily. Run the image scan on a schedule even without code changes:

```yaml
on:
  schedule:
    - cron: '0 6 * * *'
```

---

## 4. Common mistakes

- **Security as a separate pipeline:** Security must be in the same pipeline as build/deploy. A separate review after deployment is too late.
- **Ignoring scan results:** If 50 MEDIUM findings pass through, triage them. Track in issues.
- **No runtime monitoring:** Pipeline secures supply chain. Falco secures runtime. You need both.
- **Compliance as a checkbox:** Running Trivy alone does not make you compliant. Act on findings, document exceptions, maintain evidence.

---

## Exercises

1. [Exercise 1 — Run the full pipeline](exercises/01-full-pipeline.md)
2. [Exercise 2 — Break and fix each gate](exercises/02-break-fix.md)

**Congratulations — you have completed the Security Pipeline project.**

You now have a complete shift-left security implementation: image scanning, IaC scanning, policy enforcement, supply chain signing, runtime detection, secrets management, and an automated CI/CD pipeline. This is production-grade security for a banking application.
