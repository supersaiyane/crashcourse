# -----------------------------------------------------------------------------
# S3 Module — FinStack object storage
#
# Creates S3 buckets for application data (monthly statements) and audit logs.
# All buckets enforce: no public access, SSE-KMS encryption, versioning,
# and lifecycle rules for cost control.
# -----------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Statements Bucket — monthly payment statements
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "statements" {
  bucket = "${var.project}-statements-${var.environment}"

  tags = merge(var.tags, {
    Name = "${var.project}-statements"
  })
}

resource "aws_s3_bucket_versioning" "statements" {
  bucket = aws_s3_bucket.statements.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "statements" {
  bucket = aws_s3_bucket.statements.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "statements" {
  bucket = aws_s3_bucket.statements.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "statements" {
  bucket = aws_s3_bucket.statements.id

  rule {
    id     = "archive-old-statements"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 2555   # ~7 years — BFSI regulatory retention
    }
  }
}

# ---------------------------------------------------------------------------
# Audit Logs Bucket — infrastructure and application audit trails
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "audit_logs" {
  bucket = "${var.project}-audit-logs-${var.environment}"

  tags = merge(var.tags, {
    Name = "${var.project}-audit-logs"
  })
}

resource "aws_s3_bucket_versioning" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  rule {
    id     = "archive-old-audit-logs"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "GLACIER"
    }

    expiration {
      days = 2555   # ~7 years — BFSI regulatory retention
    }
  }
}
