# Exercise 2: Write a Custom Policy

## Step 1: Write a Rego policy that denies containers running as root (UID 0)
## Step 2: Create a ConstraintTemplate from your policy
## Step 3: Apply it to the securebank namespace
## Step 4: Test with a deployment that has `runAsUser: 0` — should be rejected
## Step 5: Test with SecureBank deployment (runAsUser: 65534) — should pass

## Verify

Your custom policy should reject root containers and allow non-root.
