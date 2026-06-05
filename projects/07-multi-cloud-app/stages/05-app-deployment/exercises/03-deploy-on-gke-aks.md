# Exercise 3: Deploy on GKE and AKS

**Goal:** Deploy CloudPlatform to GCP GKE and Azure AKS using the same manifests, proving Kubernetes portability.

## Step 1: Deploy on GKE

```bash
# switch to the GKE cluster context
kubectl config use-context gke_myproject_asia-south1_cloudplatform-gke

# create namespace and apply — identical commands to EKS
kubectl create namespace cloudplatform
kubectl apply -f k8s/base/ -n cloudplatform

# wait for pods
kubectl get pods -n cloudplatform -w
```

Expected output:
- Same 6 pods as EKS, all Running 1/1

## Step 2: Test GKE API

```bash
kubectl port-forward svc/analytics-api 8081:80 -n cloudplatform &
curl http://localhost:8081/healthz
# {"status": "healthy", "cloud": "gcp"}
```

## Step 3: Deploy on AKS

```bash
# switch to the AKS cluster context
kubectl config use-context cloudplatform-aks

# create namespace and apply
kubectl create namespace cloudplatform
kubectl apply -f k8s/base/ -n cloudplatform

# wait for pods
kubectl get pods -n cloudplatform -w
```

## Step 4: Test AKS API

```bash
kubectl port-forward svc/analytics-api 8082:80 -n cloudplatform &
curl http://localhost:8082/healthz
# {"status": "healthy", "cloud": "azure"}
```

## Step 5: Compare pod status across all three clouds

```bash
for ctx in cloudplatform-eks gke_myproject_asia-south1_cloudplatform-gke cloudplatform-aks; do
  echo "=== $ctx ==="
  kubectl --context=$ctx get pods -n cloudplatform --no-headers | awk '{print $3}' | sort | uniq -c
  echo ""
done
# Each should show: 6 Running
```

## Verify

All three clusters show 6 pods in Running state. The healthz endpoint returns 200 on each cloud. The same `k8s/base/` directory was used for all three with no modifications.
