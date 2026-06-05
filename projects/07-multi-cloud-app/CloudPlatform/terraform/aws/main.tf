# -----------------------------------------------------------------------------
# AWS Infrastructure — CloudPlatform (Project 7)
# Provisions VPC, EKS, RDS (PostgreSQL), and S3 for the multi-cloud app.
# -----------------------------------------------------------------------------

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "cloudplatform"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# --- Networking -----------------------------------------------------------

module "vpc" {
  source = "./modules/vpc"

  environment  = var.environment
  cluster_name = var.cluster_name
}

# --- Compute (Kubernetes) ------------------------------------------------

module "eks" {
  source = "./modules/eks"

  environment   = var.environment
  cluster_name  = var.cluster_name
  instance_type = var.instance_type

  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
}

# --- Database -------------------------------------------------------------

module "rds" {
  source = "./modules/rds"

  environment        = var.environment
  db_name            = var.db_name
  db_password        = var.db_password          # passed via TF_VAR or -var, never hardcoded
  private_subnet_ids = module.vpc.private_subnet_ids
  vpc_id             = module.vpc.vpc_id
}

# --- Object Storage -------------------------------------------------------

module "s3" {
  source = "./modules/s3"

  environment = var.environment
}
