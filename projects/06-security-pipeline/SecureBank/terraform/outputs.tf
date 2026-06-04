output "s3_bucket_name" {
  value = aws_s3_bucket.transaction_logs.id
}

output "db_endpoint" {
  value = aws_db_instance.transactions.endpoint
}

output "security_group_id" {
  value = aws_security_group.api.id
}
