# -----------------------------------------------------------------------------
# S3 Module — Outputs
# -----------------------------------------------------------------------------

output "statements_bucket_id" {
  description = "ID of the statements S3 bucket"
  value       = aws_s3_bucket.statements.id
}

output "statements_bucket_arn" {
  description = "ARN of the statements S3 bucket"
  value       = aws_s3_bucket.statements.arn
}

output "audit_logs_bucket_id" {
  description = "ID of the audit logs S3 bucket"
  value       = aws_s3_bucket.audit_logs.id
}

output "audit_logs_bucket_arn" {
  description = "ARN of the audit logs S3 bucket"
  value       = aws_s3_bucket.audit_logs.arn
}
