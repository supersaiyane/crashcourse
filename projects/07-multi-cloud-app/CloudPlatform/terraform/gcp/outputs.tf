# -----------------------------------------------------------------------------
# Outputs — GCP
# -----------------------------------------------------------------------------

output "vpc_name" {
  description = "Name of the VPC network"
  value       = google_compute_network.main.name
}

output "gke_endpoint" {
  description = "Endpoint of the GKE cluster API server"
  value       = google_container_cluster.main.endpoint
}

output "cloudsql_connection" {
  description = "Cloud SQL instance connection name (project:region:instance)"
  value       = google_sql_database_instance.main.connection_name
}

output "gcs_bucket" {
  description = "Name of the GCS analytics bucket"
  value       = google_storage_bucket.analytics.name
}
