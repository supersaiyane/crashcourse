# -----------------------------------------------------------------------------
# Security Groups Module — FinStack network access control
#
# Three-tier security group design:
#   ALB (public)  →  EKS/App (private)  →  RDS (private)
#
# Each tier only allows traffic from the tier above. The database tier
# is never reachable from the internet.
# -----------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# ALB Security Group — public-facing load balancer
# ---------------------------------------------------------------------------

resource "aws_security_group" "alb" {
  name        = "${var.project}-alb-sg"
  description = "Allow HTTPS inbound to the ALB"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP for redirect"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.project}-alb-sg"
    Tier = "public"
  })
}

# ---------------------------------------------------------------------------
# EKS Cluster Security Group — control plane + worker communication
# ---------------------------------------------------------------------------

resource "aws_security_group" "eks_cluster" {
  name        = "${var.project}-eks-cluster-sg"
  description = "EKS cluster control plane security group"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Allow workers to communicate with the cluster API"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.project}-eks-cluster-sg"
    Tier = "private"
  })
}

# ---------------------------------------------------------------------------
# App Security Group — EKS worker nodes / payment-api pods
# ---------------------------------------------------------------------------

resource "aws_security_group" "app" {
  name        = "${var.project}-app-sg"
  description = "Allow traffic from ALB to application pods"
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTP from ALB"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description = "Allow node-to-node communication within the cluster"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.project}-app-sg"
    Tier = "private"
  })
}

# ---------------------------------------------------------------------------
# Database Security Group — RDS PostgreSQL
# ---------------------------------------------------------------------------

resource "aws_security_group" "db" {
  name        = "${var.project}-db-sg"
  description = "Allow PostgreSQL access only from the app tier"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from app tier"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.project}-db-sg"
    Tier = "private"
  })
}
