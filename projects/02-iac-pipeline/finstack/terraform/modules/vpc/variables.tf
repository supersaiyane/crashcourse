# -----------------------------------------------------------------------------
# VPC Module — Input Variables
# -----------------------------------------------------------------------------

variable "project" {
  description = "Project name prefix for all resources (e.g. finstack)"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC (e.g. 10.0.0.0/16)"
  type        = string
  default     = "10.0.0.0/16"
}

variable "azs" {
  description = "List of availability zones to deploy into"
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b"]
}

variable "cluster_name" {
  description = "EKS cluster name — used for subnet tagging so the AWS LB controller can discover subnets"
  type        = string
}

variable "tags" {
  description = "Common tags applied to every resource in this module"
  type        = map(string)
  default     = {}
}
