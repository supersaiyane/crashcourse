# Exercise 1: Find All Misconfigurations

**Goal:** Run Trivy and Checkov on SecureBank's Terraform and list all findings.

## Step 1: Scan with Trivy

```bash
trivy config ./terraform
```

Record the number of failures by severity.

## Step 2: Scan with Checkov

```bash
checkov -d ./terraform --framework terraform
```

## Step 3: Compare

Which findings did Trivy catch that Checkov missed, and vice versa?

## Verify

You should have a list of 8-12 findings covering S3, RDS, security groups, and EKS.
