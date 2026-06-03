# -----------------------------------------------------------------------------
# Providers & Backend — AWS provider + S3 remote state
#
# For local development with LocalStack, override the endpoint:
#   export AWS_ENDPOINT_URL=http://localhost:4566
#   terraform init -backend=false
#
# For real AWS, configure the S3 backend bucket and DynamoDB table first.
# Never store state locally in production — it will drift and you will lose it.
# -----------------------------------------------------------------------------

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # -------------------------------------------------------------------------
  # S3 Backend — uncomment when deploying to real AWS
  #
  # Create the bucket and DynamoDB table first:
  #   aws s3api create-bucket --bucket finstack-tfstate-ap-south-1 \
  #     --region ap-south-1 --create-bucket-configuration LocationConstraint=ap-south-1
  #   aws dynamodb create-table --table-name finstack-tfstate-lock \
  #     --attribute-definitions AttributeName=LockID,AttributeType=S \
  #     --key-schema AttributeName=LockID,KeyType=HASH \
  #     --billing-mode PAY_PER_REQUEST --region ap-south-1
  # -------------------------------------------------------------------------
  # backend "s3" {
  #   bucket         = "finstack-tfstate-ap-south-1"
  #   key            = "finstack/terraform.tfstate"
  #   region         = "ap-south-1"
  #   dynamodb_table = "finstack-tfstate-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "finstack"
      ManagedBy = "terraform"
    }
  }
}
