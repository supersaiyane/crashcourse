# Stage 2: IaC Scanning

**Goal:** Scan SecureBank's Terraform infrastructure code for security misconfigurations using Trivy and Checkov — finding and fixing issues before they reach cloud environments.

**Prerequisites:** Stage 1 complete. Trivy CLI installed. Python 3.8+ installed (for Checkov). Checkov installed: `pip install checkov`.

---

## 1. Theory (What & Why)

### The IaC security problem

Infrastructure as Code (IaC) is a superpower — you define your cloud resources in version-controlled files. But it is also a risk multiplier. One misconfigured Terraform file can:

- Open a security group to the entire internet (`0.0.0.0/0`)
- Create an unencrypted database with a hardcoded password
- Make an S3 bucket publicly readable (leaking customer data)
- Provision an EKS cluster with a public API endpoint

These are not hypothetical. In 2023, misconfigured cloud resources were the root cause of 15% of data breaches (Verizon DBIR). And unlike code bugs, IaC misconfigurations deploy immediately to production infrastructure.

### What is IaC scanning?

IaC scanners read your Terraform, CloudFormation, Kubernetes YAML, Dockerfiles, and Helm charts and check them against security best practices:

```text
+-------------------+     scan      +-------------------+
| Terraform files   | -----------> | Trivy / Checkov   |
| (*.tf, *.yaml)    |              | (policy database) |
+-------------------+              +-------------------+
                                          |
                                   +------v------+
                                   | Findings    |
                                   | - CKV_AWS_21: S3 no versioning
                                   | - CKV_AWS_19: S3 no encryption
                                   | - CKV_AWS_17: RDS publicly accessible
                                   +-------------+
```

### Trivy vs Checkov

| Feature | Trivy (config scan) | Checkov |
|---------|-------------------|---------|
| **Speed** | Fast (Go binary) | Slower (Python) |
| **Policy count** | ~800 rules | ~2000 rules |
| **Custom policies** | Rego (OPA) | Python or YAML |
| **Frameworks** | TF, K8s, Docker, Helm | TF, CFN, K8s, Docker, ARM, Serverless |
| **Output formats** | Table, JSON, SARIF | Table, JSON, SARIF, JUnit |
| **Best for** | Quick scans in CI | Deep audits, compliance frameworks |

Use both: Trivy for fast CI gates, Checkov for comprehensive audits.

### SecureBank's intentional misconfigurations

The `terraform/main.tf` file contains deliberate security issues for this exercise:

| Resource | Misconfiguration | Checkov ID | Severity |
|----------|-----------------|------------|----------|
| S3 bucket | No versioning | CKV_AWS_21 | HIGH |
| S3 bucket | No encryption | CKV_AWS_19 | HIGH |
| S3 bucket | No public access block | CKV_AWS_53 | HIGH |
| Security group | Open to 0.0.0.0/0 | CKV_AWS_24 | CRITICAL |
| RDS instance | No encryption at rest | CKV_AWS_16 | HIGH |
| RDS instance | Publicly accessible | CKV_AWS_17 | CRITICAL |
| RDS instance | Hardcoded password | CKV_AWS_16 | CRITICAL |
| RDS instance | No multi-AZ | CKV_AWS_157 | MEDIUM |
| EKS cluster | Public API endpoint | CKV_AWS_39 | HIGH |

Your job in the exercises: find these with Trivy and Checkov, then fix them.

---

## 2. Hands-On: Scan SecureBank Infrastructure

### 2.1 Scan with Trivy

```bash
cd SecureBank
trivy config ./terraform
```

Expected output:

```text
terraform/main.tf (terraform)

Tests: 15 (SUCCESSES: 3, FAILURES: 12, EXCEPTIONS: 0)
Failures: 12 (HIGH: 7, CRITICAL: 3, MEDIUM: 2)

+---------------------------+----------+-------------------------------+
| CHECK                     | SEVERITY | DESCRIPTION                   |
+---------------------------+----------+-------------------------------+
| AVD-AWS-0089              | CRITICAL | SG allows ingress from 0.0.0.0|
| AVD-AWS-0080              | CRITICAL | RDS publicly accessible       |
| AVD-AWS-0176              | HIGH     | S3 bucket lacks encryption    |
+---------------------------+----------+-------------------------------+
```

### 2.2 Scan with Checkov

```bash
checkov -d ./terraform --framework terraform
```

Checkov provides more detail — each finding includes:
- Check ID (CKV_AWS_21)
- File and line number
- Description
- Link to remediation guide

### 2.3 Fix the S3 bucket

Open `terraform/main.tf` and add:

```hcl
resource "aws_s3_bucket_versioning" "transaction_logs" {
  bucket = aws_s3_bucket.transaction_logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "transaction_logs" {
  bucket = aws_s3_bucket.transaction_logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "transaction_logs" {
  bucket                  = aws_s3_bucket.transaction_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

### 2.4 Fix the security group

Replace the open ingress rule:

```hcl
ingress {
  from_port   = 8080
  to_port     = 8080
  protocol    = "tcp"
  cidr_blocks = ["10.0.0.0/8"]    # internal VPC only, not 0.0.0.0/0
  description = "API access from internal network"
}
```

### 2.5 Fix the RDS instance

```hcl
resource "aws_db_instance" "transactions" {
  # ... existing config ...
  storage_encrypted   = true          # enable encryption at rest
  publicly_accessible = false         # remove public access
  multi_az            = true          # high availability
  password            = var.db_password  # from variable, not hardcoded
}
```

### 2.6 Rescan and confirm

```bash
trivy config ./terraform
# Failures should be reduced to 0 (or near 0)

checkov -d ./terraform --framework terraform
# Passed checks should increase significantly
```

### 2.7 In BFSI context

RBI (Reserve Bank of India) and PRA (UK) require encryption at rest for all customer data. A Checkov scan that finds `storage_encrypted = false` on a production database is not just a best practice — it is a compliance violation that auditors will flag. Automated IaC scanning catches these before they reach production.

---

## 3. Key patterns

### Baseline and suppress

Not all findings need immediate fixing. Create a baseline of accepted risks:

```bash
checkov -d ./terraform --create-baseline
# Creates .checkov.baseline with current findings
# Future scans only report NEW findings
```

### Pre-commit hook

Scan before code reaches Git:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/bridgecrewio/checkov
    rev: 3.2.0
    hooks:
      - id: checkov
        args: ['-d', './terraform']
```

### Custom policies

Write organisation-specific rules:

```python
# custom_checks/require_tags.py
from checkov.terraform.checks.resource.base_resource_check import BaseResourceCheck

class RequireProjectTag(BaseResourceCheck):
    def __init__(self):
        name = "Ensure all resources have a Project tag"
        id = "CKV_CUSTOM_1"
        supported = ["aws_s3_bucket", "aws_db_instance", "aws_security_group"]
        super().__init__(name=name, id=id, supported_resource_types=supported)

    def scan_resource_conf(self, conf):
        tags = conf.get("tags", [{}])[0]
        return "PASSED" if "Project" in tags else "FAILED"
```

---

## 4. Common mistakes

- **Scanning only Terraform:** Checkov also scans Kubernetes YAML, Dockerfiles, and Helm charts. Scan everything.
- **Hardcoding secrets in .tf files:** Use variables + Vault/AWS Secrets Manager. Checkov will flag hardcoded passwords.
- **Ignoring all findings:** Use baselines to suppress accepted risks, not `--skip-check` on everything.
- **Not scanning in CI:** Local scans get skipped. CI scans are mandatory. Set up Checkov in your pipeline.
- **Using default security groups:** AWS default SGs allow all outbound. Create explicit SGs with least-privilege rules.

---

## Exercises

1. [Exercise 1 — Find all misconfigurations](exercises/01-find-misconfigs.md)
2. [Exercise 2 — Fix and rescan](exercises/02-fix-rescan.md)
3. [Exercise 3 — Write a custom policy](exercises/03-custom-policy.md)

**Next stage:** [03-policy-enforcement](../03-policy-enforcement/README.md) — Kubernetes admission control with OPA.
