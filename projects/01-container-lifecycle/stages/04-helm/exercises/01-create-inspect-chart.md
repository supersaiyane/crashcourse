# Exercise 1: Create and Inspect the Helm Chart

**Goal:** Understand the chart structure, inspect default values, and verify template rendering.

## Step 1 — Create the chart

```bash
helm create sample-app/helm/cutlink
```

## Step 2 — Explore the chart structure

```bash
tree sample-app/helm/cutlink/
```

You'll see: `Chart.yaml`, `values.yaml`, `templates/` (11+ template files), `charts/`, `crds/`.

## Step 3 — Inspect Chart.yaml

```bash
cat sample-app/helm/cutlink/Chart.yaml
```

Note: `apiVersion: v2`, `name: cutlink`, `type: application`, `version: 0.1.0`, `appVersion: "1.0.0"`, `kubeVersion: ">=1.22.0-0"`.

## Step 4 — Render the chart

```bash
helm template cutlink-release sample-app/helm/cutlink/ --debug
```

This renders templates locally without installing anything.

## Step 5 — Dry-run install

```bash
helm install cutlink-release sample-app/helm/cutlink/ --dry-run --debug
```

## Step 6 — Lint the chart

```bash
helm lint sample-app/helm/cutlink/
```

## Step 7 — Package the chart

```bash
helm package sample-app/helm/cutlink/ -d sample-app/helm/
```
