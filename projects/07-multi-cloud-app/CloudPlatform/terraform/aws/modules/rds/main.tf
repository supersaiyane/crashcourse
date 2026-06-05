# -----------------------------------------------------------------------------
# AWS RDS — PostgreSQL 15 (managed relational database)
# -----------------------------------------------------------------------------

variable "environment" {
  type = string
}

variable "db_name" {
  type = string
}

variable "db_password" {
  type      = string
  sensitive = true                                # never logged or shown in plan output
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "vpc_id" {
  type = string
}

# --- DB Subnet Group (places RDS in private subnets) ----------------------

resource "aws_db_subnet_group" "main" {
  name       = "${var.environment}-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "${var.environment}-db-subnet-group"
  }
}

# --- Security Group for RDS -----------------------------------------------

resource "aws_security_group" "rds" {
  name_prefix = "${var.environment}-rds-"
  vpc_id      = var.vpc_id
  description = "Allow PostgreSQL traffic from within the VPC"

  # Allow inbound PostgreSQL (5432) from the VPC CIDR
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]                 # VPC CIDR only
    description = "PostgreSQL from VPC"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.environment}-rds-sg"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# --- RDS Instance ---------------------------------------------------------

resource "aws_db_instance" "main" {
  identifier     = "${var.environment}-${var.db_name}"
  engine         = "postgres"
  engine_version = "15"                           # PostgreSQL 15
  instance_class = "db.t3.micro"                  # cost-effective for dev/staging

  allocated_storage     = 20                      # GB
  max_allocated_storage = 100                     # enable storage autoscaling up to 100 GB
  storage_type          = "gp3"                   # general purpose SSD

  db_name  = var.db_name
  username = "cloudplatform_admin"
  password = var.db_password                      # from variable, never hardcoded

  multi_az               = false                  # single AZ to reduce cost (enable in prod)
  publicly_accessible    = false                  # private subnets only
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = 7                     # 7-day automated backups
  skip_final_snapshot     = true                  # set false in prod

  tags = {
    Name = "${var.environment}-${var.db_name}"
  }
}

# --- Outputs --------------------------------------------------------------

output "endpoint" {
  value = aws_db_instance.main.endpoint
}

output "db_name" {
  value = aws_db_instance.main.db_name
}
