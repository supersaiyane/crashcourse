# -----------------------------------------------------------------------------
# Input variables — Azure
# -----------------------------------------------------------------------------

variable "location" {
  description = "Azure region for all resources"
  type        = string
  default     = "eastus"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "cluster_name" {
  description = "Name of the AKS cluster"
  type        = string
  default     = "cloudplatform-aks"
}

variable "db_password" {
  description = "Admin password for PostgreSQL Flexible Server — pass via TF_VAR_db_password"
  type        = string
  sensitive   = true
}
