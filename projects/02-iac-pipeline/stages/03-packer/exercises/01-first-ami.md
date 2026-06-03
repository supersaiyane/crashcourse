# Exercise 1: First AMI — Build a FinStack Base Image with Docker

**Goal:** Write an HCL2 Packer template, build a machine image using the Docker builder (no AWS account needed), install FinStack base packages, and verify the image works.

**Time:** 30 minutes

---

## Step 1: Install Packer

```bash
# macOS
brew install packer

# Verify
packer --version
```

---

## Step 2: Create the Project Structure

```bash
mkdir -p finstack/packer/scripts
mkdir -p finstack/packer/configs
cd finstack/packer
```

---

## Step 3: Write the Variables File

Create `variables.pkr.hcl`:

```hcl
# variables.pkr.hcl — inputs for the FinStack base image
variable "environment" {
  type        = string
  default     = "dev"
  description = "Target environment (dev, staging, prod)"
}

variable "project" {
  type        = string
  default     = "finstack"
  description = "Project name used in image naming"
}

variable "base_packages" {
  type        = list(string)
  default     = ["python3", "jq", "curl", "tar", "gzip"]
  description = "Packages to install in the base image"
}
```

---

## Step 4: Write the Template

Create `finstack-base.pkr.hcl`:

```hcl
# finstack-base.pkr.hcl — FinStack base image template

packer {
  required_plugins {
    docker = {
      version = ">= 1.0.0"
      source  = "github.com/hashicorp/docker"
    }
  }
}

locals {
  timestamp = formatdate("YYYYMMDD-HHmmss", timestamp())
  image_name = "${var.project}-base-${var.environment}-${local.timestamp}"
}

# --- Source: Docker builder (local, no cloud needed) ---
source "docker" "base" {
  image  = "amazonlinux:2"       # Same base OS as production AMIs
  commit = true                   # Commit the container as an image
  changes = [
    "ENTRYPOINT [\"/bin/bash\"]",
    "LABEL project=${var.project}",
    "LABEL environment=${var.environment}",
    "LABEL build_time=${local.timestamp}"
  ]
}

# --- Build block ---
build {
  name    = "finstack-base"
  sources = ["source.docker.base"]

  # Step 1: Update OS and install base packages
  provisioner "shell" {
    inline = [
      "echo '=== Updating OS ==='",
      "yum update -y",
      "echo '=== Installing base packages ==='",
      "yum install -y ${join(" ", var.base_packages)}",
      "echo '=== Verifying installations ==='",
      "python3 --version",
      "jq --version",
      "curl --version | head -1"
    ]
  }

  # Step 2: Create FinStack directory structure
  provisioner "shell" {
    inline = [
      "mkdir -p /etc/finstack",
      "mkdir -p /var/log/finstack",
      "mkdir -p /opt/finstack/bin"
    ]
  }

  # Step 3: Upload the application config
  provisioner "file" {
    source      = "configs/finstack.conf"
    destination = "/etc/finstack/finstack.conf"
  }

  # Step 4: Verify the config was placed correctly
  provisioner "shell" {
    inline = [
      "echo '=== Verifying config ==='",
      "cat /etc/finstack/finstack.conf",
      "echo '=== Build complete ==='"
    ]
  }

  # Output a manifest with the image ID and build metadata
  post-processor "manifest" {
    output     = "manifest.json"
    strip_path = true
  }
}
```

---

## Step 5: Create the Config File

Create `configs/finstack.conf`:

```text
# FinStack base configuration
# Dynamic values (DB host, secrets) injected at boot time via env vars
PROJECT=finstack
LOG_DIR=/var/log/finstack
LOG_LEVEL=info
METRICS_PORT=9090
HEALTH_CHECK_PATH=/healthz
```

---

## Step 6: Init — Download Plugins

```bash
packer init .
```

Expected output:

```
Installed plugin github.com/hashicorp/docker v1.x.x in ...
```

---

## Step 7: Validate — Check the Template

```bash
packer validate .
```

Expected output:

```
The configuration is valid.
```

---

## Step 8: Build — Create the Image

```bash
packer build .
```

Expected output (key lines):

```
==> finstack-base.docker.base: Creating a temporary directory for sharing data...
==> finstack-base.docker.base: Pulling Docker image: amazonlinux:2
==> finstack-base.docker.base: Starting docker container...
==> finstack-base.docker.base: Provisioning with shell script...
    finstack-base.docker.base: === Updating OS ===
    ...
    finstack-base.docker.base: === Installing base packages ===
    ...
    finstack-base.docker.base: Python 3.7.x
    finstack-base.docker.base: jq-1.5
    finstack-base.docker.base: curl 7.x.x
==> finstack-base.docker.base: Provisioning with file...
==> finstack-base.docker.base: === Verifying config ===
    finstack-base.docker.base: # FinStack base configuration
    ...
==> finstack-base.docker.base: === Build complete ===
==> finstack-base.docker.base: Committing the container
==> finstack-base.docker.base: Running post-processor: manifest
Build 'finstack-base.docker.base' finished after X minutes.

==> Builds finished. The artifacts of successful builds are:
--> finstack-base.docker.base: Imported Docker image: sha256:abc123...
```

Note the image SHA — you'll use it in the next step.

---

## Step 9: Verify the Image

Run the built image and check that packages are installed:

```bash
# Get the image ID from the manifest
IMAGE_ID=$(jq -r '.builds[-1].artifact_id' manifest.json)

# Run the image interactively
docker run --rm -it $IMAGE_ID bash
```

Inside the container, verify:

```bash
python3 --version                      # Should show Python 3.x
jq --version                           # Should show jq-1.x
curl --version | head -1               # Should show curl 7.x
cat /etc/finstack/finstack.conf        # Should show the config
ls -la /var/log/finstack/              # Should exist
ls -la /opt/finstack/bin/              # Should exist
exit
```

---

## Step 10: Inspect the Manifest

```bash
cat manifest.json | jq .
```

Expected structure:

```json
{
  "builds": [
    {
      "name": "finstack-base",
      "builder_type": "docker",
      "build_time": 1234567890,
      "artifact_id": "sha256:abc123...",
      "packer_run_uuid": "..."
    }
  ],
  "last_run_uuid": "..."
}
```

The manifest is how CI/CD pipelines know which image was built. Terraform can read this file to deploy the latest image.

---

## Step 11: Build with a Variable Override

```bash
packer build -var 'environment=staging' .
```

The image labels will now show `environment=staging`. Check:

```bash
IMAGE_ID=$(jq -r '.builds[-1].artifact_id' manifest.json)
docker inspect $IMAGE_ID | jq '.[0].Config.Labels'
```

Expected:

```json
{
  "environment": "staging",
  "project": "finstack",
  "build_time": "20260602-..."
}
```

---

## Step 12: Clean Up

```bash
# Remove built images
docker rmi $(jq -r '.builds[].artifact_id' manifest.json) 2>/dev/null
rm -f manifest.json
```

---

## You're Done When

- [x] `packer build` completes successfully and outputs a Docker image ID
- [x] python3, jq, and curl are installed inside the image
- [x] `/etc/finstack/finstack.conf` exists with the correct content
- [x] `manifest.json` contains the image ID and build metadata
- [x] Building with `-var 'environment=staging'` changes the image labels
- [x] You understand the init → validate → build lifecycle

## Common Mistakes

- **Forgetting `packer init`** — the Docker plugin must be downloaded before the first build
- **Wrong `source` path in the file provisioner** — paths are relative to the directory where you run `packer build`, not relative to the template file
- **Not using `commit = true` with Docker** — without it, Packer doesn't save the container as an image
- **Skipping `validate` before `build`** — catch syntax errors before waiting for a build
- **Committing `manifest.json` with secrets** — the manifest may contain account IDs or image names that vary per environment; add it to `.gitignore` or generate it in CI only
