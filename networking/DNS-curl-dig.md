# DNS, curl & dig — A 2-Day Crash Course

> **In one sentence:** This is the network-debugging toolkit — understand how DNS turns names into
> addresses, use `dig` to inspect that resolution, and use `curl` to make and dissect HTTP
> requests, so you can answer "why can't my service reach that endpoint?"

> Builds on `Linux.md`. These three skills resolve a huge fraction of "it's not connecting" incidents.

---

## Part 0 — Why this matters and the mental model

When a service can't talk to another service, the cause is almost always in one of a few layers,
and you debug them in order:
1. **Name resolution** — does the hostname resolve to an IP at all? (DNS) → `dig`
2. **Connectivity** — can you reach that IP and port? → `ping`, `nc`, `curl`
3. **The application** — does the HTTP request actually work, and what does it return? → `curl`

Most "connection" problems are really **DNS problems** (wrong/stale record, wrong resolver) or
**HTTP problems** (wrong path, TLS error, 4xx/5xx). `dig` and `curl` are the two instruments that
tell you which layer is broken.

**How DNS works (the model):** DNS is the internet's phone book. When you request
`api.example.com`, your machine asks a chain of DNS servers to translate that name into an IP
address. It's hierarchical: root servers → `.com` servers → `example.com`'s authoritative servers,
which hold the actual records. Answers are **cached** with a **TTL** (time-to-live), which is why
DNS changes don't take effect instantly — old answers linger until the TTL expires. Understanding
caching/TTL explains most "I changed the DNS but it still goes to the old server" confusion.

**Mental model:** name → (DNS resolution) → IP → (TCP connect to a port) → (HTTP request/response).
Debug left to right; `dig` checks the first arrow, `curl` checks the last.

---

## Part 1 — DNS record types you must know

| Record | Maps... | Example |
|--------|---------|---------|
| **A** | name → IPv4 address | `api.example.com → 93.184.216.34` |
| **AAAA** | name → IPv6 address | |
| **CNAME** | name → another name (alias) | `www → example.com` |
| **MX** | domain → mail servers | |
| **TXT** | arbitrary text (SPF, domain verification) | |
| **NS** | domain → its authoritative nameservers | |
| **SOA** | the domain's "start of authority" metadata | |
| **PTR** | IP → name (reverse DNS) | |

The two you'll touch most: **A** (where does this name point?) and **CNAME** (this name is an alias
for that one). **TTL** on each record controls how long it's cached.

---

## DAY 1 — Inspect DNS with dig, fetch with curl

### 1. `dig` — see exactly what DNS returns
```bash
dig example.com                    # full answer (A record by default)
dig +short example.com             # just the IP — the quick check
dig example.com A                  # specific record type (A/AAAA/CNAME/MX/TXT/NS)
dig +short example.com MX
dig @8.8.8.8 example.com           # ask a SPECIFIC resolver (Google's), bypassing your default
dig +trace example.com             # follow the full resolution chain from the root
```
Reading `dig` output, the key part is the **ANSWER SECTION**:
```
;; ANSWER SECTION:
example.com.   3600   IN   A   93.184.216.34
                ^TTL            ^the IP
```
That TTL (3600 = 1 hour) is how long this answer is cached. `dig +short` is your everyday "what
does this resolve to?" The `@resolver` form is gold for "does the *new* DNS record exist yet, even
if my machine has the old one cached?" — ask the authoritative server directly.

### 2. The DNS debugging workflow
```bash
dig +short api.example.com                 # does it resolve? to what?
dig @1.1.1.1 +short api.example.com        # does a public resolver agree? (cache vs reality)
dig api.example.com NS                      # who's authoritative for this domain?
dig @<authoritative-ns> +short api.example.com   # what does the SOURCE OF TRUTH say?
```
If your machine resolves to an old IP but the authoritative server returns the new one → you're
hitting a **cache**; wait out the TTL or flush. If nothing resolves → the record is missing/wrong.

### 3. `curl` — make HTTP requests and dissect them
```bash
curl https://example.com                       # fetch the body
curl -I https://example.com                    # HEAD request — headers only (status, content-type)
curl -i https://example.com                    # include response headers WITH the body
curl -v https://example.com                    # VERBOSE — see DNS, TCP, TLS handshake, headers
curl -s https://example.com | jq .             # silent (no progress bar) + pipe JSON to jq
```
`curl -v` is the single best network-debugging command: it shows you, step by step, the IP it
resolved, the TLS handshake, the request headers it sent, and the response headers it got back.
When something's wrong, `curl -v` usually shows you *where*.

### 4. Reading `curl -v` (what each part tells you)
```
* Trying 93.184.216.34:443...        <- DNS resolved + attempting TCP connect (connectivity layer)
* SSL connection using TLSv1.3        <- TLS handshake succeeded (cert/TLS layer)
> GET / HTTP/2                        <- the request you SENT (lines starting >)
> Host: example.com
< HTTP/2 200                          <- the response you GOT (lines starting <)
< content-type: text/html
```
`>` = sent, `<` = received. If it hangs at "Trying..." → connectivity/firewall. If TLS fails →
certificate/protocol. If you get a `< 404`/`< 500` → DNS and connection are fine, it's an
application/path problem.

**By end of Day 1 you can:** resolve names with `dig` (including bypassing cache via `@resolver`),
fetch and inspect HTTP with `curl -v`/`-I`, and reason about which layer (DNS / connect / TLS /
app) is failing.

---

## DAY 2 — Real debugging, APIs, and TLS

### 1. curl for APIs (your daily integration tool)
```bash
# methods, headers, body
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"gurpreet"}'

curl -s https://api.example.com/data | jq '.items[]'    # parse JSON (see jq.md)
curl -u user:pass https://api.example.com               # basic auth
curl -o out.json https://api.example.com/data           # save to a file
curl -L https://example.com                              # follow redirects (3xx)
curl --data-urlencode "q=hello world" https://api/search # url-encode a param
```
Useful flags: `-w` to print timing/status, e.g. measure latency without a browser:
```bash
curl -s -o /dev/null -w "status=%{http_code} time=%{time_total}s dns=%{time_namelookup}s\n" \
  https://api.example.com/health
```
`%{time_namelookup}` vs `%{time_total}` tells you whether slowness is DNS or the server.

### 2. Connectivity tests (when curl can't even connect)
```bash
ping example.com                  # basic reachability (ICMP; some hosts block it)
nc -zv example.com 443            # is the PORT open? (netcat) — the real "can I reach the service?"
nc -zv 10.0.0.5 5432              # e.g. can I reach Postgres on this host?
traceroute example.com            # the network path (where packets stop)
ss -tulpn                         # locally: what's listening on which port? (see Linux.md)
telnet example.com 80             # old-school port check
```
`nc -zv host port` is the precise "is that service reachable on that port?" test — more useful
than `ping` (which only tests the host, not the port, and is often blocked).

### 3. TLS / certificate debugging (a common production headache)
```bash
curl -v https://example.com 2>&1 | grep -i -E "SSL|TLS|certificate|expire"
# inspect the cert directly:
openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -dates -subject -issuer
```
Common TLS errors and meaning: "certificate has expired" (renew it), "self-signed certificate"
(untrusted CA — add `-k` to bypass *for testing only*), "handshake failure" (protocol/cipher
mismatch), "SNI" issues (use `-servername`/`--resolve`). `curl -k` skips verification — handy to
confirm "is it the cert or the app?" but never in production code.

### 4. Testing against a specific server (bypass DNS / test before cutover)
```bash
# pretend example.com resolves to a specific IP — test the NEW server before changing DNS
curl -v --resolve example.com:443:10.0.0.99 https://example.com/health
# or hit an IP but send the right Host header (virtual hosts):
curl -v -H "Host: example.com" https://10.0.0.99/health
```
`--resolve` is the pro move: validate a new backend behind a hostname *before* you flip DNS to it
— no `/etc/hosts` editing, no waiting on TTLs.

### 5. Local DNS resolution config
```bash
cat /etc/resolv.conf          # which DNS servers your machine uses
cat /etc/hosts                # static name->IP overrides (checked BEFORE DNS)
getent hosts example.com      # how the SYSTEM resolves it (respects /etc/hosts, nsswitch)
resolvectl status             # systemd-resolved status (modern distros)
# flush caches (varies): resolvectl flush-caches  /  sudo systemd-resolve --flush-caches
```
Note: `dig` queries DNS directly and **ignores `/etc/hosts`**, while your applications use the
system resolver (which *does* read `/etc/hosts`). So `dig` and your app can disagree — use
`getent hosts` to see what the *application* will actually resolve.

### 6. The full top-to-bottom debug sequence
```bash
# "my app can't reach api.example.com:443"
dig +short api.example.com                 # 1. does the name resolve? to the right IP?
getent hosts api.example.com               # 1b. what will the APP resolve (incl /etc/hosts)?
nc -zv api.example.com 443                 # 2. is the port reachable? (firewall/routing)
curl -v https://api.example.com/health     # 3. does HTTP+TLS work? what status comes back?
curl -v --resolve api.example.com:443:<new-ip> https://api.example.com/health  # test a specific backend
```

---

## Worked example — "the API call started failing after a deploy"
```text
1. dig +short api.example.com            -> resolves to 10.0.0.50 (an IP). Good, DNS is fine.
2. nc -zv api.example.com 443            -> "succeeded". Port reachable. Not a firewall issue.
3. curl -v https://api.example.com/v1/orders
     < HTTP/2 404                         -> connection + TLS fine; it's a 404. App-layer problem.
4. curl -i https://api.example.com/v2/orders
     < HTTP/2 200                         -> the path moved to /v2 in the deploy. Root cause found.
   (If step 3 had hung at "Trying..." -> connectivity. If TLS error -> cert. The status code
    localizes the problem to a layer.)
```

---

## Common pitfalls
- **Assuming DNS propagated instantly.** TTL caching means old answers linger. Check the
  authoritative server with `dig @ns` and remember `dig` ignores `/etc/hosts` (use `getent`).
- **Using `ping` to test a service.** `ping` tests the host (ICMP), often blocked, and never tests
  the port. Use `nc -zv host port` or `curl`.
- **Ignoring `curl -v`.** People guess instead of reading the verbose output that literally shows
  where it failed (resolve / connect / TLS / status).
- **`curl -k` in production.** It disables cert verification — fine to *diagnose* "is it the
  cert?", never to *fix* by leaving it on. Fix the cert.
- **Confusing redirects.** A `301/302` without `-L` looks like "nothing returned." Add `-L` to
  follow.
- **Reading status codes loosely.** 2xx ok, 3xx redirect, **4xx your request is wrong** (path,
  auth, payload), **5xx the server failed**. The class tells you whose problem it is.
- **`dig` vs the app disagreeing.** `dig` = pure DNS; apps use the system resolver + `/etc/hosts`.
  `getent hosts` shows the truth your app sees.

---

## Quick reference
```bash
# DNS (dig)
dig +short name [A|AAAA|CNAME|MX|TXT|NS]   # the IP/record, terse
dig name                                   # full answer (read ANSWER SECTION + TTL)
dig @8.8.8.8 name                          # query a specific resolver (bypass local cache)
dig +trace name                            # full resolution from root
dig -x 1.2.3.4                             # reverse lookup (PTR)
host name   nslookup name                  # simpler alternatives
getent hosts name                          # what the SYSTEM resolves (honors /etc/hosts)

# HTTP (curl)
curl URL                  -I (headers only)   -i (headers+body)   -v (verbose/debug)
  -s (silent)   -L (follow redirects)   -o file   -O (save w/ remote name)
  -X METHOD   -H "Header: v"   -d 'body'   --data-urlencode k=v
  -u user:pass   -k (insecure, testing only)
  --resolve host:port:IP    -H "Host: name"   (test a specific backend)
  -w "%{http_code} %{time_total}s %{time_namelookup}s"   (timing)

# Connectivity
ping host        nc -zv host port        traceroute host        ss -tulpn
telnet host port

# TLS
openssl s_client -connect host:443 -servername host </dev/null | openssl x509 -noout -dates
```

---

## Next steps after Day 2
- **`jq`** to parse JSON API responses fluently (see `jq.md`); **`yq`** for YAML (`yq.md`).
- HTTP deeper: status codes, methods, headers (caching, CORS), HTTP/2 vs HTTP/3.
- DNS deeper: split-horizon DNS, DNS in Kubernetes (CoreDNS, service discovery), DNSSEC.
- Load testing endpoints (`hey`, `wrk`, `vegeta`) and synthetic monitoring (blackbox_exporter —
  see `Prometheus.md`).

**The mantra:** name → IP → port → HTTP, debugged left to right. `dig +short` (and `@resolver` to
beat the cache) for DNS; `nc -zv` for the port; `curl -v` to watch the whole request and read the
status code that tells you which layer broke.
