# Stage 5: Runtime Security

**Goal:** Deploy Falco to detect suspicious runtime behaviour in the SecureBank cluster — shell access, unexpected network connections, sensitive file reads, and privilege escalation attempts.

**Prerequisites:** Stage 4 complete. A Kubernetes cluster. Helm installed.

---

## 1. Theory (What & Why)

### Why runtime security?

Stages 1-4 secure the supply chain: scanning, policies, and signing happen before deployment. But what about threats that emerge at runtime?

- An attacker exploits a zero-day in Go's HTTP library and gets a shell inside the container
- A compromised dependency exfiltrates data to an external server
- A misconfigured RBAC rule allows a service account to read secrets from other namespaces
- A developer accidentally exposes a debug endpoint that dumps environment variables

Static scanning cannot catch these. You need runtime detection — watching what processes, files, and network connections actually happen inside running containers.

### What is Falco?

Falco is a runtime security tool that watches system calls (syscalls) in real time. Every time a process opens a file, spawns a child process, or makes a network connection, the kernel generates a syscall. Falco intercepts these and matches them against rules:

```text
Container                    Kernel                     Falco
  |                            |                          |
  | open("/etc/shadow")        |                          |
  | ----------------------->   | syscall: openat          |
  |                            | -----------------------> |
  |                            |                          | MATCH: "sensitive file read"
  |                            |                          | ALERT -> Slack/PagerDuty
```

### Falco rules

A Falco rule has three parts:
- **condition** — syscall pattern to match (process name, file path, network destination)
- **output** — what to log when the rule triggers
- **priority** — EMERGENCY, ALERT, CRITICAL, ERROR, WARNING, NOTICE, INFO, DEBUG

### SecureBank custom rules

The project ships with four Falco rules in `policies/falco/securebank-rules.yaml`:

| Rule | Detects | Priority |
|------|---------|----------|
| **Unexpected outbound connection** | API connects to non-internal IP | WARNING |
| **Shell spawned** | bash/sh/zsh runs inside the container | CRITICAL |
| **Sensitive file access** | /etc/shadow, .pem, .key files read | CRITICAL |
| **Environment variables read** | /proc/self/environ accessed (may contain secrets) | NOTICE |

In a banking context, a shell spawning inside a production API container is a near-certain indicator of compromise. It should page someone immediately.

---

## 2. Hands-On: Deploy Falco for SecureBank

### 2.1 Install Falco with Helm

```bash
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm repo update

helm install falco falcosecurity/falco \
  --namespace falco --create-namespace \
  --set falcosidekick.enabled=true \
  --set falcosidekick.config.slack.webhookurl="https://hooks.slack.com/..." \
  --set-file customRules."securebank-rules\.yaml"=policies/falco/securebank-rules.yaml
```

### 2.2 Verify Falco is running

```bash
kubectl get pods -n falco
# falco-xxxxx                    2/2   Running
# falco-falcosidekick-xxxxx     1/1   Running
```

### 2.3 Trigger a detection — shell in container

```bash
# Exec into the SecureBank container (simulating attacker)
kubectl exec -it deploy/transaction-api -n securebank -- sh
```

Check Falco logs:

```bash
kubectl logs -n falco -l app.kubernetes.io/name=falco --tail 20 | grep "Shell spawned"
# CRITICAL: Shell spawned in SecureBank container (user=root command=sh container=securebank)
```

### 2.4 Trigger a detection — sensitive file read

Inside the exec session:

```bash
cat /etc/passwd
```

Falco logs:

```text
CRITICAL: Sensitive file accessed in SecureBank (file=/etc/passwd command=cat container=securebank)
```

### 2.5 Trigger a detection — unexpected outbound connection

```bash
# Inside the container, try connecting to an external IP
wget -q -O- http://ifconfig.me
```

Falco logs:

```text
WARNING: Unexpected outbound connection from SecureBank (connection=X.X.X.X:80 container=securebank)
```

### 2.6 View alerts in Falcosidekick

Falcosidekick forwards alerts to Slack, PagerDuty, Elasticsearch, or webhooks. Check the sidekick dashboard:

```bash
kubectl port-forward svc/falco-falcosidekick-ui -n falco 2802:2802
# Open http://localhost:2802
```

---

## 3. Key patterns

### Response automation

Falcosidekick can trigger automated responses:
- **Kill the pod** — Falco detects shell, sidekick deletes the pod, Kubernetes recreates it clean
- **Quarantine** — Apply a NetworkPolicy that blocks all egress from the compromised pod
- **Page oncall** — Send to PagerDuty with severity and context

### Tuning rules

Default Falco rules generate noise. Tune for your environment:

```yaml
- rule: Unexpected outbound connection from transaction-api
  condition: >
    evt.type = connect and
    container.name = "securebank" and
    not fd.sip in ("10.0.0.0/8", "172.16.0.0/12")
  # Add exceptions for known external services:
  # not fd.sip in ("10.0.0.0/8", "172.16.0.0/12", "203.0.113.50")
```

### BFSI context

RBI's Cyber Security Framework requires real-time monitoring of critical systems. Falco provides exactly this — runtime detection with sub-second alert latency. During an audit:

"Show me your runtime threat detection for production banking APIs." — Falco dashboards + Falcosidekick logs provide the evidence.

---

## 4. Common mistakes

- **Not tuning rules:** Default rules generate hundreds of alerts. Tune to your workloads or you will ignore real threats.
- **Running Falco only in audit mode:** Detection without alerting is useless. Connect Falcosidekick to Slack/PagerDuty.
- **Ignoring NOTICE-level alerts:** NOTICE alerts (like environment variable reads) build context for incident investigation.
- **No response playbook:** When Falco fires a CRITICAL, what happens? Define the response before you need it.

---

## Exercises

1. [Exercise 1 — Trigger and detect](exercises/01-trigger-detect.md)
2. [Exercise 2 — Write a custom rule](exercises/02-custom-rule.md)

**Next stage:** [06-secrets-management](../06-secrets-management/README.md) — dynamic secrets with Vault.
