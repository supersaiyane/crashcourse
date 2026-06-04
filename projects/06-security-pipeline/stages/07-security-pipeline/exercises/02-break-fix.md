# Exercise 2: Break and Fix Each Gate

## Step 1: Break the test gate — add a failing test, push, confirm pipeline stops at test
## Step 2: Fix, then break image scan — use a vulnerable base image
## Step 3: Fix, then break IaC scan — add an open security group to terraform
## Step 4: Fix all, push — confirm full pipeline passes
## Step 5: Note for each: which job caught it, time to feedback, error message quality

## Verify

Each gate should independently block the pipeline when its domain is violated.
