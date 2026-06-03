# Exercise 2: Process Management

**Goal:** Understand processes, signals, and how to manage running programs.

## Step 1 — View the process tree

```bash
ps auxf
```

Find PID 1 — it's `systemd` on Ubuntu. Look at its children.
- `USER` — who owns the process
- `PID` — process ID
- `%CPU`, `%MEM` — resource usage
- `STAT` — process state (S = sleeping, R = running, Z = zombie)

## Step 2 — Interactive monitoring

```bash
top
```

Press `q` to quit. Try:
- `Shift+P` — sort by CPU
- `Shift+M` — sort by memory
- `k` — kill a process (enter PID, then signal)

## Step 3 — Send signals

```bash
sleep 120 &
bg_pid=$!
echo "Background sleep PID is $bg_pid"
kill -15 $bg_pid
ps -p $bg_pid

sleep 120 &
bg_pid=$!
kill -9 $bg_pid
ps -p $bg_pid
```

Notice the difference: `kill -15` (SIGTERM) politely asks the process to stop. `kill -9` (SIGKILL) cannot be caught — the kernel terminates immediately.

## Step 4 — Check a service

```bash
systemctl status sshd
# Or on Ubuntu:
systemctl status ssh
systemctl status cron
systemctl status systemd-journald
```

## Step 5 — Read service logs

```bash
journalctl -u ssh --no-pager | tail -20
```

> **Why this matters for containers:** Docker containers run a single process (PID 1). When you `docker stop`, Docker sends SIGTERM to PID 1. If your app doesn't handle SIGTERM, Docker waits 10 seconds then sends SIGKILL. Best practice: use `exec` in your entrypoint so your app becomes PID 1 and receives signals directly.
