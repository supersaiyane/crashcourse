# Exercise 1: Filesystem Exploration

**Goal:** Navigate Linux's filesystem and understand where everything lives.

## Step 1 — List the root directory

```bash
ls -la /
```

Note that `/bin`, `/sbin`, and `/lib` are often symlinks into `/usr/bin`, `/usr/sbin`, `/usr/lib` on modern Ubuntu. This is called **usrmerge** — it consolidates the filesystem.

## Step 2 — Check disk usage

```bash
df -h
```

Look at:
- `/dev/sda1` (or similar) — your main disk, mounted at `/`
- `tmpfs` entries — RAM-backed filesystems (fast, but cleared on reboot)
- Usage percentage — if it's over 80%, you're in trouble territory

## Step 3 — Find the biggest directories in /var

```bash
du -sh /var/* | sort -rh | head -10
```

`/var/log` tends to be the biggest — log files accumulate.

## Step 4 — Find configuration files

```bash
find /etc -name "*.conf" | head -10
```

Try a broader pattern:

```bash
find /etc -name "*config*" -o -name "*.conf" | head -10
```

## Step 5 — Examine file metadata

```bash
stat /etc/hosts
```

Note the three timestamps:
- **Access** — when the file was last read
- **Modify** — when the content last changed
- **Change** — when metadata (permissions, ownership) last changed

## Step 6 — Create a symbolic link

```bash
ln -s /etc/hosts ~/my-hosts-link
ls -la ~/my-hosts-link
cat ~/my-hosts-link
rm ~/my-hosts-link
```

> **Why this matters for containers:** Container images use layers — each layer is a filesystem diff. When you `docker pull` an image, you're downloading these layers. When you `docker run`, the union filesystem (overlay2) merges them. Understanding how Linux filesystems work helps you debug "disk full" in a container, permission errors on mounted volumes, and missing config files.
