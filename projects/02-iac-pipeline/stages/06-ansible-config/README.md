# Stage 6: Ansible Config — Post-Provision Configuration Management

**Goal:** Write Ansible playbooks and roles that bootstrap FinStack servers after Terraform provisions them — harden SSH, install monitoring agents, ship logs, and encrypt secrets with Ansible Vault — so that every host in every environment is configured identically, idempotently, and auditably.

**Prerequisites:** Stages 1-5 complete. You should be comfortable with Terraform modules, Terragrunt multi-env, Packer golden AMIs, Vault dynamic secrets, and OPA policy gates. Ansible builds on all of these — it is the configuration layer that runs *after* infrastructure exists.

**Sample App:** FinStack — the same BFSI payment platform. Terraform created the VPC, subnets, EKS, and RDS. Packer baked the golden AMI. Now Ansible configures the running instances: SSH hardening, NTP, node_exporter, CloudWatch log shipping, and application-specific tuning.

> For the full crash course on Ansible, see [`Ansible.md`](../../../../iac/Ansible.md).

---

## 1. Theory

### 1.1 Why Configuration Management After IaC?

Terraform provisions infrastructure — it creates the VPC, launches the EC2 instances, provisions the RDS database. But Terraform does not configure what runs *inside* those instances. It does not harden SSH, install monitoring agents, configure NTP, or deploy application configs. That is configuration management's job.

You might ask: "Didn't Packer bake all of that into the AMI in Stage 3?" Partially. Packer handles the *static* baseline — the packages, the CIS hardening, the initial filesystem layout. But there are things Packer cannot do:

| Concern | Packer (Build Time) | Ansible (Run Time) |
|---------|--------------------|--------------------|
| **Environment-specific config** | Cannot know if it's dev/staging/prod | Injects environment variables from inventory |
| **Dynamic values** | Cannot know the RDS endpoint or VPC CIDR | Reads Terraform outputs and configures accordingly |
| **Secret rotation** | Bakes a static secret into the image | Pulls current secret from Vault on every run |
| **Drift correction** | Image is immutable — cannot self-correct | Re-running the playbook restores desired state |
| **Post-launch setup** | Cannot register with monitoring or service mesh | Registers the instance with Prometheus, Consul, etc. |
| **Compliance updates** | Requires rebuilding the entire AMI | Updates a config line, restarts a service — minutes |

**The one idea that unlocks Ansible:** Ansible is a **desired-state engine for configuration**. You describe what the system should look like (packages installed, files present, services running), and Ansible converges the system to that state. Run it once to set up. Run it again — nothing changes. Run it after someone manually edited a config — it fixes the drift. This property is called **idempotency**, and it is the foundation of reliable configuration management.

**Mental model:** Think of Ansible as a checklist that a diligent sysadmin runs on every server, every time. The checklist says "SSH root login must be disabled, chrony must be installed and running, node_exporter must be listening on port 9100." If everything already matches, the sysadmin does nothing. If something drifted, they fix it. Ansible automates that sysadmin — across 3 servers or 3,000.

---

### 1.2 Architecture — How Ansible Fits into the FinStack Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                     THE IaC PIPELINE                                 │
│                                                                     │
│  Stage 1-2          Stage 3          Stage 4          Stage 5       │
│  Terraform/TG  ──▶  Packer AMI  ──▶  Vault Secrets ──▶ OPA Policy  │
│  (provision)       (golden image)   (dynamic creds)   (compliance)  │
│                                                                     │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────────────────────────────────────────────┐           │
│  │                STAGE 6: ANSIBLE                       │           │
│  │                                                      │           │
│  │  Developer laptop          Target hosts              │           │
│  │  ┌──────────────┐         ┌───────────────────┐     │           │
│  │  │  ansible-     │  SSH   │  web-1  (10.0.1.10)│     │           │
│  │  │  playbook     │───────▶│  web-2  (10.0.1.11)│     │           │
│  │  │  bootstrap.yml│        │  web-3  (10.0.1.12)│     │           │
│  │  └──────┬───────┘         │  db-1   (10.0.2.20)│     │           │
│  │         │                 │  mon-1  (10.0.3.30)│     │           │
│  │         │                 └───────────────────┘     │           │
│  │         │                                            │           │
│  │    No agent on targets.                              │           │
│  │    Ansible SSHs in, runs tasks, exits.               │           │
│  │    Nothing left behind except the changes.           │           │
│  └──────────────────────────────────────────────────────┘           │
│                                                                     │
│         │                                                           │
│         ▼                                                           │
│  Stage 7: CI/CD — GitHub Actions runs ansible-playbook in pipeline  │
└─────────────────────────────────────────────────────────────────────┘
```

**Key insight: Ansible is agentless.** Unlike Puppet or Chef, there is no daemon running on the target hosts. Ansible connects over SSH, executes tasks as Python scripts on the remote host, and disconnects. This makes it trivially easy to adopt — you need SSH access and Python on the target, both of which are already present on any AMI built with Packer.

---

### 1.3 Core Concepts

#### The Inventory

The inventory is Ansible's address book — it tells Ansible which hosts exist, how to reach them, and what groups they belong to. Groups map directly to your infrastructure tiers:

```ini
# inventory/hosts.ini
[web]                               # Payment API hosts
web-1 ansible_host=10.0.1.10
web-2 ansible_host=10.0.1.11

[db]                                # Database bastion hosts
db-1  ansible_host=10.0.2.20

[monitoring]                        # Prometheus / Grafana
mon-1 ansible_host=10.0.3.30

[finstack:children]                 # All FinStack hosts
web
db
monitoring

[finstack:vars]                     # Variables applied to all
ansible_user=ec2-user
environment=dev
```

Groups let you target tasks. `hosts: web` runs only on payment API hosts. `hosts: finstack` runs on everything. `--limit db-1` runs on a single host.

In production, you rarely maintain a static inventory file. Instead, you use a **dynamic inventory** plugin that queries AWS EC2, Terraform state, or a CMDB. The AWS EC2 plugin discovers instances by tag:

```yaml
# inventory/aws_ec2.yml
plugin: amazon.aws.aws_ec2
regions:
  - ap-south-1
filters:
  tag:Project: finstack
  tag:Environment: dev
keyed_groups:
  - key: tags.Role       # Creates groups from the Role tag
    prefix: role
```

This means your inventory stays current as instances come and go — no manual IP management.

#### Playbooks

A playbook is a YAML file that declares the desired state of a group of hosts. It lists tasks to execute in order:

```yaml
---
- name: Bootstrap FinStack hosts     # Play name (one playbook can have multiple plays)
  hosts: finstack                    # Which hosts to target (from inventory)
  become: true                       # Use sudo for privileged operations
  gather_facts: true                 # Collect OS info before running tasks

  tasks:
    - name: Ensure chrony is installed
      ansible.builtin.yum:
        name: chrony
        state: present               # Idempotent: installs only if missing

    - name: Ensure chrony is running
      ansible.builtin.systemd:
        name: chronyd
        enabled: true
        state: started               # Idempotent: starts only if stopped
```

**Every task is idempotent by design.** `state: present` means "make sure it's there." If chrony is already installed, Ansible reports `ok` (no change). If it's missing, Ansible installs it and reports `changed`. This is the property that makes Ansible safe to run repeatedly.

#### Modules

Modules are the verbs of Ansible — `yum` installs packages, `systemd` manages services, `copy` places files, `template` renders Jinja2 templates, `lineinfile` edits a single line in a config file. There are thousands, but you'll use about 15 daily:

| Module | Purpose | Example |
|--------|---------|---------|
| `ansible.builtin.yum` | Install/remove packages | `state: present` |
| `ansible.builtin.apt` | Debian/Ubuntu packages | `state: latest` |
| `ansible.builtin.systemd` | Manage services | `state: started, enabled: true` |
| `ansible.builtin.copy` | Copy file to remote | `src: local.conf, dest: /etc/app.conf` |
| `ansible.builtin.template` | Render Jinja2 template | `src: nginx.conf.j2, dest: /etc/nginx/nginx.conf` |
| `ansible.builtin.lineinfile` | Edit a single line | `regexp: "^#?PermitRootLogin", line: "PermitRootLogin no"` |
| `ansible.builtin.file` | Create dirs, set perms | `state: directory, mode: "0755"` |
| `ansible.builtin.user` | Manage users | `name: appuser, system: true` |
| `ansible.builtin.get_url` | Download files | `url: https://..., dest: /tmp/` |
| `ansible.builtin.unarchive` | Extract archives | `src: /tmp/x.tar.gz, remote_src: true` |
| `ansible.builtin.command` | Run arbitrary command | Use only when no module exists |
| `ansible.builtin.shell` | Run shell command | Pipes, redirects — use sparingly |
| `ansible.builtin.include_role` | Call a role | `name: monitoring-agent` |
| `ansible.builtin.debug` | Print variables | `msg: "VPC is {{ vpc_id }}"` |
| `ansible.builtin.assert` | Validate conditions | `that: ansible_memtotal_mb >= 1024` |

**Rule of thumb:** if a module exists for the task, use the module. Modules are idempotent by design. `command` and `shell` are not — you must add `creates:` or `when:` guards to make them safe.

#### Handlers

Handlers are tasks that run only when notified. They solve the "restart the service only if the config changed" problem:

```yaml
tasks:
  - name: Deploy nginx config
    ansible.builtin.template:
      src: nginx.conf.j2
      dest: /etc/nginx/nginx.conf
    notify: restart nginx          # Triggers the handler only if the file changed

handlers:
  - name: restart nginx
    ansible.builtin.systemd:
      name: nginx
      state: restarted
```

If the template is already identical to the file on disk, the task reports `ok`, the handler is never notified, and nginx keeps running without a restart. This is critical for zero-disruption config management — you do not want to restart a payment API service on every Ansible run.

#### Roles

A role is a structured, reusable unit of Ansible tasks. Instead of putting everything in one giant playbook, you organise related tasks into a role with a standard directory layout:

```
roles/
└── monitoring-agent/
    ├── tasks/
    │   └── main.yml         # The tasks to execute
    ├── handlers/
    │   └── main.yml         # Handlers (restart services)
    ├── templates/
    │   └── node-exporter.service.j2   # Jinja2 templates
    ├── files/               # Static files to copy
    ├── vars/
    │   └── main.yml         # Role variables (high priority)
    ├── defaults/
    │   └── main.yml         # Default variables (lowest priority, easy to override)
    └── meta/
        └── main.yml         # Dependencies on other roles
```

Ansible auto-discovers files by convention. When you call `include_role: name: monitoring-agent`, Ansible loads `roles/monitoring-agent/tasks/main.yml`, makes templates from `templates/` available, and registers handlers from `handlers/main.yml`. No path gymnastics.

**Role design rules for FinStack:**
1. One role per concern — `monitoring-agent`, `ssh-hardening`, `log-shipping`, `ntp`
2. All tuneable values in `defaults/main.yml` — easy to override per environment
3. Every template has a comment header: "Managed by Ansible. Do not edit manually."
4. Roles never hardcode hostnames, IPs, or secrets — those come from inventory or Vault

---

### 1.4 Ansible Vault — Encrypting Secrets

Ansible Vault encrypts sensitive data (passwords, API keys, certificates) so they can live safely in Git. This is different from HashiCorp Vault (Stage 4) — Ansible Vault is a file-encryption tool built into Ansible itself.

```
┌─────────────────────────────────────────────────────────────┐
│                    ANSIBLE VAULT                             │
│                                                             │
│  Plaintext                    Encrypted                     │
│  ┌──────────────────┐        ┌──────────────────────────┐  │
│  │ db_password: s3cr3t │  ──▶ │ $ANSIBLE_VAULT;1.1;AES256 │  │
│  │ api_key: abc123     │      │ 38613430323261326466...   │  │
│  └──────────────────┘        └──────────────────────────┘  │
│                                                             │
│  Stored in Git: YES (encrypted)                             │
│  Readable without password: NO                              │
│  Decrypted at runtime by ansible-playbook                   │
└─────────────────────────────────────────────────────────────┘
```

**Essential Ansible Vault commands:**

```bash
# Encrypt a file
ansible-vault encrypt group_vars/prod/vault.yml

# Decrypt a file (for editing)
ansible-vault decrypt group_vars/prod/vault.yml

# Edit an encrypted file in-place (decrypts, opens editor, re-encrypts)
ansible-vault edit group_vars/prod/vault.yml

# View contents without decrypting the file on disk
ansible-vault view group_vars/prod/vault.yml

# Re-key — change the encryption password
ansible-vault rekey group_vars/prod/vault.yml

# Run a playbook that uses encrypted vars
ansible-playbook bootstrap.yml --ask-vault-pass
# Or with a password file (for CI):
ansible-playbook bootstrap.yml --vault-password-file ~/.vault_pass
```

**The convention for vault variables:** prefix encrypted variable names with `vault_` and reference them through a plain variable:

```yaml
# group_vars/prod/vault.yml (encrypted)
vault_db_password: "s3cr3t_pr0d_p@ss"
vault_api_key: "abc123-prod-key"

# group_vars/prod/vars.yml (plaintext, committed)
db_password: "{{ vault_db_password }}"
api_key: "{{ vault_api_key }}"
```

This way, `grep db_password` in your codebase finds the reference in `vars.yml` (easy to trace), while the actual value is encrypted in `vault.yml` (safe in Git). In BFSI, this pattern satisfies the auditor's question: "Where is the production database password stored?" Answer: "Encrypted at rest in Git, decrypted only at runtime by the CI/CD pipeline, which holds the vault password in a GitHub Actions secret."

**Ansible Vault vs HashiCorp Vault:**

| Feature | Ansible Vault | HashiCorp Vault (Stage 4) |
|---------|--------------|--------------------------|
| **What it encrypts** | Files and strings at rest | Dynamic secrets, PKI certs, transit encryption |
| **Where secrets live** | In Git (encrypted) | In Vault's storage backend |
| **Rotation** | Manual — re-encrypt with new values | Automatic — leases expire, new creds issued |
| **Access control** | Whoever has the vault password | Policies, AppRoles, OIDC |
| **Best for** | Static secrets that change infrequently | Dynamic secrets, short-lived credentials |

Use both. Ansible Vault for inventory-level secrets (SSH keys, static API tokens). HashiCorp Vault for dynamic database credentials, short-lived TLS certs, and anything that needs automatic rotation.

---

### 1.5 Idempotency — The Property That Makes Ansible Safe

Idempotency means running the same operation multiple times produces the same result as running it once. This is not a nice-to-have — it is the foundation of reliable automation.

```
First run:                           Second run (no changes):
┌────────────┐                      ┌────────────┐
│ Task 1     │ changed              │ Task 1     │ ok
│ Task 2     │ changed              │ Task 2     │ ok
│ Task 3     │ changed              │ Task 3     │ ok
│ Task 4     │ changed              │ Task 4     │ ok
└────────────┘                      └────────────┘
  4 changed, 0 ok                     0 changed, 4 ok

Third run (after manual drift):
┌────────────┐
│ Task 1     │ ok                   <- still correct
│ Task 2     │ changed              <- Ansible fixed the drift
│ Task 3     │ ok                   <- still correct
│ Task 4     │ ok                   <- still correct
└────────────┘
  1 changed, 3 ok
```

**Why this matters for BFSI:** when the auditor asks "are all production servers configured identically?" you run the playbook in check mode (`--check`) and show zero changes. If anything drifted, Ansible detects and reports it. This is a compliance superpower.

**How to verify idempotency:** run the playbook twice. The second run should show zero `changed` tasks. If it shows changes, something is wrong — typically a `command` or `shell` task without a `creates:` guard, or a template with a timestamp that changes every render.

---

### 1.6 The FinStack Ansible Structure

Here is the complete Ansible layout within the FinStack project:

```
finstack/ansible/
├── ansible.cfg                         # Project-level config
├── inventory/
│   ├── hosts.ini                       # Static inventory (dev/lab)
│   └── aws_ec2.yml                     # Dynamic inventory (production)
├── playbooks/
│   ├── bootstrap.yml                   # Full server bootstrap
│   ├── monitoring.yml                  # Monitoring-only playbook
│   └── rotate-secrets.yml              # Secret rotation playbook
├── roles/
│   ├── monitoring-agent/
│   │   ├── tasks/main.yml
│   │   ├── handlers/main.yml
│   │   ├── templates/node-exporter.service.j2
│   │   └── defaults/main.yml
│   ├── ssh-hardening/
│   │   ├── tasks/main.yml
│   │   └── defaults/main.yml
│   ├── ntp/
│   │   ├── tasks/main.yml
│   │   └── defaults/main.yml
│   └── log-shipping/
│       ├── tasks/main.yml
│       ├── templates/cloudwatch-agent.json.j2
│       └── defaults/main.yml
└── group_vars/
    ├── all/
    │   └── vars.yml                    # Common to all environments
    ├── dev/
    │   ├── vars.yml                    # Dev-specific variables
    │   └── vault.yml                   # Encrypted dev secrets
    └── prod/
        ├── vars.yml                    # Prod-specific variables
        └── vault.yml                   # Encrypted prod secrets
```

This structure mirrors Terraform's module approach: each role is a reusable unit, each environment gets its own variables, and secrets are encrypted at rest. The playbook composes roles, just as Terraform's root module composes child modules.

---

### 1.7 Variable Precedence — Where Ansible Looks for Values

Ansible has 22 levels of variable precedence. You do not need to memorise all 22, but you must understand the practical hierarchy:

```
Highest priority (wins)
  ^
  |  -e / --extra-vars on CLI           # "Nuclear override" — always wins
  |  include_vars / set_fact            # Set during play execution
  |  Role vars (roles/x/vars/main.yml)  # Role-specific, hard to override
  |  Playbook vars / vars_files         # Declared in the play
  |  Host vars (host_vars/web-1.yml)    # Per-host overrides
  |  Group vars (group_vars/web.yml)    # Per-group settings
  |  Role defaults (roles/x/defaults/)  # Designed to be overridden
  |  Inventory vars ([web:vars])        # In the inventory file
  v
Lowest priority (overridden easily)
```

**The practical rule:** put tuneable values in `defaults/main.yml` (lowest priority — easy to override per environment). Put values that should never change in `vars/main.yml` (high priority). Use `group_vars/` for environment-specific settings. Use `-e` only for one-off overrides or CI injection.

---

### 1.8 Check Mode and Diff Mode — The Safety Net

Before applying changes to production, always run in check mode:

```bash
# Check mode: show what WOULD change, without changing anything
ansible-playbook bootstrap.yml --check

# Check + diff: show what would change AND the line-by-line diff
ansible-playbook bootstrap.yml --check --diff
```

Check mode is Ansible's equivalent of `terraform plan`. It predicts changes without executing them. Diff mode shows the exact file differences. In CI, run check mode on the PR and apply on merge — the same pattern as Terraform (Stage 7).

**Limitations of check mode:** tasks that use `command` or `shell` cannot predict their effect in check mode unless you add `check_mode: no` or use `changed_when` to teach Ansible how to evaluate them. Module-based tasks (yum, systemd, template) work reliably in check mode out of the box.

---

### 1.9 Connecting Ansible to Terraform

Terraform provisions infrastructure. Ansible configures it. The bridge between them is Terraform outputs:

```
Terraform                              Ansible
┌──────────────┐                      ┌──────────────────────┐
│ output "web_  │    terraform output  │ [web]                │
│ instance_ips" │ ─────────────────▶  │ web-1 ansible_host=  │
│               │    (JSON -> inventory)│   10.0.1.10         │
│ output "rds_  │                      │                      │
│ endpoint"     │ ─────────────────▶  │ [finstack:vars]      │
│               │    (-> group_vars)   │ rds_endpoint=        │
└──────────────┘                      │   finstack-db.xxx.rds│
                                       └──────────────────────┘
```

**Two patterns for this bridge:**

**Pattern 1 — Terraform output to dynamic inventory:**
Use the `terraform-inventory` tool or write a script that reads `terraform output -json` and generates an Ansible inventory. Good for small setups.

**Pattern 2 — AWS EC2 dynamic inventory (recommended):**
Tag your EC2 instances in Terraform (`tag:Role = web`, `tag:Project = finstack`). The Ansible AWS EC2 inventory plugin discovers them by tag. No manual wiring. This is the production pattern.

**Pattern 3 — Terraform local-exec provisioner (quick-and-dirty, not recommended for production):**

```hcl
resource "aws_instance" "web" {
  # ... instance config ...

  provisioner "local-exec" {
    command = "ansible-playbook -i '${self.private_ip},' bootstrap.yml"
  }
}
```

This runs Ansible immediately after Terraform creates the instance. It works for demos but has problems in production: it ties Ansible's lifecycle to Terraform's, makes re-running Ansible independently difficult, and fails if the instance isn't SSH-ready yet. Prefer patterns 1 or 2.

---

### 1.10 The Bootstrap Playbook — Walking Through FinStack's Configuration

The FinStack bootstrap playbook (`finstack/ansible/playbooks/bootstrap.yml`) configures every host in four phases:

```
Phase 1: SSH Hardening          Phase 2: NTP
┌─────────────────────┐        ┌─────────────────────┐
│ Disable root login   │        │ Install chrony       │
│ Disable password auth│        │ Point to AWS NTP     │
│ Disable X11 forward  │        │ Enable + start       │
│ Max 3 auth attempts  │        │                      │
│ 300s idle timeout    │        │                      │
└─────────────────────┘        └─────────────────────┘

Phase 3: Monitoring             Phase 4: Log Shipping
┌─────────────────────┐        ┌─────────────────────┐
│ Create system user   │        │ Install CW agent     │
│ Download binary      │        │ Deploy JSON config   │
│ Install to /usr/local│        │ Ship /var/log/messages│
│ Deploy systemd unit  │        │ Ship /var/log/secure │
│ Enable + start       │        │ 90-day retention     │
└─────────────────────┘        └─────────────────────┘
```

Each phase maps to either inline tasks or a role call. The handler pattern ensures services restart only when their configuration actually changes. On a second run with no changes, all four phases report `ok` across every task — zero restarts, zero disruption.

**Why the order matters:** SSH hardening must happen first (security baseline). NTP second (accurate timestamps for logs and auditing). Monitoring third (so the node is visible in Prometheus from the moment it starts serving traffic). Log shipping last (depends on the monitoring infrastructure being in place to receive logs).

---

### 1.11 Testing Ansible Locally with Docker

You do not need real EC2 instances to learn Ansible. A Docker container running `systemd` simulates an EC2 host well enough for all exercises in this stage:

```yaml
# docker-compose.ansible-lab.yml
services:
  target:
    image: geerlingguy/docker-amazonlinux2-ansible:latest
    container_name: ansible-target
    privileged: true
    volumes:
      - /sys/fs/cgroup:/sys/fs/cgroup:ro
    ports:
      - "2222:22"
      - "9100:9100"        # node_exporter
    tmpfs:
      - /run
      - /run/lock
```

Then in your inventory:

```ini
[finstack]
target ansible_host=127.0.0.1 ansible_port=2222 ansible_user=root ansible_ssh_pass=ansible
```

This gives you a full Amazon Linux 2 environment with systemd, SSH, and yum — identical to what your Packer AMI boots on EC2. All exercises in this stage work against this container.

---

### 1.12 Common Ansible Patterns for BFSI

**Pattern: Compliance assertion at the start of every play**

```yaml
tasks:
  - name: Assert minimum memory for payment processing
    ansible.builtin.assert:
      that:
        - ansible_memtotal_mb >= 2048
        - ansible_processor_vcpus >= 2
      fail_msg: "Host does not meet minimum specs for FinStack"
      success_msg: "Host meets minimum specs"

  - name: Assert required tags are present (from Terraform)
    ansible.builtin.assert:
      that:
        - "'finstack' in group_names"
      fail_msg: "Host is not in the finstack group — check inventory"
```

**Pattern: Environment-specific configuration with group_vars**

```yaml
# group_vars/dev/vars.yml
environment: dev
log_level: debug
cloudwatch_log_group: "/finstack/dev/syslog"
node_exporter_port: 9100

# group_vars/prod/vars.yml
environment: prod
log_level: warn
cloudwatch_log_group: "/finstack/prod/syslog"
node_exporter_port: 9100
```

Same playbook, different behaviour per environment. The playbook never contains `if environment == prod` logic — the variables drive the configuration.

**Pattern: Rolling restart for zero-downtime deploys**

```yaml
- name: Update payment API config
  hosts: web
  serial: 1                  # Run on one host at a time
  max_fail_percentage: 0     # Stop immediately if any host fails

  tasks:
    - name: Deploy new config
      ansible.builtin.template:
        src: finstack-api.conf.j2
        dest: /etc/finstack/api.conf
      notify: restart finstack-api

    - name: Wait for health check
      ansible.builtin.uri:
        url: "http://{{ ansible_host }}:8080/health"
        status_code: 200
      retries: 10
      delay: 5

  handlers:
    - name: restart finstack-api
      ansible.builtin.systemd:
        name: finstack-api
        state: restarted
```

`serial: 1` means Ansible configures one web host at a time, waiting for the health check to pass before moving to the next. If any host fails the health check, the play stops — no cascading failure across the payment API fleet.

---

## 2. Hands-On Exercises

The exercises are in the `exercises/` directory. Complete them in order.

### Exercise 1: Bootstrap Playbook

**File:** `exercises/01-bootstrap-playbook.md`

Write and run the FinStack bootstrap playbook against a local Docker container (simulating an EC2 instance). Harden SSH, configure NTP, and install node_exporter.

**Key commands you'll learn:**

```bash
ansible-playbook playbooks/bootstrap.yml             # Run the full bootstrap
ansible-playbook playbooks/bootstrap.yml --check      # Dry-run (check mode)
ansible-playbook playbooks/bootstrap.yml --check --diff  # Dry-run with diffs
ansible-playbook playbooks/bootstrap.yml --limit web  # Run on web hosts only
ansible-playbook playbooks/bootstrap.yml -e "ntp_server=pool.ntp.org"  # Override var
ansible all -m ping                                    # Test connectivity
ansible all -m setup                                   # Gather facts
```

**What you'll configure:**

```
┌──────────────────────────────────────────────────┐
│  Target Host (Docker container / EC2)             │
│                                                  │
│  ┌────────────────┐  ┌────────────────────────┐  │
│  │ SSH hardened    │  │ chrony (NTP) running   │  │
│  │  - no root     │  │  - AWS time server     │  │
│  │  - no password │  │  - iburst enabled      │  │
│  │  - timeout 300s│  │                        │  │
│  └────────────────┘  └────────────────────────┘  │
│                                                  │
│  ┌────────────────┐  ┌────────────────────────┐  │
│  │ node_exporter  │  │ CloudWatch agent       │  │
│  │  port 9100     │  │  syslog -> CloudWatch  │  │
│  │  systemd unit  │  │  secure -> CloudWatch  │  │
│  └────────────────┘  └────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

**You're done when:**
- `ansible-playbook bootstrap.yml` completes with zero failures
- Running it a second time shows zero `changed` tasks (idempotency confirmed)
- `curl localhost:9100/metrics` returns Prometheus metrics from node_exporter
- `--check` mode shows zero changes after a successful apply

Estimated time: 45 minutes.

---

### Exercise 2: Roles

**File:** `exercises/02-roles.md`

Refactor the monolithic bootstrap playbook into reusable roles — `ssh-hardening`, `ntp`, `monitoring-agent`, and `log-shipping`. Wire them together with role defaults and group_vars. Encrypt production secrets with Ansible Vault.

**Key commands you'll learn:**

```bash
ansible-galaxy init roles/ssh-hardening              # Scaffold a role
ansible-vault encrypt group_vars/prod/vault.yml      # Encrypt secrets
ansible-vault edit group_vars/prod/vault.yml          # Edit encrypted file
ansible-playbook bootstrap.yml --ask-vault-pass       # Run with encrypted vars
ansible-playbook bootstrap.yml --vault-password-file ~/.vault_pass  # CI pattern
```

**What you'll build:**

```
playbooks/bootstrap.yml
    |
    +-- role: ssh-hardening    -->  roles/ssh-hardening/
    |       | SSH config hardened
    |
    +-- role: ntp              -->  roles/ntp/
    |       | chrony configured
    |
    +-- role: monitoring-agent -->  roles/monitoring-agent/
    |       | node_exporter running
    |
    +-- role: log-shipping     -->  roles/log-shipping/
            | CloudWatch agent running
```

**You're done when:**
- Each concern lives in its own role directory with `tasks/`, `handlers/`, `defaults/`, and `templates/`
- `group_vars/prod/vault.yml` is encrypted and `ansible-vault view` shows the secrets
- The playbook runs identically with roles as it did with inline tasks
- You can override `node_exporter_port` per environment by changing `group_vars/dev/vars.yml`

Estimated time: 45 minutes.

---

## 3. Summary

### What You Learned

| Concept | Key Insight |
|---------|-------------|
| **Configuration management** | Terraform provisions, Ansible configures — they complement each other |
| **Agentless** | Ansible SSHs in, runs tasks, exits — no daemon on targets |
| **Inventory** | Static for dev, dynamic (AWS EC2 plugin) for production |
| **Playbook** | YAML file declaring desired state; runs tasks in order |
| **Module** | Built-in verbs (yum, systemd, template); idempotent by design |
| **Handler** | Task that runs only when notified — avoids unnecessary restarts |
| **Role** | Reusable, structured unit of tasks — one role per concern |
| **Ansible Vault** | File-level encryption for secrets in Git — different from HashiCorp Vault |
| **Idempotency** | Run twice, get the same result — foundation of reliable automation |
| **Check mode** | `--check` is Ansible's `terraform plan` — preview without applying |
| **Variable precedence** | Defaults (low) -> group_vars -> role vars -> extra-vars (high) |

### Ansible Cheat Sheet

```bash
# Connectivity
ansible all -m ping                               # Test SSH to all hosts
ansible web -m ping                               # Test SSH to web group
ansible all -m setup                              # Gather facts (OS, memory, IPs)
ansible all -m setup -a "filter=ansible_os_family"  # Specific fact

# Running playbooks
ansible-playbook playbooks/bootstrap.yml           # Run full bootstrap
ansible-playbook playbooks/bootstrap.yml --check   # Dry-run (no changes)
ansible-playbook playbooks/bootstrap.yml --diff     # Show file diffs
ansible-playbook playbooks/bootstrap.yml --check --diff  # Both
ansible-playbook playbooks/bootstrap.yml --limit web     # Web hosts only
ansible-playbook playbooks/bootstrap.yml --limit web-1   # Single host
ansible-playbook playbooks/bootstrap.yml --tags monitoring  # Tagged tasks only
ansible-playbook playbooks/bootstrap.yml --skip-tags ssh    # Skip tagged tasks
ansible-playbook playbooks/bootstrap.yml -e "env=prod"      # Override variable
ansible-playbook playbooks/bootstrap.yml -v        # Verbose
ansible-playbook playbooks/bootstrap.yml -vvv      # Very verbose (debug SSH)

# Ad-hoc commands (quick one-off tasks)
ansible web -m yum -a "name=htop state=present" --become  # Install package
ansible web -m systemd -a "name=nginx state=restarted"    # Restart service
ansible web -m command -a "uptime"                         # Run command
ansible web -m copy -a "src=./motd dest=/etc/motd"         # Copy file

# Ansible Vault
ansible-vault encrypt file.yml                     # Encrypt
ansible-vault decrypt file.yml                     # Decrypt
ansible-vault edit file.yml                        # Edit in-place
ansible-vault view file.yml                        # View without decrypting on disk
ansible-vault rekey file.yml                       # Change password
ansible-vault encrypt_string 's3cr3t' --name 'db_pass'  # Encrypt a single string

# Roles
ansible-galaxy init roles/my-role                  # Scaffold role directory
ansible-galaxy install geerlingguy.docker          # Install from Galaxy
ansible-galaxy list                                # List installed roles
ansible-galaxy collection install amazon.aws       # Install AWS collection

# Inventory
ansible-inventory --list                           # Dump full inventory as JSON
ansible-inventory --graph                          # Show group hierarchy
ansible-inventory --host web-1                     # Show vars for one host

# Debugging
ansible-playbook playbooks/bootstrap.yml --syntax-check   # Check YAML syntax
ansible-playbook playbooks/bootstrap.yml --list-tasks      # List tasks without running
ansible-playbook playbooks/bootstrap.yml --list-hosts      # List targeted hosts
ansible-playbook playbooks/bootstrap.yml --step            # Confirm each task
```

### Next Steps

You've completed Stage 6. FinStack hosts are now bootstrapped with hardened SSH, NTP, monitoring agents, and log shipping — all managed by idempotent Ansible playbooks with secrets encrypted by Ansible Vault. Next:

- **Stage 7 (CI/CD Pipeline)** — automate everything in GitHub Actions: plan-on-PR, apply-on-merge, OPA gate, Ansible run post-deploy

**Further learning:**
- Dynamic inventory with the AWS EC2 plugin (see `Ansible.md`)
- Ansible AWX / Tower for enterprise-scale playbook management
- Molecule for testing Ansible roles in isolated containers
- Integrating Ansible with HashiCorp Vault for dynamic secret injection at runtime (combining Stage 4 and Stage 6)
