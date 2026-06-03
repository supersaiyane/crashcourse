# Exercise 3: Linux for Containers Deep Dive

**Goal:** See the kernel features that make containers work.

## Step 1 — Inspect cgroup hierarchy

```bash
cat /proc/1/cgroup
```

On a system without containers, PID 1 lives in the root cgroup. Inside a Docker container, you'll see a path like `0::/docker/<container-id>`.

Also look at the cgroup filesystem:

```bash
ls /sys/fs/cgroup/
cat /sys/fs/cgroup/memory/memory.current
```

> **Why this matters:** When you run `docker run --memory=512m`, Docker writes `512m` to the container's memory cgroup limit. The kernel enforces it — exceeding the limit triggers OOM kill.

## Step 2 — Manual namespace creation

```bash
sudo unshare --pid --fork --mount --mount-proc /bin/bash
```

Inside this new shell, run:

```bash
ps aux
exit
```

`unshare` is the same system call Docker uses to create namespaces for containers.

## Step 3 — Inspect system resources

```bash
lscpu
free -h
cat /proc/meminfo
```

The `available` column in `free -h` is the number that matters — it accounts for reclaimable cache.

## Step 4 — Network inspection

```bash
ip link
ip addr
ip route
```

## Step 5 — Firewall rules

```bash
sudo iptables -L
```

> **Why this matters:** Docker manipulates iptables to route traffic to containers. When you run `docker run -p 8080:80 nginx`, Docker adds a DNAT rule forwarding host port 8080 to the container's port 80. If you have a firewall that blocks Docker's rules, port mappings silently fail.

## Step 6 — Check IP forwarding

```bash
cat /proc/sys/net/ipv4/ip_forward
```

Should print `1` (enabled). If `0`, enable it:

```bash
sudo sysctl -w net.ipv4.ip_forward=1
```

To make it permanent, add this line to `/etc/sysctl.conf`:

```
net.ipv4.ip_forward=1
```

> **Why this matters:** Docker needs IP forwarding to bridge traffic between containers and the outside world. Without it, containers can reach the internet (via NAT) but containers on different hosts can't communicate directly — which breaks Kubernetes networking.
