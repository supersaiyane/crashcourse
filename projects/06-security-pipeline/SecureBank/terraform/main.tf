# SecureBank Infrastructure — contains intentional misconfigurations
# for Checkov/Trivy IaC scanning exercises.
# Students will find and fix these issues in Stage 02.

provider "aws" {
  region = var.region
}

resource "aws_s3_bucket" "transaction_logs" {
  bucket = "securebank-transaction-logs-${var.environment}"

  # INTENTIONAL MISCONFIGURATION: no versioning enabled
  # Checkov will flag: CKV_AWS_21 "Ensure S3 bucket has versioning enabled"

  # INTENTIONAL MISCONFIGURATION: no server-side encryption
  # Checkov will flag: CKV_AWS_19 "Ensure S3 bucket has server-side encryption"

  # INTENTIONAL MISCONFIGURATION: no public access block
  # Checkov will flag: CKV_AWS_53 "Ensure S3 bucket has block public access"

  tags = {
    Environment = var.environment
    Project     = "securebank"
  }
}

resource "aws_security_group" "api" {
  name        = "securebank-api-${var.environment}"
  description = "Security group for SecureBank API"
  vpc_id      = module.vpc.vpc_id

  # INTENTIONAL MISCONFIGURATION: allows all inbound traffic
  # Checkov will flag: CKV_AWS_24 "Ensure no security group allows ingress from 0.0.0.0/0 to port 22"
  ingress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "securebank-api-${var.environment}"
  }
}

resource "aws_db_instance" "transactions" {
  identifier     = "securebank-${var.environment}"
  engine         = "postgres"
  engine_version = "16.3"
  instance_class = "db.t3.medium"

  allocated_storage = 20
  db_name           = "securebank"
  username          = "admin"
  password          = "hardcoded-password-change-me"  # INTENTIONAL: hardcoded password

  # INTENTIONAL MISCONFIGURATION: no encryption at rest
  # Checkov will flag: CKV_AWS_16 "Ensure RDS instance has encryption at rest enabled"
  storage_encrypted = false

  # INTENTIONAL MISCONFIGURATION: publicly accessible
  # Checkov will flag: CKV_AWS_17 "Ensure RDS instance is not publicly accessible"
  publicly_accessible = true

  # INTENTIONAL MISCONFIGURATION: no multi-AZ
  multi_az = false

  skip_final_snapshot = true

  tags = {
    Environment = var.environment
    Project     = "securebank"
  }
}
