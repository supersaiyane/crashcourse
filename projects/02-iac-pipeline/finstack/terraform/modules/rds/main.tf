# -----------------------------------------------------------------------------
# RDS Module — FinStack PostgreSQL database
#
# Multi-AZ PostgreSQL instance in private subnets with encryption at rest,
# automated backups, and deletion protection. This is the transaction ledger
# and account balance store for the payment API.
# -----------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Subnet Group — RDS in private subnets only
# ---------------------------------------------------------------------------

resource "aws_db_subnet_group" "this" {
  name       = "${var.project}-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = merge(var.tags, {
    Name = "${var.project}-db-subnet-group"
  })
}

# ---------------------------------------------------------------------------
# Parameter Group — PostgreSQL 16 tuning
# ---------------------------------------------------------------------------

resource "aws_db_parameter_group" "this" {
  name   = "${var.project}-pg16-params"
  family = "postgres16"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_statement"
    value = "ddl"
  }

  tags = merge(var.tags, {
    Name = "${var.project}-pg16-params"
  })
}

# ---------------------------------------------------------------------------
# RDS Instance — PostgreSQL 16, encrypted, Multi-AZ
# ---------------------------------------------------------------------------

resource "aws_db_instance" "this" {
  identifier     = "${var.project}-postgres"
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.kms_key_arn

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password   # In production, use Vault dynamic creds (Stage 4)
  port     = 5432

  multi_az               = var.multi_az
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.db_sg_id]
  parameter_group_name   = aws_db_parameter_group.this.name

  backup_retention_period = var.backup_retention_days
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:30-sun:05:30"

  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = "${var.project}-postgres-final"
  deletion_protection       = var.deletion_protection

  performance_insights_enabled = true
  monitoring_interval          = 60

  tags = merge(var.tags, {
    Name = "${var.project}-postgres"
  })
}
