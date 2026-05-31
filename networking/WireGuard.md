# WireGuard — A 2-Day Crash Course

WireGuard is a modern VPN protocol — fast, simple, secure, and only ~4,000 lines of code compared to OpenVPN's 100K+.

---

## Part 0 — Why WireGuard

OpenVPN and IPsec were designed in a different era. They carry decades of complexity: multiple cipher suites, handshake negotiation, bloated codebases, and configuration files that require a seasoned administrator to read without flinching. The attack surface is proportional to that complexity.

WireGuard takes a different position. It is built into the Linux kernel (since 5.6). It does not negotiate crypto — it makes the choice for you: Curve25519 for key exchange, ChaCha20-Poly1305 for encryption, BLAKE2s for hashing, SipHash for hashtable keys. You cannot misconfigure your way into weak encryption because there is no weaker option to pick.

The result is a tunnel that comes up in milliseconds, performs at near line rate, roams between networks without dropping, and runs in a codebase small enough to audit in an afternoon.

You should reach for WireGuard when:

- You need a site-to-site VPN between cloud and on-prem.
- You need road-warrior access for remote workers.
- You want a mesh network between nodes without a heavyweight control plane.
- You are replacing an aging IPsec or OpenVPN setup.

---

## Vocabulary

**Interface** — A virtual network interface on your machine, typically named `wg0`, `wg1`, etc. This is the local end of the tunnel.

**Peer** — Any remote WireGuard node you want to communicate with. Each peer is identified by its public key, not its IP address.

**PrivateKey** — A 32-byte Curve25519 private key generated locally. Never leave the machine. Never commit it to version control.

**PublicKey** — Derived from the private key. This is what you share with peers so they can authenticate you.

**AllowedIPs** — A whitelist of IP ranges that a peer is permitted to send through the tunnel, and that your host will route to that peer. `0.0.0.0/0` means "route all traffic to this peer" (full tunnel / default gateway). A narrower CIDR like `10.10.0.2/32` means "only traffic destined for that one address goes to this peer."

**Endpoint** — The real-world `IP:port` of a peer. Optional — if a peer is behind NAT and always initiates, you may omit it on the server side and let WireGuard learn it from incoming packets.

**PersistentKeepalive** — Sends a keepalive packet every N seconds. Keeps NAT mappings alive so a peer behind a firewall can receive inbound packets. Typically set to `25` on the roaming client side.

**wg** — Low-level CLI tool. Reads and writes interface configuration. Does not manage routing or bring interfaces up.

**wg-quick** — Higher-level wrapper around `wg`. Reads a config file, creates the interface, sets routes, runs pre/post scripts, and handles `up`/`down` cleanly.

**PreSharedKey** — An optional symmetric 32-byte key layered on top of the Curve25519 handshake. Adds post-quantum resistance. Strongly recommended for any long-lived tunnel.

---

## DAY 1 — Install, Generate Keys, Bring Up a Tunnel

### Install

```bash
# Debian / Ubuntu
sudo apt update && sudo apt install wireguard

# RHEL / Rocky / AlmaLinux 8+
sudo dnf install epel-release && sudo dnf install wireguard-tools

# macOS (via Homebrew)
brew install wireguard-tools

# Or use the macOS App Store WireGuard client for a GUI
```

The kernel module is included on Linux 5.6+. On older kernels, install `wireguard-dkms`.

### Generate Keys

Do this on every machine that will participate in the tunnel.

```bash
# Generate private key (keep this secret)
wg genkey | tee privatekey | wg pubkey > publickey

# Or inline
PRIVATE=$(wg genkey)
PUBLIC=$(echo "$PRIVATE" | wg pubkey)
echo "Private: $PRIVATE"
echo "Public:  $PUBLIC"
```

Generate a preshared key for each peer pair:

```bash
wg genpsk > psk_server_client
```

### Configure the Server (Machine A — `10.0.0.1`)

Create `/etc/wireguard/wg0.conf`:

```ini
[Interface]
Address    = 10.0.0.1/24
ListenPort = 51820
PrivateKey = <SERVER_PRIVATE_KEY>

# Enable IP forwarding for routing
PostUp   = sysctl -w net.ipv4.ip_forward=1
PostDown = sysctl -w net.ipv4.ip_forward=0

[Peer]
PublicKey    = <CLIENT_PUBLIC_KEY>
PresharedKey = <PSK>
AllowedIPs   = 10.0.0.2/32
```

### Configure the Client (Machine B — `10.0.0.2`)

Create `/etc/wireguard/wg0.conf`:

```ini
[Interface]
Address    = 10.0.0.2/24
PrivateKey = <CLIENT_PRIVATE_KEY>

[Peer]
PublicKey           = <SERVER_PUBLIC_KEY>
PresharedKey        = <PSK>
Endpoint            = <SERVER_PUBLIC_IP>:51820
AllowedIPs          = 10.0.0.1/32
PersistentKeepalive = 25
```

### Bring It Up

```bash
# Both machines
sudo wg-quick up wg0

# Enable at boot
sudo systemctl enable wg-quick@wg0
```

### Verify Connectivity

```bash
# Check interface state and peer handshake
sudo wg show

# Expected output includes:
# latest handshake: X seconds ago
# transfer: N KiB received, N KiB sent

# Ping the other end
ping 10.0.0.1   # from Machine B
ping 10.0.0.2   # from Machine A
```

If the handshake is absent, check firewall rules — UDP 51820 must be reachable on the server.

### Permissions

```bash
# Config files must be readable only by root
sudo chmod 600 /etc/wireguard/wg0.conf
```

---

## DAY 2 — Production Patterns

### Site-to-Site VPN

You want all traffic from `192.168.1.0/24` (office LAN) to reach `10.200.0.0/16` (cloud VPC) through the tunnel.

On the office router running WireGuard:

```ini
[Peer]
PublicKey  = <CLOUD_GW_PUBKEY>
Endpoint   = <CLOUD_GW_IP>:51820
AllowedIPs = 10.200.0.0/16
```

On the cloud gateway:

```ini
[Peer]
PublicKey  = <OFFICE_ROUTER_PUBKEY>
AllowedIPs = 192.168.1.0/24
```

Add a static route on machines in the cloud VPC pointing `192.168.1.0/24` via the WireGuard gateway. On the office side, add `10.200.0.0/16` via the WireGuard gateway. Both gateways need `net.ipv4.ip_forward = 1` and a `MASQUERADE` iptables rule if you are doing NAT.

```bash
# On gateway, allow forwarding and masquerade
PostUp   = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
```

### Road-Warrior (Roaming Client)

A laptop that should route all internet traffic through the VPN server:

```ini
[Peer]
PublicKey           = <SERVER_PUBKEY>
Endpoint            = <SERVER_IP>:51820
AllowedIPs          = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
```

`AllowedIPs = 0.0.0.0/0` makes WireGuard the default gateway. Every packet leaves through the tunnel. The server needs to forward and NAT that traffic out to the internet.

⚠️ If you use `0.0.0.0/0`, DNS queries also travel through the tunnel unless you set `DNS` in the `[Interface]` block. Without this, your DNS may leak.

### DNS Inside the Tunnel

```ini
[Interface]
Address = 10.0.0.2/24
DNS     = 10.0.0.1
```

`wg-quick` writes a `resolv.conf` entry (on Linux via `resolvconf` or `systemd-resolved`) that points DNS queries to the VPN server's address. The server must be running a resolver (Unbound, dnsmasq, CoreDNS, or systemd-resolved) listening on `10.0.0.1`.

On macOS, `wg-quick` configures the system DNS automatically when the `DNS` key is present.

### NAT Traversal

WireGuard handles NAT traversal well because the protocol is stateless from the network's perspective — roaming from one IP to another does not break the session. The tunnel updates the peer's endpoint the moment a valid authenticated packet arrives from a new address.

For a peer behind a strict NAT with no known endpoint, use `PersistentKeepalive = 25`. This sends an outbound packet every 25 seconds, keeping the NAT mapping alive so the server can reach back.

If both peers are behind NAT with no public IP, you need a relay. Consider STUN/TURN, or use a mesh overlay like Tailscale.

### Tailscale and Netmaker

When you have more than a handful of peers, managing public keys and AllowedIPs by hand scales poorly. Two tools sit on top of WireGuard's primitives and automate key distribution and mesh routing:

**Tailscale** — Managed control plane. Install the agent, log in, and every device appears on a flat `100.x.y.z` network. No config files to write. The control plane is proprietary but the data plane is standard WireGuard. Useful for small teams or personal setups where you trust Tailscale's coordination server. Self-hosted option: Headscale.

**Netmaker** — Open-source, self-hosted mesh control plane. Runs a gRPC server that distributes WireGuard configs to nodes. Supports site-to-site, ingress/egress gateways, and ACLs. Appropriate when you need full control and want to self-host the coordination layer.

Both generate standard WireGuard interfaces under the hood — you can inspect them with `wg show` at any time.

### Firewall Rules

On the WireGuard server, open the listen port:

```bash
# iptables
iptables -A INPUT -p udp --dport 51820 -j ACCEPT

# firewalld
firewall-cmd --permanent --add-port=51820/udp && firewall-cmd --reload

# ufw
ufw allow 51820/udp
```

Lock down the WireGuard interface so only expected traffic crosses it:

```bash
# Allow established tunnel traffic, drop everything else on wg0 by default
iptables -A INPUT  -i wg0 -s 10.0.0.0/24 -j ACCEPT
iptables -A OUTPUT -o wg0 -d 10.0.0.0/24 -j ACCEPT
```

### Monitoring

```bash
# Live peer stats
watch -n 2 sudo wg show

# Fields to watch:
# latest handshake — should be < 3 minutes if peer is active
# transfer        — bytes in / bytes out (no activity = tunnel stale or broken)
# endpoint        — current real IP of roaming peer (updates on reconnect)
```

For Prometheus, `prometheus-wireguard-exporter` scrapes `wg show` output and exposes metrics on port 9586. Pair with a Grafana dashboard to track handshake age and byte counters per peer.

### Container Access via WireGuard

To give containers access to the VPN, either:

1. Run the WireGuard interface on the host and add container subnet routes to the peer's `AllowedIPs`. Containers route through the host's `wg0` via the default gateway.

2. Run WireGuard inside a privileged container (or as a sidecar) using the `linuxserver/wireguard` image. The container holds the private key and manages `wg0` internally.

```yaml
# docker-compose snippet for option 2
services:
  wireguard:
    image: linuxserver/wireguard
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    volumes:
      - ./wg-config:/config
    ports:
      - "51820:51820/udp"
    sysctls:
      - net.ipv4.conf.all.src_valid_mark=1
```

⚠️ The container needs `CAP_NET_ADMIN` and kernel module access (`SYS_MODULE`). On hardened kernels, you may also need to load `wireguard` manually with `modprobe wireguard` on the host.

---

## Worked Example — Office to Cloud VPC

**Goal:** Route traffic between `192.168.10.0/24` (office) and `172.16.0.0/16` (AWS VPC) through a WireGuard tunnel. The cloud gateway is an EC2 instance with Elastic IP `54.12.34.56`.

**Step 1 — Generate keys on both machines.**

```bash
# Cloud (EC2)
CLOUD_PRIV=$(wg genkey); CLOUD_PUB=$(echo "$CLOUD_PRIV" | wg pubkey)

# Office router
OFFICE_PRIV=$(wg genkey); OFFICE_PUB=$(echo "$OFFICE_PRIV" | wg pubkey)

# PSK
PSK=$(wg genpsk)
```

**Step 2 — Cloud gateway config `/etc/wireguard/wg0.conf`.**

```ini
[Interface]
Address    = 10.99.0.1/30
ListenPort = 51820
PrivateKey = <CLOUD_PRIV>
PostUp     = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown   = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
PublicKey    = <OFFICE_PUB>
PresharedKey = <PSK>
AllowedIPs   = 192.168.10.0/24, 10.99.0.2/32
```

**Step 3 — Office router config `/etc/wireguard/wg0.conf`.**

```ini
[Interface]
Address    = 10.99.0.2/30
PrivateKey = <OFFICE_PRIV>
PostUp     = iptables -A FORWARD -i wg0 -j ACCEPT; sysctl -w net.ipv4.ip_forward=1
PostDown   = iptables -D FORWARD -i wg0 -j ACCEPT

[Peer]
PublicKey           = <CLOUD_PUB>
PresharedKey        = <PSK>
Endpoint            = 54.12.34.56:51820
AllowedIPs          = 172.16.0.0/16, 10.99.0.1/32
PersistentKeepalive = 25
```

**Step 4 — Bring up both interfaces.**

```bash
sudo wg-quick up wg0
sudo systemctl enable wg-quick@wg0
```

**Step 5 — Add routes in the VPC.** In the AWS Route Table, add `192.168.10.0/24 → eni-xxxx` (the EC2 instance's ENI). Disable source/destination check on the EC2 instance.

**Step 6 — Verify.**

```bash
# From office host
ping 172.16.1.5

# From EC2
ping 192.168.10.10

# Handshake check
sudo wg show wg0
```

---

## Pitfalls

**Handshake never completes.** Almost always a firewall issue. UDP 51820 must be open inbound on the machine with a public IP. Check security groups (AWS), NSGs (Azure), `iptables -L -n`, and `ufw status`.

**Tunnel comes up but no traffic flows.** IP forwarding is off. Run `sysctl net.ipv4.ip_forward` — if it returns `0`, traffic will not route. Set it to `1` permanently in `/etc/sysctl.d/99-wireguard.conf`.

**AllowedIPs mismatch.** If the cloud side has `AllowedIPs = 192.168.10.0/24` but you are sending traffic from `192.168.10.50`, that address must fall within the allowed range. WireGuard silently drops packets that do not match.

**Roaming client loses DNS on reconnect.** The `DNS` key in `[Interface]` only works with `wg-quick`, not bare `wg`. If you manage the interface manually, you must also configure the resolver yourself.

**Large MTU fragmentation.** WireGuard adds ~60 bytes of overhead. On links with 1500-byte MTU, you may see issues with large packets. Set `MTU = 1420` in `[Interface]` on roaming clients.

**Key rotation is manual.** WireGuard does not rotate keys automatically. Build a process to regenerate keys and push new configs periodically, especially for long-lived production tunnels.

⚠️ **Never store private keys in environment variables you log.** Shell history, systemd journal, and container logs have captured secrets this way. Write them to a file readable only by root, or use a secrets manager and inject via `PostUp`.

**Time skew.** WireGuard's handshake includes timestamps. If system clocks differ by more than a few minutes, handshakes fail. Ensure NTP is running on all peers.

---

## Quick Reference

```bash
# Show tunnel status and peer stats
sudo wg show

# Show specific interface
sudo wg show wg0

# Bring interface up / down
sudo wg-quick up wg0
sudo wg-quick down wg0

# Reload config without dropping tunnel (live peer add/remove)
sudo wg syncconf wg0 <(sudo wg-quick strip wg0)

# Add a peer dynamically (no config file edit)
sudo wg set wg0 peer <PUBKEY> allowed-ips 10.0.0.5/32 endpoint 1.2.3.4:51820

# Remove a peer
sudo wg set wg0 peer <PUBKEY> remove

# Generate keys
wg genkey | tee private.key | wg pubkey > public.key
wg genpsk > preshared.key

# Check IP forwarding
sysctl net.ipv4.ip_forward

# Enable permanently
echo "net.ipv4.ip_forward = 1" | sudo tee /etc/sysctl.d/99-wg.conf
sudo sysctl --system
```

| Config Key            | Where     | Purpose                                        |
|-----------------------|-----------|------------------------------------------------|
| `Address`             | Interface | Tunnel IP assigned to this node                |
| `ListenPort`          | Interface | UDP port to listen on (server side)            |
| `PrivateKey`          | Interface | This node's private key                        |
| `DNS`                 | Interface | Resolver to use inside the tunnel              |
| `MTU`                 | Interface | Override default MTU (use 1420 for roaming)    |
| `PublicKey`           | Peer      | Remote peer's public key                       |
| `PresharedKey`        | Peer      | Symmetric layer for post-quantum resistance    |
| `AllowedIPs`          | Peer      | CIDRs routed to / accepted from this peer      |
| `Endpoint`            | Peer      | Real IP:port of the remote peer                |
| `PersistentKeepalive` | Peer      | Keepalive interval in seconds (25 for NAT)     |

---

## Next Steps

You have the tunnel. Now build the rest of the stack:

- `SSH.md` — secure shell access into the hosts reachable through the tunnel.
- `Linux.md` — IP forwarding, iptables, routing tables, and namespaces.
- `DNS-curl-dig.md` — DNS inside the tunnel, split-horizon, and debugging name resolution.
- `Nginx.md` — expose internal services through a reverse proxy behind the VPN.

---

## The Mantra

> One interface. One config file. One handshake. If the handshake is green and the routes match the AllowedIPs, traffic flows. Everything else is debugging those two things.
