# Exercise 1: Deploy Gatekeeper and Test

## Step 1: Install Gatekeeper on your cluster
## Step 2: Create the deny-latest-tag ConstraintTemplate and Constraint
## Step 3: Try deploying a pod with `nginx:latest` — verify it is rejected
## Step 4: Fix the tag to `nginx:1.27.0` — verify it is accepted
## Step 5: Apply all four SecureBank policies
## Step 6: Deploy SecureBank — verify all manifests pass

## Verify

```bash
kubectl get constraints
# All constraints should show 0 violations for securebank namespace
```
