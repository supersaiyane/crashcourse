# -----------------------------------------------------------------------------
# AWS VPC — 3 public + 3 private subnets across 3 AZs
# CIDR: 10.0.0.0/16
# -----------------------------------------------------------------------------

variable "environment" {
  type = string
}

variable "cluster_name" {
  type = string
}

# Fetch available AZs in the current region
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 3)
}

# --- VPC ------------------------------------------------------------------

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true                   # required for EKS
  enable_dns_hostnames = true                   # required for RDS endpoints

  tags = {
    Name = "${var.environment}-vpc"
  }
}

# --- Internet Gateway (public subnet egress) ------------------------------

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.environment}-igw"
  }
}

# --- Public Subnets (one per AZ) ------------------------------------------

resource "aws_subnet" "public" {
  count = 3

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet("10.0.0.0/16", 8, count.index)        # 10.0.0.0/24, 10.0.1.0/24, 10.0.2.0/24
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true                                              # instances get public IPs

  tags = {
    Name                                        = "${var.environment}-public-${local.azs[count.index]}"
    "kubernetes.io/role/elb"                     = "1"                         # tag for AWS LB controller
    "kubernetes.io/cluster/${var.cluster_name}"  = "shared"
  }
}

# --- Private Subnets (one per AZ) -----------------------------------------

resource "aws_subnet" "private" {
  count = 3

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet("10.0.0.0/16", 8, count.index + 10)         # 10.0.10.0/24, 10.0.11.0/24, 10.0.12.0/24
  availability_zone = local.azs[count.index]

  tags = {
    Name                                        = "${var.environment}-private-${local.azs[count.index]}"
    "kubernetes.io/role/internal-elb"            = "1"
    "kubernetes.io/cluster/${var.cluster_name}"  = "shared"
  }
}

# --- NAT Gateway (single, for cost — prod should use one per AZ) ----------

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "${var.environment}-nat-eip"
  }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id       # place NAT in the first public subnet

  tags = {
    Name = "${var.environment}-nat"
  }

  depends_on = [aws_internet_gateway.main]
}

# --- Route Tables ---------------------------------------------------------

# Public route table — traffic to 0.0.0.0/0 goes through the IGW
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.environment}-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  count          = 3
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private route table — traffic to 0.0.0.0/0 goes through the NAT gateway
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = {
    Name = "${var.environment}-private-rt"
  }
}

resource "aws_route_table_association" "private" {
  count          = 3
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# --- Outputs --------------------------------------------------------------

output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}
