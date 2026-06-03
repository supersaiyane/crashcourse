# -----------------------------------------------------------------------------
# Security Groups Module — Input Variables
# -----------------------------------------------------------------------------

variable "project" {
  description = "Project name prefix for all resources"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where the security groups are created"
  type        = string
}

variable "tags" {
  description = "Common tags applied to every resource in this module"
  type        = map(string)
  default     = {}
}
