# Exercise 2: Deploy on AWS EKS

**Goal:** Deploy CloudPlatform to your EKS cluster, verify all pods are running, and confirm the API responds.

## Step 1: Switch kubectl context to EKS

```bash
kubectl config use-context arn:aws:eks:ap-south-1:123456789:cluster/cloudplatform-eks
# Switched to context "arn:aws:eks:..."
```

## Step 2: Create the namespace

```bash
kubectl create namespace cloudplatform     # isolates CloudPlatform resources
# namespace/cloudplatform created
```

## Step 3: Apply all manifests

```bash
kubectl apply -f k8s/base/ -n cloudplatform
# configmap/cloudplatform-config created
# secret/cloudplatform-secrets created
# deployment.apps/analytics-api created
# service/analytics-api created
# deployment.apps/analytics-processor created
# deployment.apps/frontend created
# service/frontend created
```

## Step 4: Wait for pods to reach Running state

```bash
kubectl get pods -n cloudplatform -w       # -w = watch for changes
# Wait until all pods show 1/1 Running (Ctrl+C to stop watching)
```

Expected output:
- 2 analytics-api pods (Running, 1/1)
- 2 analytics-processor pods (Running, 1/1)
- 2 frontend pods (Running, 1/1)

## Step 5: Test the API via port-forward

```bash
kubectl port-forward svc/analytics-api 8080:80 -n cloudplatform &
curl http://localhost:8080/healthz
# {"status": "healthy", "cloud": "aws"}
```

## Step 6: Check resource allocation

```bash
kubectl describe pod -l app.kubernetes.io/component=api -n cloudplatform | grep -A 2 "Requests:"
#     Requests:
#       cpu:     100m
#       memory:  128Mi
```

## Verify

```bash
kubectl get pods -n cloudplatform --no-headers | wc -l
```

You should see: `6` (2 API + 2 processor + 2 frontend pods, all Running). The healthz endpoint returns a 200 status with `"status": "healthy"`.
