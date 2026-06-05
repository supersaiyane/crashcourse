# Exercise 1: Deploy Azure VNet and AKS Cluster

**Goal:** Create an Azure Resource Group, VNet with AKS and database subnets, and an AKS cluster with managed identity. Verify kubectl access and confirm all three cloud clusters are in your kubeconfig.

## Step 1: Initialise and plan

```bash
cd projects/07-multi-cloud-app/terraform/azure
terraform init                                   # download azurerm provider
terraform plan -out=azure.tfplan                 # preview resources
```

Expected output:
- `Plan: 5 to add` (Resource Group, VNet, 2 subnets, AKS cluster)

## Step 2: Apply the configuration

```bash
terraform apply azure.tfplan                     # create resources — AKS takes 5-8 minutes
```

Expected output:
- `azurerm_kubernetes_cluster.main: Creating...`
- `Apply complete! Resources: 5 added.`

## Step 3: Configure kubectl for AKS

```bash
az aks get-credentials \
  --resource-group cloudplatform-rg \
  --name cloudplatform-aks                       # merges AKS context into kubeconfig
```

Expected output:
- `Merged "cloudplatform-aks" as current context in ~/.kube/config`

## Step 4: Verify nodes and run a test pod

```bash
kubectl get nodes                                # expect 2 nodes in Ready state
kubectl run cloudplatform-test --image=nginx:1.25-alpine --port=80
kubectl get pods -w                              # wait for Running
kubectl delete pod cloudplatform-test            # clean up
```

Expected output:
- 2 nodes with names like `aks-default-...-vmss000000` in `Ready` state
- Test pod reaches `Running` then is deleted

## Step 5: Verify all three clusters in kubeconfig

```bash
kubectl config get-contexts                      # should show EKS, GKE, and AKS
```

Expected output:
- Three contexts listed: `cloudplatform-eks`, `cloudplatform-gke`, `cloudplatform-aks`

## Verify

```bash
kubectl cluster-info                             # shows AKS API server endpoint
az aks show --resource-group cloudplatform-rg --name cloudplatform-aks \
  --query "identity.type" --output tsv
```

You should see: cluster info and `SystemAssigned` — confirming managed identity (no service principal secrets). Proceed to Exercise 2 for PostgreSQL.
