# -----------------------------------------------------------------------------
# FinStack Golden AMI — Amazon Linux 2, CIS Hardened
#
# Builds an immutable base AMI with:
#   - CIS Level 1 hardening basics (SSH, filesystem, audit)
#   - Prometheus node_exporter for monitoring
#   - CloudWatch agent for log shipping
#   - NTP (chrony) configured for accurate timestamps
#
# Usage:
#   packer init .
#   packer validate .
#   packer build -var 'environment=dev' .
# -----------------------------------------------------------------------------

packer {
  required_plugins {
    amazon = {
      version = ">= 1.3.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

# ---------------------------------------------------------------------------
# Source — Amazon Linux 2 latest
# ---------------------------------------------------------------------------

source "amazon-ebs" "base" {
  region        = var.aws_region
  instance_type = var.instance_type
  ami_name      = "${var.ami_name_prefix}-${var.environment}-{{timestamp}}"
  ssh_username  = "ec2-user"

  # Find the latest Amazon Linux 2 AMI
  source_ami_filter {
    filters = {
      name                = "amzn2-ami-hvm-*-x86_64-gp2"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["amazon"]
  }

  # Network — use provided VPC/subnet or defaults
  vpc_id    = var.vpc_id != "" ? var.vpc_id : null
  subnet_id = var.subnet_id != "" ? var.subnet_id : null

  # Tags on the output AMI
  tags = merge(var.tags, {
    Name        = "${var.ami_name_prefix}-${var.environment}"
    Environment = var.environment
    BaseOS      = "amazon-linux-2"
    CISHardened = "level-1"
    BuildTime   = "{{timestamp}}"
  })

  # Tags on the builder instance (so you can identify it while running)
  run_tags = merge(var.tags, {
    Name = "packer-builder-finstack"
  })
}

# ---------------------------------------------------------------------------
# Build — provisioners run in order
# ---------------------------------------------------------------------------

build {
  name    = "finstack-base"
  sources = ["source.amazon-ebs.base"]

  # -------------------------------------------
  # Step 1: System updates
  # -------------------------------------------
  provisioner "shell" {
    inline = [
      "echo '>>> Updating system packages'",
      "sudo yum update -y",
      "sudo yum install -y yum-utils curl wget unzip jq chrony"
    ]
  }

  # -------------------------------------------
  # Step 2: CIS hardening basics (Level 1)
  # -------------------------------------------
  provisioner "shell" {
    inline = [
      "echo '>>> Applying CIS hardening basics'",

      # SSH hardening
      "sudo sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config",
      "sudo sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config",
      "sudo sed -i 's/^#\\?X11Forwarding.*/X11Forwarding no/' /etc/ssh/sshd_config",
      "sudo sed -i 's/^#\\?MaxAuthTries.*/MaxAuthTries 3/' /etc/ssh/sshd_config",
      "sudo sed -i 's/^#\\?ClientAliveInterval.*/ClientAliveInterval 300/' /etc/ssh/sshd_config",
      "sudo sed -i 's/^#\\?ClientAliveCountMax.*/ClientAliveCountMax 2/' /etc/ssh/sshd_config",

      # Filesystem hardening — disable uncommon filesystems
      "echo 'install cramfs /bin/true' | sudo tee /etc/modprobe.d/cramfs.conf",
      "echo 'install freevxfs /bin/true' | sudo tee /etc/modprobe.d/freevxfs.conf",
      "echo 'install hfs /bin/true' | sudo tee /etc/modprobe.d/hfs.conf",
      "echo 'install hfsplus /bin/true' | sudo tee /etc/modprobe.d/hfsplus.conf",

      # Audit logging
      "sudo yum install -y audit audit-libs",
      "sudo systemctl enable auditd",

      # Ensure permissions on critical files
      "sudo chmod 600 /etc/crontab",
      "sudo chmod 600 /etc/ssh/sshd_config",
      "sudo chmod 644 /etc/passwd",
      "sudo chmod 000 /etc/shadow"
    ]
  }

  # -------------------------------------------
  # Step 3: NTP (chrony) — accurate timestamps
  # -------------------------------------------
  provisioner "shell" {
    inline = [
      "echo '>>> Configuring chrony for NTP'",
      "sudo systemctl enable chronyd",
      "sudo systemctl start chronyd"
    ]
  }

  # -------------------------------------------
  # Step 4: Prometheus node_exporter
  # -------------------------------------------
  provisioner "shell" {
    inline = [
      "echo '>>> Installing Prometheus node_exporter ${var.node_exporter_version}'",

      # Create service user (no shell, no home)
      "sudo useradd --no-create-home --shell /bin/false node_exporter || true",

      # Download and install
      "cd /tmp",
      "curl -sSLO https://github.com/prometheus/node_exporter/releases/download/v${var.node_exporter_version}/node_exporter-${var.node_exporter_version}.linux-amd64.tar.gz",
      "tar xzf node_exporter-${var.node_exporter_version}.linux-amd64.tar.gz",
      "sudo cp node_exporter-${var.node_exporter_version}.linux-amd64/node_exporter /usr/local/bin/",
      "sudo chown node_exporter:node_exporter /usr/local/bin/node_exporter",

      # Systemd service
      "cat <<'UNIT' | sudo tee /etc/systemd/system/node_exporter.service",
      "[Unit]",
      "Description=Prometheus Node Exporter",
      "Documentation=https://prometheus.io/docs/guides/node-exporter/",
      "Wants=network-online.target",
      "After=network-online.target",
      "",
      "[Service]",
      "User=node_exporter",
      "Group=node_exporter",
      "Type=simple",
      "ExecStart=/usr/local/bin/node_exporter --collector.systemd --collector.processes",
      "Restart=on-failure",
      "RestartSec=5",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
      "UNIT",

      "sudo systemctl daemon-reload",
      "sudo systemctl enable node_exporter"
    ]
  }

  # -------------------------------------------
  # Step 5: CloudWatch agent for log shipping
  # -------------------------------------------
  provisioner "shell" {
    inline = [
      "echo '>>> Installing CloudWatch agent'",
      "sudo yum install -y amazon-cloudwatch-agent",
      "sudo systemctl enable amazon-cloudwatch-agent"
    ]
  }

  # -------------------------------------------
  # Step 6: Cleanup
  # -------------------------------------------
  provisioner "shell" {
    inline = [
      "echo '>>> Cleaning up'",
      "sudo yum clean all",
      "sudo rm -rf /tmp/*",
      "sudo rm -rf /var/cache/yum",

      # Remove SSH host keys (regenerated on first boot)
      "sudo rm -f /etc/ssh/ssh_host_*",

      "echo '>>> Golden AMI build complete'"
    ]
  }

  # -------------------------------------------
  # Post-processor — output the AMI ID
  # -------------------------------------------
  post-processor "manifest" {
    output     = "build-manifest.json"
    strip_path = true
  }
}
