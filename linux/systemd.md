# systemd — A 2-Day Crash Course

> **In one sentence:** systemd is the init system and service manager on modern Linux — it starts your services, manages dependencies, handles logging (journald), and schedules timers — if it runs on Linux, systemd probably manages it. Prerequisite: see `Linux.md`.

---

## Part 0 — Why systemd exists

Before systemd, Linux used SysVinit. Every service was a shell script in `/etc/init.d/`. If you wanted `nginx` to start after `networking`, you encoded that with numbered symlinks (`S20networking`, `S80nginx`) and hoped for the best. There was no parallelism — services started one at a time. There was no supervision — if a service crashed, nothing restarted it. Logs were wherever the service decided to write them, in whatever format it chose.

systemd replaced all of that in one sweep. It defines services, mounts, timers, sockets, and devices as *units* — declarative configuration files with a consistent syntax. It tracks dependency graphs and starts units in parallel where possible. It supervises processes and restarts them on failure. It captures all stdout/stderr into a structured binary log (journald) that you can query by service, priority, time, or field.

The controversy around systemd is real — it does a lot, and some people dislike that. But in 2026 it ships on every major distribution. You need to know it.

**Mental model:** systemd is the operating system's project manager — it knows which services depend on which, starts them in parallel where possible, restarts them when they crash, and keeps a structured log of everything.

---

## Part 1 — The vocabulary

| Term | What it means |
|---|---|
| **Unit** | The fundamental object systemd manages — a file describing a service, mount, timer, socket, etc. |
| **Service** | A unit that manages a process — the most common unit type (`.service`). |
| **Target** | A grouping unit — like a runlevel. `multi-user.target` is "system up, no GUI". `graphical.target` adds a desktop. |
| **Timer** | A unit that triggers another unit on a schedule — systemd's replacement for cron (`.timer`). |
| **Socket** | A unit that manages an IPC or network socket — enables socket activation (`.socket`). |
| **Journal (journald)** | systemd's logging subsystem — captures structured logs from all units, queryable with `journalctl`. |
| **systemctl** | The primary command-line interface for controlling systemd and inspecting unit state. |
| **Unit File** | The declarative config file for a unit — lives in `/etc/systemd/system/` or `/lib/systemd/system/`. |
| **WantedBy** | A directive in `[Install]` that declares which target should pull this unit in when enabled. |
| **Slice** | A unit that represents a cgroup hierarchy node — used to group processes and apply resource limits. |

---

## DAY 1 — Manage services

### 1.1 — The basic lifecycle commands

These five commands cover 80% of daily work:

```bash
# Start a service right now (does not persist across reboots)
systemctl start nginx

# Stop a running service
systemctl stop nginx

# Restart — stop then start
systemctl restart nginx

# Reload config without restarting the process (if the service supports it)
systemctl reload nginx

# Show current state, recent log lines, and the main PID
systemctl status nginx
```

`status` output is your first stop when something is wrong. It shows you the active/inactive/failed state, the last five journal lines, and the cgroup tree.

### 1.2 — Enabling and disabling services at boot

"Running" and "enabled" are separate concepts. A service can be running but not enabled (won't survive reboot) or enabled but not running (will start next boot but isn't started now).

```bash
# Enable: create the symlink that makes this service start at boot
systemctl enable nginx

# Enable AND start it now in one command
systemctl enable --now nginx

# Disable: remove the symlink (does not stop it if running)
systemctl disable nginx

# Disable AND stop it now
systemctl disable --now nginx

# Check whether a service is enabled
systemctl is-enabled nginx

# Check whether a service is active (running)
systemctl is-active nginx
```

### 1.3 — Reading unit files

Before you write one, read some. This is how you learn the syntax and what options are available:

```bash
# Show the unit file systemd is actually using (follows overrides)
systemctl cat nginx

# Show all properties of a unit
systemctl show nginx

# List all loaded units of type service
systemctl list-units --type=service

# List all unit files (including disabled ones)
systemctl list-unit-files --type=service
```

Unit files have three sections: `[Unit]` (metadata and dependencies), `[Service]` (how to run it), and `[Install]` (how `enable` hooks it into targets). Most of what you need to understand is in `[Service]`.

### 1.4 — Viewing logs with journalctl

journald captures every byte written to stdout and stderr by every service. The journal is binary and indexed — queries are fast.

```bash
# Follow logs in real time (like tail -f)
journalctl -f

# Show logs for one specific unit
journalctl -u nginx

# Follow logs for one unit
journalctl -fu nginx

# Show logs since the last boot
journalctl -b

# Show logs from the previous boot (useful after a crash)
journalctl -b -1

# Filter by time range
journalctl --since "2026-05-30 10:00" --until "2026-05-30 11:00"

# Filter by priority (0=emerg, 3=err, 6=info, 7=debug)
journalctl -p err

# Show only kernel messages
journalctl -k

# Show the last 100 lines
journalctl -n 100

# Output in JSON (useful for piping to jq — see jq.md)
journalctl -u nginx -o json | jq '.MESSAGE'
```

### 1.5 — Writing your first service unit file

Create a file at `/etc/systemd/system/myapp.service`:

```ini
[Unit]
Description=My Application
Documentation=https://example.com/docs
After=network.target

[Service]
Type=simple
User=myapp
WorkingDirectory=/opt/myapp
ExecStart=/opt/myapp/bin/myapp --config /etc/myapp/config.yaml
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Then tell systemd to pick it up and start it:

```bash
systemctl daemon-reload   # required after creating or editing a unit file
systemctl enable --now myapp
systemctl status myapp
```

`Type=simple` means the process you exec IS the main process — systemd tracks that PID directly. Other types: `forking` (service daemonizes itself), `notify` (service sends sd_notify when ready), `exec` (like simple but waits for exec to succeed).

### 1.6 — Understanding targets

Targets are named synchronization points. When the system boots, systemd works toward `default.target` (usually symlinked to `multi-user.target` on servers or `graphical.target` on desktops).

```bash
# See the current default target
systemctl get-default

# Change the default target
systemctl set-default multi-user.target

# Switch to a target right now (like changing runlevels)
systemctl isolate rescue.target

# List all available targets
systemctl list-units --type=target
```

Common targets you'll encounter:

| Target | Equivalent | Meaning |
|---|---|---|
| `poweroff.target` | runlevel 0 | Shutdown |
| `rescue.target` | runlevel 1 | Single-user/recovery |
| `multi-user.target` | runlevel 3 | Multi-user, no GUI |
| `graphical.target` | runlevel 5 | Multi-user + GUI |
| `reboot.target` | runlevel 6 | Reboot |

**By end of Day 1 you can:** start, stop, enable, and disable services; read unit files; query the journal by unit, time, and priority; write a basic service unit that runs your app on boot.

---

## DAY 2 — Make it real

### 2.1 — Advanced unit file options

A production service unit looks different from the minimal Day 1 version. Here's what the additional directives do:

```ini
[Unit]
Description=Go API Server
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
Type=notify
User=goapi
Group=goapi
WorkingDirectory=/opt/goapi

# Environment variables — never put secrets here directly
Environment=APP_ENV=production
Environment=LOG_LEVEL=info
EnvironmentFile=/etc/goapi/env   # one KEY=VALUE per line

# Run a check before starting (non-zero exit aborts the start)
ExecStartPre=/opt/goapi/bin/goapi --check-config

ExecStart=/opt/goapi/bin/goapi serve
ExecStartPost=/usr/bin/curl -sf http://localhost:8080/healthz

# Graceful shutdown: send SIGTERM, wait 30s, then SIGKILL
ExecStop=/bin/kill -TERM $MAINPID
TimeoutStopSec=30

# Restart policy
Restart=on-failure
RestartSec=5s
StartLimitIntervalSec=60s
StartLimitBurst=3          # give up after 3 failures in 60s

# Resource limits (cgroups)
MemoryMax=512M
CPUQuota=50%
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

`Wants` vs `Requires`: `Wants` expresses a soft dependency — if `network-online.target` fails to start, your service still tries. `Requires` is hard — your service won't start if the dependency fails. `After` only controls ordering; it does not imply a dependency.

### 2.2 — Timers: replacing cron

A systemd timer consists of two units: a `.timer` file that defines the schedule and a matching `.service` file that does the work. The names must match.

```ini
# /etc/systemd/system/backup.timer
[Unit]
Description=Run database backup daily

[Timer]
OnCalendar=daily
Persistent=true       # run immediately if the last run was missed (e.g., system was off)
RandomizedDelaySec=5m # spread load — don't run exactly at midnight

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/backup.service
[Unit]
Description=Database Backup
After=postgresql.service

[Service]
Type=oneshot
User=backup
ExecStart=/usr/local/bin/backup.sh
```

`OnCalendar` format: `daily`, `weekly`, `hourly`, `Mon *-*-* 02:00:00`, `*:0/15` (every 15 minutes). Check your expression:

```bash
systemd-analyze calendar "Mon *-*-* 02:00:00"
# Lists next several trigger times

# Enable the timer (not the service — the timer starts the service)
systemctl enable --now backup.timer

# List all active timers with their next trigger time
systemctl list-timers
```

### 2.3 — Socket activation

Socket activation lets systemd hold open a socket and start the service only when a connection arrives. Useful for services that are rarely used — the socket is always "available" but the process only runs when needed.

```ini
# /etc/systemd/system/myapi.socket
[Unit]
Description=My API Socket

[Socket]
ListenStream=8080
Accept=no

[Install]
WantedBy=sockets.target
```

When a connection arrives on port 8080, systemd starts `myapi.service` and passes the socket as file descriptor 3. The service reads from that FD rather than binding itself. This also enables zero-downtime restarts — the socket stays open while the old process exits and the new one starts.

### 2.4 — Templated units

If you have multiple instances of the same service (e.g., multiple Redis instances on different ports), use a template unit. The filename contains `@`:

```ini
# /etc/systemd/system/redis@.service
[Unit]
Description=Redis instance %i

[Service]
ExecStart=/usr/bin/redis-server /etc/redis/%i.conf
User=redis

[Install]
WantedBy=multi-user.target
```

`%i` is the instance name — the part after `@` in the unit name:

```bash
systemctl start redis@6379
systemctl start redis@6380
systemctl enable redis@6379
```

### 2.5 — Drop-in overrides

Never edit the unit file in `/lib/systemd/system/` — a package update will overwrite your changes. Instead, use a drop-in override:

```bash
# Opens a drop-in editor automatically
systemctl edit nginx

# To replace the entire unit file (not just override selected fields)
systemctl edit --full nginx
```

`systemctl edit` creates `/etc/systemd/system/nginx.service.d/override.conf`. Only the directives you specify are overridden — everything else comes from the original. To add an environment variable to an existing service without touching its unit file:

```ini
# /etc/systemd/system/nginx.service.d/override.conf
[Service]
Environment=MY_VAR=hello
```

⚠️ To clear a repeated directive (like `ExecStart`), you must first set it to empty, then set the new value — otherwise systemd appends:

```ini
[Service]
ExecStart=
ExecStart=/usr/sbin/nginx -g "daemon off;" -c /etc/nginx/custom.conf
```

### 2.6 — Debugging failed services

When `systemctl status myapp` shows `failed`, work through this sequence:

```bash
# 1. See the last journal output — often the error is right here
journalctl -u myapp -n 50

# 2. Check for dependency failures
systemctl list-dependencies myapp

# 3. See why it's in a failed state
systemctl show myapp --property=Result
systemctl show myapp --property=ExecMainStatus

# 4. Try starting it interactively to see output directly
systemd-run --unit=test-myapp --pty /opt/myapp/bin/myapp

# 5. Analyze boot timing (find slow or failed units)
systemd-analyze blame
systemd-analyze critical-chain myapp.service

# 6. Reset the failed state so you can try again
systemctl reset-failed myapp
```

`StartLimitBurst` stops systemd from endlessly restarting a broken service. After the burst limit is hit, `systemctl reset-failed` clears it so you can attempt a restart after fixing the underlying issue.

### 2.7 — Security hardening

systemd gives you a sandboxing toolkit. Use it. These directives go in `[Service]`:

```ini
[Service]
# Run as a dynamically allocated UID/GID — no persistent user needed
DynamicUser=yes

# Mount /usr, /boot, /etc as read-only
ProtectSystem=strict

# Make /home, /root, /run/user inaccessible
ProtectHome=yes

# Prevent privilege escalation (no setuid bits, no sudo)
NoNewPrivileges=yes

# Give the service its own /tmp — isolated from other processes
PrivateTmp=yes

# Restrict which system calls are allowed
SystemCallFilter=@system-service

# Restrict which address families can be used
RestrictAddressFamilies=AF_INET AF_INET6

# Make the service unable to write to most of the filesystem
ReadWritePaths=/var/lib/myapp /var/log/myapp
```

`DynamicUser=yes` is the highest-impact single directive — it allocates an ephemeral UID that doesn't exist in `/etc/passwd`, preventing the service from ever impersonating a real system user.

Audit a service's security posture:

```bash
systemd-analyze security myapp.service
# Outputs a score and table of enabled/missing hardening options
```

### 2.8 — journald configuration and log rotation

journald configuration lives at `/etc/systemd/journald.conf`. Key settings:

```ini
[Journal]
# Maximum size of the journal on disk
SystemMaxUse=2G

# How long to keep journal entries
MaxRetentionSec=3month

# Compress entries
Compress=yes

# Forward to syslog (set to yes if you're using a syslog collector)
ForwardToSyslog=no

# Log to /run/log/journal (volatile, cleared on reboot) vs /var/log/journal (persistent)
Storage=persistent
```

After changing `journald.conf`:

```bash
systemctl restart systemd-journald

# Manually vacuum old entries
journalctl --vacuum-size=500M
journalctl --vacuum-time=2weeks

# See how much disk the journal is using
journalctl --disk-usage
```

---

## Worked example — Deploying a Go API as a systemd service

You've built a Go HTTP API that binds to port 8080. Here's the complete production setup.

**1. Create the user and directories:**

```bash
useradd --system --no-create-home --shell /usr/sbin/nologin goapi
mkdir -p /opt/goapi/bin /etc/goapi /var/lib/goapi
chown goapi:goapi /var/lib/goapi
cp ./dist/goapi /opt/goapi/bin/goapi
chmod 755 /opt/goapi/bin/goapi
```

**2. Write the service unit:**

```ini
# /etc/systemd/system/goapi.service
[Unit]
Description=Go API Service
Documentation=https://internal.example.com/goapi
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=goapi
Group=goapi
WorkingDirectory=/opt/goapi

EnvironmentFile=-/etc/goapi/env    # the - prefix makes missing file non-fatal

ExecStartPre=/opt/goapi/bin/goapi --validate-config
ExecStart=/opt/goapi/bin/goapi serve --addr :8080

Restart=on-failure
RestartSec=5s
StartLimitIntervalSec=120s
StartLimitBurst=5

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=goapi

# Resource limits
MemoryMax=256M
CPUQuota=40%
LimitNOFILE=65536

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=/var/lib/goapi

[Install]
WantedBy=multi-user.target
```

**3. Write a timer for periodic log export:**

```ini
# /etc/systemd/system/goapi-log-export.timer
[Unit]
Description=Export goapi logs hourly

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/goapi-log-export.service
[Unit]
Description=Export goapi logs to object storage
After=goapi.service

[Service]
Type=oneshot
User=goapi
ExecStart=/usr/local/bin/export-logs.sh goapi
```

**4. Enable and verify:**

```bash
systemctl daemon-reload
systemctl enable --now goapi
systemctl enable --now goapi-log-export.timer

# Check status
systemctl status goapi
journalctl -fu goapi

# Verify timer
systemctl list-timers goapi-log-export.timer
```

**5. Expose metrics to Prometheus** — see `Prometheus.md`. The standard approach is to run a sidecar exporter (`process-exporter`, `node_exporter`) and have it scrape `/proc` data for the `goapi` cgroup. Your app can also expose its own `/metrics` endpoint — journald logs appear in Prometheus via `promtail` + Loki (see `Loki.md`).

---

## Common pitfalls

- **Forgetting `daemon-reload` after editing a unit file.** systemd caches unit files in memory. If you edit a file and don't run `systemctl daemon-reload`, systemd runs the old version. Do this every time.

- **Confusing `enable` with `start`.** `enable` creates the symlink for boot. `start` runs it now. A newly enabled service will not start until next boot unless you also run `start` (or use `--now`).

- **Writing `Requires=` when you mean `After=`.** `Requires=network.target` does not mean "start after network is up" — it means "fail if network.target fails." Use `After=` for ordering. Often you want `After=network-online.target Wants=network-online.target` together.

- **Using `Type=forking` for a service that doesn't fork.** If your process doesn't daemonize itself (most modern services don't — they run in the foreground), use `Type=simple` or `Type=exec`. `Type=forking` with a non-forking process causes systemd to wait forever for a PID that never appears.

- **Putting secrets in `Environment=`.** Environment variables in unit files are readable by anyone who can run `systemctl show`. Use `EnvironmentFile=` pointing to a file with `0600` permissions, or better, use a secrets manager.

- **Ignoring `StartLimitBurst`.** When a broken service hits the burst limit, systemd stops trying to restart it. `systemctl status` shows `failed` with a message about start limit reached. The fix is `systemctl reset-failed myapp` after resolving the underlying issue.

- **Editing files in `/lib/systemd/system/`.** Package updates overwrite these. Always use `systemctl edit` or place overrides in `/etc/systemd/system/`.

- **Not using `PrivateTmp=yes` for services that handle untrusted input.** Without it, your service shares `/tmp` with every other process on the system — a classic privilege escalation vector.

- **Expecting `journalctl -f` to show old logs.** `-f` follows from the current end of the journal. To see recent history AND follow, combine: `journalctl -fu myapp`.

- **Overlooking `systemd-analyze security`.** You've written a service unit but left half the hardening options off the table. Run this command before calling a service "production ready."

---

## Quick command reference

### systemctl

```bash
systemctl start|stop|restart|reload <unit>
systemctl status <unit>
systemctl enable|disable [--now] <unit>
systemctl is-active|is-enabled|is-failed <unit>
systemctl daemon-reload
systemctl cat <unit>
systemctl show <unit> [--property=<key>]
systemctl edit [--full] <unit>
systemctl list-units [--type=service|timer|socket]
systemctl list-unit-files [--type=service]
systemctl list-timers
systemctl list-dependencies <unit>
systemctl reset-failed [<unit>]
systemctl isolate <target>
systemctl get-default
systemctl set-default <target>
systemd-analyze blame
systemd-analyze critical-chain <unit>
systemd-analyze security <unit>
systemd-analyze calendar "<expression>"
```

### journalctl

```bash
journalctl                          # all logs
journalctl -f                       # follow
journalctl -u <unit>                # filter by unit
journalctl -fu <unit>               # follow by unit
journalctl -b                       # since last boot
journalctl -b -1                    # previous boot
journalctl -p err                   # filter by priority
journalctl -k                       # kernel messages only
journalctl -n <N>                   # last N lines
journalctl --since "YYYY-MM-DD HH:MM"
journalctl --until "YYYY-MM-DD HH:MM"
journalctl -o json                  # JSON output
journalctl --disk-usage
journalctl --vacuum-size=<size>
journalctl --vacuum-time=<duration>
```

### Unit file directives

```ini
# [Unit] section
Description=          # human-readable name
Documentation=        # URL or man page
After=                # start ordering (soft)
Before=               # start ordering (soft, reverse)
Wants=                # soft dependency
Requires=             # hard dependency
BindsTo=              # like Requires but also stops with dependency

# [Service] section
Type=                 # simple|exec|forking|oneshot|notify|dbus
User=                 # run as this user
Group=                # run as this group
WorkingDirectory=     # set working dir before exec
ExecStartPre=         # run before ExecStart
ExecStart=            # the main command
ExecStartPost=        # run after ExecStart succeeds
ExecStop=             # graceful shutdown command
ExecReload=           # reload command
Restart=              # no|on-success|on-failure|on-abnormal|always
RestartSec=           # seconds between restart attempts
StartLimitIntervalSec=
StartLimitBurst=
Environment=          # KEY=VALUE pairs
EnvironmentFile=      # path to file with KEY=VALUE pairs
TimeoutStartSec=
TimeoutStopSec=
StandardOutput=       # journal|null|inherit|file:path
StandardError=        # journal|null|inherit|file:path
SyslogIdentifier=     # tag for journal entries
MemoryMax=            # cgroup memory limit
CPUQuota=             # cgroup CPU limit (e.g. 50%)
LimitNOFILE=          # open file descriptor limit
# Security
NoNewPrivileges=yes
ProtectSystem=        # strict|full|yes
ProtectHome=          # yes|read-only|tmpfs
PrivateTmp=yes
DynamicUser=yes
ReadWritePaths=       # paths the service may write to
SystemCallFilter=     # syscall allowlist
RestrictAddressFamilies=

# [Timer] section
OnCalendar=           # daily|weekly|hourly|Mon *-*-* 02:00:00
OnBootSec=            # relative to boot
OnUnitActiveSec=      # relative to last activation
Persistent=yes        # catch up on missed runs
RandomizedDelaySec=   # spread load across a window

# [Install] section
WantedBy=             # which target enables this unit
RequiredBy=           # hard version of WantedBy
Alias=                # alternative names for this unit
```

---

## Next steps after Day 2

- **`Linux.md`** — process management, file permissions, networking fundamentals that underpin everything systemd manages.
- **`Bash.md`** — write reliable `ExecStartPre` scripts, log parsers, and maintenance scripts triggered by timers.
- **`Docker.md`** — systemd can manage containers directly via `podman` (which has native systemd integration via `podman generate systemd`), or you run Docker itself as a systemd service.
- **cgroups deep-dive** — systemd exposes cgroups v2 through `Slice=`, `MemoryMax=`, `CPUWeight=`, and `IOWeight=`. Understanding cgroups lets you reason precisely about resource isolation — essential when running multiple services on the same host.
- **`Prometheus.md`** — scrape `node_exporter` for systemd unit state metrics (`node_systemd_unit_state`), alert on failed services, and build dashboards over service uptime.

---

## Recommended learning resources

**YouTube channels & playlists:**
- [LearnLinuxTV — systemd Deep Dive](https://www.youtube.com/@LearnLinuxTV) — structured series covering units, targets, timers, and journal from basics to production
- [The Urban Penguin — systemd Administration](https://www.youtube.com/@TheUrbanPenguin) — detailed tutorials on service files, socket activation, and cgroup resource controls
- [NetworkChuck — systemd for Beginners](https://www.youtube.com/@NetworkChuck) — approachable first look at managing services on modern Linux
- [tutoriaLinux — systemd Services and Timers](https://www.youtube.com/@tutoriaLinux) — practical systemd usage for ops engineers building reliable service management
- [Fireship — systemd Explained](https://www.youtube.com/@Fireship) — fast overview of what systemd replaced and why it matters

**Official docs & blogs:**
- [systemd Official Documentation (systemd.io)](https://systemd.io/) — the upstream project site with links to man pages, design docs, and FAQs
- [Lennart Poettering's systemd Blog Series](http://0pointer.de/blog/projects/systemd.html) — the original design rationale from systemd's creator, still the best "why" explanation
- [Arch Wiki — systemd](https://wiki.archlinux.org/title/Systemd) — community-maintained, comprehensive, and practical reference for all systemd components

**The mantra:** If you don't know what's wrong, `systemctl status` and `journalctl -fu` — everything else follows from there.
