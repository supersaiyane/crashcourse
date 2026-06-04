# Exercise 2: Enforce Signed Images in Kubernetes

## Step 1: Install the Sigstore Policy Controller (or Kyverno)
## Step 2: Create a ClusterImagePolicy requiring signatures for your registry
## Step 3: Deploy SecureBank with a signed image — should succeed
## Step 4: Try deploying an unsigned image — should be rejected
## Step 5: Check the admission webhook logs for the rejection reason

## Verify

Unsigned images should be rejected with a clear error message about missing signatures.
