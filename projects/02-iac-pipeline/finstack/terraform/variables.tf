# -----------------------------------------------------------------------------
# Root Module — Input Variables
#
# Values come from terraform.tfvars or CI/CD pipeline environment.
# Sensitive values (db_password) should come from Vault in production.
# -----------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# General
# ---------------------------------------------------------------------------

variable "project" {
  description = "Project name prefix — all resources are named finstack-*"
  type        = string
  default     = "finstack"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "owner" {
  description = "Team or individual owning this infrastructure"
  type        = string
  default     = "sre-team"
}

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "ap-south-1"
}

# ---------------------------------------------------------------------------
# VPC
# ---------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "azs" {
  description = "Availability zones for subnets"
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b"]
}

# ---------------------------------------------------------------------------
# EKS
# ---------------------------------------------------------------------------

variable "eks_cluster_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.29"
}

variable "eks_public_access" {
  description = "Enable public access to the EKS API endpoint (disable in production)"
  type        = bool
  default     = false
}

variable "eks_node_instance_types" {
  description = "Instance types for EKS worker nodes"
  type        = list(string)
  default     = ["t3.medium"]
}

variable "eks_node_desired_size" {
  description = "Desired number of EKS worker nodes"
  type        = number
  default     = 2
}

variable "eks_node_max_size" {
  description = "Maximum number of EKS worker nodes"
  type        = number
  default     = 4
}

variable "eks_node_min_size" {
  description = "Minimum number of EKS worker nodes"
  type        = number
  default     = 1
}

# ---------------------------------------------------------------------------
# RDS
# ---------------------------------------------------------------------------

variable "rds_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16.3"
}

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "rds_allocated_storage" {
  description = "Initial storage allocation in GB"
  type        = number
  default     = 20
}

variable "rds_db_name" {
  description = "Name of the default database"
  type        = string
  default     = "finstack"
}

variable "rds_db_username" {
  description = "Master username for RDS"
  type        = string
  default     = "finstack_admin"
}

variable "rds_db_password" {
  description = "Master password for RDS — use Vault dynamic creds in production"
  type        = string
  sensitive   = true
}

variable "rds_multi_az" {
  description = "Enable Multi-AZ for RDS"
  type        = bool
  default     = true
}

variable "rds_skip_final_snapshot" {
  description = "Skip final snapshot on RDS deletion (set false in production)"
  type        = bool
  default     = true
}

variable "rds_deletion_protection" {
  description = "Enable RDS deletion protection (set true in production)"
  type        = bool
  default     = false
}

# ---------------------------------------------------------------------------
# Application (IRSA)
# ---------------------------------------------------------------------------

variable "app_namespace" {
  description = "Kubernetes namespace for the payment-api"
  type        = string
  default     = "finstack"
}

variable "app_service_account" {
  description = "Kubernetes service account for IRSA"
  type        = string
  default     = "payment-api"
}
