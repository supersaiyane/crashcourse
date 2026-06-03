# Exercise 2: Modules — Refactor into Reusable Components

**Goal:** Refactor the flat Terraform configuration from Exercise 1 into four reusable modules (VPC, RDS, S3, IAM), wire them together with input/output references, and verify everything still works.

**Time:** 45 minutes

---

## Step 1: Create the Module Directory Structure

```bash
cd finstack/terraform
mkdir -p modules/vpc modules/rds modules/s3 modules/iam
```

Your target structure:

```
terraform/
├── modules/
│   ├── vpc/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── rds/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── s3/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── iam/
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
└── environments/
    ├── main.tf          ← calls all modules
    ├── variables.tf
    ├── outputs.tf
    └── providers.tf
```

---

## Step 2: Write the VPC Module

`modules/vpc/variables.tf`:

```hcl
variable "project" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "azs" {
  description = "Availability zones"
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b"]
}

variable "common_tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default     = {}
}
```

`modules/vpc/main.tf`:

```hcl
resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(var.common_tags, {
    Name = "${var.project}-vpc"
  })
}

resource "aws_subnet" "public" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone = var.azs[count.index]

  map_public_ip_on_launch = true

  tags = merge(var.common_tags, {
    Name = "${var.project}-public-${count.index}"
    Tier = "public"
  })
}

resource "aws_subnet" "private" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 100)
  availability_zone = var.azs[count.index]

  tags = merge(var.common_tags, {
    Name = "${var.project}-private-${count.index}"
    Tier = "private"
  })
}
```

`modules/vpc/outputs.tf`:

```hcl
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = aws_subnet.private[*].id
}

output "vpc_cidr" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.this.cidr_block
}
```

---

## Step 3: Write the S3 Module

`modules/s3/variables.tf`:

```hcl
variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "common_tags" {
  type    = map(string)
  default = {}
}
```

`modules/s3/main.tf`:

```hcl
resource "aws_s3_bucket" "this" {
  bucket = "${var.project}-${var.environment}-statements"
  tags   = merge(var.common_tags, { Name = "${var.project}-statements" })
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
```

`modules/s3/outputs.tf`:

```hcl
output "bucket_name" {
  description = "Name of the S3 bucket"
  value       = aws_s3_bucket.this.id
}

output "bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = aws_s3_bucket.this.arn
}
```

---

## Step 4: Write the RDS Module

`modules/rds/variables.tf`:

```hcl
variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "vpc_id" {
  description = "VPC ID for the DB subnet group"
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs for DB placement"
  type        = list(string)
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "finstack"
}

variable "db_username" {
  description = "Master username"
  type        = string
  default     = "finstack_admin"
}

variable "db_password" {
  description = "Master password"
  type        = string
  sensitive   = true
}

variable "common_tags" {
  type    = map(string)
  default = {}
}
```

`modules/rds/main.tf`:

```hcl
resource "aws_db_subnet_group" "this" {
  name       = "${var.project}-${var.environment}-db-subnets"
  subnet_ids = var.subnet_ids

  tags = merge(var.common_tags, {
    Name = "${var.project}-db-subnets"
  })
}

resource "aws_security_group" "rds" {
  name_prefix = "${var.project}-rds-"
  vpc_id      = var.vpc_id
  description = "Allow PostgreSQL from within the VPC"

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]      # VPC CIDR only
    description = "PostgreSQL from VPC"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.common_tags
}

resource "aws_db_instance" "this" {
  identifier     = "${var.project}-${var.environment}-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t3.micro"

  allocated_storage = 20
  storage_encrypted = true             # Encrypted at rest — BFSI requirement

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password           # In production, use Vault (Stage 4)

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  skip_final_snapshot = true           # Dev only — never skip in production

  tags = merge(var.common_tags, {
    Name = "${var.project}-db"
  })
}
```

`modules/rds/outputs.tf`:

```hcl
output "endpoint" {
  description = "RDS endpoint"
  value       = aws_db_instance.this.endpoint
}

output "port" {
  description = "RDS port"
  value       = aws_db_instance.this.port
}

output "db_name" {
  description = "Database name"
  value       = aws_db_instance.this.db_name
}
```

---

## Step 5: Write the IAM Module

`modules/iam/variables.tf`:

```hcl
variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "s3_bucket_arn" {
  description = "ARN of the S3 bucket the app role can access"
  type        = string
}

variable "common_tags" {
  type    = map(string)
  default = {}
}
```

`modules/iam/main.tf`:

```hcl
# App role — used by FinStack pods via IRSA
resource "aws_iam_role" "app" {
  name = "${var.project}-${var.environment}-app-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"   # EKS IRSA in production
      }
    }]
  })

  tags = var.common_tags
}

# S3 access policy — least privilege
resource "aws_iam_role_policy" "app_s3" {
  name = "${var.project}-s3-access"
  role = aws_iam_role.app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ]
      Resource = [
        var.s3_bucket_arn,
        "${var.s3_bucket_arn}/*"
      ]
    }]
  })
}
```

`modules/iam/outputs.tf`:

```hcl
output "app_role_arn" {
  description = "ARN of the app IAM role"
  value       = aws_iam_role.app.arn
}

output "app_role_name" {
  description = "Name of the app IAM role"
  value       = aws_iam_role.app.name
}
```

---

## Step 6: Rewrite the Root Configuration

Replace `environments/main.tf` with module calls:

```hcl
# environments/main.tf — compose FinStack from modules
locals {
  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

module "vpc" {
  source      = "../modules/vpc"
  project     = var.project
  environment = var.environment
  vpc_cidr    = var.vpc_cidr
  common_tags = local.common_tags
}

module "s3" {
  source      = "../modules/s3"
  project     = var.project
  environment = var.environment
  common_tags = local.common_tags
}

module "rds" {
  source      = "../modules/rds"
  project     = var.project
  environment = var.environment
  vpc_id      = module.vpc.vpc_id
  subnet_ids  = module.vpc.private_subnet_ids
  db_password = var.db_password
  common_tags = local.common_tags
}

module "iam" {
  source        = "../modules/iam"
  project       = var.project
  environment   = var.environment
  s3_bucket_arn = module.s3.bucket_arn
  common_tags   = local.common_tags
}
```

Add `db_password` to `variables.tf`:

```hcl
variable "db_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
  default     = "localstack-dev-only"   # Never do this in production
}
```

Update `outputs.tf`:

```hcl
output "vpc_id" {
  value = module.vpc.vpc_id
}

output "bucket_name" {
  value = module.s3.bucket_name
}

output "rds_endpoint" {
  value     = module.rds.endpoint
  sensitive = true
}

output "app_role_arn" {
  value = module.iam.app_role_arn
}
```

---

## Step 7: Apply and Verify

```bash
cd finstack/terraform/environments
terraform init -upgrade       # Re-initialise to pick up modules
terraform plan                # Should show all resources under module namespaces
terraform apply               # Type yes
```

Verify module namespacing:

```bash
terraform state list
```

Expected (resources now live under modules):

```
module.iam.aws_iam_role.app
module.iam.aws_iam_role_policy.app_s3
module.rds.aws_db_instance.this
module.rds.aws_db_subnet_group.this
module.rds.aws_security_group.rds
module.s3.aws_s3_bucket.this
module.s3.aws_s3_bucket_public_access_block.this
module.s3.aws_s3_bucket_server_side_encryption_configuration.this
module.vpc.aws_subnet.private[0]
module.vpc.aws_subnet.private[1]
module.vpc.aws_subnet.public[0]
module.vpc.aws_subnet.public[1]
module.vpc.aws_vpc.this
```

---

## You're Done When

- [x] `terraform state list` shows resources namespaced under `module.vpc`, `module.rds`, etc.
- [x] Changing a module variable (e.g., VPC CIDR) only requires editing `variables.tf` or `tfvars`
- [x] Module outputs flow into other module inputs (VPC ID into RDS, S3 ARN into IAM)
- [x] You can explain why modules make multi-environment deployments possible
- [x] `terraform plan` shows 0 changes after a successful apply

## Common Mistakes

- **Forgetting `terraform init -upgrade`** after adding modules — Terraform won't find them
- **Circular dependencies** — module A outputs something module B needs, and module B outputs something A needs; restructure to break the cycle
- **Hardcoding values in modules** — defeats the purpose; everything should be a variable
- **Not exposing outputs** — if module B needs module A's VPC ID, module A must export it
