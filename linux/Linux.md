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

## Next steps after Day 2
- **`Bash.md`** — turn these commands into scripts (variables, loops, conditionals, error
  handling).
- **`Vim.md`** — edit files on servers that have no GUI.
- **`tmux.md`** — keep sessions alive across disconnects (essential over SSH).
- Text-processing power tools: **awk**, **sed**, **jq** (see `jq.md`) for parsing output.
- Deeper: SSH keys & config, cron/systemd timers, file descriptors, signals, and security
  hardening.

**The mantra:** everything is a file; compose small tools with pipes. To operate a box: navigate,
inspect state (files, processes, resources, logs), then change it carefully. When something
breaks: `df -h`, `free -h`, `top`, and read the logs.
