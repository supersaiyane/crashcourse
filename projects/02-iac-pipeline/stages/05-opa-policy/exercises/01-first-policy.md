# Exercise 1: First Policy — Deny Public S3 Buckets

**Goal:** Write a Rego policy that denies S3 buckets with public ACLs, test it with `opa test`, and run it against a Terraform plan JSON using conftest.

**Time:** 30 minutes

---

## Step 1: Install OPA and Conftest

```bash
# macOS
brew install opa conftest

# Verify
opa version
conftest --version
```

---

## Step 2: Create the Policy Directory

```bash
cd finstack
mkdir -p policy
```

---

## Step 3: Write the Policy

Create `policy/s3.rego`:

```rego
# policy/s3.rego — deny S3 buckets with public ACLs
package main

deny[msg] {
    resource := input.resource_changes[_]               # iterate all resource changes
    resource.type == "aws_s3_bucket"                     # only S3 buckets
    acl := resource.change.after.acl                     # get the planned ACL
    acl == "public-read"                                 # check for public-read
    name := resource.change.after.bucket                 # get bucket name for the message
    msg := sprintf("S3 bucket '%s' has public-read ACL — BFSI policy requires private buckets", [name])
}

deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_s3_bucket"
    acl := resource.change.after.acl
    acl == "public-read-write"                           # also catch public-read-write
    name := resource.change.after.bucket
    msg := sprintf("S3 bucket '%s' has public-read-write ACL — BFSI policy requires private buckets", [name])
}
```

---

## Step 4: Write Tests

Create `policy/s3_test.rego`:

```rego
# policy/s3_test.rego — unit tests for S3 policy
package main

# Test: public-read bucket should be denied
test_deny_public_read_s3 {
    result := deny with input as {"resource_changes": [{
        "type": "aws_s3_bucket",
        "change": {"actions": ["create"], "after": {"bucket": "bad-bucket", "acl": "public-read"}}
    }]}
    count(result) > 0
}

# Test: public-read-write bucket should be denied
test_deny_public_read_write_s3 {
    result := deny with input as {"resource_changes": [{
        "type": "aws_s3_bucket",
        "change": {"actions": ["create"], "after": {"bucket": "bad-bucket", "acl": "public-read-write"}}
    }]}
    count(result) > 0
}

# Test: private bucket should pass (no deny)
test_allow_private_s3 {
    result := deny with input as {"resource_changes": [{
        "type": "aws_s3_bucket",
        "change": {"actions": ["create"], "after": {"bucket": "good-bucket", "acl": "private"}}
    }]}
    count(result) == 0
}
```

---

## Step 5: Run Tests

```bash
opa test policy/ -v
```

Expected output:

```
policy/s3_test.rego:
  data.main.test_deny_public_read_s3: PASS (1.1ms)
  data.main.test_deny_public_read_write_s3: PASS (0.9ms)
  data.main.test_allow_private_s3: PASS (0.7ms)

PASS: 3/3
```

---

## Step 6: Test Against a Terraform Plan

Generate the plan JSON from your FinStack Terraform config:

```bash
cd finstack/terraform/environments
terraform plan -out=plan.out
terraform show -json plan.out > plan.json
```

Run conftest:

```bash
conftest test plan.json --policy ../../../policy/
```

Expected output (FinStack buckets are private):

```
PASS - plan.json - main - no test failures
```

Now create a failing test — edit `plan.json` temporarily, changing a bucket's `acl` to `"public-read"`, and re-run conftest. You should see:

```
FAIL - plan.json - main - S3 bucket 'finstack-dev-statements' has public-read ACL — BFSI policy requires private buckets
```

---

## You're Done When

- [x] `opa test policy/ -v` passes all three test cases
- [x] `conftest test plan.json` passes against a private-bucket plan
- [x] You can make conftest fail by changing the ACL to `public-read` in plan.json
- [x] You understand the structure: `deny[msg] { conditions... msg := "..." }`

## Common Mistakes

- **Wrong package name** — conftest expects `package main` by default. If you use a different package, pass `--all-namespaces`.
- **Navigating the wrong JSON path** — use `jq '.resource_changes[0].change.after'` to inspect the plan structure before writing rules.
- **Forgetting the `msg` assignment** — `deny[msg]` requires `msg` to be bound inside the rule body. Without it, OPA errors.
- **Testing against `terraform plan` output (text)** — conftest needs JSON. Always use `terraform show -json plan.out`, not the raw plan text.
