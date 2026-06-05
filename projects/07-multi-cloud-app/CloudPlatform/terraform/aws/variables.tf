# -----------------------------------------------------------------------------
# Input variables — AWS
# -----------------------------------------------------------------------------

variable "region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "cloudplatform-eks"
}

variable "db_name" {
  description = "Name of the PostgreSQL database"
  type        = string
  default     = "cloudplatform"
}

variable "db_password" {
  description = "Master password for the RDS instance — pass via TF_VAR_db_password"
  type        = string
  sensitive   = true
}

variable "instance_type" {
  description = "EC2 instance type for EKS worker nodes"
  type        = string
  default     = "t3.medium"
}
