variable "environment" { type = string }
variable "vpc_id" { type = string }

# EKS cluster placeholder — students will configure this properly
resource "aws_eks_cluster" "main" {
  name     = "securebank-${var.environment}"
  role_arn = "arn:aws:iam::role/eks-cluster-role"

  vpc_config {
    # INTENTIONAL: endpoint should not be public in production
    endpoint_public_access = true
    subnet_ids             = []
  }
}
