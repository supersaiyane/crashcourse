# -----------------------------------------------------------------------------
# Root Module — Outputs
#
# These values are used by downstream stages (Terragrunt, Ansible, CI/CD)
# and are visible via `terraform output`.
# -----------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# VPC
# ---------------------------------------------------------------------------

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

# ---------------------------------------------------------------------------
# EKS
# ---------------------------------------------------------------------------

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "EKS cluster API endpoint"
  value       = module.eks.cluster_endpoint
}

output "eks_cluster_ca_certificate" {
  description = "Base64-encoded CA certificate for the EKS cluster"
  value       = module.eks.cluster_ca_certificate
  sensitive   = true
}

# ---------------------------------------------------------------------------
# RDS
# ---------------------------------------------------------------------------

output "rds_endpoint" {
  description = "RDS connection endpoint (host:port)"
  value       = module.rds.db_endpoint
}

output "rds_address" {
  description = "RDS hostname"
  value       = module.rds.db_address
}

output "rds_db_name" {
  description = "Name of the default database"
  value       = module.rds.db_name
}

# ---------------------------------------------------------------------------
# S3
# ---------------------------------------------------------------------------

output "statements_bucket_id" {
  description = "Statements S3 bucket name"
  value       = module.s3.statements_bucket_id
}

output "audit_logs_bucket_id" {
  description = "Audit logs S3 bucket name"
  value       = module.s3.audit_logs_bucket_id
}

# ---------------------------------------------------------------------------
# IAM
# ---------------------------------------------------------------------------

output "payment_api_role_arn" {
  description = "IRSA role ARN for the payment-api pods"
  value       = module.iam.payment_api_role_arn
}

output "kms_key_arn" {
  description = "KMS key ARN used for encryption"
  value       = module.iam.kms_key_arn
}

# ---------------------------------------------------------------------------
# Security Groups
# ---------------------------------------------------------------------------

output "alb_sg_id" {
  description = "ALB security group ID"
  value       = module.security_groups.alb_sg_id
}

output "app_sg_id" {
  description = "App tier security group ID"
  value       = module.security_groups.app_sg_id
}

output "db_sg_id" {
  description = "Database tier security group ID"
  value       = module.security_groups.db_sg_id
}
