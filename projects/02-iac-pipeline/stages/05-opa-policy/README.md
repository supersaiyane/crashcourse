# Stage 5: OPA Policy — Shift-Left Compliance for Infrastructure as Code

**Goal:** Write, test, and enforce Open Policy Agent (OPA) policies that validate FinStack Terraform plans before infrastructure is provisioned — no public S3 buckets, mandatory tags, restricted instance types — then integrate policy checks into the CI pipeline so non-compliant infrastructure never reaches apply.

**Prerequisites:** Stages 1–4 complete (Terraform, Terragrunt, Packer, Vault). Docker running for LocalStack. Basic familiarity with JSON.

**Sample App:** FinStack — a BFSI payment platform. You will write policies that enforce the security and governance rules FinStack's infrastructure must satisfy before any `terraform apply` runs.

> For the full crash course on OPA, see [`OPA.md`](../../../../iac/OPA.md).

---

## 1. Theory

### 1.1 Why Policy as Code?

Before policy-as-code, compliance checks looked like this:

| Approach | What Happens | The Problem |
|----------|-------------|-------------|
| **Manual review** | A human reads the Terraform plan in a PR | Slow, inconsistent, misses subtle violations |
| **Post-deploy scan** | A tool scans running infra after apply | Too late — the public S3 bucket already existed for 20 minutes |
| **Tribal knowledge** | "Everyone knows we don't use m5.24xlarge" | New engineer doesn't know; nobody catches it in review |
| **Wiki checklist** | "Before merging, check the security doc" | Nobody reads it after week two |

In BFSI, a public S3 bucket holding payment statements is not an inconvenience — it is a regulatory incident. A misconfigured instance type burning through reserved capacity is a budget breach that triggers audit questions. You cannot rely on humans catching these in code review. You need a machine that reads every plan, every time, and blocks violations before apply.

**The one idea that unlocks OPA:** OPA is a **general-purpose policy engine** — you give it structured data (a Terraform plan, a Kubernetes manifest, an API request) and a set of rules written in Rego, and it returns a decision: allow or deny, with reasons. It does not know what Terraform is. It does not know what S3 is. It just evaluates rules against JSON. This is its power — one engine, any domain.

**Mental model:** Think of OPA as a building inspector. The architect draws the plans (Terraform code). Before construction begins, the inspector (OPA) reviews the plans against the building code (Rego policies). If the plans violate code — fire exits too narrow, load-bearing walls missing — construction is blocked. The inspector does not build anything. The inspector only says "pass" or "fail, and here's why."

```
┌─────────────────────────────────────────────────────────────────────┐
│                     POLICY-AS-CODE PIPELINE                         │
│                                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────┐  │
│  │ terraform │───▶│ terraform│───▶│ conftest │───▶│ terraform    │  │
│  │ init      │    │ plan     │    │ test     │    │ apply        │  │
│  │           │    │ -out=plan│    │ (OPA)    │    │ (only if     │  │
│  │           │    │          │    │          │    │  policies    │  │
│  │           │    │          │    │ PASS/FAIL│    │  pass)       │  │
│  └──────────┘    └──────────┘    └─────┬────┘    └──────────────┘  │
│                                        │                            │
│                                   FAIL = BLOCK                      │
│                                   (no apply, PR cannot merge)       │
└─────────────────────────────────────────────────────────────────────┘
```

This is **shift-left compliance** — catching violations at plan time, not after deployment.

---

### 1.2 Architecture — Where OPA Fits

```
┌──────────────────────────────────────────────────────────────┐
│  DEVELOPER WORKSTATION / CI PIPELINE                          │
│                                                              │
│  ┌────────────┐                                              │
│  │ .tf files  │                                              │
│  └─────┬──────┘                                              │
│        │                                                     │
│        ▼                                                     │
│  ┌────────────┐     ┌───────────────┐                        │
│  │ terraform  │────▶│ plan.json     │  (terraform show -json)│
│  │ plan       │     │ (structured   │                        │
│  └────────────┘     │  plan output) │                        │
│                     └───────┬───────┘                        │
│                             │                                │
│                             ▼                                │
│                     ┌───────────────┐     ┌──────────────┐   │
│                     │   conftest    │◀────│ policy/*.rego │   │
│                     │   (OPA CLI   │     │ (your rules) │   │
│                     │    wrapper)  │     └──────────────┘   │
│                     └───────┬───────┘                        │
│                             │                                │
│                     ┌───────┴───────┐                        │
│                     │               │                        │
│                  PASS            FAIL                         │
│                  (exit 0)       (exit 1)                      │
│                     │               │                        │
│                     ▼               ▼                         │
│              terraform apply   BLOCKED — fix violations       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Key tools:**

| Tool | Role | Install |
|------|------|---------|
| **OPA** | Policy engine + Rego evaluator + test runner | `brew install opa` or binary from GitHub releases |
| **conftest** | CLI that runs OPA policies against structured files (JSON, YAML, HCL) | `brew install conftest` or binary from GitHub releases |
| **terraform show -json** | Converts a Terraform plan binary into JSON that OPA/conftest can read | Built into Terraform CLI |

You write policies in Rego. Conftest wraps OPA so you don't need to manage the OPA server — it reads your policy files, evaluates them against the input, and returns pass/fail. In CI, conftest's exit code drives the pipeline: 0 = pass, 1 = fail.

---

### 1.3 Rego — The Policy Language

Rego (pronounced "ray-go") is OPA's declarative policy language. If you know SQL, the mental model is similar: you describe *what* you're looking for, not *how* to find it.

**Core concepts — the six things you need:**

| Concept | What It Does | Example |
|---------|-------------|---------|
| **Package** | Namespaces your rules | `package terraform.s3` |
| **Rule** | A named boolean or set | `deny[msg] { ... }` |
| **Input** | The data being evaluated (Terraform plan JSON) | `input.resource_changes` |
| **Iteration** | Implicit — variables unify over collections | `resource := input.resource_changes[_]` |
| **Comparison** | Equality and inequality | `resource.type == "aws_s3_bucket"` |
| **String format** | Build human-readable messages | `msg := sprintf("bucket %s is public", [name])` |

**The Rego evaluation model — how deny rules work:**

```
┌─────────────────────────────────────────────────────┐
│  deny[msg] {                                         │
│      some resource in input.resource_changes         │
│      resource.type == "aws_s3_bucket"                │
│      # ... conditions that identify a violation ...  │
│      msg := "Violation: ..."                         │
│  }                                                   │
│                                                      │
│  If ALL conditions inside the braces are true,       │
│  the rule fires and adds msg to the deny set.        │
│                                                      │
│  If the deny set is non-empty → FAIL                 │
│  If the deny set is empty    → PASS                  │
└─────────────────────────────────────────────────────┘
```

Rego rules are **conjunctive** within a single rule body (all conditions must be true) and **disjunctive** across multiple rule definitions with the same name (any one firing adds to the set). This is the key insight: you don't write if/else — you write multiple rules, and any violation that matches any rule gets collected.

**A minimal Rego policy — deny public S3 buckets:**

```rego
# policy/s3.rego
package main

# Deny S3 buckets that have a public ACL
deny[msg] {
    resource := input.resource_changes[_]                    # iterate over all resource changes
    resource.type == "aws_s3_bucket"                         # only S3 buckets
    resource.change.after.acl == "public-read"               # check for public ACL
    name := resource.change.after.bucket                     # get the bucket name
    msg := sprintf("S3 bucket '%s' has public-read ACL — BFSI policy requires private buckets", [name])
}
```

**Reading Terraform plan JSON — the structure you navigate:**

```
terraform show -json plan.out | jq .

{
  "resource_changes": [                    # <-- this is what you iterate
    {
      "address": "aws_s3_bucket.statements",
      "type": "aws_s3_bucket",
      "change": {
        "actions": ["create"],
        "before": null,                    # null = resource doesn't exist yet
        "after": {                         # <-- the planned state
          "bucket": "finstack-dev-statements",
          "acl": "private",
          "tags": {
            "Project": "finstack",
            "Environment": "dev",
            "ManagedBy": "terraform"
          }
        }
      }
    },
    {
      "address": "aws_instance.app",
      "type": "aws_instance",
      "change": {
        "actions": ["create"],
        "after": {
          "instance_type": "t3.micro",
          "tags": {}
        }
      }
    }
  ]
}
```

Every policy navigates this structure: `input.resource_changes[_]` gives you each resource, `.type` tells you what it is, `.change.after` gives you the planned values.

---

### 1.4 The Three FinStack Policies

These are the policies you will build in this stage. They represent the minimum governance a BFSI platform needs:

```
┌─────────────────────────────────────────────────────────────┐
│                  FINSTACK POLICY GATE                         │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Policy 1: no_public_s3                                │   │
│  │  No S3 bucket may have public-read or public-read-     │   │
│  │  write ACL. Payment data must never be exposed.        │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Policy 2: require_tags                                │   │
│  │  Every resource must have Project, Environment, and    │   │
│  │  ManagedBy tags. Untagged resources are invisible      │   │
│  │  to cost allocation and audit.                         │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Policy 3: restrict_instance_types                     │   │
│  │  Only approved instance types (t3.micro, t3.small,     │   │
│  │  t3.medium, m5.large) are allowed. Prevents accidental │   │
│  │  cost overruns from oversized instances.               │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ALL THREE must pass. Any violation blocks terraform apply.  │
└─────────────────────────────────────────────────────────────┘
```

**Why these three?**
- **no_public_s3** — The most common BFSI compliance violation. A single public bucket holding customer statements is a data breach.
- **require_tags** — Without tags, you cannot attribute costs to teams, cannot filter resources in audit, cannot enforce lifecycle policies. Tagging is the foundation of cloud governance.
- **restrict_instance_types** — In BFSI, compute budgets are fixed and pre-approved. An engineer spinning up an `m5.24xlarge` because "it was faster" blows the quarterly budget.

---

### 1.5 Writing Each Policy — Detailed Walkthrough

#### Policy 1: no_public_s3

This policy checks two things: the bucket ACL and the public access block resource. A truly secure S3 configuration requires both.

```rego
# policy/s3.rego — deny public S3 buckets
package main

# Deny S3 buckets with public-read ACL
deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_s3_bucket"
    resource.change.actions[_] != "delete"                  # don't check resources being destroyed
    acl := resource.change.after.acl
    acl == "public-read"
    name := resource.change.after.bucket
    msg := sprintf("S3 bucket '%s' has public-read ACL — BFSI policy requires private buckets", [name])
}

# Deny S3 buckets with public-read-write ACL
deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_s3_bucket"
    resource.change.actions[_] != "delete"
    acl := resource.change.after.acl
    acl == "public-read-write"
    name := resource.change.after.bucket
    msg := sprintf("S3 bucket '%s' has public-read-write ACL — BFSI policy requires private buckets", [name])
}

# Deny public access blocks that don't block everything
deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_s3_bucket_public_access_block"
    resource.change.actions[_] != "delete"
    change := resource.change.after
    change.block_public_acls == false
    msg := sprintf("S3 public access block '%s': block_public_acls must be true", [resource.address])
}

deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_s3_bucket_public_access_block"
    resource.change.actions[_] != "delete"
    change := resource.change.after
    change.block_public_policy == false
    msg := sprintf("S3 public access block '%s': block_public_policy must be true", [resource.address])
}

deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_s3_bucket_public_access_block"
    resource.change.actions[_] != "delete"
    change := resource.change.after
    change.restrict_public_buckets == false
    msg := sprintf("S3 public access block '%s': restrict_public_buckets must be true", [resource.address])
}
```

Notice the pattern: each rule tests one specific violation. Five separate `deny` rules rather than one complex rule. This is idiomatic Rego — each rule has a single, clear reason to fire.

#### Policy 2: require_tags

```rego
# policy/tags.rego — require mandatory tags on all taggable resources
package main

required_tags := {"Project", "Environment", "ManagedBy"}

deny[msg] {
    resource := input.resource_changes[_]
    resource.change.actions[_] == "create"                  # only check new resources
    tags := resource.change.after.tags                       # get planned tags
    tags != null                                             # resource supports tags
    tag := required_tags[_]                                  # iterate required tags
    not tags[tag]                                            # tag is missing
    msg := sprintf("Resource '%s' missing required tag: %s", [resource.address, tag])
}
```

**Why `tags != null`?** Some AWS resource types (e.g., `aws_iam_policy`) don't support tags. If the plan JSON has `"tags": null`, this guard prevents a false positive.

**Why `actions[_] == "create"`?** Without this guard, the rule also fires on resources being deleted (where `after` might be null) or on no-op reads. Checking for "create" scopes the rule to new resources where you can actually enforce the requirement.

#### Policy 3: restrict_instance_types

```rego
# policy/instances.rego — restrict EC2 instance types to approved list
package main

allowed_instance_types := {"t3.micro", "t3.small", "t3.medium", "m5.large"}

deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_instance"
    resource.change.actions[_] == "create"
    instance_type := resource.change.after.instance_type
    not allowed_instance_types[instance_type]                # not in the approved set
    msg := sprintf(
        "Instance type '%s' not in approved list for '%s' — allowed: t3.micro, t3.small, t3.medium, m5.large",
        [instance_type, resource.address],
    )
}

# Also restrict RDS instance classes
allowed_rds_classes := {"db.t3.micro", "db.t3.small", "db.t3.medium", "db.m5.large"}

deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_db_instance"
    resource.change.actions[_] == "create"
    instance_class := resource.change.after.instance_class
    not allowed_rds_classes[instance_class]
    msg := sprintf(
        "RDS instance class '%s' not in approved list for '%s' — allowed: db.t3.micro, db.t3.small, db.t3.medium, db.m5.large",
        [instance_class, resource.address],
    )
}
```

The approved set is a Rego set literal. Adding a new approved instance type is a one-line change — add it to the set. No rule logic needs to change.

---

### 1.6 Testing Policies with `opa test`

Policies are code. Code needs tests. OPA has a built-in test framework.

```
┌──────────────────────────────────────────────────────┐
│  policy/                                              │
│  ├── s3.rego              # policy: deny public S3    │
│  ├── tags.rego            # policy: require tags      │
│  ├── instances.rego       # policy: restrict types    │
│  ├── s3_test.rego         # tests for s3 policy       │
│  ├── tags_test.rego       # tests for tags policy     │
│  └── instances_test.rego  # tests for instances policy│
│                                                       │
│  opa test policy/ -v                                  │
│  → runs all *_test.rego files, reports pass/fail      │
└──────────────────────────────────────────────────────┘
```

**Test naming convention:** test files end in `_test.rego`. Test rules start with `test_`. OPA discovers them automatically.

**How a test works:**

```rego
# policy/s3_test.rego
package main

# Test: a public bucket should be denied
test_deny_public_s3_bucket {
    # Construct a fake input that represents a public bucket
    result := deny with input as {
        "resource_changes": [{
            "type": "aws_s3_bucket",
            "change": {
                "actions": ["create"],
                "after": {
                    "bucket": "test-bucket",
                    "acl": "public-read"
                }
            }
        }]
    }
    # The deny set should contain exactly one message
    count(result) > 0
}

# Test: a private bucket should pass
test_allow_private_s3_bucket {
    result := deny with input as {
        "resource_changes": [{
            "type": "aws_s3_bucket",
            "change": {
                "actions": ["create"],
                "after": {
                    "bucket": "test-bucket",
                    "acl": "private"
                }
            }
        }]
    }
    # The deny set should be empty — no violations
    count(result) == 0
}
```

The `with input as { ... }` syntax injects mock data. This is OPA's equivalent of a test fixture — you construct the minimal input that exercises the rule.

**Running tests:**

```bash
opa test policy/ -v
```

Expected output:

```
policy/s3_test.rego:
  data.main.test_deny_public_s3_bucket: PASS (1.2ms)
  data.main.test_allow_private_s3_bucket: PASS (0.8ms)

PASS: 2/2
```

**Test coverage:**

```bash
opa test policy/ -v --coverage
```

This shows which lines of your policy code were exercised by tests. Aim for complete coverage of all deny rules — each rule should have at least one test that triggers it and one that doesn't.

---

### 1.7 Conftest — Running Policies Against Real Plans

Conftest is the bridge between Terraform's plan output and OPA's policy engine. It handles the plumbing so you don't have to.

**The workflow:**

```bash
# Step 1: Generate the plan binary
terraform plan -out=plan.out

# Step 2: Convert to JSON (this is what conftest reads)
terraform show -json plan.out > plan.json

# Step 3: Run policies against the plan
conftest test plan.json --policy policy/
```

**Conftest conventions:**
- Policies live in a `policy/` directory by default (override with `--policy`)
- All `.rego` files in the policy directory are loaded
- Rules named `deny[msg]` cause test failure
- Rules named `warn[msg]` print warnings but don't fail
- Rules named `violation[msg]` also cause failure (alternative to deny)

**Expected output — all policies pass:**

```
PASS - plan.json - main - no test failures
```

**Expected output — violations found:**

```
FAIL - plan.json - main - S3 bucket 'finstack-dev-statements' has public-read ACL — BFSI policy requires private buckets
FAIL - plan.json - main - Resource 'aws_instance.app' missing required tag: ManagedBy
FAIL - plan.json - main - Instance type 'm5.24xlarge' not in approved list for 'aws_instance.app'

3 tests, 0 passed, 0 warnings, 3 failures
```

Each failure message comes from the `msg` in your `deny[msg]` rule. Write clear, actionable messages — the developer reading this in CI needs to know exactly what to fix.

---

### 1.8 CI Integration — The Policy Gate

In a real pipeline, the policy check runs after `terraform plan` and before `terraform apply`. If conftest returns a non-zero exit code, the pipeline stops.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CI PIPELINE (GitHub Actions)                   │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │ checkout  │─▶│ terraform│─▶│ conftest  │─▶│ terraform      │  │
│  │ code      │  │ init +   │  │ test      │  │ apply          │  │
│  │           │  │ plan     │  │ plan.json │  │ (manual gate   │  │
│  │           │  │          │  │           │  │  + conftest    │  │
│  │           │  │ -out=plan│  │ --policy  │  │  passed)       │  │
│  └──────────┘  └──────────┘  │ policy/   │  └────────────────┘  │
│                               └─────┬────┘                       │
│                                     │                            │
│                              exit 0 = continue                   │
│                              exit 1 = BLOCK pipeline             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**GitHub Actions step (what you'll wire up in Stage 7):**

```yaml
# .github/workflows/terraform.yml (relevant step)
- name: Policy check — OPA/conftest
  run: |
    terraform show -json plan.out > plan.json
    conftest test plan.json --policy policy/ --no-color
```

If conftest fails, the job fails, the PR gets a red check, and the developer must fix the violation before merging. This is the shift-left pattern — compliance is enforced at PR time, not after deployment.

**Using warn instead of deny for advisory policies:**

Not every policy needs to be a hard blocker. Use `warn[msg]` for policies you want to surface but not enforce yet — for example, recommending (but not requiring) encryption on non-production buckets:

```rego
warn[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_s3_bucket_server_side_encryption_configuration"
    # ... check for missing encryption ...
    msg := "Consider enabling encryption on this bucket"
}
```

Conftest prints warnings but exits 0. This lets you introduce policies gradually — start as `warn`, promote to `deny` after the team has had time to comply.

---

### 1.9 Debugging Rego Policies

When a policy doesn't behave as expected, you have several tools:

**Interactive evaluation with `opa eval`:**

```bash
# Evaluate a specific rule against input
opa eval -d policy/ -i plan.json "data.main.deny"

# Pretty-print the result
opa eval -d policy/ -i plan.json "data.main.deny" --format pretty

# Full trace — shows every step of evaluation
opa eval -d policy/ -i plan.json "data.main.deny" --explain full
```

**Common debugging pattern:**

```rego
# Temporarily add a "debug" rule to inspect intermediate values
debug[resource_type] {
    resource := input.resource_changes[_]
    resource_type := resource.type
}
```

Then evaluate: `opa eval -d policy/ -i plan.json "data.main.debug" --format pretty`

This shows you what resource types are in the plan — useful when your deny rule isn't matching and you're not sure why.

**The Rego Playground:** [play.openpolicyagent.org](https://play.openpolicyagent.org) lets you paste input JSON and Rego rules side by side and see evaluation results instantly. Use it when developing new rules before committing them.

---

## 2. Hands-On Exercises

The exercises are in the `exercises/` directory. Complete them in order.

### Exercise 1: First Policy

**File:** `exercises/01-first-policy.md`

Write a Rego policy that denies public S3 buckets. Test it with `opa test` against mock inputs. Then run it against a real Terraform plan JSON using conftest.

**Key commands you'll learn:**

```bash
opa test policy/ -v                    # Run policy unit tests
opa eval -d policy/ -i plan.json "data.main.deny"  # Evaluate interactively
conftest test plan.json --policy policy/            # Run policies against a plan
```

**What you'll build:**

```
policy/
├── s3.rego              # deny rule for public S3 buckets
└── s3_test.rego         # unit tests: public denied, private allowed
```

**You're done when:**
- `opa test policy/ -v` passes both test cases (public denied, private allowed)
- `conftest test plan.json` passes against a private-bucket plan
- You can modify the plan JSON to make the bucket public and see conftest fail
- You understand how `deny[msg]` rules collect violations

Estimated time: 30 minutes.

---

### Exercise 2: Terraform Policies

**File:** `exercises/02-terraform-policies.md`

Add the require_tags and restrict_instance_types policies. Run the full suite with conftest against the FinStack Terraform plan. Fix any violations in the Terraform code, re-plan, and re-test until all three policies pass.

**Key commands you'll learn:**

```bash
conftest test plan.json --policy policy/ --all-namespaces  # Test all policies
conftest test plan.json --output json                      # Machine-readable output
opa test policy/ -v --coverage                             # Test coverage report
```

**What you'll build:**

```
policy/
├── s3.rego              # deny public S3
├── s3_test.rego         # tests
├── tags.rego            # require Project, Environment, ManagedBy tags
├── tags_test.rego       # tests
├── instances.rego       # restrict instance types to approved list
└── instances_test.rego  # tests
```

**You're done when:**
- All test files pass with `opa test policy/ -v`
- `conftest test plan.json` returns exit code 0 against a compliant FinStack plan
- You have deliberately introduced a violation (wrong instance type, missing tag, public ACL) and confirmed conftest catches it
- You understand how to add a new policy for a new resource type

Estimated time: 45 minutes.

---

## 3. Summary

### What You Learned

| Concept | Key Insight |
|---------|-------------|
| **Policy as code** | Compliance rules as version-controlled, testable, automated checks |
| **OPA** | General-purpose policy engine — evaluates rules against structured data |
| **Rego** | Declarative language; `deny[msg]` rules collect violations into a set |
| **Rego evaluation** | Conjunctive within a rule (AND), disjunctive across rules (OR) |
| **conftest** | CLI wrapper around OPA for testing structured files (JSON, YAML, HCL) |
| **Terraform plan JSON** | `terraform show -json plan.out` — the structured input OPA evaluates |
| **`deny[msg]`** | If conditions match, msg is added to deny set; non-empty set = failure |
| **`warn[msg]`** | Like deny, but advisory — conftest prints but exits 0 |
| **`with input as`** | Test fixture injection — construct minimal input to exercise a rule |
| **`opa test`** | Built-in test runner; test rules start with `test_`, files end in `_test.rego` |
| **Shift-left** | Catch violations at plan time, not after deployment |
| **CI gate** | conftest exit code drives pipeline — non-zero blocks apply |

### OPA / Conftest Cheat Sheet

```bash
# OPA — evaluate and test
opa eval -d policy/ -i plan.json "data.main.deny"        # Evaluate deny rules against input
opa eval -d policy/ -i plan.json "data.main.deny" --format pretty  # Human-readable output
opa eval -d policy/ -i plan.json "data.main.deny" --explain full   # Full evaluation trace
opa test policy/ -v                                       # Run all tests, verbose
opa test policy/ -v --coverage                            # Test coverage report
opa test policy/ --run "test_deny_public"                 # Run a single test by name
opa fmt policy/                                           # Format Rego files (canonical style)
opa check policy/                                         # Syntax check without evaluation

# Conftest — test structured files against policies
conftest test plan.json --policy policy/                  # Run policies against Terraform plan
conftest test plan.json --policy policy/ --no-color       # CI-friendly output (no ANSI)
conftest test plan.json --output json                     # Machine-readable JSON output
conftest test plan.json --output table                    # Table format
conftest test plan.json --all-namespaces                  # Test all namespaces
conftest test plan.json --combine                         # Combine all files into one input
conftest test *.yaml --policy policy/                     # Test YAML files (K8s manifests)
conftest verify --policy policy/                          # Run Rego unit tests via conftest

# Terraform plan — generate the JSON input
terraform plan -out=plan.out                              # Binary plan file
terraform show -json plan.out > plan.json                 # Convert to JSON for conftest
terraform show -json plan.out | jq '.resource_changes'    # Inspect resource changes
terraform show -json plan.out | jq '.resource_changes[] | select(.type == "aws_s3_bucket")'

# Debugging policies
opa eval -d policy/ -i plan.json "data.main.deny" --explain full  # Trace rule evaluation
conftest test plan.json --policy policy/ --trace          # Trace conftest evaluation
```

### The Three FinStack Policies — Quick Reference

```rego
# Policy 1: No public S3 buckets
deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_s3_bucket"
    resource.change.after.acl == "public-read"
    msg := sprintf("S3 bucket '%s' has public ACL", [resource.change.after.bucket])
}

# Policy 2: Required tags on all taggable resources
required_tags := {"Project", "Environment", "ManagedBy"}
deny[msg] {
    resource := input.resource_changes[_]
    resource.change.actions[_] == "create"
    tags := resource.change.after.tags
    tags != null
    tag := required_tags[_]
    not tags[tag]
    msg := sprintf("Resource '%s' missing required tag: %s", [resource.address, tag])
}

# Policy 3: Restrict instance types
allowed_types := {"t3.micro", "t3.small", "t3.medium", "m5.large"}
deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_instance"
    resource.change.actions[_] == "create"
    instance_type := resource.change.after.instance_type
    not allowed_types[instance_type]
    msg := sprintf("Instance type '%s' not approved for '%s'", [instance_type, resource.address])
}
```

### Next Steps

You've completed Stage 5. FinStack's infrastructure is now gated by policy-as-code — no non-compliant plan can reach apply. Next:

- **Stage 6 (Ansible Config)** — configure the provisioned infrastructure with Ansible
- **Stage 7 (CI/CD Pipeline)** — wire Terraform + conftest + Ansible into a complete GitHub Actions pipeline

**Further learning:**
- Custom OPA bundles for sharing policies across teams (see `OPA.md`)
- Policy libraries: Regula, Checkov, tfsec — pre-built rules you can adopt
- OPA as a Kubernetes admission controller (validating webhook)
- Rego playground at [play.openpolicyagent.org](https://play.openpolicyagent.org) for interactive experimentation
- Styra DAS for enterprise OPA management and decision logging
