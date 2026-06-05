# -----------------------------------------------------------------------------
# AWS S3 — Analytics data bucket with encryption and versioning
# -----------------------------------------------------------------------------

variable "environment" {
  type = string
}

locals {
  bucket_name = "cloudplatform-analytics-${var.environment}-${random_id.suffix.hex}"
}

# Random suffix to ensure globally unique bucket name
resource "random_id" "suffix" {
  byte_length = 4
}

# --- S3 Bucket ------------------------------------------------------------

resource "aws_s3_bucket" "analytics" {
  bucket = local.bucket_name

  tags = {
    Name = local.bucket_name
  }
}

# --- Versioning (keep history of all objects) ------------------------------

resource "aws_s3_bucket_versioning" "analytics" {
  bucket = aws_s3_bucket.analytics.id

  versioning_configuration {
    status = "Enabled"
  }
}

# --- Server-Side Encryption (AES-256 by default) --------------------------

resource "aws_s3_bucket_server_side_encryption_configuration" "analytics" {
  bucket = aws_s3_bucket.analytics.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"                   # KMS-managed encryption
    }
    bucket_key_enabled = true                     # reduce KMS API costs
  }
}

# --- Block All Public Access ----------------------------------------------

resource "aws_s3_bucket_public_access_block" "analytics" {
  bucket = aws_s3_bucket.analytics.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- Outputs --------------------------------------------------------------

output "bucket_name" {
  value = aws_s3_bucket.analytics.id
}

output "bucket_arn" {
  value = aws_s3_bucket.analytics.arn
}
