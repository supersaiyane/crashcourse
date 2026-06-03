# -----------------------------------------------------------------------------
# S3 Module — Input Variables
# -----------------------------------------------------------------------------

variable "project" {
  description = "Project name prefix for all resources"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod) — used in bucket names for uniqueness"
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of the KMS key for SSE-KMS encryption"
  type        = string
}

variable "tags" {
  description = "Common tags applied to every resource in this module"
  type        = map(string)
  default     = {}
}
