# -----------------------------------------------------------------------------
# IAM Module — Input Variables
# -----------------------------------------------------------------------------

variable "project" {
  description = "Project name prefix for all resources"
  type        = string
}

variable "oidc_provider_arn" {
  description = "ARN of the EKS OIDC provider for IRSA trust"
  type        = string
}

variable "oidc_issuer_url" {
  description = "OIDC issuer URL (without https://) for IRSA condition keys"
  type        = string
}

variable "app_namespace" {
  description = "Kubernetes namespace where payment-api runs"
  type        = string
  default     = "finstack"
}

variable "app_service_account" {
  description = "Kubernetes service account name for the payment-api pods"
  type        = string
  default     = "payment-api"
}

variable "statements_bucket_arn" {
  description = "ARN of the S3 statements bucket (for IRSA policy)"
  type        = string
}

variable "audit_logs_bucket_arn" {
  description = "ARN of the S3 audit logs bucket (for IRSA policy)"
  type        = string
}

variable "tags" {
  description = "Common tags applied to every resource in this module"
  type        = map(string)
  default     = {}
}
