# Stage 3: Packer — Golden AMIs and Immutable Infrastructure

**Goal:** Build hardened, reproducible machine images (AMIs) with Packer's HCL2 templates — starting with a basic Amazon Linux 2 image, then layering CIS hardening, FinStack application dependencies, and observability agents — so that every EC2 instance or ASG node launches from a known-good, pre-baked image instead of running provisioning scripts at boot time.

**Prerequisites:** Stage 1 (Terraform basics) and Stage 2 (Terragrunt) complete. Docker running for the Docker builder exercises. Basic shell scripting. No AWS account required — we use the Docker builder locally and explain the AWS EBS builder pattern for production.

**Sample App:** FinStack — a BFSI payment platform. You will build golden AMIs that FinStack compute nodes boot from, with all dependencies pre-installed and security hardening applied at image build time.

> For the full crash course on Packer, see [`Packer.md`](../../../../iac/Packer.md).

---

## 1. Theory

### 1.1 Why Packer? The Immutable Infrastructure Problem

There are two approaches to configuring servers:

**Mutable infrastructure (the old way):** Launch a bare OS, then SSH in or run a config management tool (Ansible, Chef, Puppet) to install packages, configure services, and harden the OS. Every server is a snowflake — slightly different depending on when it was provisioned, which package versions were available, and whether the provisioning script ran to completion.

**Immutable infrastructure (the Packer way):** Build a machine image with everything pre-installed. Launch instances from that image. Never SSH in to change them. If you need a change, build a new image and replace the instances.

| Problem | Mutable (config at boot) | Immutable (pre-baked image) |
|---------|-------------------------|---------------------------|
| **Boot time** | 5–15 min (download packages, compile, configure) | 30–60 sec (image already has everything) |
| **Consistency** | Depends on external repos being available at boot | Identical every time — the image is the artefact |
| **Debugging** | "Works on this server but not that one" | Every instance is identical — reproduce locally |
| **Security** | Patch window: SSH in, run update, pray | Build new image with patches, roll out, destroy old instances |
| **Rollback** | Re-run old provisioning scripts (do they still work?) | Launch previous image version — instant |
| **Audit** | "What's installed on server X?" — SSH and check | Image build log in CI — complete manifest |

In BFSI, immutable infrastructure is particularly valuable. When the auditor asks "what software is running on your production servers?" you point to a Packer build log and the exact image ID deployed by Terraform — not a hope that Ansible ran the same playbook on every node.

**The one idea that unlocks Packer:** Packer is a **machine image compiler**. You write a template that describes the source OS, provisioning steps, and output format. Packer launches a temporary instance, runs your provisioning, snapshots the result into an image, and destroys the temporary instance. The image is your deployable artefact — like a Docker image, but for full VMs.

**Mental model:** Think of Packer like a bakery. You give it a recipe (template), raw ingredients (base OS + packages), and it produces a finished loaf (AMI). You never modify the loaf after baking — if you want a different recipe, you bake a new one. The old loaves stay on the shelf in case you need to roll back.

---

### 1.2 Architecture — How Packer Works

```
┌──────────────────────────────────────────────────────────────────┐
│                        YOUR LAPTOP / CI                          │
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐                           │
│  │  .pkr.hcl    │────▶│  packer CLI  │                           │
│  │  template    │     │              │                           │
│  └──────────────┘     └──────┬───────┘                           │
│                              │                                   │
└──────────────────────────────┼───────────────────────────────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
                ▼              ▼              ▼
         ┌──────────┐  ┌──────────┐  ┌──────────────┐
         │  Builder  │  │  Builder  │  │   Builder    │
         │  (Docker) │  │  (AWS    │  │   (GCP,      │
         │           │  │   EBS)   │  │    Azure)    │
         └─────┬─────┘  └─────┬────┘  └──────┬──────┘
               │              │               │
               ▼              ▼               ▼
         ┌──────────┐  ┌──────────┐  ┌──────────────┐
         │ Docker   │  │   AMI    │  │  GCP Image / │
         │ Image    │  │          │  │  Azure VHD   │
         └──────────┘  └──────────┘  └──────────────┘
```

**The lifecycle — three phases:**

```
packer init       →  Download plugins (builders, provisioners)
packer validate   →  Check template syntax and references
packer build      →  Launch temp instance → provision → snapshot → destroy temp
```

**Inside `packer build`:**

```
1. Launch a temporary compute instance (EC2, Docker container, VM)
2. Wait for it to become reachable (SSH or WinRM)
3. Run provisioners in order:
   a. shell scripts
   b. file uploads
   c. Ansible playbooks
   d. Chef / Puppet / Salt
4. Snapshot the instance into an image (AMI, Docker image, etc.)
5. Destroy the temporary instance
6. Output the image ID
```

---

### 1.3 Core Concepts

#### HCL2 Templates

Packer migrated from JSON to HCL2 (the same language as Terraform). HCL2 templates use the `.pkr.hcl` extension:

```hcl
# finstack-base.pkr.hcl
packer {
  required_plugins {
    docker = {
      version = ">= 1.0.0"
      source  = "github.com/hashicorp/docker"
    }
  }
}
```

**Why HCL2 over JSON:**
- Variables with types and defaults
- Locals for computed values
- Functions (templatefile, timestamp, upper, etc.)
- Comments
- Multi-line strings
- Conditional expressions

#### Sources (Builders)

A source defines where and how to launch the temporary instance:

```hcl
# Docker builder — runs locally, no cloud account needed
source "docker" "base" {
  image  = "amazonlinux:2"
  commit = true
  changes = [
    "ENTRYPOINT [\"/bin/bash\"]"
  ]
}

# AWS EBS builder — launches a real EC2 instance, creates an AMI
source "amazon-ebs" "base" {
  ami_name      = "finstack-base-${local.timestamp}"
  instance_type = "t3.micro"
  region        = "ap-south-1"
  source_ami_filter {
    filters = {
      name                = "amzn2-ami-hvm-*-x86_64-gp2"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    owners      = ["amazon"]
    most_recent = true
  }
  ssh_username = "ec2-user"

  tags = {
    Name        = "finstack-base"
    Environment = var.environment
    BuildTime   = local.timestamp
    ManagedBy   = "packer"
  }
}
```

**Source naming:** `source "<builder_type>" "<name>"`. You reference it in the build block as `source.<type>.<name>`.

#### Build Block

The build block ties sources to provisioners:

```hcl
build {
  name    = "finstack-base"
  sources = ["source.docker.base"]

  # Provisioners run in order
  provisioner "shell" {
    inline = [
      "yum update -y",
      "yum install -y python3 jq curl"
    ]
  }

  provisioner "file" {
    source      = "configs/finstack.conf"
    destination = "/etc/finstack/finstack.conf"
  }

  provisioner "shell" {
    script = "scripts/harden.sh"
  }

  # Post-processors run after the image is created
  post-processor "manifest" {
    output = "manifest.json"
  }
}
```

Provisioners execute in the order they appear. If any provisioner fails, the build fails and the temporary instance is destroyed (no half-baked images).

#### Variables

```hcl
# variables.pkr.hcl
variable "environment" {
  type        = string
  default     = "dev"
  description = "Target environment for the image"
}

variable "base_packages" {
  type    = list(string)
  default = ["python3", "jq", "curl", "aws-cli"]
}

variable "vault_token" {
  type      = string
  sensitive = true     # Hidden in logs
}
```

Pass variables via:
- `-var 'environment=prod'` on the command line
- `-var-file=prod.pkrvars.hcl`
- `PKR_VAR_environment=prod` environment variable
- Auto-loaded `*.auto.pkrvars.hcl` files

**Never put secrets in `.pkrvars.hcl` files committed to Git.** Use environment variables or a secrets manager. Packer's `vault()` function can read secrets directly from HashiCorp Vault.

#### Locals

```hcl
locals {
  timestamp   = formatdate("YYYYMMDD-HHmmss", timestamp())
  ami_name    = "finstack-${var.environment}-${local.timestamp}"
  common_tags = {
    Project     = "finstack"
    Environment = var.environment
    BuildTime   = local.timestamp
    ManagedBy   = "packer"
  }
}
```

Use locals for values computed at build time. The timestamp pattern ensures every image has a unique name.

#### Provisioners

Provisioners are the steps that configure the image. The most common:

| Provisioner | Use Case | Example |
|-------------|----------|---------|
| `shell` | Run commands or scripts | Install packages, configure services |
| `file` | Upload files to the image | Config files, certificates, scripts |
| `ansible` | Run Ansible playbooks | Complex multi-step configuration |
| `shell-local` | Run commands on your machine | Generate configs before upload |

**Provisioner ordering matters.** A common pattern:

```
1. shell: update OS, install base packages
2. file: upload application configs
3. shell: install application dependencies
4. shell: run hardening script
5. shell: clean up (remove SSH keys, temp files, shell history)
```

The cleanup step is critical for security — you don't want build-time credentials or temporary files in the final image.

#### Post-Processors

Post-processors act on the built image:

```hcl
post-processor "manifest" {
  output     = "manifest.json"       # Write image ID to a file
  strip_path = true
}

post-processor "shell-local" {
  inline = ["echo 'Image built: {{.BuildName}}'"]
}
```

The manifest post-processor is essential for CI/CD — it writes the image ID to a JSON file that Terraform/Terragrunt can read to deploy the new image.

---

### 1.4 The Image Pipeline — From Source to Deployment

```
┌──────────┐    ┌──────────┐    ┌───────────┐    ┌──────────────┐
│  Base OS  │───▶│  Packer  │───▶│  Golden   │───▶│  Terraform   │
│  (Amazon  │    │  Build   │    │  AMI      │    │  Deploy      │
│   Linux)  │    │          │    │           │    │  (ASG/EKS)   │
└──────────┘    └──────────┘    └───────────┘    └──────────────┘
                     │
              ┌──────┴──────┐
              │ Provisioners │
              │ 1. Update OS │
              │ 2. Install   │
              │    packages  │
              │ 3. Configure │
              │ 4. Harden    │
              │ 5. Clean up  │
              └─────────────┘
```

**The image promotion pattern in BFSI:**

```
Developer builds  →  CI validates  →  Security scans  →  Promote to prod

1. packer build (dev)       ── Build in dev account
2. packer validate          ── Syntax check in CI
3. Trivy/Inspector scan     ── Vulnerability scan
4. ami-copy to staging      ── Test in staging
5. ami-copy to prod         ── Promote after approval
6. terraform apply          ── Deploy to ASG/EKS
```

Each image is versioned and immutable. Rolling back means deploying the previous image ID — not re-running provisioning scripts.

---

### 1.5 FinStack Golden AMI Architecture

The FinStack platform needs three image types:

```
┌──────────────────────────────────────────────────────────────┐
│                    FINSTACK IMAGE HIERARCHY                    │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Layer 1: Base Image (finstack-base)                    │  │
│  │  - Amazon Linux 2 / Ubuntu 22.04                        │  │
│  │  - OS updates, base packages (python3, jq, curl)        │  │
│  │  - CIS Level 1 hardening                                │  │
│  │  - CloudWatch agent, node_exporter                      │  │
│  │  - SSM agent (no SSH in prod)                           │  │
│  └───────────────────────┬────────────────────────────────┘  │
│                          │                                    │
│           ┌──────────────┼──────────────┐                    │
│           ▼              ▼              ▼                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ App Image    │ │ Worker Image │ │ Bastion Image│        │
│  │ (API server) │ │ (batch jobs) │ │ (jump host)  │        │
│  │              │ │              │ │              │        │
│  │ + Flask      │ │ + Celery     │ │ + Audit      │        │
│  │ + gunicorn   │ │ + Redis CLI  │ │   logging    │        │
│  │ + app config │ │ + job config │ │ + MFA        │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                              │
│  Built weekly or on code change — whichever comes first      │
└──────────────────────────────────────────────────────────────┘
```

**Layered image pattern:** The base image is built weekly with OS patches. Application images inherit from the base and add role-specific software. This avoids rebuilding everything when only the application changes, and ensures security patches propagate to all roles.

---

### 1.6 Immutable Infrastructure in Practice

**What "immutable" really means:**

- **Never SSH into production instances to change things.** If something needs changing, build a new image.
- **Configuration that varies per environment** (database endpoints, API keys) comes from environment variables, SSM Parameter Store, or Vault at boot time — not baked into the image.
- **Application code** can be baked into the image (for VM-based deploys) or pulled at boot time (for container-based deploys). For FinStack, we bake dependencies but pull code from S3 at launch.

**What to bake vs what to inject:**

| Bake into image (static) | Inject at boot (dynamic) |
|--------------------------|--------------------------|
| OS packages | Database endpoints |
| Runtime (Python, Java) | API keys and secrets |
| System config (sysctl, limits) | Feature flags |
| Monitoring agents | TLS certificates (rotated) |
| Security hardening | Environment name |
| Application dependencies | Log group names |

**Rule of thumb:** If it changes per environment or rotates, inject it. If it's the same everywhere and changes only on release, bake it.

---

### 1.7 Security Hardening in Images

For BFSI, every image must be hardened before it reaches production. The CIS (Center for Internet Security) benchmarks are the standard:

```
CIS Hardening Script — Key Steps:
1. Disable root login via SSH
2. Set password complexity requirements
3. Configure audit logging (auditd)
4. Disable unnecessary services
5. Set file permissions on sensitive files
6. Configure firewall (iptables/nftables)
7. Enable SELinux/AppArmor
8. Remove unnecessary packages
9. Set login banner
10. Clean up: remove SSH host keys (regenerated on first boot),
    clear shell history, remove temp files
```

The cleanup step is non-negotiable. If you skip it, build-time SSH keys end up in every instance launched from the image — a security vulnerability.

---

## 2. Hands-On Exercises

The exercises are in the `exercises/` directory. Complete them in order.

### Exercise 1: First AMI

**File:** `exercises/01-first-ami.md`

Build your first machine image using the Docker builder (no AWS account needed). Install FinStack base packages, create a config directory, and verify the image works.

**Key commands you'll learn:**

```bash
packer init .                         # Download plugins
packer validate .                     # Check template syntax
packer build .                        # Build the image
packer build -var 'env=staging' .     # Build with variable override
docker run -it <image_id> bash        # Verify the image
```

**What you'll create:**

```
┌──────────────────────────────┐
│  Docker Image: finstack-base │
│                              │
│  Amazon Linux 2 base         │
│  + python3, jq, curl         │
│  + /etc/finstack/ directory  │
│  + finstack.conf             │
│  + build manifest            │
└──────────────────────────────┘
```

**You're done when:**
- `packer build` completes successfully and outputs an image ID
- `docker run` on the image shows python3, jq, and curl installed
- `/etc/finstack/finstack.conf` exists inside the image
- `manifest.json` contains the build timestamp and image ID

Estimated time: 30 minutes.

---

### Exercise 2: Hardened Image

**File:** `exercises/02-hardened-image.md`

Extend the base image with CIS-inspired hardening: disable root SSH, set file permissions, configure audit logging, and run a cleanup script. Verify that hardening rules are applied in the final image.

**Key commands you'll learn:**

```bash
packer build -var-file=prod.pkrvars.hcl .    # Build with prod variables
packer build -only='docker.hardened' .       # Build only one source
docker run <image_id> cat /etc/ssh/sshd_config | grep PermitRootLogin
```

**What you'll create:**

```
┌──────────────────────────────────┐
│  Docker Image: finstack-hardened │
│                                  │
│  finstack-base layer             │
│  + CIS hardening applied         │
│  + SSH root login disabled       │
│  + Audit logging configured      │
│  + Unnecessary services removed  │
│  + Build artefacts cleaned       │
│  + Shell history cleared         │
└──────────────────────────────────┘
```

**You're done when:**
- The hardened image builds on top of the base image
- `PermitRootLogin no` is set in the SSH config
- No shell history or temp files exist in the final image
- The build produces a manifest with both base and hardened image IDs
- You can explain why cleanup is mandatory for BFSI images

Estimated time: 45 minutes.

---

## 3. Summary

### What You Learned

| Concept | Key Insight |
|---------|-------------|
| **Immutable infrastructure** | Build images with everything pre-installed; never modify running instances |
| **HCL2 templates** | Same language as Terraform — variables, locals, functions, types |
| **Sources (builders)** | Define where to build — Docker (local), AWS EBS (cloud), GCP, Azure |
| **Provisioners** | Ordered steps: shell scripts, file uploads, Ansible playbooks |
| **Post-processors** | Act on the built image — manifests, compression, registry push |
| **Layered images** | Base image (OS + hardening) → Application image (role-specific) |
| **Golden AMI pattern** | One blessed image per role, versioned, scanned, promoted through environments |
| **Hardening** | CIS benchmarks applied at build time, not boot time |
| **Cleanup** | Remove SSH keys, history, temp files — mandatory for security |
| **Bake vs inject** | Static config in the image, dynamic config from environment/Vault |

### Packer Cheat Sheet

```bash
# Lifecycle
packer init .                           # Download plugins
packer validate .                       # Check template syntax
packer fmt .                            # Format .pkr.hcl files (canonical style)
packer build .                          # Build all sources in the template
packer build -only='docker.base' .      # Build one specific source
packer build -var 'env=prod' .          # Pass a variable
packer build -var-file=prod.pkrvars.hcl .  # Pass a variable file

# Debugging
packer build -debug .                   # Step through provisioners one at a time
packer build -on-error=ask .            # Pause on error (inspect the instance)
packer build -on-error=abort .          # Destroy instance on error (default)
PACKER_LOG=1 packer build .             # Enable debug logging

# Inspection
packer inspect .                        # List variables, builders, provisioners
packer hcl2-upgrade template.json       # Convert JSON template to HCL2

# Variables (priority order, highest wins)
packer build -var 'key=value' .         # Command line
packer build -var-file=file.pkrvars.hcl .  # Variable file
PKR_VAR_key=value packer build .        # Environment variable
# *.auto.pkrvars.hcl                    # Auto-loaded files
# default in variable block             # Lowest priority
```

### Common Patterns

```hcl
# Pattern: Timestamp for unique image names
locals {
  timestamp = formatdate("YYYYMMDD-HHmmss", timestamp())
  ami_name  = "finstack-${var.role}-${var.environment}-${local.timestamp}"
}

# Pattern: Source AMI filter (always get latest base)
source "amazon-ebs" "base" {
  source_ami_filter {
    filters = {
      name                = "amzn2-ami-hvm-*-x86_64-gp2"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    owners      = ["amazon"]
    most_recent = true
  }
}

# Pattern: Manifest for CI/CD integration
post-processor "manifest" {
  output     = "manifest.json"
  strip_path = true
}

# Pattern: Cleanup provisioner (always last)
provisioner "shell" {
  inline = [
    "sudo rm -rf /tmp/*",
    "sudo rm -f /root/.bash_history",
    "sudo rm -f /home/ec2-user/.bash_history",
    "sudo rm -f /etc/ssh/ssh_host_*",       # Regenerated on first boot
    "sudo truncate -s 0 /var/log/messages",
    "sudo truncate -s 0 /var/log/secure"
  ]
}
```

### Next Steps

You've completed Stage 3. FinStack has golden, hardened images built by Packer. Next:

- **Stage 4 (Vault)** — inject dynamic secrets into Packer builds and Terraform applies
- **Stage 5 (OPA)** — enforce policy gates on images (no root SSH, required tags)
- **Stage 7 (CI/CD)** — automate Packer builds in GitHub Actions, trigger Terraform on new AMI

**Further learning:**
- Multi-region AMI copies with `ami_regions` in the AWS EBS builder
- HCP Packer registry for image metadata and version management
- Integrating Trivy or Amazon Inspector for vulnerability scanning post-build
- Using Ansible provisioners for complex multi-step configuration
- Packer + Terraform data source: `aws_ami` filter for the latest golden AMI
