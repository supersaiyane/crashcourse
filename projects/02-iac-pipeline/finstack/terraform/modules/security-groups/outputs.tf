# -----------------------------------------------------------------------------
# Security Groups Module — Outputs
# -----------------------------------------------------------------------------

output "alb_sg_id" {
  description = "Security group ID for the ALB (public tier)"
  value       = aws_security_group.alb.id
}

output "cluster_sg_id" {
  description = "Security group ID for the EKS cluster control plane"
  value       = aws_security_group.eks_cluster.id
}

output "app_sg_id" {
  description = "Security group ID for EKS worker nodes / app pods"
  value       = aws_security_group.app.id
}

output "db_sg_id" {
  description = "Security group ID for RDS PostgreSQL"
  value       = aws_security_group.db.id
}
