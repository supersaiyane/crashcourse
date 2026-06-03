# -----------------------------------------------------------------------------
# Packer Variables — FinStack Golden AMI
#
# Input variables for the base AMI build. Override at build time:
#   packer build -var 'aws_region=ap-south-1' -var 'environment=staging' .
# -----------------------------------------------------------------------------

variable "aws_region" {
  description = "AWS region to build the AMI in"
  type        = string
  default     = "ap-south-1"
}

variable "instance_type" {
  description = "EC2 instance type for the Packer builder"
  type        = string
  default     = "t3.micro"
}

variable "ami_name_prefix" {
  description = "Prefix for the output AMI name"
  type        = string
  default     = "finstack-base"
}

variable "environment" {
  description = "Target environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "vpc_id" {
  description = "VPC ID to launch the builder instance in (empty = default VPC)"
  type        = string
  default     = ""
}

variable "subnet_id" {
  description = "Subnet ID for the builder instance (empty = auto-select)"
  type        = string
  default     = ""
}

variable "node_exporter_version" {
  description = "Prometheus node_exporter version to install"
  type        = string
  default     = "1.7.0"
}

variable "tags" {
  description = "Tags applied to the builder instance and output AMI"
  type        = map(string)
  default = {
    Project    = "finstack"
    ManagedBy  = "packer"
    CostCentre = "payments-platform"
    Compliance = "rbi-pci-dss"
  }
}
