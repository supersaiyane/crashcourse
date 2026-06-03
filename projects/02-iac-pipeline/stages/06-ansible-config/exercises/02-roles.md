# Exercise 2: Roles — Refactor into Reusable Units and Encrypt Secrets

**Goal:** Refactor the monolithic bootstrap playbook into four reusable roles — `ssh-hardening`, `ntp`, `monitoring-agent`, and `log-shipping`. Set up `group_vars` for dev and prod. Encrypt production secrets with Ansible Vault. Verify the refactored playbook produces identical results.

**Time:** 45 minutes

---

## Step 1: Scaffold the Roles

```bash
cd finstack/ansible

ansible-galaxy init roles/ssh-hardening
ansible-galaxy init roles/ntp
ansible-galaxy init roles/log-shipping
# monitoring-agent already exists in the FinStack scaffold
```

Verify:

```bash
ls roles/*/tasks/main.yml
```

Expected: four roles listed.

---

## Step 2: Extract Tasks into Roles

Move SSH hardening tasks from `playbooks/bootstrap.yml` into `roles/ssh-hardening/tasks/main.yml`. Create `roles/ssh-hardening/defaults/main.yml` with tuneable defaults:

```yaml
# roles/ssh-hardening/defaults/main.yml
---
ssh_max_auth_tries: 3
ssh_idle_timeout: 300
```

Create `roles/ssh-hardening/handlers/main.yml`:

```yaml
---
- name: restart sshd
  ansible.builtin.systemd:
    name: sshd
    state: restarted
```

Repeat for `ntp` (extract chrony tasks, default `ntp_server`) and `log-shipping` (extract CloudWatch tasks, default `cloudwatch_log_group`). Each role gets its own `tasks/`, `defaults/`, and `handlers/` as needed.

---

## Step 3: Rewrite the Playbook

Replace all inline tasks in `playbooks/bootstrap.yml` with role calls:

```yaml
# playbooks/bootstrap.yml (refactored)
---
- name: Bootstrap FinStack hosts
  hosts: finstack
  become: true
  gather_facts: true

  roles:
    - role: ssh-hardening
    - role: ntp
    - role: monitoring-agent
    - role: log-shipping
```

---

## Step 4: Set Up group_vars

```bash
mkdir -p group_vars/all group_vars/dev group_vars/prod
```

Create `group_vars/all/vars.yml`, `group_vars/dev/vars.yml`, and `group_vars/prod/vars.yml` with environment-specific values (see the Stage 6 README for examples).

---

## Step 5: Encrypt Production Secrets

```bash
ansible-vault create group_vars/prod/vault.yml
```

Enter a vault password (e.g., `finstack-lab`). Add synthetic secrets:

```yaml
vault_db_password: "pr0d-db-s3cr3t-2024"
vault_api_key: "ak-prod-finstack-xyz789"
```

Reference them in `group_vars/prod/vars.yml`:

```yaml
db_password: "{{ vault_db_password }}"
api_key: "{{ vault_api_key }}"
```

Verify encryption:

```bash
head -1 group_vars/prod/vault.yml
# Expected: $ANSIBLE_VAULT;1.1;AES256

ansible-vault view group_vars/prod/vault.yml
# Enter password — should show plaintext values
```

---

## Step 6: Run and Verify

Start the Docker target (if not running):

```bash
docker run -d --name ansible-target --privileged \
  -p 2222:22 -p 9100:9100 \
  -v /sys/fs/cgroup:/sys/fs/cgroup:ro \
  --tmpfs /run --tmpfs /run/lock \
  geerlingguy/docker-amazonlinux2-ansible:latest
```

Run the refactored playbook:

```bash
ansible-playbook -i inventory/lab.ini playbooks/bootstrap.yml
```

Expected: `failed=0`. Run again: `changed=0`.

---

## Step 7: Test Variable Override

Change `node_exporter_port` in `group_vars/dev/vars.yml` to `9200`. Run the playbook — the monitoring-agent role should report `changed` (new port). Verify with `curl localhost:9200/metrics`. Revert to `9100`.

---

## Step 8: Clean Up

```bash
docker stop ansible-target && docker rm ansible-target
```

---

## You're Done When

- [x] Four roles exist with proper `tasks/`, `defaults/`, `handlers/` structure
- [x] `playbooks/bootstrap.yml` contains only role calls — no inline tasks
- [x] `group_vars/prod/vault.yml` is AES-256 encrypted
- [x] `ansible-vault view` shows the secrets after entering the password
- [x] Refactored playbook produces identical results (`failed=0`, then `changed=0`)
- [x] Changing a variable in `group_vars/dev/vars.yml` changes behaviour without editing a role

## Common Mistakes

- **Handlers not found** — handler names must match exactly between `notify:` and the handler definition
- **Variable not overriding** — `defaults/main.yml` (lowest priority) is overridden by `group_vars`; put tuneable values in `defaults/`, not `vars/`
- **Vault password mismatch** — store it in `~/.vault_pass` and use `--vault-password-file` for repeatability
- **Role not found** — ensure `roles_path = roles` in `ansible.cfg`
