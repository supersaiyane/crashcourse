# Falco — A 2-Day Crash Course

> **In one sentence:** Falco is a runtime security tool that detects anomalous activity in your containers and hosts by watching system calls in real time — it's the intrusion detection system for cloud-native. Prerequisite: know Kubernetes — see `Kubernetes.md`.

---

## Part 0 — Why Falco exists

Image scanners like Trivy catch known vulnerabilities baked into your container images before they ship. That's valuable — but it leaves a wide-open gap. Once a container is running, a scanner has no visibility into what it's actually doing. An attacker who exploits a zero-day, abuses a misconfiguration, or just runs `curl | bash` inside your pod will sail right past image scanning completely.

What you actually need is something watching behavior at runtime — the moment a process spawns unexpectedly, the moment someone reads `/etc/shadow`, the moment a container tries to write to `/proc` or open a raw socket. That's what Falco does. It hooks into the Linux kernel — via a kernel module or eBPF probe — and watches every system call from every container on the node, comparing what it sees against a library of rules. When behavior matches a rule, it fires an alert.

Think of the relationship this way: Trivy is the metal detector at the airport — it checks what's in your bag before you board. Falco is the security camera inside the building — it watches what you actually do once you're in, and alerts when something looks wrong.

The threat model Falco is built for includes: lateral movement after a container breakout, credential theft from within a running pod, privilege escalation via kernel exploits, and insider threats from legitimate access being abused. These are all things that look fine to an image scanner and look fine to a Kubernetes admission controller — but generate distinctive system call patterns that Falco can detect.

**Mental model:** Falco doesn't prevent attacks — it detects them fast enough that you can respond before they become breaches.

---

## Part 1 — The vocabulary

| Term | What it means |
|------|---------------|
| **System Call (syscall)** | The low-level interface between userspace processes and the Linux kernel. Every file read, network connection, and process spawn goes through here. Falco watches these. |
| **Rule** | The core unit of Falco configuration — a named detection with a condition, output format, and priority. When the condition is true for a syscall event, Falco fires an alert. |
| **Macro** | A named, reusable condition fragment you can reference inside rules. Keeps rule conditions readable and DRY — for example, `container` is a built-in macro that checks whether the event came from inside a container. |
| **List** | A named collection of values — file paths, syscall names, process names — referenced inside conditions with the `in` operator. Makes rules maintainable when you have many values. |
| **Priority** | Severity level of a rule's alert. Ordered from highest to lowest: `EMERGENCY`, `ALERT`, `CRITICAL`, `ERROR`, `WARNING`, `NOTICE`, `INFORMATIONAL`, `DEBUG`. Most default rules sit at `WARNING` or `NOTICE`. |
| **Output** | The message Falco emits when a rule fires, using a printf-style template with event fields like `%proc.name`, `%container.id`, `%fd.name`. |
| **Falco Driver** | The kernel-level component that captures syscall events. Two options: a traditional kernel module (loaded into the kernel, requires kernel headers) or an eBPF probe (safer, no kernel headers required, preferred on modern kernels and managed K8s). |
| **Falcosidekick** | A companion service that receives Falco alerts and fans them out to destinations — Slack, PagerDuty, Elasticsearch, S3, webhooks, and more. You almost always want this in production. |
| **Plugin** | The extension system introduced in Falco 0.31. Plugins let Falco consume event sources beyond syscalls — including Kubernetes audit logs, AWS CloudTrail, GitHub audit logs. Each plugin is a shared library implementing a standard API. |

---

## DAY 1 — Detect suspicious activity

### 1. Install Falco on Kubernetes with Helm

You need Helm set up — see `Helm.md` for the basics.

Add the Falco Helm repository and install:

```bash
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm repo update

helm install falco falcosecurity/falco \
  --namespace falco \
  --create-namespace \
  --set driver.kind=ebpf \
  --set falcosidekick.enabled=true \
  --set falcosidekick.webui.enabled=true
```

The `driver.kind=ebpf` flag selects the eBPF probe instead of the kernel module — this is the right default for most managed Kubernetes clusters (EKS, GKE, AKS) where you can't easily load kernel modules. On bare-metal clusters with full kernel access, you might prefer `driver.kind=module` for slightly lower overhead.

Verify the pods are running:

```bash
kubectl get pods -n falco
# You should see: falco-xxxxx (DaemonSet — one per node), falcosidekick, falcosidekick-ui
```

Falco runs as a DaemonSet. Every node in your cluster gets a pod, because syscall watching is per-node — there's no way to do this centrally.

### 2. Understand the default rule set

Falco ships with a curated set of rules covering the most common attack patterns. They live in the Helm chart as a ConfigMap and are loaded at startup. A few important defaults to know:

- **Terminal shell in container** — fires when someone runs an interactive shell (`bash`, `sh`, `zsh`) inside a running container
- **Read sensitive file untrusted** — fires when a process not on the trusted list reads `/etc/shadow`, `/etc/sudoers`, SSH keys
- **Write below root** — fires when a process writes to directories that should be read-only at runtime
- **Container drift** — fires when a new executable appears in a running container that wasn't in the image
- **Outbound connection to C2 server** — fires on connections to known bad IP ranges (requires the network rules)

You don't need to write rules on Day 1. The defaults cover a lot. Your first job is to understand what's already there before you start customizing.

List all loaded rules from within the Falco pod:

```bash
kubectl exec -n falco daemonset/falco -- falco --list
```

### 3. Trigger an alert deliberately

Open two terminals. In terminal 1, watch the Falco logs:

```bash
kubectl logs -n falco daemonset/falco -f
```

In terminal 2, exec into any running container in your cluster:

```bash
kubectl exec -it <some-pod> -- /bin/bash
```

The moment that exec lands, you should see in terminal 1:

```
Notice A shell was spawned in a container with an attached terminal
  (user=<user> container=<name> shell=bash parent=runc cmdline=bash ...)
```

Now, still inside that container, try to read a sensitive file:

```bash
cat /etc/shadow
```

You'll see a second alert:

```
Warning Sensitive file opened for reading by non-trusted program
  (user=root name=cat command=cat /etc/shadow file=/etc/shadow ...)
```

This is the core loop: behavior happens — syscall fires — Falco's condition matches — alert is emitted. You've just witnessed it end to end.

### 4. Understand rule anatomy

Every Falco rule has five fields. Here's the "Terminal shell in container" rule simplified:

```yaml
- rule: Terminal Shell in Container
  desc: >
    A shell was spawned in a container with an attached terminal.
    Shells in containers are a common sign of an attacker exploring.
  condition: >
    spawned_process
    and container
    and shell_procs
    and proc.tty != 0
  output: >
    A shell was spawned in a container with an attached terminal
    (user=%user.name container=%container.name shell=%proc.name
     parent=%proc.pname cmdline=%proc.cmdline)
  priority: NOTICE
```

Breaking it down:

- `rule` — the unique name. Keep it descriptive; it shows up in your alerts.
- `desc` — human-readable explanation. Write this for the on-call engineer who's never seen this rule before.
- `condition` — a boolean expression evaluated against each syscall event. Uses Falco's filter syntax — a mix of macros (like `container`, `spawned_process`) and field comparisons (like `proc.tty != 0`). If this evaluates to true, the alert fires.
- `output` — the message emitted. Use `%field.name` format to interpolate event data — process names, container IDs, file paths, usernames. This is what ends up in your Slack message or PagerDuty alert, so make it informative.
- `priority` — severity. Use `CRITICAL` or `EMERGENCY` sparingly — those should page someone immediately. `WARNING` and `NOTICE` are appropriate for "interesting, investigate when you can."

**By end of Day 1 you can:** install Falco via Helm, trigger alerts by doing suspicious things in containers, read and interpret the alert output, and explain what a rule's condition, output, and priority fields do.

---

## DAY 2 — Make it real

### 1. Write a custom rule

The default rules won't cover everything specific to your environment. Let's say you want to alert whenever any process in your production namespace reads from a secrets directory your app doesn't normally touch.

Create a file `custom-rules.yaml`:

```yaml
- list: my_app_processes
  items: [nginx, my-api, node]

- macro: not_my_app
  condition: not proc.name in (my_app_processes)

- rule: Unexpected Read of App Secrets Dir
  desc: >
    A process that is not part of the application read from
    /var/secrets — possible credential theft.
  condition: >
    open_read
    and container
    and fd.name startswith "/var/secrets/"
    and not_my_app
  output: >
    Unexpected secrets dir read
    (user=%user.name proc=%proc.name file=%fd.name container=%container.name)
  priority: WARNING
  tags: [custom, credentials]
```

Apply this as an override in your Helm values:

```yaml
# values-custom.yaml
customRules:
  custom-rules.yaml: |-
    - list: my_app_processes
      items: [nginx, my-api, node]
    ...
```

```bash
helm upgrade falco falcosecurity/falco \
  --namespace falco \
  -f values-custom.yaml
```

Rules are reloaded when Falco restarts — in Kubernetes that means a rolling restart of the DaemonSet. Plan for a brief gap during upgrades.

### 2. Tune false positives with exceptions and macros

Within the first week of running Falco in a real cluster, you will get false positives. A legitimate init container reads `/etc/shadow` during startup. A monitoring agent spawns shells. A database migration script does something that looks like privilege escalation but isn't.

The wrong approach is to disable rules entirely. The right approach is to add targeted exceptions.

**Method 1 — Append to a macro condition:**

```yaml
- macro: trusted_shell_spawners
  condition: (proc.name in (my-init-container, my-debug-tool))

- macro: shell_in_container_conditions
  append: true
  condition: and not trusted_shell_spawners
```

**Method 2 — Use the `exceptions` field (Falco 0.28+):**

```yaml
- rule: Terminal Shell in Container
  exceptions:
    - name: trusted_containers
      fields: [container.image.repository]
      comps: [=]
      values:
        - [my-company/debug-tools]
```

The `exceptions` field is cleaner and more maintainable than macro appending for most cases. It reads like a blocklist directly on the rule.

The discipline here: every exception you add should be documented — who added it, why, and what alert they were suppressing. A comment in the YAML is enough. Over time, an undocumented pile of exceptions becomes a security blindspot.

### 3. Route alerts with Falcosidekick

Falco writes alerts to stdout. That's not where your on-call engineer is looking at 3am. Falcosidekick bridges that gap — it reads from Falco's HTTP output and fans alerts out to wherever your team actually works.

Configure Falcosidekick outputs in Helm values:

```yaml
# values-sidekick.yaml
falcosidekick:
  enabled: true
  config:
    slack:
      webhookurl: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
      minimumpriority: "warning"
    pagerduty:
      routingkey: "YOUR_PAGERDUTY_ROUTING_KEY"
      minimumpriority: "critical"
    elasticsearch:
      hostport: "http://elasticsearch:9200"
      index: "falco"
      minimumpriority: "debug"   # send everything to SIEM
```

The `minimumpriority` field per destination is powerful — route `WARNING` and above to Slack for async review, but only page PagerDuty on `CRITICAL` or `EMERGENCY`. Everything goes to Elasticsearch for the security team's SIEM queries.

Check Falcosidekick health and the built-in dashboard:

```bash
kubectl port-forward svc/falco-falcosidekick-ui 2802:2802 -n falco
# Open http://localhost:2802 — live dashboard of alert counts by rule, priority, and destination
```

### 4. eBPF driver vs kernel module — know the tradeoffs

| | Kernel Module | eBPF Probe |
|---|---|---|
| **Kernel headers required** | Yes — must match running kernel version | No |
| **Crash risk** | Can kernel panic on bug | eBPF verifier prevents unsafe programs |
| **Performance** | Slightly lower overhead | Small overhead from verifier |
| **Managed K8s (EKS/GKE/AKS)** | Often blocked — no root node access | Works on kernels >= 4.14 |
| **Syscall coverage** | Full | Full on kernel >= 5.8 (CO-RE); limited on older |

If you're on a modern managed cluster, eBPF is the right default. If you're on bare-metal with kernel < 4.14 or need maximum coverage, the kernel module is your path.

### 5. Performance tuning

Falco adds overhead proportional to syscall volume. In most environments it's 1–3% CPU. In high-throughput environments — database nodes, compile farms — it can be meaningful.

Practical knobs:

```yaml
falco:
  syscall_event_drops:
    threshold: 0.1
    actions:
      - log
      - alert

  # Limit which syscalls Falco watches — advanced, use carefully
  base_syscalls:
    custom_set: [open, openat, read, write, execve, execveat, clone, fork]
    repair: true
```

Monitor Falco's own metrics via its embedded Prometheus endpoint — see `Prometheus.md` for how to scrape and `Alertmanager.md` for alerting on Falco health. Key metrics: `falco_events_processed_total`, `falco_syscall_event_drops_total`.

⚠️ If you see `syscall_event_drops_total` rising, Falco is falling behind the event stream and silently missing events. Raise the ring buffer size or reduce the syscall set being watched.

### 6. Kubernetes audit log integration

Falco's default driver watches syscalls. But some important events — who created a pod, who read a secret via the API server, who modified a ClusterRole — happen at the Kubernetes API level, not the syscall level.

Enable the Kubernetes audit log plugin to catch these:

```yaml
# values-audit.yaml
falco:
  plugins:
    - name: k8saudit
      library_path: libk8saudit.so
      init_config:
        maxEventBytes: 1048576
      open_params: "http://0.0.0.0:9765/k8s-audit"
  load_plugins: [k8saudit, json]
```

Configure your API server to send audit events to Falco's webhook URL. This gives you rules like:

- Create/modify privileged pods
- Access secrets from suspicious service accounts
- Attach to running containers (even without `kubectl exec`)
- Modify ClusterRoleBindings

The syscall driver and the audit log plugin are complementary — syscalls catch what happens inside containers, audit logs catch what happens at the cluster control plane.

### 7. Response actions — kill pods on critical alerts

Detection alone is reactive. For the most severe alerts, you can automate the response. Falcosidekick supports a generic webhook output that can trigger Lambda functions, Kubernetes jobs, or a custom response engine.

```yaml
falcosidekick:
  config:
    webhook:
      address: "http://response-engine:8080/event"
      minimumpriority: "critical"
```

The response engine receives the alert payload and can delete the offending pod (`kubectl delete pod`), cordon the node, or capture a forensic snapshot before killing.

⚠️ Automated pod deletion is a sharp knife. A misconfigured rule on a critical alert fires at 2am — your response engine deletes your database pod. Test in non-production first. Build in a dry-run mode. Keep the minimum priority threshold conservative — `EMERGENCY` only, initially.

---

## Worked example — Detecting a container escape attempt

**Scenario:** An attacker has compromised a web application pod and is attempting to explore the environment — looking for credentials, checking if they can read the host filesystem, ultimately trying to escape the container.

**Timeline:**

1. Attacker gains code execution via an RCE vulnerability in the web app.
2. They run `id` to check their privileges — `root` inside the container.
3. They attempt to read `/etc/shadow` — looking for password hashes.
4. They try to `cat /proc/1/maps` — checking if they can see the host's init process.
5. They find mounted secrets at `/run/secrets/kubernetes.io/serviceaccount/token` and read the token.
6. They attempt to call the Kubernetes API with the stolen token.

**What Falco sees:**

Event 3 triggers **"Read sensitive file untrusted"** — priority `WARNING`. This fires immediately and hits Slack.

Event 4 triggers a custom rule: **"Container reading host proc filesystem"** — priority `CRITICAL`. This pages PagerDuty.

Event 5 triggers **"ServiceAccount token read by untrusted process"** — priority `CRITICAL`.

**Falco output for event 5:**

```
Critical ServiceAccount token read by untrusted process
  (user=root proc=cat cmdline=cat /run/secrets/.../token
   container=web-app-6d4f9c container.image=mycompany/webapp:1.2.3
   k8s.pod=web-app-6d4f9c-xm4p2 k8s.ns=production)
```

**Falcosidekick routing:**

- Slack receives the `WARNING` on event 3 — security team sees it but no immediate page.
- PagerDuty receives `CRITICAL` on event 4 — on-call is paged.
- Elasticsearch receives all events — full timeline available for post-incident forensics.

**Response:**

The on-call engineer sees the PagerDuty alert within 2 minutes, correlates the Slack alert from 90 seconds earlier, and identifies the affected pod from the alert fields. They isolate the pod by applying a NetworkPolicy and begin forensics. The detection-to-response loop takes under 5 minutes.

This is the scenario Falco is designed for. Without it, the attacker's actions are invisible until they've already moved laterally.

---

## Common pitfalls

- **Running in alert-only mode forever.** Falco only alerts — it doesn't block. If you don't have a process for acting on alerts, you get alert fatigue fast. Build the routing and response workflow before going to production.

- **Ignoring drop events.** `syscall_event_drops_total` going up means Falco can't keep pace with syscall volume and is silently missing events. Watch this metric — see `Prometheus.md`.

- **Using the kernel module on managed Kubernetes.** Many managed clusters block kernel module loading. You'll see the pod crash-loop at startup. Use eBPF.

- **Suppressing rules with broad macros.** Adding `and not container.image.repository startswith "mycompany/"` to suppress a noisy rule turns off that detection for your entire fleet. Use the `exceptions` field with specific, narrow criteria instead.

- **Not tagging custom rules.** Falco rules support a `tags` field. Use it. Tags let you filter alerts by category in Falcosidekick and make audit trails legible.

- **Forgetting Falco is per-node, not per-cluster.** A DaemonSet means one pod per node. Cordoned or tainted nodes without a Falco pod are blind spots.

- **Treating Falco as a compliance checkbox.** Falco is only useful if someone is reading the alerts. A SIEM integration without a playbook for what to do is just expensive log storage.

- **Testing custom rules only in production.** Use a staging cluster first. Falco's `--dry-run` mode and rule validation let you catch syntax errors before deployment.

---

## Quick command reference

**Installation and management:**

```bash
# Install Falco via Helm (eBPF, with Falcosidekick)
helm install falco falcosecurity/falco \
  --namespace falco \
  --create-namespace \
  --set driver.kind=ebpf \
  --set falcosidekick.enabled=true \
  --set falcosidekick.webui.enabled=true

# Upgrade with custom rules
helm upgrade falco falcosecurity/falco \
  --namespace falco \
  -f values-custom.yaml

# Watch Falco logs in real time
kubectl logs -n falco daemonset/falco -f

# List all loaded rules
kubectl exec -n falco daemonset/falco -- falco --list

# Validate a rules file without running Falco
kubectl exec -n falco daemonset/falco -- falco --dry-run -r /etc/falco/falco_rules.yaml

# Check Falco version
kubectl exec -n falco daemonset/falco -- falco --version
```

**Rule syntax reference:**

```yaml
# Full rule structure
- rule: Rule Name
  desc: Human-readable description for the on-call engineer.
  condition: >
    spawned_process
    and container
    and proc.name = "curl"
    and not proc.pname in (my_trusted_parents)
  output: >
    Suspicious curl in container
    (user=%user.name proc=%proc.name parent=%proc.pname
     container=%container.name image=%container.image.repository)
  priority: WARNING
  tags: [network, custom]
  exceptions:
    - name: trusted_images
      fields: [container.image.repository]
      comps: [=]
      values:
        - [mycompany/debug-tools]

# Macro definition
- macro: spawned_process
  condition: evt.type in (execve, execveat) and evt.dir = <

# List definition
- list: sensitive_files
  items: [/etc/shadow, /etc/sudoers, /root/.ssh/authorized_keys]

# Append to existing macro (use sparingly)
- macro: container
  append: true
  condition: and (container.name != "my-exempt-container")
```

**Useful Falco filter fields:**

```
proc.name       — process name
proc.cmdline    — full command line
proc.pname      — parent process name
proc.pid        — process ID
user.name       — username
fd.name         — file descriptor path (files, sockets)
container.name  — container name
container.id    — container ID
container.image.repository  — image name without tag
k8s.pod.name    — Kubernetes pod name
k8s.ns.name     — Kubernetes namespace
evt.type        — syscall type (execve, open, connect, ...)
evt.dir         — direction: < (enter) or > (exit)
```

**Helm values reference:**

```yaml
# values.yaml — common production settings
driver:
  kind: ebpf          # or: module

falco:
  grpc:
    enabled: true     # enables gRPC API for programmatic access
  webServer:
    enabled: true     # enables /healthz and metrics endpoints
  metrics:
    enabled: true     # expose Prometheus metrics at /metrics
    interval: 1m

falcosidekick:
  enabled: true
  webui:
    enabled: true
  config:
    slack:
      webhookurl: ""
      minimumpriority: "warning"
    pagerduty:
      routingkey: ""
      minimumpriority: "critical"
    elasticsearch:
      hostport: ""
      index: "falco"
      minimumpriority: "debug"
    webhook:
      address: ""
      minimumpriority: "critical"
```

**Falcosidekick output configurations:**

```yaml
# Slack
slack:
  webhookurl: "https://hooks.slack.com/services/T.../B.../..."
  channel: "#security-alerts"
  username: "falco"
  minimumpriority: "warning"

# PagerDuty
pagerduty:
  routingkey: "abc123..."
  minimumpriority: "critical"

# Generic webhook (response engine, Lambda, etc.)
webhook:
  address: "https://your-response-engine/event"
  customHeaders:
    Authorization: "Bearer YOUR_TOKEN"
  minimumpriority: "critical"

# Loki (see Loki.md)
loki:
  hostport: "http://loki:3100"
  minimumpriority: "debug"
```

---

## Next steps after Day 2

- **`Trivy.md`** — Pair Falco with image scanning. Trivy catches vulnerabilities before deployment; Falco catches exploitation at runtime. You want both layers.
- **`Kubernetes.md`** — Deepen your understanding of pod security contexts, network policies, and RBAC — the configuration that Falco monitors for violations.
- **OPA/Gatekeeper** — Admission control to enforce policy at deploy time. Gatekeeper prevents you from deploying a privileged container; Falco alerts if one somehow gets through and starts behaving suspiciously.
- **Cosign/Sigstore** — Image signing and verification. Falco can alert on unsigned images running in production when combined with the audit log plugin, closing the loop between supply chain security and runtime detection.
- **`Prometheus.md`** and **`Alertmanager.md`** — Scrape Falco's metrics endpoint and alert on Falco health: drop rate, rule evaluation latency, driver connectivity. You can't trust Falco's alerts if Falco itself is unhealthy.

---

## Recommended learning resources

**YouTube channels & playlists:**
- [CNCF — Falco talks (KubeCon)](https://www.youtube.com/@cncf) — maintainer-led sessions on rule writing, kernel driver architecture, and production deployment patterns
- [Sysdig — Falco and Runtime Security](https://www.youtube.com/@Sysdig) — tutorials on detecting container escapes, cryptominers, and lateral movement with Falco rules
- [John Hammond — Runtime Security](https://www.youtube.com/@_JohnHammond) — hands-on demonstrations of detecting live attacks in containers and Kubernetes
- [The Cyber Mentor — Container Security](https://www.youtube.com/@TCMSecurityAcademy) — offensive security perspective that helps you understand what Falco is designed to detect
- [Aqua Security — Cloud Native Security](https://www.youtube.com/@AquaSecurityOpenSource) — broader supply chain and runtime security context for positioning Falco in your stack

**Official docs & blogs:**
- [Falco Official Documentation](https://falco.org/docs/) — installation, rule syntax, output channels, and driver configuration reference
- [Falco Rules Repository](https://github.com/falcosecurity/rules) — the default ruleset with detailed descriptions of each detection
- [Sysdig Blog — Falco](https://sysdig.com/blog/) — real-world detection stories, rule-writing guides, and runtime security architecture

---

**The mantra:** Falco doesn't stop the attacker at the door — it names them, timestamps them, and pages you the moment they touch something they shouldn't.
