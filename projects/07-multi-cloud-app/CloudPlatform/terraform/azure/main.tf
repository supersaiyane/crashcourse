# -----------------------------------------------------------------------------
# Azure Infrastructure — CloudPlatform (Project 7)
# Resource Group, VNet, AKS, PostgreSQL Flexible Server, Storage Account.
# -----------------------------------------------------------------------------

terraform {
  required_version = ">= 1.5"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
}

locals {
  tags = {
    Project     = "cloudplatform"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# =============================================================================
# RESOURCE GROUP — logical container for all Azure resources
# =============================================================================

resource "azurerm_resource_group" "main" {
  name     = "rg-cloudplatform-${var.environment}"
  location = var.location
  tags     = local.tags
}

# =============================================================================
# NETWORKING — VNet + Subnets
# =============================================================================

resource "azurerm_virtual_network" "main" {
  name                = "${var.environment}-vnet"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  address_space       = ["10.1.0.0/16"]

  tags = local.tags
}

# Subnet for AKS nodes
resource "azurerm_subnet" "aks" {
  name                 = "${var.environment}-aks-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.1.0.0/20"]           # ~4k IPs for nodes + pods
}

# Subnet for PostgreSQL (delegated to flexible server)
resource "azurerm_subnet" "postgres" {
  name                 = "${var.environment}-postgres-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.1.16.0/24"]

  # Delegation required for PostgreSQL Flexible Server
  delegation {
    name = "postgres-delegation"
    service_delegation {
      name = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/join/action",
      ]
    }
  }
}

# Private DNS zone for PostgreSQL (required for VNet integration)
resource "azurerm_private_dns_zone" "postgres" {
  name                = "cloudplatform.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgres" {
  name                  = "${var.environment}-postgres-dns-link"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.postgres.name
  virtual_network_id    = azurerm_virtual_network.main.id
}

# =============================================================================
# COMPUTE — AKS Cluster
# =============================================================================

resource "azurerm_kubernetes_cluster" "main" {
  name                = var.cluster_name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  dns_prefix          = var.cluster_name
  kubernetes_version  = "1.29"                     # latest stable

  default_node_pool {
    name                = "default"
    node_count          = 2                        # 2 worker nodes
    vm_size             = "Standard_B2s"           # 2 vCPU, 4 GB — cost-effective
    vnet_subnet_id      = azurerm_subnet.aks.id
    enable_auto_scaling = false
  }

  # System-assigned managed identity (no service principal secrets needed)
  identity {
    type = "SystemAssigned"
  }

  # Azure CNI networking for VNet integration
  network_profile {
    network_plugin    = "azure"
    load_balancer_sku = "standard"
    service_cidr      = "10.2.0.0/16"             # internal service CIDR
    dns_service_ip    = "10.2.0.10"
  }

  tags = local.tags
}

# =============================================================================
# DATABASE — Azure Database for PostgreSQL Flexible Server
# =============================================================================

resource "azurerm_postgresql_flexible_server" "main" {
  name                = "${var.environment}-cloudplatform-db"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  version                = "15"                    # PostgreSQL 15
  sku_name               = "B_Standard_B1ms"       # Burstable, cost-effective for dev
  storage_mb             = 32768                    # 32 GB
  backup_retention_days  = 7
  geo_redundant_backup_enabled = false             # disable for cost (enable in prod)

  administrator_login    = "cloudplatform_admin"
  administrator_password = var.db_password          # from variable, never hardcoded

  # VNet integration — no public access
  delegated_subnet_id = azurerm_subnet.postgres.id
  private_dns_zone_id = azurerm_private_dns_zone.postgres.id

  zone = "1"                                       # single AZ for cost

  tags = local.tags

  depends_on = [
    azurerm_private_dns_zone_virtual_network_link.postgres,
  ]
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = "cloudplatform"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# =============================================================================
# OBJECT STORAGE — Storage Account + Blob Container
# =============================================================================

# Storage account names must be globally unique, 3-24 chars, lowercase alphanumeric only
resource "azurerm_storage_account" "main" {
  name                     = "cpanalytics${var.environment}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"                 # locally redundant (use GRS in prod)

  # Block public blob access
  allow_nested_items_to_be_public = false

  # Enable blob versioning
  blob_properties {
    versioning_enabled = true
  }

  tags = local.tags
}

resource "azurerm_storage_container" "analytics" {
  name                  = "analytics-data"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"                # no anonymous access
}
