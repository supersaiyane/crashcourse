# Exercise 1: Bootstrap Playbook — Configure FinStack Hosts

**Goal:** Run the FinStack bootstrap playbook against a local Docker container that simulates an EC2 instance. Verify SSH hardening, NTP configuration, and node_exporter installation. Confirm idempotency by running the playbook twice.

**Time:** 45 minutes

---

## Step 1: Start the Ansible Lab Environment

From the `finstack` directory, start a Docker container that simulates an Amazon Linux 2 EC2 instance with systemd:

```bash
cd finstack

docker run -d \
  --name ansible-target \
  --privileged \
  -p 2222:22 \
  -p 9100:9100 \
  -v /sys/fs/cgroup:/sys/fs/cgroup:ro \
  --tmpfs /run \
  --tmpfs /run/lock \
  geerlingguy/docker-amazonlinux2-ansible:latest
```

Verify the container is running:

```bash
docker ps --filter name=ansible-target
```

Expected output:

```
CONTAINER ID   IMAGE                                          STATUS    PORTS
a1b2c3d4e5f6   geerlingguy/docker-amazonlinux2-ansible:latest Up 10s    0.0.0.0:2222->22/tcp, 0.0.0.0:9100->9100/tcp
```

---

## Step 2: Set Up the Lab Inventory

Navigate to the Ansible directory and create a lab inventory:

```bash
cd finstack/ansible
```

Create `inventory/lab.ini`:

```ini
# inventory/lab.ini — local Docker target for exercises
[finstack]
target ansible_host=127.0.0.1 ansible_port=2222 ansible_user=root ansible_ssh_pass=ansible

[web]
target

[finstack:vars]
environment=dev
ntp_server=pool.ntp.org
node_exporter_version=1.7.0
node_exporter_port=9100
cloudwatch_log_group=/finstack/dev/syslog
```

---

## Step 3: Test Connectivity

```bash
ansible -i inventory/lab.ini all -m ping
```

Expected output:

```
target | SUCCESS => {
    "changed": false,
    "ping": "pong"
}
```

Gather facts to confirm the OS:

```bash
ansible -i inventory/lab.ini all -m setup -a "filter=ansible_distribution*"
```

Expected: `"ansible_distribution": "Amazon"`.

---

## Step 4: Run in Check Mode First

Preview what the playbook would change without touching the host:

```bash
ansible-playbook -i inventory/lab.ini playbooks/bootstrap.yml --check --diff
```

Expected: all tasks show `changed` (nothing is configured yet). Read each task name — this is the safety net.

---

## Step 5: Apply the Bootstrap Playbook

```bash
ansible-playbook -i inventory/lab.ini playbooks/bootstrap.yml
```

Expected output (summary):

```
PLAY RECAP *********************************************************************
target                     : ok=15   changed=12   unreachable=0    failed=0    skipped=0
```

The critical check: `failed=0` and `unreachable=0`.

---

## Step 6: Verify the Configuration

Check node_exporter is serving metrics:

```bash
curl -s http://localhost:9100/metrics | head -5
```

Expected: Prometheus metric lines starting with `# HELP` and `# TYPE`.

Verify SSH hardening:

```bash
ansible -i inventory/lab.ini all -m command -a "grep PermitRootLogin /etc/ssh/sshd_config"
```

Expected: `PermitRootLogin no`.

---

## Step 7: Verify Idempotency

Run the playbook again:

```bash
ansible-playbook -i inventory/lab.ini playbooks/bootstrap.yml
```

Expected:

```
PLAY RECAP *********************************************************************
target                     : ok=15   changed=0    unreachable=0    failed=0    skipped=0
```

**`changed=0` is the proof of idempotency.** Ansible detected the system already matches the desired state.

---

## Step 8: Simulate Drift and Auto-Correct

Break SSH config manually:

```bash
docker exec ansible-target sed -i 's/PermitRootLogin no/PermitRootLogin yes/' /etc/ssh/sshd_config
```

Detect the drift with check mode:

```bash
ansible-playbook -i inventory/lab.ini playbooks/bootstrap.yml --check --diff
```

Expected: one task shows `changed` with a diff.

Fix the drift:

```bash
ansible-playbook -i inventory/lab.ini playbooks/bootstrap.yml
```

Expected: `changed=1` — only the drifted line was corrected.

---

## Step 9: Clean Up

```bash
docker stop ansible-target && docker rm ansible-target
```

---

## You're Done When

- [x] `ansible all -m ping` returns `pong` from the Docker target
- [x] `ansible-playbook bootstrap.yml` completes with `failed=0`
- [x] A second run shows `changed=0` (idempotency confirmed)
- [x] `curl localhost:9100/metrics` returns Prometheus metrics
- [x] You simulated drift and Ansible auto-corrected it
- [x] You understand what check mode and diff mode show you

## Common Mistakes

- **Forgetting `-i inventory/lab.ini`** — Ansible defaults to the inventory in `ansible.cfg`, not your lab file
- **Container not running systemd** — `--privileged` and the cgroup volume are required
- **SSH connection refused** — wait a few seconds for sshd to start in the container
- **`changed` on second run** — look for `command`/`shell` tasks without idempotency guards
