# -----------------------------------------------------------------------------
# OPA Policy — No Public S3 Buckets
#
# BFSI compliance: S3 buckets must never be publicly accessible.
# Payment statements, audit logs, and transaction data live in S3 —
# a public bucket is a data breach waiting to happen.
#
# Evaluates Terraform plan JSON (from `terraform show -json tfplan`).
#
# Usage:
#   terraform plan -out=tfplan
#   terraform show -json tfplan > tfplan.json
#   conftest test --policy policies/ tfplan.json
# -----------------------------------------------------------------------------

package finstack.s3

import rego.v1

# ---------------------------------------------------------------------------
# Deny S3 buckets with public ACLs
# ---------------------------------------------------------------------------
deny contains msg if {
    some resource in input.resource_changes
    resource.type == "aws_s3_bucket"
    resource.change.after.acl == "public-read"
    msg := sprintf(
        "DENIED: S3 bucket '%s' has public-read ACL. BFSI policy requires all buckets to be private. Remove the 'acl' argument or set it to 'private'.",
        [resource.address]
    )
}

deny contains msg if {
    some resource in input.resource_changes
    resource.type == "aws_s3_bucket"
    resource.change.after.acl == "public-read-write"
    msg := sprintf(
        "DENIED: S3 bucket '%s' has public-read-write ACL. This is extremely dangerous — anyone on the internet can read and write your data.",
        [resource.address]
    )
}

# ---------------------------------------------------------------------------
# Deny S3 bucket public access block set to allow public access
# ---------------------------------------------------------------------------
deny contains msg if {
    some resource in input.resource_changes
    resource.type == "aws_s3_bucket_public_access_block"
    resource.change.after.block_public_acls == false
    msg := sprintf(
        "DENIED: S3 public access block '%s' has block_public_acls set to false. All FinStack buckets must block public ACLs.",
        [resource.address]
    )
}

deny contains msg if {
    some resource in input.resource_changes
    resource.type == "aws_s3_bucket_public_access_block"
    resource.change.after.block_public_policy == false
    msg := sprintf(
        "DENIED: S3 public access block '%s' has block_public_policy set to false. All FinStack buckets must block public policies.",
        [resource.address]
    )
}

deny contains msg if {
    some resource in input.resource_changes
    resource.type == "aws_s3_bucket_public_access_block"
    resource.change.after.restrict_public_buckets == false
    msg := sprintf(
        "DENIED: S3 public access block '%s' has restrict_public_buckets set to false.",
        [resource.address]
    )
}

# ---------------------------------------------------------------------------
# Deny S3 buckets without encryption
# ---------------------------------------------------------------------------
deny contains msg if {
    some resource in input.resource_changes
    resource.type == "aws_s3_bucket"
    resource.change.actions[_] == "create"
    not has_encryption(resource.address)
    msg := sprintf(
        "DENIED: S3 bucket '%s' is being created without server-side encryption. BFSI policy requires SSE-KMS or SSE-S3 on all buckets.",
        [resource.address]
    )
}

# Helper: check if a matching encryption config exists in the plan
has_encryption(bucket_address) if {
    some resource in input.resource_changes
    resource.type == "aws_s3_bucket_server_side_encryption_configuration"
    contains(resource.address, bucket_address)
}
