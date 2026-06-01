# SaltStack — A 2-Day Crash Course

Salt is a configuration management and remote execution engine — it manages thousands of servers in seconds using a master/minion architecture with a ZeroMQ message bus.

**Prerequisite:** [`Linux.md`](../Linux.md)

---

## Part 0 — Why Salt?

You already know the landscape. Ansible is agentless but slow at scale — it SSHes into every host sequentially or in batches, and at 500 nodes that latency adds up. Puppet is agent-based and powerful, but its DSL is a learning curve of its own, and the catalog compilation overhead can be significant.

Salt sits in the middle — and then exceeds both. It is agent-based like Puppet, so it has persistent connections and fast response times. It is Python-native like Ansible, so extending it feels natural. Its secret weapon is ZeroMQ: a high-performance asynchronous message bus that lets the master fan out a command to 10,000 minions and collect results in under a second.

Salt also blurs the line between configuration management and remote execution. You can apply declarative states (like Puppet or Ansible), but you can also run imperative commands against arbitrary subsets of your fleet right now — without writing a playbook or a manifest first. That duality is what makes it genuinely different.

---

## Vocabulary

| Term | What it means |
|---|---|
| **Master** | The central server that issues commands and stores state definitions |
| **Minion** | An agent running on a managed node; connects outbound to the master |
| **Grain** | Static or slow-changing facts about a minion (OS, CPU, hostname, custom tags) |
| **Pillar** | Secure, per-minion data stored on the master — secrets, env-specific config |
| **State** | A declarative description of what a minion should look like |
| **SLS** | "SaLt State" file — YAML + Jinja2, the format for states and pillars |
| **Top File** | `top.sls` — maps minions to the states they should receive |
| **Execution Module** | A Python module that performs imperative tasks (`cmd`, `pkg`, `service`, `file`, …) |
| **Highstate** | Applying all states assigned to a minion via `top.sls` |
| **Reactor** | An event-driven rule: "when event X fires, run function Y" |
| **Beacon** | A minion-side monitor that emits events to the master (disk usage, process state, etc.) |
| **Salt-SSH** | Agentless mode — Salt over SSH, no minion daemon required |
| **Salt-Cloud** | Provisions VMs on cloud providers and bootstraps minions automatically |

---

## DAY 1 — Get Running

### Install the Master

On a dedicated Ubuntu/Debian host:

```bash
curl -fsSL https://repo.saltproject.io/salt/py3/ubuntu/22.04/amd64/latest.gpg \
  | sudo gpg --dearmor -o /usr/share/keyrings/salt-archive-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/salt-archive-keyring.gpg] \
  https://repo.saltproject.io/salt/py3/ubuntu/22.04/amd64/latest jammy main" \
  | sudo tee /etc/apt/sources.list.d/salt.list

sudo apt-get update && sudo apt-get install -y salt-master
sudo systemctl enable --now salt-master
```

Edit `/etc/salt/master` to expose the interface if needed:

```yaml
interface: 0.0.0.0
```

Restart after any master config change: `sudo systemctl restart salt-master`

### Install a Minion

On each managed node:

```bash
sudo apt-get install -y salt-minion
```

Edit `/etc/salt/minion`:

```yaml
master: <master-ip-or-hostname>
id: web01   # optional; defaults to hostname
```

```bash
sudo systemctl enable --now salt-minion
```

The minion generates a key pair and sends its public key to the master. Nothing happens until you accept it.

### Accept Minion Keys

On the master:

```bash
# List pending keys
sudo salt-key -L

# Accept a specific minion
sudo salt-key -a web01

# Accept all pending (use carefully in production)
sudo salt-key -A
```

Once accepted, the minion is ready.

### Remote Execution — Your First Commands

```bash
# Ping all minions (not ICMP — Salt's own health check)
sudo salt '*' test.ping

# Run a shell command on all minions
sudo salt '*' cmd.run 'uptime'

# Target by minion ID glob
sudo salt 'web*' cmd.run 'df -h /'

# Install a package
sudo salt 'web01' pkg.install nginx

# Check a service
sudo salt '*' service.status nginx
```

The `'*'` is a glob targeting expression. You will refine this with grains shortly.

### Grains — System Facts

Grains are collected automatically at minion start. They include OS, kernel version, IP addresses, CPU architecture, and more.

```bash
# List all grains for a minion
sudo salt 'web01' grains.items

# Get a specific grain
sudo salt 'web01' grains.get os
sudo salt 'web01' grains.get fqdn

# Target by grain value
sudo salt -G 'os:Ubuntu' cmd.run 'lsb_release -a'
sudo salt -G 'environment:production' test.ping
```

You can set custom grains on a minion — useful for tagging:

```bash
sudo salt 'web01' grains.setval environment production
sudo salt 'web01' grains.setval role webserver
```

Or define them statically in `/etc/salt/grains` on the minion:

```yaml
environment: production
role: webserver
datacenter: us-east-1
```

### Your First State File

States live on the master under `/srv/salt/`. Create the directory if it does not exist:

```bash
sudo mkdir -p /srv/salt
```

Create `/srv/salt/nginx.sls`:

```yaml
nginx_package:
  pkg.installed:
    - name: nginx

nginx_service:
  service.running:
    - name: nginx
    - enable: True
    - require:
      - pkg: nginx_package
```

Apply it to a single minion:

```bash
sudo salt 'web01' state.apply nginx
```

Salt reports each state with a `Succeeded`/`Failed` count and whether changes were made (`changed=1`) or the system was already correct (`changed=0`). Idempotency is built in — running the same state twice does not reinstall nginx.

### The Top File — Targeting at Scale

`/srv/salt/top.sls` is the entry point for highstate. It maps minions to states:

```yaml
base:
  '*':
    - common.ntp
    - common.users

  'role:webserver':
    - match: grain
    - nginx
    - certbot

  'role:database':
    - match: grain
    - postgresql
    - pgbouncer
```

Apply highstate to all minions:

```bash
sudo salt '*' state.highstate
```

Apply to one minion for testing:

```bash
sudo salt 'web01' state.highstate
```

Dry run — no changes applied:

```bash
sudo salt 'web01' state.highstate test=True
```

---

## DAY 2 — Go Deeper

### Pillars — Per-Minion Secrets and Config

Pillars are sensitive or environment-specific data stored on the master and pushed to minions securely. A minion only receives the pillar data assigned to it.

Pillar files live under `/srv/pillar/`. Create `/srv/pillar/top.sls`:

```yaml
base:
  'role:webserver':
    - match: grain
    - webserver

  'web01':
    - secrets.web01
```

Create `/srv/pillar/webserver.sls`:

```yaml
nginx:
  worker_processes: 4
  keepalive_timeout: 65
  server_name: example.com
```

Create `/srv/pillar/secrets/web01.sls`:

```yaml
db_password: "correct-horse-battery-staple"
api_key: "sk-prod-abc123"
```

Refresh pillars on minions:

```bash
sudo salt '*' saltutil.refresh_pillar
```

Access or verify pillar data:

```bash
sudo salt 'web01' pillar.get nginx:server_name
sudo salt 'web01' pillar.items
```

⚠️ Pillar data is stored in plaintext on the master filesystem. For production secrets, integrate with Vault using `salt-ext-pillar` or the `vault` execution module. Restrict master filesystem permissions tightly regardless.

### Jinja Templating in States

SLS files are rendered through Jinja2 before being parsed as YAML. This lets you reference grains and pillars directly:

```yaml
# /srv/salt/nginx/config.sls

nginx_config:
  file.managed:
    - name: /etc/nginx/nginx.conf
    - source: salt://nginx/files/nginx.conf.j2
    - template: jinja
    - context:
        worker_processes: {{ pillar['nginx']['worker_processes'] }}
        server_name: {{ pillar['nginx']['server_name'] }}
```

The template at `/srv/salt/nginx/files/nginx.conf.j2`:

```jinja
worker_processes {{ worker_processes }};

http {
    server {
        listen 80;
        server_name {{ server_name }};
    }
}
```

You can also branch directly in SLS without a separate template context:

```jinja
{% if grains['os_family'] == 'Debian' %}
apt_transport_https:
  pkg.installed:
    - name: apt-transport-https
{% elif grains['os_family'] == 'RedHat' %}
epel_release:
  pkg.installed:
    - name: epel-release
{% endif %}
```

### Requisites — Ordering and Triggering

Salt resolves a dependency graph rather than executing states in file order. You express dependencies with requisites:

```yaml
nginx_package:
  pkg.installed:
    - name: nginx

nginx_config:
  file.managed:
    - name: /etc/nginx/nginx.conf
    - source: salt://nginx/files/nginx.conf.j2
    - template: jinja
    - require:
      - pkg: nginx_package     # only run after nginx is installed

nginx_service:
  service.running:
    - name: nginx
    - enable: True
    - require:
      - pkg: nginx_package
    - watch:
      - file: nginx_config     # restart nginx when config changes
```

Key requisites:

| Requisite | Meaning |
|---|---|
| `require` | Run only after this dependency succeeds |
| `watch` | Run (or restart service) if the watched state changed |
| `require_in` | Inverse require — declare from the dependency side |
| `watch_in` | Inverse watch |
| `onchanges` | Run only if this state made a change |
| `unless` | Skip if this shell command exits 0 |
| `onlyif` | Run only if this shell command exits 0 |

### Salt-SSH — Agentless Mode

You do not always want or need a minion. Salt-SSH connects over SSH using your existing keys:

```bash
sudo apt-get install -y salt-ssh
```

Define your roster at `/etc/salt/roster`:

```yaml
web01:
  host: 192.168.1.10
  user: ubuntu
  sudo: True
  priv: /home/ubuntu/.ssh/id_rsa

web02:
  host: 192.168.1.11
  user: ubuntu
  sudo: True
```

Run commands and states exactly as with the master/minion model:

```bash
sudo salt-ssh '*' test.ping
sudo salt-ssh 'web01' cmd.run 'uptime'
sudo salt-ssh '*' state.apply nginx
```

Salt-SSH is slower than the message bus but useful for bootstrapping, ephemeral nodes, or environments where persistent agents are not permitted.

### Reactors and Beacons

**Beacons** watch for events on the minion and emit them to the master event bus:

```yaml
# /etc/salt/minion.d/beacons.conf
beacons:
  disk:
    - interval: 60
    - /: 85
    - /var: 90
  service:
    - interval: 30
    - nginx:
        onchangeonly: True
```

**Reactors** on the master listen for events and respond:

```yaml
# /etc/salt/master.d/reactor.conf
reactor:
  - 'salt/beacon/*/disk/':
    - /srv/reactor/disk_alert.sls
  - 'salt/beacon/*/service/':
    - /srv/reactor/restart_service.sls
```

Reactor SLS at `/srv/reactor/restart_service.sls`:

```yaml
restart_failed_service:
  local.service.restart:
    - tgt: {{ data['id'] }}
    - arg:
      - {{ data['name'] }}
```

This is Salt's event-driven automation layer. Beacons emit, reactors respond — no external monitoring glue required.

### Orchestration

For multi-tier deployments where order across minions matters, use Salt's orchestration runner on the master:

```yaml
# /srv/salt/orch/deploy_webapp.sls

update_database:
  salt.state:
    - tgt: 'role:database'
    - tgt_type: grain
    - sls:
      - postgresql.migrate

update_webservers:
  salt.state:
    - tgt: 'role:webserver'
    - tgt_type: grain
    - sls:
      - nginx
      - webapp.deploy
    - require:
      - salt: update_database
```

Run the orchestration from the master:

```bash
sudo salt-run state.orchestrate orch.deploy_webapp
```

This gives you Ansible-style playbook ordering across your fleet, with all of Salt's speed.

### Salt-Cloud

Salt-Cloud provisions VMs and bootstraps minions in one step:

```yaml
# /etc/salt/cloud.providers.d/aws.conf
my-aws:
  driver: ec2
  region: us-east-1
  id: AKIAIOSFODNN7EXAMPLE
  key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
  keyname: my-keypair
  securitygroup: sg-0abc12345
  private_key: /root/.ssh/my-keypair.pem
```

```yaml
# /etc/salt/cloud.profiles.d/webserver.conf
web-ubuntu-22:
  provider: my-aws
  image: ami-0c55b159cbfafe1f0
  size: t3.medium
  grains:
    role: webserver
    environment: production
```

```bash
# Provision a single new minion
sudo salt-cloud -p web-ubuntu-22 web03

# Provision from a map file (multiple nodes)
sudo salt-cloud -m /etc/salt/cloud.maps.d/prod.map
```

The node is provisioned, salt-minion is installed, the key is accepted, and the host joins your fleet — all in one command.

### Salt vs Ansible vs Puppet

| Dimension | Salt | Ansible | Puppet |
|---|---|---|---|
| Architecture | Master/minion (agent) | Agentless (SSH) | Master/agent |
| Language | Python + YAML/Jinja | YAML + Jinja | Puppet DSL (Ruby-like) |
| Speed at scale | Excellent (ZeroMQ) | Moderate (SSH batches) | Good (catalog compilation) |
| Remote execution | First-class | Via `command`/`shell` | Limited (MCollective) |
| Learning curve | Moderate | Low | High (DSL) |
| Secret handling | Pillar + Vault | Ansible Vault | Hiera + Vault |
| Event-driven | Native (reactor/beacon) | External (AWX/EDA) | Limited native |
| Community | Smaller, active | Largest | Large, enterprise-focused |
| Best for | Large fleets, real-time control | Small-medium, simplicity | Enterprise, compliance |

Pick Salt when you need speed, real-time remote execution, or event-driven automation at scale. Pick Ansible when your team already knows it and fleet size is manageable. Pick Puppet when you are in an enterprise environment with a compliance-heavy workflow.

---

## Worked Example — Web Server Fleet

You manage 20 web servers. They all run nginx, share a base config, but have individual TLS certs and database passwords. Here is how you structure it.

**Directory layout:**

```
/srv/salt/
├── top.sls
├── common/
│   ├── init.sls       # NTP, users, SSH keys
│   └── sudoers.sls
├── nginx/
│   ├── init.sls       # install + service
│   ├── config.sls     # rendered nginx.conf
│   └── files/
│       └── nginx.conf.j2
└── webapp/
    └── deploy.sls     # pull latest release, symlink, restart

/srv/pillar/
├── top.sls
├── common.sls
└── per-host/
    ├── web01.sls      # db_password, tls_cert_path
    └── web02.sls
```

`/srv/salt/top.sls`:

```yaml
base:
  'role:webserver':
    - match: grain
    - common
    - nginx
    - nginx.config
    - webapp.deploy
```

`/srv/pillar/top.sls`:

```yaml
base:
  'role:webserver':
    - match: grain
    - common

  'web01':
    - per-host.web01

  'web02':
    - per-host.web02
```

`/srv/salt/nginx/config.sls`:

```yaml
nginx_conf:
  file.managed:
    - name: /etc/nginx/nginx.conf
    - source: salt://nginx/files/nginx.conf.j2
    - template: jinja
    - user: root
    - group: root
    - mode: '0644'
    - watch_in:
      - service: nginx_service
```

Deploy to the whole fleet:

```bash
sudo salt -G 'role:webserver' state.highstate
```

Check for configuration drift without making changes:

```bash
sudo salt -G 'role:webserver' state.highstate test=True
```

---

## Pitfalls

**Key management overhead.** Every new minion requires key acceptance on the master. In autoscaling environments, automate this with `salt-cloud` or pre-seed keys via user-data scripts. Leaving unaccepted keys piling up is a security and operational hazard.

**Pillar data is not encrypted at rest.** The master stores pillars as plaintext files. Anyone with master filesystem access can read all your secrets. Use Vault integration for secrets that matter.

**Top file targeting mistakes.** When your top file grows large across multiple environments, incorrect targeting can apply states to the wrong minions. Always run `test=True` before highstate on production. Run `salt 'web01' state.show_highstate` to preview exactly what will be applied.

**Jinja errors are opaque.** A syntax error in a Jinja template produces a confusing Python traceback, not a line-numbered template error. Always test templates on a single non-production minion first.

**ZeroMQ timeouts at scale.** If your master is underpowered and you have thousands of minions, you will see timeout errors on large highstate runs. Tune `worker_threads`, `timeout`, and `gather_job_timeout` in `/etc/salt/master`. Consider a Salt syndic (hierarchical master) for very large fleets.

**State ordering assumptions.** Newcomers expect top-to-bottom execution. Salt builds a dependency graph — if you do not declare requisites, states may run in any order. Always use `require` and `watch` to make ordering explicit.

**Grain manipulation is not secure.** Minions can set their own grains. Do not use grain-based targeting for security-sensitive decisions. Use pillar (master-controlled) for data that must be trusted.

---

## Quick Reference

```bash
# Key management
salt-key -L                           # list all keys
salt-key -a <minion-id>               # accept one
salt-key -d <minion-id>               # delete/reject one
salt-key -A                           # accept all pending

# Remote execution
salt '*' test.ping                    # health check
salt '*' cmd.run 'uptime'             # run shell command
salt 'web*' pkg.install nginx         # install package
salt '*' service.restart nginx        # restart service
salt 'web01' disk.usage /             # check disk

# Targeting
salt '*' ...                          # all minions
salt 'web01' ...                      # exact ID
salt 'web*' ...                       # glob
salt -G 'os:Ubuntu' ...               # grain match
salt -L 'web01,web02,db01' ...        # explicit list
salt -E 'web[0-9]+' ...               # regex

# States
salt 'web01' state.apply nginx        # apply one state
salt '*' state.highstate              # apply all assigned states
salt '*' state.highstate test=True    # dry run
salt 'web01' state.show_highstate     # preview what will be applied

# Pillars and grains
salt 'web01' pillar.items             # all pillars
salt 'web01' pillar.get db_password   # one key
salt '*' saltutil.refresh_pillar      # force pillar refresh
salt 'web01' grains.items             # all grains
salt 'web01' grains.setval role db    # set custom grain

# Orchestration
salt-run state.orchestrate orch.deploy_webapp

# Salt-SSH
salt-ssh '*' test.ping
salt-ssh 'web01' state.apply nginx

# Debugging
salt 'web01' state.apply nginx -l debug     # verbose output
salt-call state.highstate test=True         # run locally on minion
salt-call --local state.apply nginx         # masterless mode
```

---

## Next Steps

- [`Ansible.md`](Ansible.md) — compare agentless automation at smaller scale
- [`Puppet.md`](Puppet.md) — explore DSL-based configuration management with strong compliance tooling
- [`Terraform.md`](Terraform.md) — provision the infrastructure Salt then configures
- [`Linux.md`](../Linux.md) — deepen the OS fundamentals Salt depends on

---

## Recommended learning resources

**YouTube channels & playlists:**
- [Salt Project — Official Channel](https://www.youtube.com/@SaltProject) — SaltConf talks, state tutorials, and orchestration walkthroughs
- [TechWorld with Nana — Configuration Management](https://www.youtube.com/@TechWorldwithNana) — beginner-friendly comparison of Salt, Ansible, and Puppet
- [KodeKloud — SaltStack Basics](https://www.youtube.com/@KodeKloud) — hands-on labs covering states, pillars, and remote execution
- [DevOps Toolkit (Viktor Farcic) — Config Management at Scale](https://www.youtube.com/@DevOpsToolkit) — where Salt fits in the modern automation landscape
- [Learn Linux TV — Server Automation](https://www.youtube.com/@LearnLinuxTV) — practical Linux automation patterns applicable to Salt

**Official docs & blogs:**
- [Salt Documentation](https://docs.saltproject.io/en/latest/) — state reference, execution modules, and pillar guides
- [Salt Project Blog](https://saltproject.io/blog/) — release notes, community updates, and event-driven automation patterns

## The Mantra

> States declare intent. Execution enforces it. The bus makes it instant.
> You do not log into servers — you target them, describe what they should be, and let Salt make reality match the description.
