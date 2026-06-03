# -----------------------------------------------------------------------------
# RDS Module — Input Variables
# -----------------------------------------------------------------------------

variable "project" {
  description = "Project name prefix for all resources"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for the DB subnet group"
  type        = list(string)
}

variable "db_sg_id" {
  description = "Security group ID allowing access to the database"
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of the KMS key for storage encryption"
  type        = string
}

variable "engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16.3"
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "allocated_storage" {
  description = "Initial storage allocation in GB"
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Maximum storage for autoscaling in GB"
  type        = number
  default     = 100
}

variable "db_name" {
  description = "Name of the default database to create"
  type        = string
  default     = "finstack"
}

variable "db_username" {
  description = "Master username for the database"
  type        = string
  default     = "finstack_admin"
}

variable "db_password" {
  description = "Master password — use Vault dynamic creds in production (Stage 4)"
  type        = string
  sensitive   = true
}

variable "multi_az" {
  description = "Enable Multi-AZ deployment for high availability"
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "Number of days to retain automated backups"
  type        = number
  default     = 7
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot on deletion (set false in production)"
  type        = bool
  default     = true
}

variable "deletion_protection" {
  description = "Enable deletion protection (set true in production)"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Common tags applied to every resource in this module"
  type        = map(string)
  default     = {}
}
