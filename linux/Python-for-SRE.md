# Python for SRE — A 2-Day Crash Course

Python is the glue language of SRE — automation scripts, API clients, custom exporters, ChatOps bots, and incident tooling all live here.

**Prerequisite:** [`Bash.md`](Bash.md) — you should be comfortable with shell scripting before reaching for Python.

---

## Part 0 — Why Python

You already know Bash. That covers 80% of SRE scripting work. So when do you reach for Python?

**Bash breaks at complexity.** Once your script needs error handling beyond `set -e`, data structures beyond arrays, or JSON parsing without wrestling `jq` into submission, Bash becomes a liability. A 300-line Bash script is a maintenance burden. A 300-line Python script is readable.

**Go is overkill for scripts.** Go is the right choice for long-running services, high-performance exporters, and anything you ship as a binary. For a script that runs on a cron, hits an API, and sends a Slack message — Go's compile step, module setup, and verbosity are friction you don't need.

**Python has a library for everything.** AWS, GCP, Azure, Slack, PagerDuty, Prometheus, Kubernetes — every platform ships a Python SDK. You write the logic; the SDK handles auth, retries, and serialization.

The rule of thumb:

- Bash for: shell glue, pipelines, simple file ops, one-liners
- Python for: API calls, data parsing, automation workflows, custom tooling
- Go for: services, daemons, compiled binaries, performance-critical exporters

---

## Vocabulary

| Term | What it is |
|---|---|
| `venv` | Isolated Python environment per project — keeps dependencies from colliding |
| `pip` | Python package installer — `pip install requests` |
| `requests` | HTTP library — the standard way to call REST APIs |
| `subprocess` | Run shell commands from Python and capture output |
| `argparse` | Parse CLI arguments — turns your script into a proper tool |
| `logging` | Structured log output — better than `print()` for production scripts |
| `yaml` / `json` | Parse config files and API responses |
| `boto3` | AWS SDK for Python |
| `google-cloud-*` | GCP client libraries (one per service) |
| `prometheus_client` | Build custom Prometheus exporters in Python |
| `click` | Alternative to argparse — decorator-based, cleaner for complex CLIs |

---

## DAY 1 — Foundations

### 1.1 Environment Setup

Always work inside a virtual environment. Never install packages globally — you will break things.

```bash
# Create a venv
python3 -m venv .venv

# Activate it
source .venv/bin/activate

# You'll see (.venv) in your prompt
# Install packages
pip install requests pyyaml

# Freeze dependencies
pip freeze > requirements.txt

# Recreate on another machine
pip install -r requirements.txt

# Deactivate when done
deactivate
```

Keep `requirements.txt` in version control. Pin versions for production scripts (`requests==2.31.0`), use loose pins for dev tools.

---

### 1.2 HTTP Requests

```python
import requests

# Simple GET
response = requests.get("https://api.example.com/health")
response.raise_for_status()  # raises on 4xx/5xx
data = response.json()

# GET with headers and params
response = requests.get(
    "https://api.example.com/metrics",
    headers={"Authorization": "Bearer TOKEN"},
    params={"service": "payments", "window": "5m"},
    timeout=10,
)

# POST with JSON body
payload = {"text": "Deployment complete", "channel": "#ops"}
response = requests.post(
    "https://slack.com/api/chat.postMessage",
    headers={"Authorization": "Bearer xoxb-TOKEN"},
    json=payload,
    timeout=10,
)
```

Always set `timeout`. A hanging HTTP call will hang your script — and in a cron job or incident tool, that means silent failure.

---

### 1.3 Parsing JSON and YAML

```python
import json
import yaml

# JSON from a file
with open("config.json") as f:
    config = json.load(f)

# JSON from a string
raw = '{"host": "db-01", "port": 5432}'
parsed = json.loads(raw)

# Write JSON
with open("output.json", "w") as f:
    json.dump({"status": "ok"}, f, indent=2)

# YAML from a file (pip install pyyaml)
with open("alert_rules.yaml") as f:
    rules = yaml.safe_load(f)

# Always use safe_load — yaml.load() with arbitrary input is a security risk
```

---

### 1.4 subprocess — Running Shell Commands

```python
import subprocess

# Run a command, capture output
result = subprocess.run(
    ["df", "-h", "/"],
    capture_output=True,
    text=True,
    check=True,  # raises CalledProcessError on non-zero exit
)
print(result.stdout)

# Run with shell=True — use sparingly, avoid with user input
result = subprocess.run(
    "ps aux | grep nginx",
    shell=True,
    capture_output=True,
    text=True,
)

# Check exit code without raising
result = subprocess.run(["systemctl", "is-active", "nginx"], capture_output=True, text=True)
if result.returncode == 0:
    print("nginx is running")
```

⚠️ `shell=True` with unsanitized input is a command injection vulnerability. If any part of the command comes from user input or an external source, build the command as a list instead.

---

### 1.5 argparse — Building CLI Tools

```python
import argparse

parser = argparse.ArgumentParser(description="Check service health")
parser.add_argument("--host", required=True, help="Target host")
parser.add_argument("--port", type=int, default=80, help="Port (default: 80)")
parser.add_argument("--timeout", type=float, default=5.0)
parser.add_argument("--verbose", action="store_true")

args = parser.parse_args()

print(f"Checking {args.host}:{args.port} with timeout {args.timeout}s")
```

Run `python script.py --help` and argparse generates usage docs automatically. This alone is worth using argparse over manual `sys.argv` parsing.

---

### 1.6 Logging

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

logger.info("Starting health check for %s", host)
logger.warning("Response time high: %.2fs", elapsed)
logger.error("Health check failed: %s", error)
```

Use `logging` instead of `print()` in any script that runs unattended. You get timestamps, levels, and the ability to redirect to a file without changing code.

---

### 1.7 Reading and Writing Files

```python
# Read entire file
with open("/var/log/app.log") as f:
    content = f.read()

# Read line by line — memory-efficient for large files
with open("/var/log/app.log") as f:
    for line in f:
        if "ERROR" in line:
            print(line.strip())

# Write
with open("/tmp/report.txt", "w") as f:
    f.write("Disk usage report\n")

# Append
with open("/var/log/custom.log", "a") as f:
    f.write(f"{timestamp} remediation triggered\n")
```

Always use `with` — it closes the file handle even if an exception occurs.

---

### 1.8 Error Handling

```python
import requests
import sys

def check_endpoint(url: str) -> dict:
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.Timeout:
        logger.error("Timeout reaching %s", url)
        sys.exit(1)
    except requests.exceptions.HTTPError as e:
        logger.error("HTTP error %s: %s", e.response.status_code, url)
        raise
    except requests.exceptions.ConnectionError:
        logger.error("Cannot connect to %s", url)
        sys.exit(2)
```

Be specific with exception types. Catching bare `except Exception` hides bugs. Exit with non-zero codes — cron jobs and monitoring check the exit code, not your log file.

---

## DAY 2 — SRE Tooling

### 2.1 Custom Prometheus Exporter

```python
import time
import subprocess
from prometheus_client import start_http_server, Gauge, Counter

# pip install prometheus_client

DISK_USAGE = Gauge("node_disk_usage_percent", "Disk usage percent", ["mountpoint"])
HEALTH_CHECKS_TOTAL = Counter("health_checks_total", "Total health checks", ["status"])

def collect_disk_metrics():
    result = subprocess.run(
        ["df", "--output=target,pcent"],
        capture_output=True,
        text=True,
    )
    for line in result.stdout.strip().splitlines()[1:]:
        mountpoint, percent = line.split()
        DISK_USAGE.labels(mountpoint=mountpoint).set(float(percent.rstrip("%")))

if __name__ == "__main__":
    start_http_server(9100)
    while True:
        collect_disk_metrics()
        time.sleep(15)
```

Hit `http://localhost:9100/metrics` and you have a Prometheus-compatible endpoint. Point your scrape config at it and the metrics appear in Grafana within minutes.

---

### 2.2 boto3 — AWS Automation

```python
import boto3

# Credentials from environment variables or ~/.aws/credentials
ec2 = boto3.client("ec2", region_name="us-east-1")

# List running instances
response = ec2.describe_instances(
    Filters=[{"Name": "instance-state-name", "Values": ["running"]}]
)
for reservation in response["Reservations"]:
    for instance in reservation["Instances"]:
        print(instance["InstanceId"], instance.get("Tags", []))

# S3 operations
s3 = boto3.client("s3")
s3.upload_file("/tmp/report.json", "my-bucket", "reports/2026-05-31.json")

# SSM Parameter Store — the right way to read secrets
ssm = boto3.client("ssm")
param = ssm.get_parameter(Name="/prod/db/password", WithDecryption=True)
password = param["Parameter"]["Value"]
```

⚠️ Never hardcode AWS credentials in scripts. Use IAM roles on EC2/ECS/Lambda, and environment variables or `~/.aws/credentials` locally.

---

### 2.3 Slack and PagerDuty Integration

```python
import requests
import os

SLACK_TOKEN = os.environ["SLACK_BOT_TOKEN"]
PAGERDUTY_KEY = os.environ["PAGERDUTY_ROUTING_KEY"]

def send_slack(channel: str, message: str) -> None:
    requests.post(
        "https://slack.com/api/chat.postMessage",
        headers={"Authorization": f"Bearer {SLACK_TOKEN}"},
        json={"channel": channel, "text": message},
        timeout=10,
    ).raise_for_status()

def trigger_pagerduty(summary: str, source: str, severity: str = "critical") -> None:
    payload = {
        "routing_key": PAGERDUTY_KEY,
        "event_action": "trigger",
        "payload": {
            "summary": summary,
            "source": source,
            "severity": severity,
        },
    }
    requests.post(
        "https://events.pagerduty.com/v2/enqueue",
        json=payload,
        timeout=10,
    ).raise_for_status()
```

Read tokens from environment variables. Never from config files checked into git. If you accidentally commit a secret, rotate it immediately — do not just delete the line and assume you're safe.

---

### 2.4 Health Checker

```python
import requests
import sys
import logging
from dataclasses import dataclass
from typing import List

logger = logging.getLogger(__name__)

@dataclass
class CheckResult:
    url: str
    healthy: bool
    status_code: int | None
    error: str | None

def check(url: str, timeout: float = 5.0) -> CheckResult:
    try:
        r = requests.get(url, timeout=timeout)
        return CheckResult(url=url, healthy=r.status_code < 500, status_code=r.status_code, error=None)
    except Exception as e:
        return CheckResult(url=url, healthy=False, status_code=None, error=str(e))

def run_checks(urls: List[str]) -> List[CheckResult]:
    return [check(url) for url in urls]

if __name__ == "__main__":
    targets = ["https://api.example.com/health", "https://admin.example.com/ping"]
    results = run_checks(targets)
    failed = [r for r in results if not r.healthy]
    for r in failed:
        logger.error("UNHEALTHY %s — %s", r.url, r.error or r.status_code)
    sys.exit(1 if failed else 0)
```

---

### 2.5 Testing with pytest

```bash
pip install pytest
```

```python
# test_health.py
from health_checker import check
from unittest.mock import patch, MagicMock

def test_healthy_endpoint():
    mock_response = MagicMock()
    mock_response.status_code = 200
    with patch("requests.get", return_value=mock_response):
        result = check("https://example.com/health")
    assert result.healthy is True
    assert result.status_code == 200

def test_connection_error():
    with patch("requests.get", side_effect=ConnectionError("refused")):
        result = check("https://dead-service.internal")
    assert result.healthy is False
    assert "refused" in result.error
```

```bash
pytest -v
pytest --tb=short        # shorter tracebacks
pytest -k "test_healthy" # run matching tests only
```

Test your scripts. A remediation script that fires incorrectly at 3am is worse than no remediation script at all.

---

### 2.6 Packaging

For scripts shared across a team:

```
my-tool/
├── my_tool/
│   ├── __init__.py
│   ├── cli.py
│   └── checks.py
├── tests/
│   └── test_checks.py
├── requirements.txt
└── pyproject.toml
```

```toml
# pyproject.toml
[project]
name = "my-tool"
version = "0.1.0"
dependencies = ["requests", "click", "pyyaml"]

[project.scripts]
my-tool = "my_tool.cli:main"
```

```bash
pip install -e .  # install in editable mode during dev
my-tool --help    # now available as a command
```

---

### 2.7 Python vs Bash vs Go — Decision Tree

```
Is the task a shell pipeline or file operation with no parsing?
  → Bash

Does the task need any of:
  - JSON/YAML parsing
  - HTTP API calls
  - AWS/GCP/Slack SDKs
  - Structured error handling
  - Unit tests
    → Python

Does the task need any of:
  - A long-running daemon
  - High concurrency
  - A compiled binary with no runtime dependency
  - High-throughput request handling
    → Go
```

When in doubt, start with Python. Rewrite in Go only when you hit a concrete performance or distribution requirement — not because Go feels more "serious."

---

## Worked Example — Auto-Remediation Script

Scenario: detect high disk usage on a host, clean old log files, alert Slack.

```python
#!/usr/bin/env python3
"""
disk_remediation.py — detect high disk usage, clean logs, alert Slack.

Usage:
    python disk_remediation.py --threshold 85 --log-dir /var/log/app --channel "#ops-alerts"
"""

import argparse
import logging
import os
import subprocess
import sys
import time
from pathlib import Path

import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

SLACK_TOKEN = os.environ.get("SLACK_BOT_TOKEN")


def get_disk_usage_percent(path: str) -> float:
    result = subprocess.run(
        ["df", "--output=pcent", path],
        capture_output=True,
        text=True,
        check=True,
    )
    lines = result.stdout.strip().splitlines()
    return float(lines[-1].strip().rstrip("%"))


def find_old_logs(log_dir: str, days_old: int = 7) -> list[Path]:
    cutoff = time.time() - (days_old * 86400)
    log_path = Path(log_dir)
    return [
        f for f in log_path.glob("*.log*")
        if f.stat().st_mtime < cutoff and f.is_file()
    ]


def delete_files(files: list[Path]) -> int:
    freed_bytes = 0
    for f in files:
        size = f.stat().st_size
        f.unlink()
        freed_bytes += size
        logger.info("Deleted %s (%d bytes)", f, size)
    return freed_bytes


def send_slack_alert(channel: str, message: str) -> None:
    if not SLACK_TOKEN:
        logger.warning("SLACK_BOT_TOKEN not set — skipping alert")
        return
    response = requests.post(
        "https://slack.com/api/chat.postMessage",
        headers={"Authorization": f"Bearer {SLACK_TOKEN}"},
        json={"channel": channel, "text": message},
        timeout=10,
    )
    response.raise_for_status()
    logger.info("Slack alert sent to %s", channel)


def main() -> int:
    parser = argparse.ArgumentParser(description="Disk remediation script")
    parser.add_argument("--threshold", type=float, default=85.0, help="Disk usage %% threshold")
    parser.add_argument("--log-dir", default="/var/log/app", help="Directory to clean")
    parser.add_argument("--days-old", type=int, default=7, help="Delete logs older than N days")
    parser.add_argument("--channel", default="#ops-alerts", help="Slack channel")
    parser.add_argument("--dry-run", action="store_true", help="Report without deleting")
    args = parser.parse_args()

    hostname = os.uname().nodename

    try:
        usage = get_disk_usage_percent("/")
    except subprocess.CalledProcessError as e:
        logger.error("Failed to check disk usage: %s", e)
        return 1

    logger.info("Disk usage on %s: %.1f%%", hostname, usage)

    if usage < args.threshold:
        logger.info("Usage below threshold (%.1f%%) — no action needed", args.threshold)
        return 0

    logger.warning(
        "Disk usage %.1f%% exceeds threshold %.1f%% — scanning for old logs",
        usage, args.threshold,
    )

    old_logs = find_old_logs(args.log_dir, args.days_old)
    logger.info("Found %d log files older than %d days", len(old_logs), args.days_old)

    if not old_logs:
        msg = f"*{hostname}* disk at {usage:.1f}% — no old logs found to clean. Manual intervention needed."
        send_slack_alert(args.channel, msg)
        return 2

    if args.dry_run:
        logger.info("Dry run — would delete %d files", len(old_logs))
        for f in old_logs:
            logger.info("  Would delete: %s", f)
        return 0

    freed = delete_files(old_logs)
    freed_mb = freed / (1024 * 1024)
    new_usage = get_disk_usage_percent("/")

    msg = (
        f"*Disk remediation complete on {hostname}*\n"
        f"Before: {usage:.1f}% | After: {new_usage:.1f}%\n"
        f"Deleted {len(old_logs)} files, freed {freed_mb:.1f} MB"
    )
    send_slack_alert(args.channel, msg)
    logger.info("Remediation complete. Freed %.1fMB. Disk now at %.1f%%", freed_mb, new_usage)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Run it: `python disk_remediation.py --threshold 80 --dry-run`

Add to cron:
```
*/15 * * * * /opt/tools/.venv/bin/python /opt/tools/disk_remediation.py >> /var/log/disk_remediation.log 2>&1
```

---

## Pitfalls

**Not using a venv.** You install a package globally, it conflicts with something else, the wrong version loads, and you spend an hour debugging an environment problem instead of your actual problem.

**Missing timeouts on HTTP calls.** `requests.get(url)` with no timeout will wait forever. One slow downstream service hangs your script — and if it's running in a pipeline, it blocks everything downstream.

**`shell=True` with external input.** If any part of a `shell=True` command comes from user input, an API response, or a file — you have a command injection vulnerability. Build the command as a list.

**Catching bare `Exception`.** `except Exception: pass` swallows every error including `KeyboardInterrupt`. Be specific with exception types.

**`print()` instead of `logging`.** In cron jobs and systemd services, `print()` output often goes nowhere. Use `logging` with a configured handler from the start.

**Not exiting non-zero on failure.** If your script exits 0 on failure, your monitoring and cron alerting won't catch it.

**Hardcoded credentials.** API keys in scripts get committed to git. Use `os.environ`. If you accidentally commit a secret, rotate it immediately — do not just delete the line.

**Loading large files entirely into memory.** `f.read()` on a 10GB log file will exhaust memory. Iterate line by line with `for line in f`.

---

## Quick Reference

```python
# HTTP GET with error handling
import requests
r = requests.get(url, headers=headers, timeout=10)
r.raise_for_status()
data = r.json()

# Run shell command
import subprocess
result = subprocess.run(["df", "-h"], capture_output=True, text=True, check=True)
output = result.stdout

# Parse YAML config
import yaml
with open("config.yaml") as f:
    cfg = yaml.safe_load(f)

# Environment variable — required
import os
token = os.environ["MY_TOKEN"]           # raises KeyError if missing
token = os.environ.get("MY_TOKEN", "")  # fallback to empty string

# Logging setup
import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# argparse minimal
import argparse
p = argparse.ArgumentParser()
p.add_argument("--host", required=True)
p.add_argument("--port", type=int, default=8080)
args = p.parse_args()

# AWS with boto3
import boto3
s3 = boto3.client("s3", region_name="us-east-1")
s3.download_file("bucket", "key", "/tmp/local")

# Prometheus gauge
from prometheus_client import Gauge, start_http_server
MY_GAUGE = Gauge("my_metric", "Description", ["label"])
MY_GAUGE.labels(label="value").set(42)
start_http_server(9100)

# Path operations
from pathlib import Path
p = Path("/var/log/app")
for f in p.glob("*.log"):
    print(f.name, f.stat().st_size)

# Write JSON file
with open("/tmp/output.json", "w") as f:
    import json
    json.dump(data, f, indent=2)
```

---

## Next Steps

- [`Bash.md`](Bash.md) — reinforce the foundation Python builds on top of
- [`Prometheus.md`](../Prometheus.md) — understand what your custom exporters are feeding
- [`AWS.md`](../AWS.md) — go deeper with boto3 and IAM patterns
- [`Kubernetes.md`](../Kubernetes.md) — automate cluster operations with the Python k8s client

---

## The Mantra

**Write it in Bash until it breaks, then write it in Python until it scales, then write it in Go when it ships.**
