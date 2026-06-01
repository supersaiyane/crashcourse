# Puppet — A 2-Day Crash Course

> **In one sentence:** Puppet is a declarative configuration management tool that continuously enforces the desired state of your infrastructure by converging real system state toward what you've described in code. Prerequisite: see `Linux.md`.

---

## Part 0 — Why Puppet exists

Picture a fleet of 200 servers. Six months ago you installed nginx on all of them. Since then, three engineers have logged in and tweaked configs "temporarily." One server's cron tab got edited. Another got a package upgrade that nobody documented. Two servers have sshd configs that contradict your security baseline. None of this was intentional — it accumulated silently. This is **configuration drift**, and it's the quiet killer of reliable infrastructure.

The naive fix is a shell script that you run periodically. But shell scripts are imperative — they describe *how* to change things, not *what the end state should be*. If the server is already in the right state, an imperative script may still touch it, break idempotency, or fail with surprising errors.

Puppet flips the model: you describe the desired state, and Puppet figures out what needs to change (possibly nothing) to reach it. Every 30 minutes by default, Puppet agents check in, compile a **catalog** of your declared intentions, compare it against current state, and apply only the delta. If a rogue engineer edits `/etc/nginx/nginx.conf` by hand, the next agent run puts it back. Silently. Without a ticket.

The thermostat mental model is exact here. You don't tell a thermostat "turn on the furnace for 12 minutes." You tell it "the temperature should be 22°C." The thermostat handles the rest, and it keeps checking. Puppet is the thermostat for your servers.

The payoff: infrastructure that self-heals, audit logs that show every change, and onboarding that takes minutes ("clone this repo, run the agent, done").

**Mental model:** You write the *desired state*. Puppet owns the *path to get there* and the *enforcement loop* that keeps you there.

---

## Part 1 — The vocabulary

| Term | What it is |
|---|---|
| **Manifest** | A `.pp` file containing Puppet code — the unit of authorship |
| **Resource** | The atomic unit of state: a file, a package, a service, a user |
| **Class** | A named block of resources you can include or assign to nodes |
| **Module** | A directory of manifests, templates, files, and data — a reusable unit you publish or consume |
| **Node** | A managed machine — identified by its certificate name (usually hostname) |
| **Catalog** | The compiled document Puppet hands to an agent: the full desired state for *this* node right now |
| **Agent** | The `puppet agent` daemon that runs on each managed node, requests a catalog, applies it |
| **Server (Puppetserver)** | The central JVM service that compiles catalogs, stores facts, manages certificates |
| **Facter** | The fact-gathering tool — each agent runs it before requesting a catalog, giving the server context (OS, IP, memory, etc.) |
| **Hiera** | Puppet's hierarchical data lookup system — separates data (IPs, passwords, flags) from code (logic) |
| **Forge** | The public module registry at `forge.puppet.com` — pre-built modules for nginx, MySQL, etc. |

---

## DAY 1 — Declare your first state

### 1.1 Install Puppet

On a fresh RHEL/Rocky/CentOS 8+ node:

```bash
rpm -Uvh https://yum.puppet.com/puppet7-release-el-8.noarch.rpm
dnf install -y puppet-agent
export PATH=$PATH:/opt/puppetlabs/bin
puppet --version
```

On Ubuntu/Debian:

```bash
wget https://apt.puppet.com/puppet7-release-focal.deb
dpkg -i puppet7-release-focal.deb
apt-get update && apt-get install -y puppet-agent
export PATH=$PATH:/opt/puppetlabs/bin
```

You don't need a Puppetserver on Day 1. `puppet apply` runs manifests locally — no agent/server handshake required. This is how you develop and test.

### 1.2 Write your first manifest

Create `/tmp/hello.pp`:

```puppet
file { '/tmp/hello.txt':
  ensure  => present,
  content => "Hello from Puppet\n",
  owner   => 'root',
  mode    => '0644',
}
```

Apply it:

```bash
puppet apply /tmp/hello.pp
cat /tmp/hello.txt
```

Run it again. Notice Puppet reports no changes — the system is already in the desired state. That's idempotency working exactly as intended.

### 1.3 Resource anatomy

Every Puppet resource follows this structure:

```puppet
type { 'title':
  attribute => value,
  attribute => value,
}
```

The *type* (`file`, `package`, `service`, `user`, `exec`, `cron`, `host`) determines which attributes are valid. The *title* is a unique identifier for this resource instance. Think of the type as a class definition and the title as the instance name.

The four most common resource types:

```puppet
package { 'nginx':
  ensure => installed,   # or 'present', '1.24.0', 'absent', 'purged'
}

file { '/etc/nginx/nginx.conf':
  ensure  => file,
  source  => 'puppet:///modules/nginx/nginx.conf',  # served from module
  owner   => 'root',
  mode    => '0644',
  notify  => Service['nginx'],  # restart nginx if this file changes
}

service { 'nginx':
  ensure => running,
  enable => true,
}

user { 'deploy':
  ensure => present,
  uid    => 1500,
  shell  => '/bin/bash',
  home   => '/home/deploy',
}
```

### 1.4 Ordering and dependencies

Puppet doesn't apply resources in file order by default — it computes a dependency graph. You express dependencies explicitly:

```puppet
package { 'nginx': ensure => installed }

service { 'nginx':
  ensure  => running,
  require => Package['nginx'],  # don't start until package is installed
}
```

The four dependency metaparameters:

| Metaparameter | Meaning |
|---|---|
| `require` | Apply *that* resource before this one |
| `before` | Apply this resource before *that* one |
| `notify` | Apply this first, then refresh *that* (triggers restart/exec) |
| `subscribe` | Refresh this resource when *that* one changes |

Reference syntax: capitalize the type, quote the title — `Package['nginx']`, `File['/etc/nginx/nginx.conf']`, `Service['nginx']`.

### 1.5 Classes

A class groups related resources under a named umbrella:

```puppet
class nginx {
  package { 'nginx':
    ensure => installed,
  }

  service { 'nginx':
    ensure  => running,
    enable  => true,
    require => Package['nginx'],
  }

  file { '/etc/nginx/nginx.conf':
    ensure  => file,
    content => "# managed by Puppet\n",
    notify  => Service['nginx'],
    require => Package['nginx'],
  }
}
```

Include it in another manifest:

```puppet
include nginx
```

Or declare it with parameters:

```puppet
class nginx (
  String $worker_processes = '1',
  Integer $worker_connections = 1024,
) {
  # use $worker_processes inside the class
}

class { 'nginx':
  worker_processes   => '4',
  worker_connections => 2048,
}
```

### 1.6 The agent/server model

For production, you run a Puppetserver and agents check in on a schedule.

On the server:

```bash
dnf install -y puppetserver
systemctl enable --now puppetserver
```

On each agent node, set the server hostname and run:

```bash
# /etc/puppetlabs/puppet/puppet.conf
[agent]
server = puppet.yourdomain.com

puppet agent --test   # manual run, shows output
```

The certificate dance:

```bash
# On server — list pending cert requests
puppetserver ca list

# Sign a specific node
puppetserver ca sign --certname agent1.yourdomain.com

# Sign all pending
puppetserver ca sign --all
```

After the cert is signed, the agent fetches its catalog and applies it. Enable the daemon for recurring runs:

```bash
systemctl enable --now puppet
```

### 1.7 Facter — your system's self-description

Before the agent requests a catalog, Facter runs and collects structured data about the node:

```bash
facter os.family         # RedHat, Debian, Darwin
facter networking.ip     # primary IP
facter memory.system.total
facter virtual           # physical, vmware, kvm, docker
```

These facts are available inside manifests as variables:

```puppet
if $facts['os']['family'] == 'RedHat' {
  package { 'httpd': ensure => installed }
} else {
  package { 'apache2': ensure => installed }
}
```

You can also define custom facts in Ruby or as simple executable scripts dropped into the `facter.d` directory.

**By end of Day 1 you can:**
- Write manifests for files, packages, services, and users
- Apply them locally with `puppet apply`
- Understand resource ordering and dependency notation
- Sign agents against a Puppetserver and trigger catalog runs
- Use Facter facts inside conditional logic

---

## DAY 2 — Make it real

### 2.1 Module structure

A module is the deployable, reusable unit in Puppet. The directory layout is enforced:

```
modules/nginx/
├── manifests/
│   ├── init.pp          # defines class 'nginx'
│   ├── config.pp        # defines class 'nginx::config'
│   └── service.pp       # defines class 'nginx::service'
├── templates/
│   └── nginx.conf.epp   # EPP template
├── files/
│   └── mime.types       # static file served verbatim
├── data/
│   └── common.yaml      # Hiera data local to the module
└── metadata.json        # module name, version, dependencies
```

The `init.pp` file must define a class named after the module. Subclasses follow `module::subclass` naming.

Generate a skeleton:

```bash
puppet module generate yourname-nginx
```

Install a module from the Forge:

```bash
puppet module install puppetlabs-nginx
puppet module install puppetlabs-mysql --version 12.0.2
```

### 2.2 Hiera — separate data from code

Hiera is a key-value lookup system with a configurable hierarchy. The principle: your manifests contain *logic*, Hiera contains *values*.

Configure the hierarchy in `hiera.yaml` (at the environment or global level):

```yaml
version: 5
hierarchy:
  - name: "Node-specific data"
    path: "nodes/%{trusted.certname}.yaml"
  - name: "OS family data"
    path: "os/%{facts.os.family}.yaml"
  - name: "Common data"
    path: "common.yaml"
datadir: data
```

Your `data/common.yaml`:

```yaml
nginx::worker_processes: "auto"
nginx::worker_connections: 1024
profile::base::ntp_servers:
  - 0.pool.ntp.org
  - 1.pool.ntp.org
```

Your `data/nodes/webserver01.yaml`:

```yaml
nginx::worker_processes: "8"
```

In the manifest, you look values up with automatic class parameter binding — Puppet matches `nginx::worker_processes` in Hiera to the `$worker_processes` parameter of the `nginx` class automatically. No explicit lookup call needed for class parameters. For ad-hoc lookups:

```puppet
$ntp_servers = lookup('profile::base::ntp_servers', Array[String], 'unique')
```

Hiera's hierarchy means `webserver01.yaml` overrides `common.yaml` for `nginx::worker_processes`, but falls through to `common.yaml` for everything else. This is the right place to store environment-specific IPs, feature flags, and credentials (encrypted with hiera-eyaml).

### 2.3 The roles and profiles pattern

This is the most important design pattern in Puppet at scale. Without it, large code bases become unmaintainable.

**Profile:** A thin wrapper around one technology. It pulls in one or more modules and binds Hiera data to them. Profiles are technology-centric — `profile::nginx`, `profile::mysql`, `profile::base`.

**Role:** Describes a business function by composing profiles. One role per node. Roles contain only `include` statements — no resources, no logic, no data.

```puppet
# modules/profile/manifests/nginx.pp
class profile::nginx {
  include nginx
  # any site-specific glue goes here
}

# modules/role/manifests/webserver.pp
class role::webserver {
  include profile::base
  include profile::nginx
  include profile::app
}
```

Node classification then becomes trivial:

```puppet
# site.pp or an ENC
node 'webserver01.prod' {
  include role::webserver
}
```

This pattern keeps roles readable (they read like job descriptions), profiles testable (one profile = one concern), and modules reusable (they know nothing about your org).

### 2.4 EPP templates

When you need dynamic file content, use Embedded Puppet (EPP) templates. EPP replaces the older ERB format and is preferred for new code.

```
<%- | String $worker_processes,
      Integer $worker_connections | -%>
worker_processes  <%= $worker_processes %>;

events {
    worker_connections  <%= $worker_connections %>;
}
```

Reference it in your manifest:

```puppet
file { '/etc/nginx/nginx.conf':
  ensure  => file,
  content => epp('nginx/nginx.conf.epp', {
    worker_processes   => $worker_processes,
    worker_connections => $worker_connections,
  }),
  notify  => Service['nginx'],
}
```

The `epp()` function renders the template at catalog compile time on the server. The agent receives the final rendered string — it never sees the template.

### 2.5 Environments

Puppet environments isolate code branches. Each environment has its own `modules/` directory, `manifests/site.pp`, and `hiera.yaml`. The default environment is `production`.

```
/etc/puppetlabs/code/environments/
├── production/
│   ├── manifests/site.pp
│   ├── modules/
│   └── hiera.yaml
├── staging/
│   └── ...
└── development/
    └── ...
```

Test a change by pointing an agent at a non-production environment:

```bash
puppet agent --test --environment staging
```

With r10k or Code Manager (the standard tooling for this), each Git branch maps to an environment automatically. A push to the `staging` branch deploys to the `staging` environment. This is Puppet's equivalent of a GitOps pipeline.

### 2.6 Puppet Bolt — agentless execution

Bolt is Puppet's task runner for nodes that don't have an agent, for one-off commands, or for bootstrapping. It uses SSH or WinRM — no agent required.

```bash
# Run a command on remote nodes
bolt command run 'df -h' --targets web1,web2

# Run a task (structured, with parameters)
bolt task run package action=install name=nginx --targets web1

# Run a plan (multi-step Puppet code + tasks)
bolt plan run myplan --targets all

# Apply a manifest directly (no agent needed)
bolt apply site.pp --targets web1 --noop
```

Bolt plans are written in Puppet language and can orchestrate multi-step workflows: drain load balancer, upgrade package, verify, re-add to rotation. Think of Bolt as Puppet for humans in a hurry, and agents as Puppet for machines operating continuously. See `Ansible.md` for a comparison — Bolt occupies a similar niche but integrates tightly with the Puppet ecosystem.

### 2.7 Testing with PDK and rspec-puppet

The Puppet Development Kit (PDK) is the standard testing toolchain.

```bash
gem install pdk     # or use the PDK package installer

pdk new module mymodule
pdk new class mymodule
pdk validate         # syntax, style, metadata checks
pdk test unit        # runs rspec-puppet tests
```

A basic rspec-puppet spec:

```ruby
# spec/classes/nginx_spec.rb
require 'spec_helper'

describe 'nginx' do
  on_supported_os.each do |os, os_facts|
    context "on #{os}" do
      let(:facts) { os_facts }

      it { is_expected.to compile.with_all_deps }
      it { is_expected.to contain_package('nginx').with_ensure('installed') }
      it { is_expected.to contain_service('nginx').with_ensure('running') }
      it { is_expected.to contain_service('nginx').that_requires('Package[nginx]') }
    end
  end
end
```

`compile.with_all_deps` validates the catalog compiles cleanly — it catches missing dependencies, duplicate resources, and type mismatches before any agent touches a real server. This is the fastest feedback loop you have.

### 2.8 Puppet vs Ansible vs Chef

| Dimension | Puppet | Ansible | Chef |
|---|---|---|---|
| Model | Declarative, pull | Procedural, push | Declarative, pull |
| Agent | Required (or Bolt) | Agentless (SSH) | Required |
| Language | Puppet DSL (Ruby-like) | YAML playbooks | Ruby DSLs |
| Learning curve | Steeper up front | Gentler | Steepest |
| Enforcement loop | Native, continuous | Requires cron/AWX | Native, continuous |
| Strength | Large fleet convergence | Ad-hoc + orchestration | Deep Ruby flexibility |
| State store | PuppetDB | None native | Chef Automate |

If your problem is "enforce state continuously across 500+ servers," Puppet is strong. If your problem is "run these tasks on 10 servers right now," reach for Ansible (see `Ansible.md`). They compose well — many teams use Puppet for base OS state and Ansible for application deployments. Puppet doesn't replace `Terraform.md` either; Terraform provisions infrastructure, Puppet configures what's running on it.

---

## Worked example — Managing an nginx fleet

Goal: manage nginx installation, config, and service on all nodes classified as webservers, with worker count driven by Hiera.

**Step 1 — Module structure**

```
modules/profile/manifests/nginx.pp
modules/role/manifests/webserver.pp
data/common.yaml
data/nodes/webserver01.yaml
```

**Step 2 — Install the upstream nginx module**

```bash
puppet module install puppet-nginx --modulepath ./modules
```

**Step 3 — Profile**

```puppet
# modules/profile/manifests/nginx.pp
class profile::nginx {
  class { 'nginx':
    worker_processes   => lookup('profile::nginx::worker_processes', String, 'first', '1'),
    worker_connections => lookup('profile::nginx::worker_connections', Integer, 'first', 1024),
  }
}
```

**Step 4 — Role**

```puppet
# modules/role/manifests/webserver.pp
class role::webserver {
  include profile::base
  include profile::nginx
}
```

**Step 5 — Hiera data**

```yaml
# data/common.yaml
profile::nginx::worker_processes: "1"
profile::nginx::worker_connections: 1024

# data/nodes/webserver01.yaml
profile::nginx::worker_processes: "4"
```

**Step 6 — Node classification in site.pp**

```puppet
# manifests/site.pp
node /^webserver/ {
  include role::webserver
}
```

**Step 7 — Deploy and run**

```bash
# Push code to production environment via r10k
r10k deploy environment production -pv

# Force immediate agent run on one node to verify
puppet agent --test --server puppet.yourdomain.com
```

The agent on `webserver01` compiles a catalog where `worker_processes` is `4` (from its node-specific Hiera data). All other webservers get `1` from `common.yaml`. If someone manually edits `/etc/nginx/nginx.conf`, the next agent run (within 30 minutes) reverts it.

---

## Common pitfalls

- **Duplicate resource declarations.** Puppet will hard-fail if two places in your catalog declare the same resource title. Use `ensure_packages()` from `stdlib` or `defined()` checks when modules share dependencies.

- **Ordering assumptions.** Don't assume alphabetical or file order. Always express dependencies explicitly with `require`, `before`, `notify`, or `subscribe`. Silent ordering bugs are the hardest to debug.

- **Class included twice with different parameters.** A class is a singleton in a catalog — you can't `class { 'nginx': ... }` twice with different values. Use defined resource types (`define`) when you need multiple instances, or restructure with Hiera so parameters come from data, not from the declaration site.

- **Using `exec` as a catch-all.** The `exec` resource runs shell commands, but it breaks idempotency unless you set `unless`, `onlyif`, or `creates`. Overusing `exec` means you're writing a shell script in Puppet syntax. Reach for a proper resource type first.

- **Not separating data from code.** Hardcoded IPs, passwords, and environment names inside manifests make modules impossible to reuse and dangerous to publish. Push all values to Hiera from day one.

- **Ignoring catalog compilation errors in CI.** A catalog that fails to compile silently in production means nodes get no changes and drift silently. Run `puppet parser validate` and `rspec-puppet` on every pull request.

- **Certificate sprawl.** Every node needs a signed cert. Automate cert signing with policy-based autosigning only on trusted internal networks — never blindly autosign on public infrastructure. Revoke certs for decommissioned nodes with `puppetserver ca clean`.

- **Conflating Puppet environments with application environments.** Puppet's `production` environment is a code branch, not your production infrastructure. You can have nodes in your real production datacenter running the Puppet `staging` environment while you test changes. Keep the concepts distinct.

- **Skipping PDK and going straight to `puppet apply`.** Local `puppet apply` won't catch catalog dependency issues that only surface with a full node classification. Use `pdk test unit` and test in a staging environment before merging to `production`.

---

## Quick command reference

```bash
# Apply a manifest locally
puppet apply manifest.pp

# Apply with verbose output and dry-run (noop)
puppet apply manifest.pp --noop --verbose

# Run agent once, print output, don't daemonize
puppet agent --test

# Run agent against a specific environment
puppet agent --test --environment staging

# Inspect a resource's current state
puppet resource file /etc/nginx/nginx.conf
puppet resource package nginx
puppet resource service nginx

# Validate manifest syntax
puppet parser validate manifest.pp

# Check Facter facts
facter os
facter networking.ip
facter -p   # include plugin facts

# Module management
puppet module install puppetlabs-stdlib
puppet module list
puppet module upgrade puppetlabs-nginx

# Certificate management (on Puppetserver)
puppetserver ca list           # pending requests
puppetserver ca sign --certname node1.example.com
puppetserver ca clean --certname node1.example.com   # revoke + delete

# Bolt — agentless
bolt command run 'uptime' --targets web1,web2
bolt task run package action=status name=nginx --targets web1
bolt apply site.pp --targets web1 --noop

# r10k — deploy environments from Git
r10k deploy environment production -pv
r10k deploy environment staging -pv

# PDK — testing
pdk validate
pdk test unit
pdk new class mymodule::config
```

---

## Next steps after Day 2

- **`Ansible.md`** — compare push vs pull models, learn when Ansible's agentless approach wins, and see how the two tools compose in a real fleet
- **`Terraform.md`** — understand the boundary between infrastructure provisioning (Terraform) and configuration management (Puppet); they complement, not compete
- **`Linux.md`** — deepen your understanding of the system primitives Puppet manages: systemd units, file permissions, package managers, and cron
- **`Bash.md`** — write robust `exec` resources and custom facts; shell fluency makes your Puppet code safer
- **`Docker.md`** — understand why containers shift (but don't eliminate) config management needs; Puppet manages the hosts that run your container runtime

---

## Recommended learning resources

**YouTube channels & playlists:**
- [Puppet — Official Channel](https://www.youtube.com/@Puppet) — PuppetConf talks, PDK tutorials, and module development guides
- [KodeKloud — Puppet for Beginners](https://www.youtube.com/@KodeKloud) — hands-on labs covering manifests, modules, and Hiera
- [TechWorld with Nana — Configuration Management](https://www.youtube.com/@TechWorldwithNana) — beginner-friendly overview of Puppet vs Ansible vs Chef
- [Learn Linux TV — Puppet Basics](https://www.youtube.com/@LearnLinuxTV) — practical series on agent setup, manifests, and module structure
- [DevOps Toolkit (Viktor Farcic) — Config Management Comparison](https://www.youtube.com/@DevOpsToolkit) — where Puppet fits in the modern IaC landscape

**Official docs & blogs:**
- [Puppet Documentation](https://www.puppet.com/docs/puppet/latest/puppet_index.html) — language reference, type reference, and module development guide
- [Puppet Blog](https://www.puppet.com/blog) — release notes, State of DevOps reports, and compliance automation patterns

**The mantra:** Describe what should exist — let the machine close the gap, every thirty minutes, forever.
