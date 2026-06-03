# -----------------------------------------------------------------------------
# IAM Module — FinStack identity and access
#
# Creates IAM roles for: EKS cluster control plane, EKS worker nodes,
# and an IRSA role for the payment-api pods (least-privilege access to
# S3 statements bucket and RDS via Vault).
# -----------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# EKS Cluster Role — allows EKS service to manage the cluster
# ---------------------------------------------------------------------------

resource "aws_iam_role" "eks_cluster" {
  name = "${var.project}-eks-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
    }]
  })

  tags = merge(var.tags, {
    Name = "${var.project}-eks-cluster-role"
  })
}

resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.eks_cluster.name
}

resource "aws_iam_role_policy_attachment" "eks_vpc_resource_controller" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"
  role       = aws_iam_role.eks_cluster.name
}

# ---------------------------------------------------------------------------
# EKS Node Role — allows EC2 instances to join the cluster
# ---------------------------------------------------------------------------

resource "aws_iam_role" "eks_node" {
  name = "${var.project}-eks-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })

  tags = merge(var.tags, {
    Name = "${var.project}-eks-node-role"
  })
}

resource "aws_iam_role_policy_attachment" "eks_worker_node_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.eks_node.name
}

resource "aws_iam_role_policy_attachment" "eks_cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.eks_node.name
}

resource "aws_iam_role_policy_attachment" "ecr_read_only" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.eks_node.name
}

# ---------------------------------------------------------------------------
# IRSA Role — payment-api pods get S3 access (least-privilege)
# ---------------------------------------------------------------------------

resource "aws_iam_role" "payment_api" {
  name = "${var.project}-payment-api-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Principal = {
        Federated = var.oidc_provider_arn
      }
      Condition = {
        StringEquals = {
          "${var.oidc_issuer_url}:sub" = "system:serviceaccount:${var.app_namespace}:${var.app_service_account}"
          "${var.oidc_issuer_url}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })

  tags = merge(var.tags, {
    Name = "${var.project}-payment-api-role"
  })
}

resource "aws_iam_policy" "payment_api_s3" {
  name        = "${var.project}-payment-api-s3-policy"
  description = "Allow payment-api to read/write statements and read audit logs"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "StatementsReadWrite"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          var.statements_bucket_arn,
          "${var.statements_bucket_arn}/*"
        ]
      },
      {
        Sid    = "AuditLogsWrite"
        Effect = "Allow"
        Action = [
          "s3:PutObject"
        ]
        Resource = [
          "${var.audit_logs_bucket_arn}/*"
        ]
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "payment_api_s3" {
  policy_arn = aws_iam_policy.payment_api_s3.arn
  role       = aws_iam_role.payment_api.name
}

# ---------------------------------------------------------------------------
# KMS Key — shared encryption key for EKS secrets, RDS, and S3
# ---------------------------------------------------------------------------

resource "aws_kms_key" "finstack" {
  description             = "${var.project} encryption key for EKS, RDS, and S3"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Name = "${var.project}-kms"
  })
}

resource "aws_kms_alias" "finstack" {
  name          = "alias/${var.project}-key"
  target_key_id = aws_kms_key.finstack.key_id
}
