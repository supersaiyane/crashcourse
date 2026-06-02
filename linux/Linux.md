# Linux — A 2-Day Crash Course

> **In one sentence:** Linux is the operating system nearly every server, container, and cloud VM
> runs on — and the command line is how you operate it. This course takes you from "lost in a
> terminal" to "comfortably navigating, inspecting, and troubleshooting a server."

> Foundational for everything else here: Docker, Kubernetes, the cloud CLIs, and CI all run on
> Linux. See also `Bash.md` (scripting), `Vim.md` (editing), `tmux.md` (sessions).

---

## Part 0 — How to think about Linux

Two ideas unlock the whole system:

**1. Everything is a file.** Your documents are files, but so are devices (`/dev/sda` is a disk),
running processes (`/proc/1234/`), and system settings (`/sys`). This means the *same handful of
tools* (`cat`, `ls`, `grep`, redirection) work on almost everything. Learn them once, use them
everywhere.

**2. Small tools, composed.** The Unix philosophy: each command does *one thing well*, and you
**pipe** them together to solve big problems. `ls` lists, `grep` filters, `sort` orders, `wc`
counts. Alone they're trivial; chained with `|` they're a data-processing language. You don't
look for a giant do-everything command — you compose small ones.

**Mental model:** the shell is a conversation. You type a command, it runs and prints text, you
read it and type the next. Most "ops work" is: navigate to the right place, look at the state of
something (files, processes, logs, resources), and make a change. The filesystem is a tree you
walk; pipes are how you transform what you find.

```mermaid
graph TD
    HW[Hardware<br>CPU / Memory / Disk / NIC] --> K[Linux Kernel<br>process scheduling, memory mgmt,<br>device drivers, networking]
    K --> SD[systemd<br>PID 1 — init system]
    SD --> SVC1[sshd]
    SD --> SVC2[nginx]
    SD --> SVC3[docker]
    SD --> SVC4[cron / timers]
    K --> FS[Virtual Filesystems<br>/proc /sys /dev]
    K --> NS[Namespaces / cgroups<br>containers use these]
    SD --> SHELL[Login Shell<br>bash / zsh]
    SHELL --> USER[User Processes<br>commands, scripts, apps]
    USER -->|read / write| FS
    USER -->|logs| LOG[/var/log + journald]
```

---

## Part 1 — The filesystem layout (where things live)
```
/            root of everything
/home/you    your personal files (~ is shorthand for your home)
/etc         system + app configuration files
/var/log     logs live here
/var         variable data (logs, spool, caches)
/tmp         temporary files (wiped on reboot)
/usr/bin     installed programs
/opt         optional / third-party software
/proc /sys   virtual filesystems exposing kernel & process info
/mnt /media  mounted disks
```
Knowing this means you know where to look: configs in `/etc`, logs in `/var/log`, your stuff in
`/home`.

---

## DAY 1 — Navigate, inspect, manipulate

### 1. Where am I, what's here, move around
```bash
pwd                 # print working directory (where am I?)
ls                  # list files
ls -lah             # long format, all (incl. hidden), human-readable sizes — your default ls
cd /var/log         # change directory
cd ~                # go home    cd -   # go to previous dir    cd ..   # up one
```
`ls -lah` shows permissions, owner, size, and date — get in the habit of using it.

### 2. Look at files (without opening an editor)
```bash
cat file            # dump whole file
less file           # scroll a file (q to quit, / to search) — best for big files
head -n 20 file     # first 20 lines       tail -n 20 file   # last 20 lines
tail -f /var/log/app.log    # FOLLOW a log live as it's written — you'll use this constantly
wc -l file          # count lines
```
`tail -f` (live log following) and `less` (paging + search) are daily essentials.

### 3. Create, copy, move, delete
```bash
touch file          # create empty file        mkdir -p a/b/c   # make nested dirs
cp src dst          # copy        cp -r dir/ dst/    # copy a directory
mv src dst          # move OR rename
rm file             # delete      rm -r dir/    # delete a directory
rm -rf dir/         # force-delete recursively — DANGEROUS, no undo, double-check the path
```
> There is no recycle bin. `rm -rf` is irreversible. Always read the path twice; never run it on
> `/` or a variable that might be empty.

### 4. Finding things
```bash
find /etc -name "*.conf"            # find files by name
find . -type f -mtime -1            # files modified in the last day
grep "error" file                   # lines containing "error"
grep -ri "timeout" /etc             # recursive, case-insensitive search
grep -rn "TODO" .                   # with line numbers
which python3                       # where is this command?
```
`find` (by metadata) and `grep` (by content) are how you locate anything.

### 5. The pipe — composing tools (the key skill)
```bash
ls -la | grep ".log"                       # only lines mentioning .log
cat access.log | grep "500" | wc -l        # count 500-errors
ps aux | grep nginx                        # find nginx processes
du -sh * | sort -h | tail                   # biggest items in this dir
history | grep ssh                          # past ssh commands
```
`|` sends one command's output into the next. Redirection sends it to files:
```bash
command > out.txt        # write stdout to a file (overwrite)
command >> out.txt       # append
command 2> err.txt       # write stderr
command > out.txt 2>&1   # both stdout and stderr to one file
command < input.txt      # feed a file as input
```

**By end of Day 1 you can:** navigate the filesystem, read files and tail logs, manipulate files
safely, find things by name and content, and compose tools with pipes and redirection. That's the
core of operating any Linux box.

---

## DAY 2 — Permissions, processes, resources, networking

### 1. Permissions (the thing that blocks you)
```bash
ls -l file
# -rwxr-xr--  owner=rwx  group=r-x  others=r--
```
Three triads (owner/group/others), each `r` (read=4) `w` (write=2) `x` (execute=1):
```bash
chmod 755 script.sh     # rwx for owner, r-x for group & others (numeric)
chmod +x script.sh      # add execute (symbolic)
chown user:group file   # change owner/group
sudo command            # run as root (administrator) — needed for system changes
```
"Permission denied" almost always means you need different permissions or `sudo`. `755` (scripts)
and `644` (regular files) are the common defaults.

### 2. Processes (what's running)
```bash
ps aux                       # snapshot of all processes
ps aux | grep nginx          # find specific ones
top                          # live process/resource view (q to quit)
htop                         # nicer top (if installed)
kill <PID>                   # ask a process to stop (SIGTERM)
kill -9 <PID>                # force-kill (SIGKILL) — last resort
pkill -f "pattern"           # kill by name/pattern
jobs / fg / bg               # manage background jobs in your shell
command &                    # run in background
nohup command &              # keep running after you log out
```
Workflow: `ps aux | grep X` to find the PID, then `kill` it. `top`/`htop` to see what's eating
CPU/memory.

### 3. Disk and memory (the resource checks you'll run on every incident)
```bash
df -h                        # disk space per filesystem ("disk full?" -> here)
du -sh /var/log/*            # what's using space in a directory
free -h                      # memory usage
uptime                       # load average + how long the box has been up
vmstat 1                     # live CPU/mem/io stats
lsof | grep deleted          # find space held by deleted-but-open files (sneaky "disk full")
```
When a server misbehaves, the first reflexes are `df -h` (disk), `free -h` (memory),
`top` (CPU), and the logs.

### 4. systemd — managing services (modern Linux)
Most services are managed by **systemd**:
```bash
systemctl status nginx       # is it running? recent logs + state
systemctl start|stop|restart nginx
systemctl enable nginx       # start on boot       systemctl disable nginx
systemctl list-units --type=service --state=running
journalctl -u nginx          # logs for a service
journalctl -u nginx -f       # follow them live
journalctl -u nginx --since "1 hour ago"
journalctl -p err -b         # error-priority logs since last boot
```
`systemctl status` + `journalctl -u <svc> -f` is the standard "is my service OK and what is it
saying?" combo.

### 5. Networking basics
```bash
ip a                         # network interfaces & IP addresses (replaces ifconfig)
ss -tulpn                    # listening ports + the processes on them (replaces netstat)
ping host                    # basic reachability
curl -v https://host/path    # make an HTTP request, see headers (see networking docs)
dig example.com              # DNS lookup
ssh user@host                # connect to a remote machine
scp file user@host:/path     # copy a file over SSH
```
`ss -tulpn` ("what's listening and who owns the port?") is invaluable for "port already in use" /
"is my service even listening?" questions.

### 6. Users, environment, and packages
```bash
whoami / id                  # who am I, and my groups
env / echo $PATH             # environment variables
export VAR=value             # set an env var for this session
apt update && apt install pkg     # Debian/Ubuntu package manager (or: dnf/yum on RHEL, apk on Alpine)
dpkg -l | grep pkg                # is a package installed?
```

---

## Worked example — "the server is slow / out of space"
```bash
# 1. Quick triage
uptime               # is load high?
top                  # what's burning CPU? (note the PID/command)
free -h              # is memory exhausted (swapping)?
df -h                # is a filesystem at 100%?

# 2. Disk full? find the culprit
du -sh /var/* | sort -h | tail        # biggest dirs under /var
du -sh /var/log/* | sort -h | tail    # often runaway logs
lsof | grep deleted | head            # space held by deleted-but-open files

# 3. A service is down?
systemctl status myapp                # state + recent log lines
journalctl -u myapp --since "30 min ago" | tail -50   # what did it say before dying?

# 4. Port conflict?
ss -tulpn | grep :8080                # who owns 8080?
```
That sequence resolves a large fraction of real server incidents.

---


## Terminal Demo

```terminal-demo
# sre@production ~ %

$ uname -a
Linux prod-web-01 5.15.0-1049-aws x86_64 GNU/Linux

$ uptime
 10:15:32 up 90 days, 5:23, 2 users, load average: 1.23, 0.98, 0.87

$ free -h
              total   used   free   shared  buff/cache  available
Mem:          15Gi    8.2Gi  1.3Gi  256Mi   5.8Gi       6.5Gi
Swap:         0B      0B     0B

$ df -h | grep -v tmpfs
Filesystem      Size  Used Avail Use% Mounted on
/dev/xvda1       50G   32G   18G  64% /
/dev/xvdf       200G  145G   55G  73% /data

$ top -bn1 | head -8
top - 10:15:32 up 90 days, load average: 1.23, 0.98, 0.87
Tasks: 156 total, 2 running, 154 sleeping
%Cpu(s): 12.3 us, 3.4 sy, 0.0 ni, 83.2 id, 0.8 wa
MiB Mem: 15872.0 total, 1331.2 free, 8396.8 used, 6144.0 buff/cache
  PID USER   PR  NI    VIRT    RES    SHR S  %CPU %MEM    COMMAND
 1234 app    20   0  2.5g   512m   45m S  45.2  3.2    node api
 5678 postgres 20  0  1.8g   890m  120m S  12.1  5.6    postgres

$ ss -tlnp | head -5
State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
LISTEN 0      128    0.0.0.0:8080        0.0.0.0:*        users:(("node",pid=1234))
LISTEN 0      128    0.0.0.0:22          0.0.0.0:*        users:(("sshd",pid=890))
LISTEN 0      244    0.0.0.0:5432        0.0.0.0:*        users:(("postgres",pid=5678))

$ journalctl -u api --since "1 hour ago" --no-pager | tail -3
Jun 02 10:15:32 prod-web-01 api[1234]: INFO request path=/healthz status=200
Jun 02 10:15:33 prod-web-01 api[1234]: INFO request path=/api/v1/orders status=201
Jun 02 10:15:35 prod-web-01 api[1234]: WARN high latency path=/api/v1/reports
```

---

## Common pitfalls
- **`rm -rf` accidents.** No undo. Triple-check paths; beware unset variables (`rm -rf "$DIR/"`
  with empty `$DIR` = disaster). Consider `ls` first to confirm what matches.
- **Forgetting `sudo`.** System files and services need root. "Permission denied" is the hint.
- **Editing the wrong file / wrong server.** Confirm the host (`hostname`) and the path before
  changing anything — especially over SSH.
- **Not reading logs.** `journalctl -u svc` and `/var/log` answer most "why is it broken?"
  questions. Look before guessing.
- **`kill -9` as a first resort.** It gives the process no chance to clean up. Try plain `kill`
  (SIGTERM) first.
- **Ignoring exit codes.** `echo $?` after a command (0 = success, non-zero = failure) — vital in
  scripts (see `Bash.md`).
- **Confusing `>` and `>>`.** `>` overwrites, `>>` appends. Clobbering a file with `>` is a common
  mistake.

---

## Quick command reference
```bash
# Navigation / files
pwd  ls -lah  cd  tree  stat file
cat  less  head -n N  tail -n N  tail -f  wc -l
touch  mkdir -p  cp [-r]  mv  rm [-rf]  ln -s target link

# Search
find PATH -name "*.x" -type f -mtime -1
grep -rni "pattern" PATH      grep -v "exclude"
which CMD   whereis CMD   locate name

# Text processing (compose with |)
sort  uniq -c  cut -d: -f1  awk '{print $1}'  sed 's/a/b/g'  tr  tee  xargs

# Permissions / ownership
chmod 755|644|+x   chown user:group   umask   sudo

# Processes
ps aux  top  htop  kill [-9] PID  pkill -f x  nohup cmd &  jobs fg bg

# Resources
df -h  du -sh *  free -h  uptime  vmstat 1  iostat  lsof

# Services (systemd)
systemctl status|start|stop|restart|enable|disable svc
journalctl -u svc [-f] [--since "1h ago"] [-p err]

# Network
ip a   ss -tulpn   ping   curl -v   dig   ssh user@host   scp f user@host:/p

# Misc
history | grep x   man cmd   cmd --help   echo $?   watch -n2 'cmd'
```

---

## Top 10 Interview Questions

<details>
<summary><strong>Q: Explain the Linux boot process from power-on to a running shell.</strong></summary>

BIOS/UEFI performs hardware checks and loads the bootloader (GRUB). GRUB loads the kernel and initial ramdisk (initrd/initramfs) into memory. The kernel initializes hardware, mounts the root filesystem, and starts PID 1 — on modern systems that is systemd. Systemd reads its unit files and starts services in dependency order (networking, logging, sshd, etc.), eventually reaching the login target where you get a shell or display manager.

</details>

<details>
<summary><strong>Q: What are file permissions in Linux, and how do you interpret `rwxr-xr--`?</strong></summary>

Every file has three permission triads: owner, group, and others. Each triad can have read (r=4), write (w=2), and execute (x=1). `rwxr-xr--` means the owner can read/write/execute, the group can read/execute, and others can only read. Numerically that is 754. Directories need the execute bit for traversal (you can `cd` into them). `chmod` changes permissions, `chown` changes ownership, and `sudo` runs commands as root when needed.

</details>

<details>
<summary><strong>Q: What is the difference between a process and a thread? How do you inspect running processes?</strong></summary>

A process is an independent running instance of a program with its own memory space, PID, and resources. A thread is a lightweight unit of execution within a process, sharing the same memory space. Use `ps aux` for a snapshot of all processes, `top` or `htop` for live resource monitoring, and `ps -eLf` to see individual threads. `kill PID` sends SIGTERM (graceful shutdown); `kill -9 PID` sends SIGKILL (force, last resort — no cleanup).

</details>

<details>
<summary><strong>Q: A server is responding slowly. Walk through your troubleshooting steps.</strong></summary>

Start with `uptime` to check load averages. Run `top` or `htop` to identify which process is consuming CPU or memory. Check `free -h` for memory pressure and swap usage. Run `df -h` to see if any filesystem is full. Check `iostat` or `vmstat 1` for disk I/O saturation. Look at application logs with `journalctl -u service` and system logs in `/var/log`. Use `ss -tulpn` to verify the service is listening. This sequence resolves the majority of real incidents.

</details>

<details>
<summary><strong>Q: What is systemd, and how do you manage services with it?</strong></summary>

Systemd is the init system and service manager on modern Linux distributions — it is PID 1, the first process started by the kernel. It manages service lifecycle, dependencies, logging, and timers. Key commands: `systemctl status/start/stop/restart/enable/disable <service>` for lifecycle, `journalctl -u <service>` for logs. Unit files in `/etc/systemd/system/` define how services run, their dependencies, restart policies, and resource limits.

</details>

<details>
<summary><strong>Q: Explain the difference between hard links and soft (symbolic) links.</strong></summary>

A hard link is a directory entry pointing directly to the same inode (data on disk) as the original file — both names are equally "real" and the data persists until all hard links are removed. A soft link (symlink) is a separate file that contains the path to the target; it breaks if the target is moved or deleted. Hard links cannot cross filesystem boundaries or link to directories. Symlinks are more common in practice for configuration management and pointing to versioned directories.

</details>

<details>
<summary><strong>Q: What are signals in Linux? Name the most important ones.</strong></summary>

Signals are asynchronous notifications sent to processes. SIGTERM (15) is the polite "please shut down" — processes can catch it and clean up. SIGKILL (9) is the uncatchable force-kill — the kernel terminates the process immediately with no cleanup. SIGHUP (1) traditionally means "terminal disconnected" and many daemons interpret it as "reload configuration." SIGINT (2) is what Ctrl+C sends. SIGSTOP/SIGCONT pause and resume processes. Always try SIGTERM before SIGKILL.

</details>

<details>
<summary><strong>Q: What is the purpose of `/proc` and `/sys` filesystems?</strong></summary>

Both are virtual filesystems that exist only in memory. `/proc` exposes kernel and per-process information — each running process has a directory (`/proc/PID/`) with its status, memory maps, file descriptors, and command line. `/proc/cpuinfo`, `/proc/meminfo` expose hardware info. `/sys` provides a structured view of kernel subsystems, devices, and drivers. Tools like `top`, `free`, and `ps` actually read from `/proc` under the hood. You can tune kernel parameters at runtime by writing to `/proc/sys/` entries.

</details>

<details>
<summary><strong>Q: How do pipes and redirection work, and what is the difference between `>` and `>>`?</strong></summary>

A pipe (`|`) connects the stdout of one command to the stdin of the next, enabling composition of small tools. `>` redirects stdout to a file, overwriting it. `>>` appends to the file instead. `2>` redirects stderr. `2>&1` merges stderr into stdout. `< file` feeds a file as stdin. This is the Unix philosophy in action — small tools that do one thing well, composed via pipes and redirection to solve complex problems without writing scripts.

</details>

<details>
<summary><strong>Q: What are inodes, and how can you run out of inodes while still having disk space?</strong></summary>

An inode is a data structure that stores metadata about a file — permissions, ownership, timestamps, and pointers to the actual data blocks — but not the file name (that is in the directory entry). Each filesystem has a fixed number of inodes set at creation time. If you create millions of tiny files (e.g. a mail spool or cache directory), you can exhaust all inodes while having plenty of disk space remaining. `df -i` shows inode usage; the fix is to delete unnecessary small files or recreate the filesystem with more inodes.

</details>

<details>
<summary><strong>Q: Explain what happens when you type a command and press Enter in a Linux shell.</strong></summary>

The shell reads the input, parses it, and performs expansions (variables, globs, aliases). It then searches for the command — first as a built-in, then along each directory in `$PATH`. If found, the shell calls `fork()` to create a child process, then `execve()` to replace the child with the command's binary. The kernel loads the program, sets up memory, and begins execution. The parent shell waits (unless `&` was used) for the child to exit, collects its exit status (`$?`), and presents the next prompt.

</details>

---



## Quick Quiz

Test your understanding with these rapid-fire questions (answers hidden):

<details>
<summary>1. What is the ONE core problem that Linux solves?</summary>
Re-read Part 0 — the mental model section. If you can explain the "why" in one sentence, you understand the foundation.
</details>

<details>
<summary>2. Name the 3 most important terms from the vocabulary section.</summary>
Review Part 1. These are the building blocks every conversation about Linux uses.
</details>

<details>
<summary>3. What is the first thing you would set up on Day 1?</summary>
Check the Day 1 section — the very first hands-on step that gets you a working result.
</details>

<details>
<summary>4. What is the most common production pitfall with Linux?</summary>
Review the Common Pitfalls section. The first item listed is typically the most frequently encountered.
</details>

<details>
<summary>5. How does Linux compare to its closest alternative?</summary>
Check the Comparison Matrix below — focus on the key differentiating row.
</details>



## Comparison Matrix

| Dimension | Linux | Windows Server | FreeBSD |
|-----------|-------|----------------|---------|
| **Primary use case** | Core strength of Linux | Core strength of Windows Server | Core strength of FreeBSD |
| **Learning curve** | Moderate | Varies | Varies |
| **Community/ecosystem** | Active | Active | Growing |
| **Operational complexity** | Medium | Varies | Varies |
| **Best for** | See Part 0 | Different tradeoffs | Different tradeoffs |

> **How to read this matrix:** no tool wins on every dimension. Pick based on your specific constraints — team expertise, existing infrastructure, scale requirements, and compliance needs. The right choice is the one that fits your context, not the one with the most checkmarks.

## Next steps after Day 2
- **`Bash.md`** — turn these commands into scripts (variables, loops, conditionals, error
  handling).
- **`Vim.md`** — edit files on servers that have no GUI.
- **`tmux.md`** — keep sessions alive across disconnects (essential over SSH).
- Text-processing power tools: **awk**, **sed**, **jq** (see `jq.md`) for parsing output.
- Deeper: SSH keys & config, cron/systemd timers, file descriptors, signals, and security
  hardening.

## Recommended learning resources

**YouTube channels & playlists:**
- [NetworkChuck — Linux for Hackers](https://www.youtube.com/@NetworkChuck) — beginner-friendly walkthroughs of Linux basics, commands, and networking
- [LearnLinuxTV — Linux Essentials Series](https://www.youtube.com/@LearnLinuxTV) — structured, methodical Linux admin tutorials from install to daily use
- [The Urban Penguin — Linux System Administration](https://www.youtube.com/@TheUrbanPenguin) — deep sysadmin topics: permissions, processes, filesystems, networking
- [Fireship — Linux in 100 Seconds](https://www.youtube.com/@Fireship) — fast-paced explainer that sets the mental model before you dive deeper
- [tutoriaLinux — Linux for DevOps](https://www.youtube.com/@tutoriaLinux) — practical Linux skills aimed at ops and DevOps engineers

**Official docs & blogs:**
- [The Linux Documentation Project (TLDP)](https://tldp.org/) — comprehensive guides and HOWTOs covering every core Linux concept
- [Julia Evans — Linux debugging and networking zines](https://jvns.ca/) — short, visual, deeply practical posts on Linux internals, networking, and command-line tools

**The mantra:** everything is a file; compose small tools with pipes. To operate a box: navigate,
inspect state (files, processes, resources, logs), then change it carefully. When something
breaks: `df -h`, `free -h`, `top`, and read the logs.
