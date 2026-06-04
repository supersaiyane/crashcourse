# Exercise 2: Fix and Rescan

**Goal:** Fix all HIGH and CRITICAL findings, then confirm a clean scan.

## Step 1: Fix S3 bucket (add versioning, encryption, public access block)
## Step 2: Fix security group (restrict CIDR to internal network)
## Step 3: Fix RDS (enable encryption, disable public access, use variable for password)
## Step 4: Rescan with both Trivy and Checkov
## Step 5: Verify zero HIGH/CRITICAL findings

## Verify

```bash
trivy config --severity HIGH,CRITICAL --exit-code 1 ./terraform
echo $?
# Should be 0
```
