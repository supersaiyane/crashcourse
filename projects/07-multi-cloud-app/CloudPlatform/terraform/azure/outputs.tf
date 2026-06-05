# -----------------------------------------------------------------------------
# Outputs — Azure
# -----------------------------------------------------------------------------

output "vnet_id" {
  description = "ID of the Azure Virtual Network"
  value       = azurerm_virtual_network.main.id
}

output "aks_fqdn" {
  description = "FQDN of the AKS cluster API server"
  value       = azurerm_kubernetes_cluster.main.fqdn
}

output "postgres_fqdn" {
  description = "FQDN of the PostgreSQL Flexible Server"
  value       = azurerm_postgresql_flexible_server.main.fqdn
}

output "storage_account" {
  description = "Name of the Azure Storage Account"
  value       = azurerm_storage_account.main.name
}
