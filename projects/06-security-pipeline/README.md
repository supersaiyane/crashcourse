# Project 6: Security Pipeline (Shift-Left)

**App:** SecureBank — a banking transaction API that demonstrates security from code to runtime

**What you'll build:** A complete shift-left security pipeline. By the end, you'll have a Go transaction API secured at every layer: container images scanned with Trivy, infrastructure configs scanned with Checkov, Kubernetes policies enforced with OPA Gatekeeper, container images signed with Cosign/Sigstore, runtime threats detected with Falco, secrets managed with Vault, and the entire pipeline automated in GitHub Actions.

**Tier:** Intermediate (3-7 years experience)

**Duration:** 6-8 weeks

**Courses covered:** Trivy, Checkov, OPA, Cosign/Sigstore, Falco, Vault, SSH, GitHub Actions

## Stages

| # | Stage | Course | What you'll do |
|---|-------|--------|---------------|
| 1 | Image Scanning | `Trivy.md` | Scan container images, generate SBOMs, set up CI gates |
| 2 | IaC Scanning | `Checkov.md` | Scan Terraform configs, find and fix misconfigurations |
| 3 | Policy Enforcement | `OPA.md` | Kubernetes admission control with OPA Gatekeeper |
| 4 | Supply Chain | `Cosign-Sigstore.md` | Sign images, verify signatures in Kubernetes |
| 5 | Runtime Security | `Falco.md` | Detect runtime threats, custom rules for banking |
| 6 | Secrets Management | `Vault.md` | Dynamic database credentials, SSH certificate authority |
| 7 | Security Pipeline | `GitHub-Actions.md` | Full security CI/CD — scan, sign, enforce, detect |

## The app: SecureBank

A banking transaction API that processes fund transfers between accounts.

```text
            +-------------------+
  Client -->| Transaction API   |--> PostgreSQL
            | (Go, port 8080)   |
            +-------------------+
                    |
                    v
              Audit Log (every transaction recorded)
```

- **Transaction API** (Go, port 8080) — creates and lists transactions, validates amounts, enforces single-transaction limits, maintains audit trail
- **PostgreSQL** — stores transactions and audit log
- Health check, structured JSON logging, input validation, concurrent-safe

The Terraform directory contains **intentional misconfigurations** — S3 without encryption, security groups open to 0.0.0.0/0, RDS publicly accessible, hardcoded passwords. These exist for scanning exercises: students find and fix them.

## Getting started

```bash
cd SecureBank
make up            # start the API
make test          # run 7 tests
make scan          # scan the Docker image
make scan-iac      # scan Terraform configs (will find issues - that is the point)
make all           # full local security pipeline
```

Then work through each stage starting at `stages/01-image-scanning/README.md`.
