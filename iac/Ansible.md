# Ansible — A 2-Day Crash Course

> **In one sentence:** Ansible lets you describe the desired state of your servers in YAML
> files, then reaches out over plain SSH and makes it so — no agent installed on the target,
> no daemon to manage, no special setup beyond a working SSH key.
>
> **Prerequisites:** You should be comfortable with SSH, Linux file permissions, and shell
> scripting before this. If not, start with `Linux.md` and `Bash.md` first.

---

## Part 0 — Why Ansible exists

You have 30 servers. You need to install nginx, drop a config file, and restart the service.
Your options without automation: SSH into each box one by one, run the same three commands,
and pray you didn't fat-finger box 17. When a colleague asks "is box 22 configured the same
as box 12?" you can't answer with confidence. When you need to reprovision after a failure,
you're piecing together steps from a wiki that's six months out of date.

This is **configuration drift** — the slow divergence of real server state from intended state —
and it is the silent killer of operational reliability.

Ansible solves it by making server configuration a text file: version-controlled, peer-reviewed,
self-documenting, and re-runnable. You describe *what* you want ("nginx installed and running,
config at `/etc/nginx/nginx.conf` with these contents") and Ansible figures out *how* to get
there. Because it uses SSH — the same tool you already use to manage servers — there's nothing
to install on targets and nothing new to trust.

The key insight: Ansible is **push-based** and **agentless**. Your control node (your laptop
or a CI runner) pushes commands outward to targets over SSH. Compare this to Chef or Puppet,
which require an agent running on every managed node phoning home to a server. Ansible's
model is simpler, easier to reason about, and trivial to extend to ephemeral infrastructure.

**Mental model:** Ansible is a remote control with a script — you describe the buttons to
press in order, and it presses them on every machine in your list simultaneously.

---

## Part 1 — The vocabulary

| Term | Meaning |
|------|---------|
| **Inventory** | The list of hosts (and groups) Ansible manages — static file or dynamic script |
| **Playbook** | A YAML file describing a sequence of plays to run against hosts |
| **Play** | A mapping of a host group to a list of tasks |
| **Task** | A single unit of work — calls one module with arguments |
| **Module** | A built-in or third-party action (copy, apt, service, template, command…) |
| **Role** | A reusable, structured bundle of tasks, variables, files, and templates |
| **Handler** | A task triggered only when notified — used for conditional restarts |
| **Fact** | A variable auto-gathered from a target host (OS, IP, memory, CPU…) |
| **Vault** | Ansible's built-in secret encryption — AES-256 for sensitive vars in your repo |
| **Galaxy** | The community hub for sharing and downloading pre-built roles |

---

## DAY 1 — Get it running

### 1. Install Ansible on your control node

Ansible only needs to be installed on the machine you're running plays *from* — your laptop,
a bastion host, or a CI runner. Targets need only SSH and Python 3.

```bash
# macOS
brew install ansible

# Ubuntu/Debian control node
sudo apt update && sudo apt install -y ansible

# Verify
ansible --version          # shows version, python location, config path
```

Python 3 must exist on target hosts. Most modern Linux distributions ship it. If you're
managing stripped-down containers or Alpine, you'll need to pre-install it — or use
`gather_facts: false` and raw modules that don't require Python.

### 2. Build your first inventory

The inventory tells Ansible which hosts exist and how to group them. Start with a static
INI-format file called `inventory.ini`:

```ini
# inventory.ini

[web]
web01 ansible_host=10.0.1.10
web02 ansible_host=10.0.1.11

[db]
db01  ansible_host=10.0.1.20

[all:vars]
ansible_user=ubuntu
ansible_ssh_private_key_file=~/.ssh/id_rsa
ansible_python_interpreter=/usr/bin/python3
```

Groups (`[web]`, `[db]`) let you target subsets of your fleet. `[all:vars]` sets variables
that apply to every host. You can also set per-host variables inline (`web01 ansible_port=2222`).

Test connectivity immediately — before writing a single playbook:

```bash
ansible all -i inventory.ini -m ping
```

`-m ping` runs the `ping` module, which does an SSH connection, verifies Python is available,
and returns `pong`. If this works, Ansible can reach your hosts. If it fails, fix SSH first —
a playbook won't magically solve connectivity problems.

### 3. Run an ad-hoc command

Before playbooks, use ad-hoc commands to run one-off tasks against your inventory. This is
useful for quick checks and emergency operations:

```bash
# Check disk space on all web servers
ansible web -i inventory.ini -m command -a "df -h /"

# Install a package (as root via sudo)
ansible web -i inventory.ini -m apt -a "name=curl state=present" --become

# Gather facts about a single host
ansible web01 -i inventory.ini -m setup
```

`--become` escalates to root (sudo). `-m command` runs a raw shell command — use it for
one-offs, but prefer specific modules (apt, yum, copy…) in playbooks because modules are
idempotent and commands are not.

### 4. Write your first playbook

A playbook is a YAML file containing one or more plays. Each play targets a group and lists
tasks to execute in order.

```yaml
# site.yml
---
- name: Configure web servers
  hosts: web
  become: true          # run all tasks as root

  tasks:
    - name: Ensure nginx is installed
      apt:
        name: nginx
        state: present
        update_cache: yes

    - name: Ensure nginx is running and enabled
      service:
        name: nginx
        state: started
        enabled: true

    - name: Deploy nginx config
      copy:
        src: files/nginx.conf
        dest: /etc/nginx/nginx.conf
        owner: root
        group: root
        mode: "0644"
      notify: Restart nginx     # triggers handler only if this task changes something

  handlers:
    - name: Restart nginx
      service:
        name: nginx
        state: restarted
```

Run it:

```bash
ansible-playbook -i inventory.ini site.yml
```

Read the output — Ansible reports each task with a status: `ok` (no change needed),
`changed` (action taken), `skipped` (condition not met), or `failed`. A `changed` count of
zero on a re-run means your systems were already in the desired state — that is idempotency
working.

### 5. Understand idempotency

Idempotency is the most important property of a well-written playbook: running it once or
ten times produces the same result. The `apt` module checks whether the package is already
installed before installing. The `copy` module computes a checksum before writing. The
`service` module checks the current state before starting.

When you write a task using `command:` or `shell:`, you bypass this guarantee — those modules
run the command every time regardless of state. Use them sparingly, and when you do, pair them
with `creates:` or `when:` conditions to restore idempotency manually.

### 6. Use check mode before applying to production

```bash
ansible-playbook -i inventory.ini site.yml --check
```

Check mode (`--check`) is a dry run — Ansible predicts what would change without actually
changing it. Use it every time before running a playbook against a production fleet. It won't
catch every case (some modules behave differently in check mode), but it surfaces obvious
mistakes.

Add `--diff` to also see the exact content changes for files:

```bash
ansible-playbook -i inventory.ini site.yml --check --diff
```

**By end of Day 1 you can:**
- Install Ansible and test SSH connectivity with `ansible all -m ping`
- Write a static inventory with host groups and variables
- Run ad-hoc commands for quick one-off operations
- Write a playbook that installs packages, manages services, and deploys config files
- Use handlers for conditional restarts
- Dry-run changes with `--check --diff` before touching production

---

## DAY 2 — Make it real

### 1. Structure with roles

A flat playbook works for a dozen tasks. A hundred tasks becomes unmaintainable.
Roles give you a standard directory layout that separates concerns:

```
roles/
└── nginx/
    ├── tasks/
    │   └── main.yml       # task list — entry point
    ├── handlers/
    │   └── main.yml       # handlers (restart, reload…)
    ├── templates/
    │   └── nginx.conf.j2  # Jinja2 templates
    ├── files/
    │   └── index.html     # static files to copy verbatim
    ├── vars/
    │   └── main.yml       # role-internal variables (high precedence)
    ├── defaults/
    │   └── main.yml       # default variables (low precedence, easily overridden)
    └── meta/
        └── main.yml       # role metadata and dependencies
```

Create the skeleton automatically:

```bash
ansible-galaxy role init roles/nginx
```

Reference the role in a playbook:

```yaml
# site.yml
---
- name: Configure web servers
  hosts: web
  become: true
  roles:
    - nginx
    - { role: certbot, when: enable_tls | default(false) }
```

Roles are reusable across projects. Once you have a battle-tested `nginx` role, every new
project inherits it — no copy-pasting. This is the right abstraction for anything you manage
more than once.

### 2. Jinja2 templates

Static config files work until you need one line to differ between staging and production.
Templates solve this — any file ending in `.j2` is processed through Jinja2 before being
pushed to the host.

```jinja2
{# templates/nginx.conf.j2 #}
worker_processes {{ ansible_processor_vcpus }};   {# fact: auto-detected CPU count #}

server {
    listen {{ nginx_port | default(80) }};
    server_name {{ inventory_hostname }};

    root {{ nginx_document_root }};

    {% if nginx_enable_gzip %}
    gzip on;
    gzip_types text/plain application/json;
    {% endif %}
}
```

Deploy it with the `template` module (not `copy`):

```yaml
- name: Deploy nginx config
  template:
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
  notify: Reload nginx
```

Facts (`ansible_processor_vcpus`, `ansible_default_ipv4.address`, `ansible_os_family`) are
gathered automatically at play start unless you set `gather_facts: false`. You can also
register your own facts mid-play with `set_fact:`.

### 3. Variables and precedence

Ansible has 22 levels of variable precedence. In practice, remember these five in order from
lowest to highest:

1. Role `defaults/main.yml` — lowest, designed to be overridden
2. Inventory group vars (`group_vars/web.yml`)
3. Inventory host vars (`host_vars/web01.yml`)
4. Role `vars/main.yml` — high, rarely override externally
5. Extra vars (`-e key=value` at the command line) — highest, always wins

Structure your variable files:

```
group_vars/
├── all.yml         # vars that apply to every host
├── web.yml         # vars for the [web] group
└── db.yml          # vars for the [db] group
host_vars/
└── web01.yml       # vars specific to web01 only
```

This is the right place to put environment-specific config (staging vs production), not inside
playbooks or roles. Keep roles generic; push specifics into `group_vars`.

### 4. Ansible Vault — secrets in your repo

Never put passwords, API keys, or private keys in plaintext in your repository. Ansible Vault
encrypts files at rest using AES-256, so you can commit secrets safely.

```bash
# Encrypt a new file
ansible-vault create group_vars/all/vault.yml

# Encrypt an existing file
ansible-vault encrypt group_vars/production/secrets.yml

# View without decrypting to disk
ansible-vault view group_vars/production/secrets.yml

# Edit in-place
ansible-vault edit group_vars/production/secrets.yml

# Decrypt to disk (careful — don't commit the result)
ansible-vault decrypt group_vars/production/secrets.yml
```

Convention: prefix all vault variables with `vault_` so they're identifiable at a glance,
then reference them from plaintext variables:

```yaml
# group_vars/all/vars.yml  (plaintext, committed)
db_password: "{{ vault_db_password }}"

# group_vars/all/vault.yml  (encrypted, committed)
vault_db_password: "supersecretpassword"
```

Run playbooks that use vault with:

```bash
# Prompt for vault password interactively
ansible-playbook site.yml --ask-vault-pass

# Use a password file (useful in CI — store the password as a CI secret)
ansible-playbook site.yml --vault-password-file ~/.vault_pass
```

### 5. Dynamic inventory

Static inventory files break down when your infrastructure is ephemeral — autoscaling groups,
spot instances, Docker containers. Dynamic inventory plugins query your cloud provider and
build the host list at runtime.

```bash
# Install AWS collection
ansible-galaxy collection install amazon.aws
```

```yaml
# inventory/aws_ec2.yml
plugin: amazon.aws.aws_ec2
regions:
  - us-east-1
filters:
  instance-state-name: running
  tag:Environment: production
keyed_groups:
  - key: tags.Role
    prefix: role
```

```bash
ansible-inventory -i inventory/aws_ec2.yml --list    # preview what it finds
ansible-playbook -i inventory/aws_ec2.yml site.yml
```

For GCP use `google.cloud.gcp_compute`. For Kubernetes pods use `kubernetes.core.k8s`.
The pattern is always the same: install the collection, write a YAML inventory config,
point `ansible-playbook -i` at it.

### 6. Tags — run a subset of a playbook

Large playbooks take time to run fully. Tags let you execute only the relevant section:

```yaml
- name: Install packages
  apt:
    name: "{{ item }}"
    state: present
  loop: "{{ packages }}"
  tags:
    - packages
    - bootstrap

- name: Deploy application config
  template:
    src: app.conf.j2
    dest: /etc/app/app.conf
  tags:
    - config
    - deploy
```

```bash
# Run only tasks tagged 'deploy'
ansible-playbook site.yml --tags deploy

# Skip tasks tagged 'bootstrap' (useful after first run)
ansible-playbook site.yml --skip-tags bootstrap

# List all tags without running
ansible-playbook site.yml --list-tags
```

### 7. Rolling deployments with serial

By default Ansible runs each task across all hosts in parallel before moving to the next task.
For a web fleet you usually want a rolling restart — process a batch at a time so you never
take the whole fleet down.

```yaml
- name: Rolling update of web fleet
  hosts: web
  become: true
  serial: 2                    # process 2 hosts at a time (also accepts "25%")
  max_fail_percentage: 0       # abort the whole play if any host fails

  tasks:
    - name: Pull latest app artifact
      get_url:
        url: "https://artifacts.example.com/app-{{ app_version }}.tar.gz"
        dest: /opt/app/

    - name: Restart app service
      service:
        name: myapp
        state: restarted
```

With `serial: 2`, Ansible processes `web01` and `web02`, confirms they're healthy, then moves
to `web03` and `web04`. If a host fails, `max_fail_percentage: 0` aborts immediately rather
than continuing to roll bad code across the fleet.

### 8. Ansible in CI — patching pipeline

The canonical SRE use case: run a nightly playbook from your CI system to patch all servers,
verify services are still healthy, and report results.

```yaml
# .github/workflows/patch.yml
name: Nightly patch run

on:
  schedule:
    - cron: "0 2 * * 2"   # 2am every Tuesday

jobs:
  patch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Ansible
        run: pip install ansible

      - name: Write vault password
        run: echo "${{ secrets.ANSIBLE_VAULT_PASS }}" > ~/.vault_pass

      - name: Run patch playbook
        run: |
          ansible-playbook \
            -i inventory/aws_ec2.yml \
            --vault-password-file ~/.vault_pass \
            playbooks/patch.yml
```

Store the vault password as a CI secret (`ANSIBLE_VAULT_PASS`). Never commit it.
See `GitHub-Actions.md` or `GitLab-CI.md` for CI platform specifics.

---

## Worked example — Deploying a web stack

You need to automate deployment of an nginx + app server + PostgreSQL stack across three
environments (dev, staging, prod). Here's how to structure and execute it end-to-end.

1. **Create the directory structure:**
   ```
   webstack/
   ├── inventory/
   │   ├── dev/
   │   │   ├── hosts.ini
   │   │   └── group_vars/
   │   │       ├── all/
   │   │       │   ├── vars.yml
   │   │       │   └── vault.yml    # encrypted
   │   │       └── web.yml
   │   └── prod/
   │       └── aws_ec2.yml          # dynamic
   ├── roles/
   │   ├── common/           # base hardening, NTP, users
   │   ├── nginx/            # install, configure, TLS
   │   ├── app/              # deploy artifact, systemd unit
   │   └── postgres/         # install, create DB and user
   ├── playbooks/
   │   ├── site.yml          # full stack
   │   ├── deploy.yml        # app-only rolling deploy
   │   └── patch.yml         # OS patching
   └── ansible.cfg
   ```

2. **Set `ansible.cfg` for the project** (keeps CLI commands short):
   ```ini
   [defaults]
   inventory           = inventory/dev
   roles_path          = roles
   vault_password_file = ~/.vault_pass
   stdout_callback     = yaml
   ```

3. **Write `playbooks/site.yml`** to apply roles in dependency order:
   ```yaml
   ---
   - name: Apply common baseline to all hosts
     hosts: all
     become: true
     roles:
       - common

   - name: Configure database tier
     hosts: db
     become: true
     roles:
       - postgres

   - name: Configure web tier
     hosts: web
     become: true
     roles:
       - nginx
       - app
   ```

4. **Bootstrap dev environment:**
   ```bash
   ansible-playbook playbooks/site.yml --check --diff   # dry run first
   ansible-playbook playbooks/site.yml                  # apply
   ```

5. **Deploy a new app version without full stack run** (faster, safer in prod):
   ```bash
   ansible-playbook -i inventory/prod/aws_ec2.yml \
     playbooks/deploy.yml \
     -e app_version=2.4.1 \
     --limit role_web \
     --check
   ```
   Remove `--check` to execute. The `serial: 25%` in `deploy.yml` means 25% of web hosts
   are updated at a time — a rolling deploy with automatic abort on failure.

6. **Verify the deployment** with a quick ad-hoc check:
   ```bash
   ansible web -i inventory/prod/aws_ec2.yml \
     -m uri \
     -a "url=http://localhost/health return_content=yes"
   ```
   The `uri` module makes an HTTP request — use it to confirm your app is responding before
   declaring the deploy complete.

---

## Common pitfalls

- **Writing non-idempotent tasks.** Using `shell:` to append a line to a file on every run,
  or `command:` to run a migration that should only run once. Always ask: "what happens if
  this task runs ten times?" If the answer is "it breaks," use `creates:`, `when:`, or the
  right module (`lineinfile`, `blockinfile`, `command` with `changed_when: false`).

- **Ignoring variable precedence.** Defining the same variable in `defaults/`, `vars/`, and
  `group_vars/` and wondering why the wrong one wins. Learn the precedence ladder. Use
  `defaults/` for role parameters you expect callers to override; use `vars/` sparingly for
  role internals.

- **Committing unencrypted secrets.** A plaintext password in `group_vars/production/vars.yml`
  will be in your git history forever once pushed. Encrypt before the first commit, not after.

- **Running without `--check` in production.** Every change to a production playbook gets a
  dry run first, every time. `--check --diff` costs 30 seconds and has saved countless
  outages.

- **Not using handlers for service restarts.** Putting `service: state=restarted` directly in
  a task restarts the service every run, regardless of whether anything changed. A handler
  fires only when notified by a task that actually changed something.

- **Fat inventories with hard-coded IPs.** As soon as you have more than one environment or
  use cloud infrastructure, switch to dynamic inventory or at minimum separate inventory
  directories per environment (`inventory/dev/`, `inventory/prod/`). Hard-coded IPs in a
  single `hosts` file leads to targeting prod when you meant staging.

- **Ignoring `ansible_python_interpreter`.** On systems where `/usr/bin/python` doesn't exist
  (Ubuntu 20.04+, most modern distros), Ansible will warn or fail. Set
  `ansible_python_interpreter=/usr/bin/python3` in `group_vars/all.yml` globally.

- **Galaxy roles without pinned versions.** `ansible-galaxy install geerlingguy.nginx`
  downloads the latest version. Use a `requirements.yml` with explicit versions and commit it.
  Run `ansible-galaxy install -r requirements.yml` in CI to reproduce exactly.

  ```yaml
  # requirements.yml
  roles:
    - name: geerlingguy.nginx
      version: 3.2.0
  collections:
    - name: amazon.aws
      version: 6.5.0
  ```

- **Forgetting `become: true` then debugging cryptic permission errors.** Modules that write
  to system paths or manage services need root. Set `become: true` at the play level, not
  per-task, when most tasks need it.

---

## Quick command reference

```bash
# ── Inventory ──────────────────────────────────────────────────────────────
ansible-inventory -i inventory.ini --list          # show all hosts as JSON
ansible-inventory -i inventory.ini --graph         # show group hierarchy
ansible all -i inventory.ini -m ping               # test connectivity

# ── Ad-hoc commands ────────────────────────────────────────────────────────
ansible web -i inventory.ini -m command -a "uptime"
ansible web -i inventory.ini -m shell   -a "df -h | grep /dev/sda"
ansible web -i inventory.ini -m apt     -a "name=htop state=present" --become
ansible web -i inventory.ini -m service -a "name=nginx state=restarted" --become
ansible web -i inventory.ini -m setup   -a "filter=ansible_os_family"
ansible web -i inventory.ini -m setup                                     # all facts

# ── Playbook execution ──────────────────────────────────────────────────────
ansible-playbook -i inventory.ini site.yml
ansible-playbook -i inventory.ini site.yml --check
ansible-playbook -i inventory.ini site.yml --check --diff
ansible-playbook -i inventory.ini site.yml --limit web01
ansible-playbook -i inventory.ini site.yml --tags deploy
ansible-playbook -i inventory.ini site.yml --skip-tags bootstrap
ansible-playbook -i inventory.ini site.yml -e "app_version=2.4.1"
ansible-playbook -i inventory.ini site.yml -v
ansible-playbook -i inventory.ini site.yml -vvv

# ── Vault ───────────────────────────────────────────────────────────────────
ansible-vault create secret.yml
ansible-vault encrypt existing.yml
ansible-vault decrypt existing.yml
ansible-vault view secret.yml
ansible-vault edit secret.yml
ansible-vault rekey secret.yml                       # change the vault password
ansible-playbook site.yml --ask-vault-pass
ansible-playbook site.yml --vault-password-file ~/.vault_pass

# ── Galaxy ──────────────────────────────────────────────────────────────────
ansible-galaxy role  init   roles/myrole
ansible-galaxy role  install geerlingguy.nginx
ansible-galaxy collection install amazon.aws
ansible-galaxy install -r requirements.yml
ansible-galaxy role  list

# ── Debugging ───────────────────────────────────────────────────────────────
ansible-playbook site.yml --list-tasks
ansible-playbook site.yml --list-tags
ansible-playbook site.yml --list-hosts
ansible-playbook site.yml --start-at-task "Deploy nginx config"
ansible-playbook site.yml --step                     # prompt before each task
```

---

## Next steps after Day 2

- **Ansible + Terraform together** — Terraform provisions the infrastructure (`Terraform.md`),
  Ansible configures what runs on it. They complement each other: Terraform owns cloud
  resources, Ansible owns OS and application state.

- **Packer + Ansible** — Bake your Ansible roles into machine images at build time instead of
  running them at boot. Faster, more reliable instance launch. See `Packer.md`.

- **Containerization** — If your workload moves to containers, Ansible's role shrinks to
  host-level concerns (Docker daemon, kernel params, monitoring agent). See `Docker.md` and
  the Kubernetes crash course.

- **AWX / Ansible Automation Platform** — The open-source web UI and API layer for Ansible.
  Adds RBAC, job scheduling, a visual inventory editor, and an audit log. Worth evaluating
  when multiple teams share playbooks.

- **Molecule** — The standard framework for testing Ansible roles. Spins up Docker containers
  (or VMs), runs your role, and verifies the result. Treat roles like code: test them.

- **Callback plugins and logging** — Ansible's output is good; structured JSON logs shipped
  to your observability stack are better. Look at `ara` (Ansible Run Analysis) for a
  self-hosted playbook history dashboard. Cross-reference `Prometheus.md` and `Loki.md`.

- **Connection plugins** — SSH is the default, but `local`, `docker`, `kubectl`, and
  `winrm` connections exist for managing localhost, containers, pods, and Windows targets.

- **Mitogen strategy plugin** — A drop-in replacement for Ansible's default connection
  strategy that uses persistent Python interpreters. Speeds up large playbook runs by 2-7x
  with no playbook changes required.

---

**The mantra:** Describe the state you want, run the playbook, trust the diff — and if you
wouldn't run it without `--check` first, you're not done writing it.
