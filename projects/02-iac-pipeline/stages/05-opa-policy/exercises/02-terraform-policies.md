# Exercise 2: Terraform Policies — Full Suite Against FinStack

**Goal:** Add require_tags and restrict_instance_types policies, run all three against the FinStack Terraform plan with conftest, fix any violations, and re-run until everything passes.

**Time:** 45 minutes

---

## Step 1: Add the Tags Policy

Create `policy/tags.rego`:

```rego
# policy/tags.rego — require mandatory tags on all created resources
package main

required_tags := {"Project", "Environment", "ManagedBy"}

deny[msg] {
    resource := input.resource_changes[_]
    resource.change.actions[_] == "create"              # only check new resources
    tags := resource.change.after.tags                   # get planned tags
    tags != null                                         # resource supports tags
    tag := required_tags[_]                              # iterate required tags
    not tags[tag]                                        # tag is missing
    msg := sprintf("Resource '%s' missing required tag: %s", [resource.address, tag])
}
```

Create `policy/tags_test.rego`:

```rego
# policy/tags_test.rego — unit tests for tags policy
package main

test_deny_missing_tags {
    result := deny with input as {"resource_changes": [{
        "address": "aws_instance.app",
        "type": "aws_instance",
        "change": {"actions": ["create"], "after": {"tags": {"Project": "finstack"}}}
    }]}
    count(result) > 0    # missing Environment and ManagedBy
}

test_allow_all_tags_present {
    result := deny with input as {"resource_changes": [{
        "address": "aws_instance.app",
        "type": "aws_instance",
        "change": {"actions": ["create"], "after": {"tags": {"Project": "x", "Environment": "dev", "ManagedBy": "terraform"}}}
    }]}
    count(result) == 0
}
```

---

## Step 2: Add the Instance Types Policy

Create `policy/instances.rego`:

```rego
# policy/instances.rego — restrict EC2 instance types to approved list
package main

allowed_instance_types := {"t3.micro", "t3.small", "t3.medium", "m5.large"}

deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_instance"
    resource.change.actions[_] == "create"
    instance_type := resource.change.after.instance_type
    not allowed_instance_types[instance_type]
    msg := sprintf("Instance type '%s' not in approved list for '%s' — allowed: t3.micro, t3.small, t3.medium, m5.large", [instance_type, resource.address])
}
```

Create `policy/instances_test.rego`:

```rego
# policy/instances_test.rego — unit tests for instance types policy
package main

test_deny_unapproved_instance_type {
    result := deny with input as {"resource_changes": [{
        "address": "aws_instance.big",
        "type": "aws_instance",
        "change": {
            "actions": ["create"],
            "after": {
                "instance_type": "m5.24xlarge",
                "tags": {"Project": "x", "Environment": "dev", "ManagedBy": "terraform"}
            }
        }
    }]}
    count(result) > 0
}

test_allow_approved_instance_type {
    result := deny with input as {"resource_changes": [{
        "address": "aws_instance.app",
        "type": "aws_instance",
        "change": {
            "actions": ["create"],
            "after": {
                "instance_type": "t3.micro",
                "tags": {"Project": "x", "Environment": "dev", "ManagedBy": "terraform"}
            }
        }
    }]}
    count(result) == 0
}
```

---

## Step 3: Run All Tests

```bash
opa test policy/ -v
```

Expected output — all 7 tests pass (3 from s3 + 2 from tags + 2 from instances):

```
policy/s3_test.rego:
  data.main.test_deny_public_read_s3: PASS (1.1ms)
  data.main.test_deny_public_read_write_s3: PASS (0.9ms)
  data.main.test_allow_private_s3: PASS (0.7ms)
policy/tags_test.rego:
  data.main.test_deny_missing_tags: PASS (0.8ms)
  data.main.test_allow_all_tags_present: PASS (0.6ms)
policy/instances_test.rego:
  data.main.test_deny_unapproved_instance_type: PASS (0.7ms)
  data.main.test_allow_approved_instance_type: PASS (0.5ms)

PASS: 7/7
```

---

## Step 4: Run Conftest Against the FinStack Plan

```bash
cd finstack/terraform/environments
terraform plan -out=plan.out
terraform show -json plan.out > plan.json
conftest test plan.json --policy ../../../policy/
```

If violations appear, fix them in your `.tf` files (add missing tags, change instance types, ensure buckets are private), then re-plan, re-generate JSON, and re-run conftest.

**Repeat until:**

```
PASS - plan.json - main - no test failures
```

---

## Step 5: Deliberately Break It

Introduce one violation per policy to confirm they catch issues:

1. Add `acl = "public-read"` to an S3 bucket resource
2. Remove the `ManagedBy` tag from one resource
3. Change an instance type to `m5.24xlarge`

Re-plan, re-generate JSON, and run conftest. You should see three `FAIL` lines — one per policy:

```
FAIL - plan.json - main - S3 bucket 'finstack-dev-statements' has public-read ACL — BFSI policy requires private buckets
FAIL - plan.json - main - Resource 'aws_instance.app' missing required tag: ManagedBy
FAIL - plan.json - main - Instance type 'm5.24xlarge' not in approved list for 'aws_instance.app' — allowed: t3.micro, t3.small, t3.medium, m5.large

3 tests, 0 passed, 0 warnings, 3 failures
```

Fix all three violations in the `.tf` files, re-run the full cycle, and confirm a clean pass.

---

## You're Done When

- [x] `opa test policy/ -v` passes all 7 test cases
- [x] `conftest test plan.json` returns exit 0 against a compliant FinStack plan
- [x] You deliberately triggered and then fixed one violation per policy
- [x] You understand how to add a fourth policy for a new resource type

## Common Mistakes

- **Tags check on resources without tags** — some resources (e.g., `aws_iam_policy`) don't support tags. Guard with `tags != null` in the rule body to avoid false positives on resources that don't have a tags field.
- **Not re-generating plan.json after fixing .tf files** — conftest reads the JSON, not the `.tf` files directly. Always re-plan and re-export after every change.
- **Hardcoding allowed values in the deny rule body** — use a named set (`allowed_instance_types`) so adding a new approved type is a one-line change, not a rule rewrite.
- **Forgetting `resource.change.actions[_] == "create"`** — without this guard, the policy also fires on resources being deleted or read, which produces confusing false positives.
