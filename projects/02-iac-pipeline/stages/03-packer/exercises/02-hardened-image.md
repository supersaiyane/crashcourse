# Exercise 2: Hardened Image — CIS Hardening and Cleanup

**Goal:** Extend the base image from Exercise 1 with CIS-inspired security hardening: disable root SSH, configure audit logging, set file permissions, remove unnecessary packages, and clean up build artefacts. Verify the hardening rules in the final image.

**Time:** 45 minutes

**Prerequisites:** Exercise 1 complete. Docker running.

---

## Step 1: Create the Hardening Script

Create `finstack/packer/scripts/harden.sh`:

```bash
#!/bin/bash
set -euo pipefail
# CIS-inspired hardening script for FinStack base images
# Adapted for Amazon Linux 2 — covers the high-impact controls

echo "=== Starting CIS hardening ==="

# --- 1. SSH hardening ---
SSHD_CONFIG="/etc/ssh/sshd_config"
if [ -f "$SSHD_CONFIG" ]; then
  echo "Hardening SSH configuration..."
  sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' "$SSHD_CONFIG"
  sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' "$SSHD_CONFIG"
  sed -i 's/^#*X11Forwarding.*/X11Forwarding no/' "$SSHD_CONFIG"
  sed -i 's/^#*MaxAuthTries.*/MaxAuthTries 3/' "$SSHD_CONFIG"
  echo "ClientAliveInterval 300" >> "$SSHD_CONFIG"
  echo "ClientAliveCountMax 2" >> "$SSHD_CONFIG"
  echo "SSH hardened."
else
  echo "sshd_config not found — installing openssh-server..."
  yum install -y openssh-server
  # Re-run SSH hardening after install
  sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
  sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  sed -i 's/^#*X11Forwarding.*/X11Forwarding no/' /etc/ssh/sshd_config
  sed -i 's/^#*MaxAuthTries.*/MaxAuthTries 3/' /etc/ssh/sshd_config
fi

# --- 2. File permissions ---
echo "Setting file permissions..."
chmod 600 /etc/ssh/sshd_config 2>/dev/null || true
chmod 644 /etc/passwd
chmod 644 /etc/group
chmod 000 /etc/shadow 2>/dev/null || true
chmod 000 /etc/gshadow 2>/dev/null || true

# --- 3. Login banner ---
echo "Setting login banner..."
cat > /etc/issue.net << 'BANNER'
*******************************************************************
*  AUTHORISED ACCESS ONLY                                         *
*  This system is the property of FinStack.                       *
*  Unauthorised access is prohibited and will be prosecuted.      *
*  All activity is monitored and logged.                          *
*******************************************************************
BANNER

# --- 4. Disable unnecessary services ---
echo "Disabling unnecessary services..."
for svc in avahi-daemon cups bluetooth; do
  systemctl disable "$svc" 2>/dev/null || true
done

# --- 5. Audit logging directory ---
echo "Configuring audit logging..."
mkdir -p /var/log/audit
touch /var/log/audit/audit.log
chmod 600 /var/log/audit/audit.log

echo "=== CIS hardening complete ==="
```

Make it executable:

```bash
chmod +x finstack/packer/scripts/harden.sh
```

---

## Step 2: Create the Cleanup Script

Create `finstack/packer/scripts/cleanup.sh`:

```bash
#!/bin/bash
set -euo pipefail
# Cleanup script — removes build-time artefacts from the final image
# This is MANDATORY for BFSI images — never ship temp files or credentials

echo "=== Starting cleanup ==="

# Remove SSH host keys — regenerated on first boot
rm -f /etc/ssh/ssh_host_* 2>/dev/null || true

# Clear shell history for all users
rm -f /root/.bash_history
rm -f /home/*/.bash_history 2>/dev/null || true
history -c 2>/dev/null || true

# Clear temp files
rm -rf /tmp/*
rm -rf /var/tmp/*

# Clear package manager cache
yum clean all
rm -rf /var/cache/yum

# Clear log files (they'll be recreated on boot)
truncate -s 0 /var/log/messages 2>/dev/null || true
truncate -s 0 /var/log/secure 2>/dev/null || true
truncate -s 0 /var/log/yum.log 2>/dev/null || true

# Remove any cloud-init artefacts
rm -rf /var/lib/cloud/instances/*

echo "=== Cleanup complete ==="
```

Make it executable:

```bash
chmod +x finstack/packer/scripts/cleanup.sh
```

---

## Step 3: Write the Hardened Image Template

Create `finstack/packer/finstack-hardened.pkr.hcl`:

```hcl
# finstack-hardened.pkr.hcl — Hardened FinStack image with CIS controls

packer {
  required_plugins {
    docker = {
      version = ">= 1.0.0"
      source  = "github.com/hashicorp/docker"
    }
  }
}

locals {
  timestamp  = formatdate("YYYYMMDD-HHmmss", timestamp())
  image_name = "${var.project}-hardened-${var.environment}-${local.timestamp}"
}

# Source: start from the base image built in Exercise 1
# In production, you'd reference the base AMI ID from the manifest
source "docker" "hardened" {
  image  = "amazonlinux:2"
  commit = true
  changes = [
    "ENTRYPOINT [\"/bin/bash\"]",
    "LABEL project=${var.project}",
    "LABEL environment=${var.environment}",
    "LABEL image_type=hardened",
    "LABEL build_time=${local.timestamp}"
  ]
}

build {
  name    = "finstack-hardened"
  sources = ["source.docker.hardened"]

  # Phase 1: Base packages (same as Exercise 1)
  provisioner "shell" {
    inline = [
      "yum update -y",
      "yum install -y ${join(" ", var.base_packages)}",
    ]
  }

  # Phase 2: Create FinStack directories and config
  provisioner "shell" {
    inline = [
      "mkdir -p /etc/finstack",
      "mkdir -p /var/log/finstack",
      "mkdir -p /opt/finstack/bin"
    ]
  }

  provisioner "file" {
    source      = "configs/finstack.conf"
    destination = "/etc/finstack/finstack.conf"
  }

  # Phase 3: CIS hardening
  provisioner "shell" {
    script = "scripts/harden.sh"
  }

  # Phase 4: Cleanup (MUST be last provisioner)
  provisioner "shell" {
    script = "scripts/cleanup.sh"
  }

  # Output manifest
  post-processor "manifest" {
    output     = "manifest-hardened.json"
    strip_path = true
  }
}
```

---

## Step 4: Build the Hardened Image

```bash
cd finstack/packer
packer validate -only='*.hardened' .
packer build -only='docker.hardened' .
```

The `-only` flag builds only the hardened source, skipping the base if both templates are in the same directory.

Expected output (key lines):

```
==> finstack-hardened.docker.hardened: Provisioning with shell script...
    finstack-hardened.docker.hardened: === Starting CIS hardening ===
    finstack-hardened.docker.hardened: Hardening SSH configuration...
    finstack-hardened.docker.hardened: Setting file permissions...
    finstack-hardened.docker.hardened: Setting login banner...
    finstack-hardened.docker.hardened: === CIS hardening complete ===
==> finstack-hardened.docker.hardened: Provisioning with shell script...
    finstack-hardened.docker.hardened: === Starting cleanup ===
    finstack-hardened.docker.hardened: === Cleanup complete ===
==> finstack-hardened.docker.hardened: Committing the container
Build 'finstack-hardened.docker.hardened' finished after X minutes.
```

---

## Step 5: Verify Hardening

```bash
IMAGE_ID=$(jq -r '.builds[-1].artifact_id' manifest-hardened.json)
docker run --rm $IMAGE_ID cat /etc/ssh/sshd_config | grep -E "PermitRootLogin|PasswordAuthentication|X11Forwarding|MaxAuthTries"
```

Expected:

```
PermitRootLogin no
PasswordAuthentication no
X11Forwarding no
MaxAuthTries 3
```

---

## Step 6: Verify the Login Banner

```bash
docker run --rm $IMAGE_ID cat /etc/issue.net
```

Expected:

```
*******************************************************************
*  AUTHORISED ACCESS ONLY                                         *
*  This system is the property of FinStack.                       *
*  Unauthorised access is prohibited and will be prosecuted.      *
*  All activity is monitored and logged.                          *
*******************************************************************
```

---

## Step 7: Verify Cleanup

```bash
# No shell history
docker run --rm $IMAGE_ID bash -c "cat /root/.bash_history 2>&1 || echo 'No history — good'"

# No package cache
docker run --rm $IMAGE_ID bash -c "ls /var/cache/yum 2>&1 || echo 'Cache cleaned — good'"

# No SSH host keys (they should be regenerated on first boot)
docker run --rm $IMAGE_ID bash -c "ls /etc/ssh/ssh_host_* 2>&1 || echo 'No host keys — good'"
```

All three checks should show the "good" message.

---

## Step 8: Build with Prod Variables

Create `prod.pkrvars.hcl`:

```hcl
environment   = "prod"
base_packages = ["python3", "jq", "curl", "tar", "gzip", "aws-cli", "audit"]
```

Build with prod variables:

```bash
packer build -var-file=prod.pkrvars.hcl -only='docker.hardened' .
```

The prod image includes additional packages (aws-cli for S3 access, audit for auditd).

---

## Step 9: Compare Image Sizes

```bash
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | head -5
```

The hardened image should be slightly larger than the base (hardening + extra packages) but the cleanup step offsets some of that by removing caches.

---

## Step 10: Clean Up

```bash
docker rmi $(jq -r '.builds[].artifact_id' manifest-hardened.json) 2>/dev/null
rm -f manifest-hardened.json manifest.json
```

---

## You're Done When

- [x] The hardened image builds successfully with both harden and cleanup provisioners
- [x] `PermitRootLogin no` is confirmed in the SSH config
- [x] `PasswordAuthentication no` is confirmed
- [x] The login banner is present at `/etc/issue.net`
- [x] No shell history, package cache, or SSH host keys exist in the final image
- [x] Building with `-var-file=prod.pkrvars.hcl` adds prod-specific packages
- [x] You can explain why the cleanup provisioner must always run last

## Common Mistakes

- **Running cleanup before hardening** — the cleanup script removes temp files that hardening may need; always run cleanup last
- **Forgetting to remove SSH host keys** — if host keys are baked into the image, every instance has the same keys — a serious security vulnerability
- **Leaving shell history in the image** — build-time commands may contain secrets or internal URLs
- **Not testing hardening rules** — always verify with `grep` or `cat` inside the final image; don't assume the script worked
- **Hardcoding secrets in the hardening script** — the script itself is committed to Git; use variables or Vault for any sensitive values
- **Skipping the banner** — BFSI compliance often requires a legal warning banner on all systems; auditors check for it
