# Stage 1: Linux Foundations

**Goal:** Navigate, troubleshoot, and automate a Linux server with confidence.

**Prerequisites:** A Linux machine (or VM) — Ubuntu 22.04 LTS recommended. You can spin one up on DigitalOcean, use Multipass, or run a Vagrant box. Any distro works, but commands in this stage target Ubuntu/Debian.

---

## 1. Theory (What & Why)

### What is an Operating System?

An operating system is the layer of software between your hardware and your applications. It has one job: **manage resources**. Every program you run — a text editor, a database, a web server — competes for CPU time, memory, disk space, and network access. Without the OS mediating that competition, every program would need to speak raw hardware, and chaos would reign.

The heart of any Linux system is the **kernel**. It handles four big things:

| Job | What it does |
|-----|-------------|
| **Hardware abstraction** | The kernel talks to your CPU, RAM, disk, and network card through *drivers*. Your programs never touch hardware directly. |
| **Process scheduling** | The kernel decides which program runs *when*. It gives each process a slice of CPU time, switching between them so fast it looks like they're all running at once. |
| **Memory management** | Each process gets its own private address space. The kernel maps virtual memory to physical RAM and swaps pages to disk when needed. |
| **Filesystem** | The kernel presents a unified tree of files (`/`) regardless of what's underneath — SSD, HDD, network filesystem, or RAM disk. |

### Why Linux for Containers?

Containers aren't a Linux invention — they're a **Linux feature**. Specifically, two kernel features make containers possible:

- **cgroups** (control groups) — limit and account for resource usage (CPU, memory, I/O) per process or group of processes. Without cgroups, one container could starve the entire host.
- **Namespaces** — isolate process trees, network stacks, mount points, and user IDs. Each container thinks it's the only thing on the machine.

No other operating system offers these primitives with the same level of maturity. That's why virtually all container platforms (Docker, containerd, CRI-O) run on Linux. You can run them on macOS or Windows via a VM, but the container itself always talks to a Linux kernel.

Linux also wins on:
- **Stability** — production servers run for years without rebooting.
- **Open source** — audit the code, fork it, fix it.
- **Ecosystem** — every cloud, every toolchain, every orchestration platform targets Linux first.

> **Why this matters for containers:** When you run `docker run`, Docker uses the host's Linux kernel to create cgroups and namespaces for your container. The container shares the kernel — it doesn't have its own. This is why you can't run a Windows container on a Linux host (different kernel ABI).

### Distribution Landscape

Not all Linux is the same. The kernel is shared, but the userland (package manager, init system, default tools) differs.

| Family | Distros | Package Manager | Best For |
|--------|---------|----------------|----------|
| **Debian** | Ubuntu, Debian | `apt` | General purpose, servers, beginners |
| **RHEL** | CentOS, Rocky, Fedora | `dnf`/`yum` | Enterprise, compliance, SELinux |
| **Alpine** | Alpine | `apk` | Minimal container images (~5 MB) |

For this course, we use **Ubuntu 22.04 LTS**. Why?
- Largest community = easiest to find help.
- `apt` is straightforward.
- Most cloud images use Ubuntu by default.
- Kubernetes and Docker have first-class Ubuntu packages.

That said, you should know Alpine exists because many *production container images* are Alpine-based. A Docker image built on `python:3.11-slim` is Debian. One built on `python:3.11-alpine` is Alpine. Both work; Alpine is smaller; Debian is easier to debug.

### Filesystem Hierarchy Standard (FHS)

Linux organizes everything under one root: `/`. Every file, device, and pseudo-filesystem lives somewhere in this tree.

| Path | Purpose | Plain English |
|------|---------|---------------|
| `/bin` | Essential user binaries (`ls`, `cp`, `sh`) | Commands needed to boot and repair the system |
| `/sbin` | System binaries (`fdisk`, `iptables`, `mount`) | Admin commands, usually root-only |
| `/etc` | Configuration files | Every program's settings live here |
| `/var` | Variable data (logs, databases, spools) | Stuff that grows over time |
| `/tmp` | Temporary files | Deleted on reboot — don't put anything important here |
| `/proc` | Process and kernel information (pseudo-filesystem) | A window into running processes — each PID gets a directory |
| `/sys` | Kernel and device information | Like `/proc` but for hardware devices |
| `/dev` | Device files (`sda`, `tty`, `random`) | Every piece of hardware is represented as a file |
| `/usr` | User binaries and libraries (secondary hierarchy) | Where most programs actually live (`/usr/bin`, `/usr/lib`) |
| `/home` | User home directories | Your documents, configs, SSH keys |
| `/root` | Root user's home directory | Root's personal files (separate from `/home`) |

Two of these deserve special attention for container work:

- **`/proc`**: When you run `ps`, it reads `/proc`. When a container reads its own `/proc`, it sees *only its own processes* — thanks to the PID namespace. You'll poke around `/proc` in Exercise 3.
- **`/sys`**: Cgroup information lives under `/sys/fs/cgroup`. Containers use this to set memory and CPU limits.

> **Why this matters for containers:** Container images start from a base filesystem (e.g., `ubuntu:22.04`). That image is extracted to a *layer* that overlays on top of the host's `/` — but it only contains the directories the image specifies. If you `docker exec` into a container, you'll see `/bin`, `/etc`, `/usr`, etc. — that's the container's isolated view.

### Processes

A **process** is a running instance of a program. Every process has a **PID** (Process ID). PID 1 is the first process started by the kernel — `init` or `systemd` — and it has special responsibilities (reaping orphaned children, handling signals that other processes ignore).

Process relationships:
- **Parent/child:** When a process starts another, the original is the parent, the new one is the child. A child that outlives its parent becomes an *orphan* and is adopted by PID 1.
- **Foreground/background:** By default, a command runs in the foreground — your terminal is blocked until it finishes. Append `&` to push it to the background.
- **Daemons:** Long-lived background processes (like `sshd`, `nginx`, `postgresql`) that detach from the terminal entirely.

**Signals** are how the kernel or another process tells a process to do something:

| Signal | Number | Meaning |
|--------|--------|---------|
| `SIGTERM` | 15 | "Please stop." Graceful shutdown — the process can clean up. |
| `SIGKILL` | 9 | "Stop NOW." Cannot be caught or ignored. Process dies immediately. |
| `SIGHUP` | 1 | "Hang up." Originally for modem disconnects; today often means "reload config." |
| `SIGINT` | 2 | Interrupt from keyboard (Ctrl+C). |

> **Why this matters for containers:** When you run `docker stop`, Docker sends `SIGTERM` to PID 1 inside the container. If the process doesn't exit in 10 seconds, Docker sends `SIGKILL`. This is why you must handle signals properly in your container entrypoint — otherwise `docker stop` becomes a kill-and-lose-data situation.

### Users & Permissions

Linux is multi-user. Every process runs as some **user**, and every file belongs to some **user:group**. Permission bits determine who can read, write, or execute.

```
-rwxr-xr-x 1 root root 12345 Jun 3 10:00 /usr/bin/ls
```

Break this down:
- `-` = regular file (`d` = directory, `l` = symlink)
- `rwx` = owner (root) can Read, Write, Execute
- `r-x` = group (root) can Read, Execute
- `r-x` = everyone else can Read, Execute
- `1` = hard link count
- `root root` = owner:group
- `12345` = size in bytes

Key commands:
- `chmod 755 file` — set permissions to rwxr-xr-x
- `chown user:group file` — change ownership
- `umask` — default permission mask for new files (e.g., `022` means new files are 644)

The superuser is **root** (UID 0). Root can do anything. Regular users (UID >= 1000) have limited powers. To run a command as root, use `sudo`.

> **Why this matters for containers:** Containers run as root by default — but running a container as root is a security risk. Best practice is to specify a non-root user in your Dockerfile with `USER 1000`. Also, file permissions inside the container map to UIDs on the host. If a container runs as root and writes files to a mounted volume, the host sees root-owned files.

### Package Management

Every Linux distribution has a package manager. It installs, updates, and removes software from central repositories.

| Tool | Distro | Common Commands |
|------|--------|----------------|
| `apt` | Debian/Ubuntu | `apt update`, `apt install nginx`, `apt upgrade`, `apt remove nginx` |
| `yum`/`dnf` | RHEL/Fedora | `yum install nginx`, `yum update` |
| `apk` | Alpine | `apk add nginx`, `apk update`, `apk del nginx` |

Key concept: **Always run `apt update` before `apt install`**. `apt update` refreshes the local package index from the repositories. Without it, you'll try to install an out-of-date index and get 404 errors or old versions.

### Systemd

Systemd is the init system used by Ubuntu and most modern Linux distributions. PID 1 is `systemd`. It manages:
- **Units** — configuration files for services, sockets, mount points, etc.
- **Services** — `.service` files define how to start/stop/reload a daemon.
- **Targets** — groups of units (like runlevels). `multi-user.target` is the normal multi-user mode.
- **Journal** — `journalctl` reads structured binary logs.

Useful systemd commands:

```bash
systemctl status nginx          # Is it running?
systemctl start nginx           # Start it
systemctl enable nginx          # Start on boot
systemctl restart nginx         # Stop then start
systemctl reload nginx          # Tell it to reload config without stopping
systemctl daemon-reload         # Reload unit files after editing
journalctl -u nginx --no-pager  # Show logs for nginx
```

> **Why this matters for containers:** Containers typically don't run systemd (it's heavy and unnecessary). But on a Linux host, Docker itself is managed by systemd: `systemctl status docker`. Understanding systemd means understanding how your container host works.

### Networking Basics

Every Linux machine has **network interfaces** — physical (eth0, ens3) or virtual (lo, docker0). Each interface gets an **IP address**.

- `lo` — loopback (127.0.0.1). Local traffic only.
- `eth0` (or `ens3`, `enp0s3`) — primary network interface. Gets your machine's real IP.
- `docker0` — Docker's virtual bridge. Containers connect through it.

**Ports**: A port is a number (0–65535) attached to an IP. `192.168.1.10:80` means "port 80 on that machine." Well-known ports include 22 (SSH), 80 (HTTP), 443 (HTTPS), 5432 (PostgreSQL), 6379 (Redis).

**DNS resolution** maps hostnames to IPs. Your machine checks `/etc/hosts` first, then queries the DNS server configured in `/etc/resolv.conf`.

Key tools: `ip addr`, `ip link`, `ip route`, `ss -tulpn`, `ping`, `curl`.

> **Why this matters for containers:** When Docker runs a container, it creates a virtual ethernet pair — one end in the container's namespace (eth0), one on the host (vethXXXX). The container gets its own IP (usually on the 172.17.0.0/16 bridge). This is how containers talk to each other and how port mapping (`-p 8080:80`) works.

### Environment Variables

Environment variables are key-value pairs available to a process and its children. They configure behavior without changing code.

```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/db"
echo $DATABASE_URL
```

In the **12-factor app** methodology, configuration is stored in environment variables. This is critical for containers because:

- The same container image can be deployed to dev, staging, and production — just change the env vars.
- Secrets (DB passwords, API keys) can be injected at runtime rather than baked into the image.
- Orchestrators like Kubernetes natively manage env vars through ConfigMaps and Secrets.

```bash
# A container-friendly pattern:
export PORT=8080
export LOG_LEVEL=info
python app.py
```

> **Why this matters for containers:** Every Dockerfile has an `ENV` instruction for default values, but you override them at runtime with `docker run -e DATABASE_URL=...`. Kubernetes takes this further with ConfigMaps and Secrets that inject env vars dynamically.

---

## 2. Hands-On Exercises

### Exercise 1: Filesystem Exploration

**Goal:** Navigate Linux's filesystem and understand where everything lives.

**Step 1 — List the root directory:**

```bash
ls -la /
```

You'll see something like:

```
drwxr-xr-x  19 root root   4096 May 15 12:00 .
drwxr-xr-x  19 root root   4096 May 15 12:00 ..
lrwxrwxrwx   1 root root      7 Apr 22  2024 bin -> usr/bin
drwxr-xr-x   4 root root   4096 May 15 12:00 boot
drwxrwxr-x   2 root root   4096 May 15 12:00 cdrom
drwxr-xr-x  20 root root   4600 Jun  3 10:00 dev
drwxr-xr-x 145 root root  12288 Jun  3 10:00 etc
drwxr-xr-x   3 root root   4096 Apr 22  2024 home
lrwxrwxrwx   1 root root      7 Apr 22  2024 lib -> usr/lib
...
drwxr-xr-x  12 root root      0 Jun  3 10:00 sys
drwxrwxrwt  14 root root   4096 Jun  3 10:00 tmp
drwxr-xr-x  14 root root   4096 Apr 22  2024 usr
drwxr-xr-x  14 root root   4096 Apr 22  2024 var
```

Note that `/bin`, `/sbin`, and `/lib` are often symlinks into `/usr/bin`, `/usr/sbin`, `/usr/lib` on modern Ubuntu. This is called **usrmerge** — it consolidates the filesystem.

**Step 2 — Check disk usage:**

```bash
df -h
```

`df -h` shows mounted filesystems with human-readable sizes. Look at:
- `/dev/sda1` (or similar) — your main disk, mounted at `/`
- `tmpfs` entries — RAM-backed filesystems (fast, but cleared on reboot)
- Usage percentage — if it's over 80%, you're in trouble territory

**Step 3 — Find the biggest directories in /var:**

```bash
du -sh /var/* | sort -rh | head -10
```

`du -sh` shows total size per item. `sort -rh` sorts by size descending. `/var/log` tends to be the biggest — log files accumulate.

**Step 4 — Find configuration files:**

```bash
find /etc -name "*.conf" | head -10
```

This searches `/etc` recursively for files ending in `.conf`. Expect to see names like `resolv.conf`, `sysctl.conf`, `ssh/sshd_config` (the `-name` pattern matches literally, so `*.conf` catches files while config files like `sshd_config` won't match — that's fine, the exercise is about using `find`).

Try a broader pattern to catch more config files:

```bash
find /etc -name "*config*" -o -name "*.conf" | head -10
```

**Step 5 — Examine file metadata:**

```bash
stat /etc/hosts
```

`stat` tells you everything about a file: size, blocks, device, inode, permissions, ownership, and three timestamps:
- **Access** — when the file was last read
- **Modify** — when the content last changed
- **Change** — when metadata (permissions, ownership) last changed

**Step 6 — Create a symbolic link:**

```bash
ln -s /etc/hosts ~/my-hosts-link
ls -la ~/my-hosts-link
cat ~/my-hosts-link
```

A symlink is a shortcut — a special file that points to another file. Unlike a hard link (which is the same file with another name), a symlink can point across filesystems and breaks if the target is deleted.

```bash
rm ~/my-hosts-link  # clean up
```

> **Why this matters for containers:** Container images use layers — each layer is a filesystem diff. When you `docker pull` an image, you're downloading these layers. When you `docker run`, the union filesystem (overlay2) merges them. Understanding how Linux filesystems work helps you debug "disk full" in a container, permission errors on mounted volumes, and missing config files.

---

### Exercise 2: Process Management

**Goal:** Understand processes, signals, and how to manage running programs.

**Step 1 — View the process tree:**

```bash
ps auxf
```

This shows every running process in a tree format. Find PID 1 — it's `systemd` on Ubuntu. Look at its children: `systemd-journald`, `systemd-logind`, `sshd`, and the shells.

*Output interpretation:*
- `USER` — who owns the process
- `PID` — process ID
- `%CPU`, `%MEM` — resource usage
- `VSZ`, `RSS` — virtual and resident memory
- `TTY` — terminal (or `?` for daemons)
- `STAT` — process state (S = sleeping, R = running, Z = zombie)
- `COMMAND` — the command (with arguments)

**Step 2 — Interactive monitoring:**

```bash
top
```

Press `q` to quit. `top` refreshes every few seconds showing CPU-hungry processes. Press:
- `Shift+P` — sort by CPU
- `Shift+M` — sort by memory
- `k` — kill a process (enter PID, then signal)
- `h` — help

If `htop` is available (install it with `apt install htop`), try it — it's `top` but prettier and more intuitive.

**Step 3 — Send signals:**

```bash
# Run a command in the background
sleep 120 &

# List background jobs
jobs

# Bring it to the foreground
fg %1

# Ctrl+C sends SIGINT — the process stops
# Now try again with the background technique:
sleep 120 &
bg_pid=$!
echo "Background sleep PID is $bg_pid"

# Send SIGTERM (graceful shutdown)
kill -15 $bg_pid

# Check if it's still alive
ps -p $bg_pid

# Start another one to demonstrate SIGKILL
sleep 120 &
bg_pid=$!
kill -9 $bg_pid
ps -p $bg_pid  # Should show nothing — it's gone
```

Notice the difference: `kill -15` (SIGTERM) politely asks the process to stop. The process can catch it, clean up, and exit gracefully. `kill -9` (SIGKILL) cannot be caught — the kernel terminates the process immediately, no cleanup. In real applications, always try SIGTERM first.

**Step 4 — Check a service:**

```bash
systemctl status sshd
# Or on Ubuntu:
systemctl status ssh
```

You'll see whether the service is active, its PID, memory usage, and recent log lines. Try `systemctl status` on any installed service: `systemctl status cron`, `systemctl status systemd-journald`.

**Step 5 — Read service logs:**

```bash
journalctl -u ssh --no-pager | tail -20
```

This shows the last 20 lines of the SSH daemon's log. You'll see login attempts, accepted connections, and errors. The `--no-pager` flag outputs directly to the terminal instead of a pager (like `less`).

> **Why this matters for containers:** Docker containers run a single process (PID 1). When you `docker stop`, Docker sends SIGTERM to PID 1. If your app doesn't handle SIGTERM (e.g., it ignores signals because it runs via a shell script), Docker waits 10 seconds then sends SIGKILL. This is the leading cause of "container stopped ungracefully" warnings. Best practice: use `exec` in your entrypoint script so your app becomes PID 1 and receives signals directly.

---

### Exercise 3: Linux for Containers Deep Dive

**Goal:** See the kernel features that make containers work.

**Step 1 — Inspect cgroup hierarchy:**

```bash
cat /proc/1/cgroup
```

This shows which cgroups PID 1 belongs to. You'll see something like:

```
0::/system.slice/init.scope
```

On a system without containers, PID 1 lives in the root cgroup. But if you run this inside a Docker container, you'll see a path like:

```
0::/docker/<container-id>
```

This is cgroup isolation in action — the container's processes are in a separate cgroup tree, so the host can limit their CPU and memory independently.

Also look at the cgroup filesystem:

```bash
ls /sys/fs/cgroup/
cat /sys/fs/cgroup/memory/memory.current  # system-wide memory usage
```

> **Why this matters for containers:** When you run `docker run --memory=512m`, Docker writes `512m` to the container's memory cgroup limit file. The kernel enforces it — if the container exceeds the limit, the kernel kills processes inside it (OOM kill). This is how resource limits work at the kernel level.

**Step 2 — Manual namespace creation:**

```bash
# Start a new shell in its own PID and mount namespaces
sudo unshare --pid --fork --mount --mount-proc /bin/bash
```

Inside this new shell, run:

```bash
ps aux
# You'll see only 2-3 processes instead of the full system.
# That's namespace isolation — this shell's PID namespace is separate.
exit
```

`unshare` is the same system call that Docker uses to create namespaces for containers. This command creates:
- A new PID namespace (`--pid`) — processes in here have their own PID numbering.
- A new mount namespace (`--mount`) — filesystem mounts here don't affect the host.

This is as close to "creating a container by hand" as you can get without using Docker.

**Step 3 — Inspect system resources:**

```bash
lscpu           # CPU cores, model, architecture
free -h         # RAM usage (total, used, available)
cat /proc/meminfo  # Detailed memory info
```

`free -h` shows:
- `total` — physical RAM installed
- `used` — memory currently in use
- `available` — memory available for new processes (includes reclaimable cache)
- `swap` — disk-based overflow memory

The `available` column is the number that matters — it accounts for memory that's "used" by the page cache but can be reclaimed. If `available` is low, your system is under memory pressure.

**Step 4 — Network inspection:**

```bash
ip link        # List all network interfaces
ip addr        # Show IP addresses on each interface
ip route       # Show routing table
```

`ip link` shows interfaces like:
- `lo` — loopback (127.0.0.1)
- `eth0` — your main network interface
- `docker0` — Docker bridge (if Docker is installed)

`ip route` shows the routing table. A typical output:

```
default via 10.0.2.2 dev eth0 proto dhcp
10.0.2.0/24 dev eth0 proto kernel scope link src 10.0.2.15
```

"default via 10.0.2.2" means traffic to any IP not on the local subnet goes through that gateway.

**Step 5 — Firewall rules:**

```bash
sudo iptables -L
```

If Docker is installed, you'll see many rules in the `FORWARD` and `NAT` chains — Docker manipulates iptables to route traffic to containers and implement port mapping. Don't change anything here — just observe.

> **Why this matters for containers:** Docker creates iptables rules automatically. When you run `docker run -p 8080:80 nginx`, Docker adds a DNAT rule that forwards traffic from host port 8080 to the container's port 80. If you have a firewall that blocks Docker's rules, your port mappings silently fail.

**Step 6 — Check IP forwarding:**

```bash
cat /proc/sys/net/ipv4/ip_forward
```

This should print `1` (enabled) if you want to run containers. If it's `0`, Docker will not be able to route traffic between containers or to the outside world. You can enable it with:

```bash
sudo sysctl -w net.ipv4.ip_forward=1
```

To make it permanent, uncomment or add this line to `/etc/sysctl.conf`:

```
net.ipv4.ip_forward=1
```

> **Why this matters for containers:** Linux acts as a router when IP forwarding is enabled. Docker needs this to bridge traffic between containers and the outside world. Without it, containers can reach the internet (via NAT) but containers on different hosts can't communicate directly — which breaks Kubernetes networking (CNI plugins like Calico and Flannel rely on IP forwarding).

---

## 3. Solutions

### Exercise 1 Solutions

**Step 1 — Root directory listing:** Your output will vary, but you should identify:
- `/bin` → `usr/bin` — essential user commands
- `/etc` — configuration files (hosts hostname, resolv.conf for DNS)
- `/var` — log files, databases, spools
- `/proc` — currently empty-ish at boot, fills as processes run

Each item is either a directory (`d`), symlink (`l`), or regular file (`-`).

**Step 2 — Disk usage (`df -h`):** The main disk (`/dev/sda1` or similar) should show less than 80% usage. If it's higher, you may have log files or old kernels consuming space. The `tmpfs` lines show RAM-backed filesystems — fast, but ephemeral.

**Step 3 — Largest directories in /var (`du -sh /var/* | sort -rh | head -10`):** Expected output (numbers will vary):

```
1.2G    /var/lib
500M    /var/log
250M    /var/cache
 12M    /var/snap
4.0K    /var/tmp
```

`/var/lib` is usually the biggest — it contains Docker images, database data, and package manager state. `/var/log` grows with system activity.

**Step 4 — Finding config files (`find /etc -name "*.conf" | head -10`):** Common results:

```
/etc/resolv.conf
/etc/sysctl.conf
/etc/ufw/ufw.conf
/etc/logrotate.conf
/etc/host.conf
```

`/etc/resolv.conf` is especially important — it defines your DNS servers. Containers inherit DNS from the host unless overridden.

**Step 5 — stat output:**

```
  File: /etc/hosts
  Size: 202             Blocks: 8          IO Block: 4096   regular file
Device: 801h/2049d      Inode: 524292      Links: 1
Access: (0644/-rw-r--r--)  Uid: (    0/    root)   Gid: (    0/    root)
Access: 2026-06-03 09:15:00.000000000 -0500
Modify: 2024-04-22 15:30:00.000000000 -0500
Change: 2024-04-22 15:30:00.000000000 -0500
```

Key observations: root owns it, the file is small (202 bytes), permissions are 644 (world-readable, only root can write).

**Step 6 — Symlink:** After `ln -s /etc/hosts ~/my-hosts-link`, `ls -la` shows:

```
lrwxrwxrwx 1 user user 9 Jun 3 10:00 /home/user/my-hosts-link -> /etc/hosts
```

The `l` at the beginning and the `->` indicate it's a symlink. The size (9 bytes) is the length of the target path (`/etc/hosts`). If you delete the target (`rm /etc/hosts`), the symlink becomes a dangling link — `cat my-hosts-link` gives "No such file or directory."

### Exercise 2 Solutions

**Step 1 — Process tree (`ps auxf`):** PID 1 should be `/sbin/init` or `/lib/systemd/systemd`. Its children include essential system services. The tree structure shows inheritance — for example, `sshd` spawns a child for each SSH session, which in turn spawns a shell (`bash`), which spawns commands you run.

**Step 3 — Signal handling:**
- `kill -15 <pid>` — process receives SIGTERM and exits
- `kill -9 <pid>` — process is destroyed immediately by the kernel

With `sleep`, both signals produce the same observable result (process exits), but the mechanism is different. For real applications (databases, web servers), SIGTERM triggers cleanup (flush buffers, close connections, write final logs), while SIGKILL skips all of that.

**Step 4 — Service status (`systemctl status ssh`):**

```
● ssh.service - OpenBSD Secure Shell server
     Loaded: loaded (/lib/systemd/system/ssh.service; enabled; vendor preset: enabled)
     Active: active (running) since Wed 2026-06-03 10:00:00 CDT
       Docs: man:sshd_config(5)
   Main PID: 1024 (sshd)
      Tasks: 1 (limit: 22978)
     Memory: 5.2M
        CPU: 50ms
     CGroup: /system.slice/ssh.service
             └─1024 "sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups"
```

This tells you the service is running, how long it's been up, its PID, memory usage, and cgroup membership. The `CGroup` line shows it's in `system.slice` — services managed by systemd are grouped into slices for resource accounting.

### Exercise 3 Solutions

**Step 1 — cgroup hierarchy:** On a host without containers:

```
0::/system.slice/init.scope
```

Inside a Docker container, the path changes to:

```
0::/docker/<container-id>
```

This is because Docker creates a cgroup namespace for the container. The container sees its own cgroup tree, but the host sees the full tree. This is how `docker stats` shows per-container resource usage — it reads from the container's cgroup.

**Step 2 — Namespace isolation:** After `sudo unshare --pid --fork --mount --mount-proc /bin/bash`, `ps aux` shows only:

```
USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  0.0  0.0   7232  4160 pts/1    S    10:00   0:00 /bin/bash
root         8  0.0  0.0   5888  2808 pts/1    R+   10:00   0:00 ps aux
```

That's it — two processes. The new PID namespace starts with PID 1 as bash, and `ps` gets PID 2. The host's hundreds of processes are invisible. This is exactly how Docker containers isolate process visibility — every container sees its own PID namespace starting at 1.

**Step 3 — Resource inspection (`free -h`):**

```
               total        used        free      shared  buff/cache   available
Mem:            15Gi       2.3Gi       8.1Gi       256Mi       4.6Gi        12Gi
Swap:           2.0Gi          0B       2.0Gi
```

If `available` is low (less than 10% of total), the system needs more RAM or you have a memory leak. For Kubernetes nodes, low available memory means pods may be evicted.

**Step 4 — IP forwarding:**

```
1
```

If this shows `0`, Docker will log warnings and container networking may not work correctly. Enable it with `sysctl -w net.ipv4.ip_forward=1` or add it to `/etc/sysctl.conf`.

---

## Summary

You've completed Stage 1. Here's what you now know:

| Concept | Why It Matters for Containers |
|---------|-------------------------------|
| The kernel manages hardware, processes, memory, and filesystems | Containers share the host kernel — no separate kernel per container |
| cgroups limit resources (CPU, memory, I/O) | `docker run --memory=512m` = cgroup write |
| Namespaces isolate process trees, networks, mounts | Each container sees its own PID 1, its own network stack |
| Filesystem Hierarchy Standard | Container images are layered filesystems mounted via overlay2 |
| Processes and signals | `docker stop` = SIGTERM, then SIGKILL after 10s |
| Users and permissions | Containers run as root by default — use `USER 1000` in Dockerfiles |
| Package management | Base images use apt, apk, or yum — know which one your image needs |
| Systemd manages the host | `systemctl status docker` — Docker itself is a systemd service |
| Networking (interfaces, IP, ports, routing) | Each container gets a virtual eth0; iptables routes traffic to it |
| Environment variables | The 12-factor app pattern: config via env vars, overridden at runtime |

**Next up: Stage 2 — Docker.** You'll take everything you learned here and apply it to running containers: building images, managing volumes, networking containers, and writing Dockerfiles for Cutlink (our URL shortener — Flask backend, nginx frontend, PostgreSQL, and Redis).
