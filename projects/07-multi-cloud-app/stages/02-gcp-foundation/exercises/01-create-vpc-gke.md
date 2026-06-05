# Exercise 1: Deploy GCP VPC and GKE Cluster

**Goal:** Create a custom-mode VPC with a regional subnet, secondary IP ranges for GKE, Cloud NAT, and a private GKE cluster. Verify kubectl access.

## Step 1: Initialise and plan

```bash
cd projects/07-multi-cloud-app/terraform/gcp
terraform init                                   # download google provider
terraform plan -out=gcp.tfplan                   # preview resources
```

Expected output:
- `Plan: 6 to add` (network, subnet, router, NAT, GKE cluster, node pool)

## Step 2: Apply the configuration

```bash
terraform apply gcp.tfplan                       # create VPC + GKE — takes 10-12 minutes
```

Expected output:
- `google_container_cluster.main: Creating...` (wait 10-12 minutes)
- `Apply complete! Resources: 6 added.`

## Step 3: Configure kubectl for GKE

```bash
gcloud container clusters get-credentials cloudplatform-gke \
  --region us-central1 \
  --project $(gcloud config get-value project)   # adds GKE context to kubeconfig
```

Expected output:
- `Fetching cluster endpoint and auth data.`
- `kubeconfig entry generated for cloudplatform-gke.`

## Step 4: Verify nodes and run a test pod

```bash
kubectl get nodes                                # expect 2+ nodes in Ready state
kubectl run cloudplatform-test --image=nginx:1.25-alpine --port=80
kubectl get pods -w                              # wait for Running
kubectl delete pod cloudplatform-test            # clean up
```

Expected output:
- Nodes with names like `gke-cloudplatform-gke-pool-...` in `Ready` state
- Test pod reaches `Running` then is deleted

## Verify

```bash
kubectl cluster-info                             # shows GKE control plane endpoint
gcloud container clusters describe cloudplatform-gke \
  --region us-central1 \
  --format="value(privateClusterConfig.enablePrivateNodes)"
```

You should see: cluster info with a private endpoint, and `True` for private nodes — confirming the cluster is private. Proceed to Exercise 2 for Cloud SQL.
