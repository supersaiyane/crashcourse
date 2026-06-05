# -----------------------------------------------------------------------------
# Input variables — GCP
# -----------------------------------------------------------------------------

variable "project_id" {
  description = "GCP project ID where resources will be created"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "cluster_name" {
  description = "Name of the GKE cluster"
  type        = string
  default     = "cloudplatform-gke"
}

variable "db_password" {
  description = "Password for the Cloud SQL admin user — pass via TF_VAR_db_password"
  type        = string
  sensitive   = true
}
