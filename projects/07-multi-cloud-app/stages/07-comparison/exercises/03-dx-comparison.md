# Exercise 3: Developer Experience Comparison

**Goal:** Rate each cloud's CLI, console, and documentation on a 1-5 scale with specific, observable criteria.

## Step 1: Rate CLI quality

Use each cloud's CLI for 15 minutes performing the same tasks (list clusters, describe a node, check logs). Rate on these criteria:

```text
+---------------------+----------+----------+----------+
| Criteria            |   AWS    |   GCP    |  Azure   |
+---------------------+----------+----------+----------+
| Installation ease   |          |          |          |
| Command consistency |          |          |          |
| Output readability  |          |          |          |
| Auto-completion     |          |          |          |
| Auth flow           |          |          |          |
| Error messages      |          |          |          |
+---------------------+----------+----------+----------+
| CLI average         |          |          |          |
+---------------------+----------+----------+----------+
```

Scale: 1 = frustrating, 2 = clunky, 3 = adequate, 4 = good, 5 = excellent

## Step 2: Rate console (web UI)

Navigate each cloud's console to find your CloudPlatform cluster, view pod status, and check logs:

```text
+---------------------+----------+----------+----------+
| Criteria            |   AWS    |   GCP    |  Azure   |
+---------------------+----------+----------+----------+
| Navigation clarity  |          |          |          |
| Search quality      |          |          |          |
| Resource visibility |          |          |          |
| Load speed          |          |          |          |
| IAM management      |          |          |          |
+---------------------+----------+----------+----------+
| Console average     |          |          |          |
+---------------------+----------+----------+----------+
```

## Step 3: Rate documentation and ecosystem

Look up how to configure a Kubernetes ingress on each cloud. Rate the docs:

```text
+---------------------+----------+----------+----------+
| Criteria            |   AWS    |   GCP    |  Azure   |
+---------------------+----------+----------+----------+
| Docs quality        |          |          |          |
| Example code        |          |          |          |
| Community (SO/GH)   |          |          |          |
| Terraform provider  |          |          |          |
| K8s integration     |          |          |          |
+---------------------+----------+----------+----------+
| Ecosystem average   |          |          |          |
+---------------------+----------+----------+----------+
```

## Step 4: Calculate overall DX score

Average the three category scores for each cloud.

## Verify

You have three completed rating tables with scores based on specific criteria (not vague feelings). You can explain which cloud has the best DX and which specific area (CLI, console, or docs) each cloud excels or struggles in.
