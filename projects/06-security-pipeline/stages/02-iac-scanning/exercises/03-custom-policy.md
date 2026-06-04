# Exercise 3: Write a Custom Policy

**Goal:** Create a custom Checkov policy that enforces SecureBank-specific rules.

## Step 1: Create a custom check that requires all resources to have an "Owner" tag
## Step 2: Place it in `custom_checks/require_owner_tag.py`
## Step 3: Run: `checkov -d ./terraform --external-checks-dir ./custom_checks`
## Step 4: Verify your custom check appears in the output
## Step 5: Add the Owner tag to all resources and rescan

## Verify

Your custom check should show as PASSED for all resources.
