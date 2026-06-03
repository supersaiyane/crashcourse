# Exercise 1: Install kube-prometheus-stack

In this exercise, you will deploy the full Prometheus monitoring stack using Helm and verify that all components are running.

## Prerequisites

- A running Kubernetes cluster (kind, minikube, or cloud-based)
- Helm v3 installed
- `kubectl` configured with cluster access
- Cutlink deployed in the `cutlink` namespace (from prior stages)

---

## Step 1: Add the Prometheus Community Helm Repository

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

## Step 2: Install kube-prometheus-stack

We install into the `monitoring` namespace with the release name `prometheus`.

```bash
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set grafana.adminPassword=prom-operator
```

What this command does:
- Creates the `monitoring` namespace if it doesn't exist.
- Installs all stack components: Prometheus, Alertmanager, Grafana, node-exporter, kube-state-metrics, and the Prometheus Operator.
- Sets the Grafana admin password to `prom-operator`.
- The release name `prometheus` is important: the chart uses it to label all CRDs (ServiceMonitors, PrometheusRules, etc.) with `release: prometheus`. If you use a different release name, you must update your CRDs accordingly.

## Step 3: Verify Installation

Check that all pods are running:

```bash
kubectl get pods -n monitoring
```

Expected output (pod name suffixes will differ):

```
NAME                                                     READY   STATUS    RESTARTS   AGE
alertmanager-prometheus-kube-prometheus-alertmanager-0   2/2     Running   0          2m
prometheus-grafana-5c9b8b7b4b-8z7kq                     3/3     Running   0          2m
prometheus-kube-prometheus-operator-6d8c4f8d7c-c2f5k    1/1     Running   0          2m
prometheus-kube-state-metrics-7f5b9f9f4b-d9c4n          1/1     Running   0          2m
prometheus-kube-prometheus-node-exporter-zm8x4           1/1     Running   0          2m
prometheus-prometheus-kube-prometheus-prometheus-0       2/2     Running   0          2m
```

## Step 4: Access Prometheus UI

Port-forward to the Prometheus server:

```bash
kubectl port-forward svc/prometheus-operated 9090:9090 -n monitoring
```

Open a browser to `http://localhost:9090`. You should see the Prometheus web UI.

**Verify targets are being scraped:**

1. In the Prometheus UI, go to **Status > Targets**.
2. You should see numerous scrape targets:
   - `serviceMonitor/monitoring/prometheus-kube-prometheus-alertmanager/0`
   - `serviceMonitor/monitoring/prometheus-kube-prometheus-kube-state-metrics/0`
   - `serviceMonitor/monitoring/prometheus-kube-prometheus-node-exporter/0`
   - `podMonitor/monitoring/prometheus-kube-prometheus-prometheus/0`
   - `serviceMonitor/monitoring/prometheus-kube-prometheus-kubelet/0`
   - `serviceMonitor/monitoring/prometheus-kube-prometheus-apiserver/0`
   - `serviceMonitor/monitoring/prometheus-kube-prometheus-coredns/0`
   - `serviceMonitor/monitoring/prometheus-kube-prometheus-kube-controller-manager/0`
   - `serviceMonitor/monitoring/prometheus-kube-prometheus-kube-scheduler/0`
3. All targets should show "UP" status.

## Step 5: Access Grafana

Port-forward to Grafana:

```bash
kubectl port-forward svc/prometheus-grafana 3000:80 -n monitoring
```

Open a browser to `http://localhost:3000`.

**Login:**
- Username: `admin`
- Password: `prom-operator`

**Explore pre-installed dashboards:**

1. Click the **Dashboards** icon (four squares) in the left sidebar.
2. Click **Browse**.
3. You should see several pre-installed dashboards:
   - **Kubernetes / Compute Resources / Namespace (Pods)**
   - **Kubernetes / Compute Resources / Node (Pods)**
   - **Kubernetes / API server**
   - **Node Exporter / Probes**
   - **Node Exporter / Full**
4. Open **Kubernetes / Compute Resources / Namespace (Pods)** and select namespace `cutlink` from the dropdown.

## Step 6: Run Your First PromQL Query

In the Prometheus UI (`http://localhost:9090`):

1. Click the **Graph** tab.
2. Enter the following query:
   ```
   up
   ```
3. Click **Execute**. You should see a table of all scrape targets and their UP status (1 = up, 0 = down).

Now try these queries to get familiar with the metrics:

**How many pods are running in the cutlink namespace?**
```
count by(namespace) (kube_pod_status_phase{namespace="cutlink", phase="Running"})
```

**How much memory is Cutlink using?**
```
sum(container_memory_usage_bytes{namespace="cutlink"})
```

**CPU usage rate for Cutlink:**
```
rate(container_cpu_usage_seconds_total{namespace="cutlink"}[5m])
```

## Troubleshooting

### Pods in CrashLoopBackOff

If Prometheus or Grafana pods are failing:

```bash
kubectl logs -n monitoring prometheus-grafana-xxxxx
kubectl describe pod -n monitoring prometheus-grafana-xxxxx
```

### No Targets Found

If Prometheus shows no targets:

```bash
kubectl get servicemonitors -A
kubectl get podmonitors -A
kubectl get prometheus -n monitoring -o yaml
```

Verify that the Prometheus CRD has the correct `serviceMonitorSelector` and `podMonitorSelector` matching the `release: prometheus` label.

### Grafana Login Fails

If you cannot log in with `admin/prom-operator`:

```bash
# Get the auto-generated password (may differ if --set failed)
kubectl get secret prometheus-grafana -n monitoring -o jsonpath="{.data.admin-password}" | base64 --decode; echo
```

---

## Summary

You have successfully deployed:
- **Prometheus** — time-series database and query engine
- **Alertmanager** — alert routing and notification
- **Grafana** — dashboard visualization with pre-installed dashboards
- **node-exporter** — host-level metrics per cluster node
- **kube-state-metrics** — Kubernetes object state metrics

In the next exercise, you will explore PromQL in depth using real metrics from your cluster.
