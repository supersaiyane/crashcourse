# -----------------------------------------------------------------------------
# IAM Module — Outputs
# -----------------------------------------------------------------------------

output "eks_cluster_role_arn" {
  description = "ARN of the EKS cluster IAM role"
  value       = aws_iam_role.eks_cluster.arn
}

output "eks_node_role_arn" {
  description = "ARN of the EKS worker node IAM role"
  value       = aws_iam_role.eks_node.arn
}

output "payment_api_role_arn" {
  description = "ARN of the IRSA role for payment-api pods"
  value       = aws_iam_role.payment_api.arn
}

output "kms_key_arn" {
  description = "ARN of the shared KMS encryption key"
  value       = aws_kms_key.finstack.arn
}

output "kms_key_id" {
  description = "ID of the shared KMS encryption key"
  value       = aws_kms_key.finstack.key_id
}
