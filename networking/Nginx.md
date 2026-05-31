# Nginx — A 2-Day Crash Course

> **In one sentence:** Nginx is a high-performance web server, reverse proxy, and load balancer that sits in front of your applications — it's the traffic cop between the internet and your services.

---

## Part 0 — Why Nginx exists

Your application server — a Node.js process, a Django app, a Go binary — is good at one thing: running your business logic. It shouldn't be responsible for:

- Terminating TLS connections and managing certificates
- Serving static files (images, CSS, JS) from disk
- Enforcing rate limits to protect against abuse
- Distributing traffic across multiple instances
- Compressing responses with gzip
- Setting security headers on every response
- Buffering slow clients so your app threads stay free

Before Nginx, every app had to solve these problems itself, or you stitched together Apache config macros and hoped for the best. Nginx solves them once, at the edge, efficiently.

The architecture matters: Nginx uses an event-driven, non-blocking model. A small number of worker processes handle thousands of concurrent connections without spawning a thread per connection. That's why it handles C10K problems (10,000 concurrent connections) that trip up threaded servers.

**Mental model:** Nginx is a receptionist — it receives every request at the front door, decides which backend handles it, and can cache, compress, rate-limit, and TLS-terminate along the way. Your backend never talks directly to the raw internet; it talks to the receptionist.

---

## Part 1 — The vocabulary

| Term | What it means |
|---|---|
| **Directive** | A single configuration instruction ending in `;` — e.g., `listen 80;` |
| **Context** | A block that groups related directives — `http {}`, `server {}`, `location {}` |
| **Upstream** | A named pool of backend servers that Nginx can proxy requests to |
| **Reverse Proxy** | Nginx sits between the client and your app — clients talk to Nginx, Nginx talks to your app |
| **Load Balancing** | Distributing incoming requests across multiple upstream servers |
| **Worker Process** | A single-threaded OS process that handles I/O events; Nginx typically runs one per CPU core |
| **Location Block** | A `location` context that matches URL paths and defines how to handle requests for those paths |
| **proxy_pass** | The directive that tells Nginx to forward a request to a backend — e.g., `proxy_pass http://localhost:3000;` |

---

## DAY 1 — Serve and proxy

### 1. Install Nginx

On Ubuntu/Debian:

```bash
sudo apt update
sudo apt install nginx
sudo systemctl enable --now nginx
```

On RHEL/Amazon Linux:

```bash
sudo dnf install nginx
sudo systemctl enable --now nginx
```

On macOS (Homebrew):

```bash
brew install nginx
brew services start nginx
```

Verify it's running:

```bash
curl -I http://localhost
# HTTP/1.1 200 OK
```

The default config lives at `/etc/nginx/nginx.conf`. On Debian-based systems, vhosts go in `/etc/nginx/sites-available/` and are symlinked into `/etc/nginx/sites-enabled/`. On RHEL-based systems, drop files into `/etc/nginx/conf.d/`.

### 2. Understand the config structure

`nginx.conf` has this nesting:

```
main context            # worker_processes, error_log, pid
└── http {}             # HTTP settings: gzip, log_format, include
    └── server {}       # Virtual host: listen, server_name
        └── location {} # URL routing: root, proxy_pass, return
```

A minimal `nginx.conf`:

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout 65;

    server {
        listen 80;
        server_name _;

        location / {
            root /var/www/html;
            index index.html;
        }
    }
}
```

`worker_processes auto` sets one worker per CPU. `sendfile on` enables zero-copy file transfer — critical for static file performance.

### 3. Serve static files

Create a simple vhost. Drop a file at `/etc/nginx/sites-available/mysite`:

```nginx
server {
    listen 80;
    server_name mysite.example.com;

    root /var/www/mysite;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    # Cache static assets aggressively
    location ~* \.(css|js|png|jpg|gif|ico|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/mysite /etc/nginx/sites-enabled/
sudo nginx -t          # test config
sudo nginx -s reload   # apply without downtime
```

`try_files $uri $uri/ =404` — this is idiomatic Nginx. It checks: does this exact file exist? Does a directory with this name exist? If neither, return 404. For single-page apps replace `=404` with `/index.html` to serve the app shell for all routes.

### 4. Basic reverse proxy

Your app runs on port 3000. Nginx listens on 80 and proxies to it:

```nginx
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;

        # Pass the original request info to your app
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Without `proxy_set_header`, your app sees Nginx's IP (`127.0.0.1`) as the client — every request appears to come from localhost. The four headers above fix that.

### 5. Logs

Nginx writes two log files by default:

- `/var/log/nginx/access.log` — every request: IP, method, path, status, bytes, response time
- `/var/log/nginx/error.log` — startup errors, upstream failures, config issues

Tail them while testing:

```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

Define a structured log format (useful for log shippers — see `../observability/Loki.md`):

```nginx
http {
    log_format json_combined escape=json
        '{"time":"$time_iso8601",'
        '"remote_addr":"$remote_addr",'
        '"method":"$request_method",'
        '"uri":"$request_uri",'
        '"status":$status,'
        '"bytes_sent":$bytes_sent,'
        '"request_time":$request_time,'
        '"upstream_response_time":"$upstream_response_time"}';

    access_log /var/log/nginx/access.log json_combined;
}
```

---

**By end of Day 1 you can:**
- Install Nginx and understand its process model
- Serve static files efficiently with `try_files`
- Set up a reverse proxy to a local backend with correct forwarding headers
- Test config changes safely and reload without dropping connections
- Tail logs to debug request flow

---

## DAY 2 — Make it real

### 1. TLS termination with Let's Encrypt

Install certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d mysite.example.com
```

Certbot rewrites your server block automatically. What it produces (simplified):

```nginx
server {
    listen 443 ssl;
    server_name mysite.example.com;

    ssl_certificate     /etc/letsencrypt/live/mysite.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mysite.example.com/privkey.pem;

    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}

server {
    listen 80;
    server_name mysite.example.com;
    return 301 https://$host$request_uri;
}
```

Auto-renew runs via a systemd timer certbot installs automatically:

```bash
sudo systemctl status certbot.timer
```

### 2. Load balancing algorithms

Define an upstream group, then proxy to the group name:

```nginx
upstream backend {
    server 10.0.0.1:3000;
    server 10.0.0.2:3000;
    server 10.0.0.3:3000;
}

server {
    location / {
        proxy_pass http://backend;
    }
}
```

Default is **round-robin** — requests cycle through servers in order. Three algorithms you'll actually use:

```nginx
upstream backend {
    # least_conn: send to the server with fewest active connections
    # Good for variable request durations
    least_conn;
    server 10.0.0.1:3000;
    server 10.0.0.2:3000;
}

upstream backend_sticky {
    # ip_hash: same client IP always hits the same server
    # Use when sessions aren't externalized — avoid if possible
    ip_hash;
    server 10.0.0.1:3000;
    server 10.0.0.2:3000;
}
```

Weight a server to receive more traffic:

```nginx
upstream backend {
    server 10.0.0.1:3000 weight=3;  # 3x more traffic
    server 10.0.0.2:3000 weight=1;
}
```

Mark a server as backup — only used when all others are down:

```nginx
upstream backend {
    server 10.0.0.1:3000;
    server 10.0.0.2:3000 backup;
}
```

### 3. Health checks (passive)

Nginx open-source does passive health checks — it marks a server down after it fails:

```nginx
upstream backend {
    server 10.0.0.1:3000 max_fails=3 fail_timeout=30s;
    server 10.0.0.2:3000 max_fails=3 fail_timeout=30s;
}
```

After 3 failures within 30 seconds, the server is removed from rotation for 30 seconds. Active health checks (periodic pings) require Nginx Plus or the `ngx_http_upstream_check_module`.

### 4. Rate limiting

Rate limiting happens in two steps: define the zone, then apply the limit.

```nginx
http {
    # Define a rate limit: 10 requests/second per IP
    # Zone name "api_limit", 10MB shared memory (stores ~160,000 IPs)
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

    server {
        location /api/ {
            # Allow a burst of 20 requests above the rate, then queue
            # nodelay: serve burst requests immediately, don't queue them
            limit_req zone=api_limit burst=20 nodelay;
            limit_req_status 429;

            proxy_pass http://backend;
        }
    }
}
```

`$binary_remote_addr` uses 4 bytes per IPv4 address instead of a string — more efficient than `$remote_addr` for the zone key.

### 5. Caching

```nginx
http {
    # Cache storage: 10MB zone for keys, 1GB disk, 60-minute inactive TTL
    proxy_cache_path /var/cache/nginx levels=1:2
                     keys_zone=app_cache:10m
                     max_size=1g
                     inactive=60m
                     use_temp_path=off;

    server {
        location / {
            proxy_cache app_cache;
            proxy_cache_valid 200 302 10m;
            proxy_cache_valid 404 1m;
            proxy_cache_use_stale error timeout updating;
            add_header X-Cache-Status $upstream_cache_status;

            proxy_pass http://backend;
        }
    }
}
```

The `X-Cache-Status` header tells you whether a response was `HIT`, `MISS`, or `BYPASS` — invaluable for debugging. Bypass cache for authenticated requests:

```nginx
proxy_cache_bypass $http_authorization;
proxy_no_cache $http_authorization;
```

### 6. Gzip compression

```nginx
http {
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;       # Don't compress tiny responses
    gzip_comp_level 6;          # 1=fast/weak, 9=slow/strong; 6 is the sweet spot
    gzip_types
        text/plain
        text/css
        text/javascript
        application/javascript
        application/json
        application/xml
        image/svg+xml;
}
```

Never compress already-compressed formats: JPEG, PNG, WebP, WOFF2, or zip files. Compressing them wastes CPU and barely shrinks the payload.

### 7. Security headers

```nginx
server {
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'" always;

    # Hide Nginx version from Server header
    server_tokens off;
}
```

The `always` parameter applies the header to all responses, including error responses — without it, headers are only added to 2xx/3xx responses.

### 8. Graceful reloads

```bash
sudo nginx -t           # validate config — always run before reload
sudo nginx -s reload    # zero-downtime reload: workers finish in-flight requests
sudo nginx -s stop      # graceful shutdown
sudo nginx -s quit      # fast shutdown (drops connections)
```

`reload` sends SIGHUP to the master process. The master starts new workers with the new config; old workers finish their current requests and exit. No connections are dropped. See `../linux/Linux.md` for signal handling and process management fundamentals.

### 9. Docker and Kubernetes patterns

In Docker, Nginx commonly runs as a sidecar or as the container itself:

```dockerfile
FROM nginx:alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY dist/ /usr/share/nginx/html
```

See `../containers/Docker.md` for multi-stage build patterns where Nginx serves the frontend bundle.

In Kubernetes, you usually don't run Nginx directly — you use the **Nginx Ingress Controller**, which reads `Ingress` resources and manages Nginx config for you:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp
  annotations:
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  rules:
    - host: mysite.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: myapp-service
                port:
                  number: 3000
```

See `../containers/Kubernetes.md` for full Ingress controller setup and TLS cert management with cert-manager.

---

## Worked example — TLS reverse proxy with load balancing

Complete production-ready config proxying to 3 backend servers:

```nginx
# /etc/nginx/sites-available/api.example.com

upstream api_backend {
    least_conn;

    server 10.0.1.10:8080 max_fails=3 fail_timeout=30s;
    server 10.0.1.11:8080 max_fails=3 fail_timeout=30s;
    server 10.0.1.12:8080 max_fails=3 fail_timeout=30s;

    keepalive 32;  # Keep 32 idle connections to backends
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name api.example.com;

    # TLS — managed by certbot
    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;

    # Security headers
    server_tokens off;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;

    # Gzip
    gzip on;
    gzip_types application/json text/plain;
    gzip_min_length 1024;

    # Global rate limit: 30 req/s per IP, burst 60
    limit_req zone=api_limit burst=60 nodelay;
    limit_req_status 429;

    # Proxy timeouts
    proxy_connect_timeout 5s;
    proxy_send_timeout    60s;
    proxy_read_timeout    60s;

    location / {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;

        # Required for keepalive to backends
        proxy_set_header Connection "";

        # Pass client info
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Buffer settings — prevents slow clients from tying up backends
        proxy_buffering on;
        proxy_buffers 8 16k;
        proxy_buffer_size 32k;
    }

    # Health check endpoint — bypass rate limiting
    location /health {
        limit_req off;
        proxy_pass http://api_backend;
        access_log off;
    }

    # Block common scanner paths
    location ~* \.(env|git|sql|bak)$ {
        return 404;
    }
}
```

The `limit_req_zone` definition belongs in the `http {}` block (in `nginx.conf` or a shared include):

```nginx
http {
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;
    include /etc/nginx/sites-enabled/*;
}
```

---

## Common pitfalls

- **Forgetting `proxy_set_header Host $host`** — your backend receives Nginx's hostname or the upstream name instead of the original `Host` header. Auth systems and virtual hosts break silently.

- **Missing `proxy_http_version 1.1` with keepalive** — upstream keepalive connections require HTTP/1.1. Without this directive, Nginx uses 1.0 and closes the connection after every request, defeating the purpose of `keepalive`.

- **Reloading without `nginx -t` first** — a config syntax error on reload kills your workers without starting new ones. Always test before reload.

- **`add_header` in nested blocks clears parent headers** — if you define headers in `http {}` and then add any `add_header` in a `server {}` or `location {}` block, the parent headers are silently dropped. Repeat all headers at the most specific level where you need them, or use an include file.

- **`root` vs `alias` in location blocks** — with `root`, Nginx appends the location path to the root path. With `alias`, the location path is replaced.

  ```nginx
  # root: serves /var/www/html/static/file.css for /static/file.css
  location /static/ { root /var/www/html; }

  # alias: serves /var/www/static/file.css for /static/file.css
  location /static/ { alias /var/www/static/; }
  ```

- **Rate limit zone too small** — a 1MB zone holds roughly 16,000 IP addresses. If you have high traffic, size the zone appropriately or entries are evicted under load.

- **Not setting `proxy_buffering on` for slow clients** — without buffering, a slow client holds a backend connection open until the full response is transferred. Enable buffering so the backend finishes fast and returns to the pool.

- **`server_name _` catches everything** — the underscore is a wildcard catch-all, not a hostname. Requests that don't match any other `server_name` land there. Make this intentional.

- **Using `if` inside location blocks** — Nginx `if` has non-obvious semantics inside location contexts. The official guidance is "if is evil." Use `map`, `try_files`, or `return` instead wherever possible.

---

## Quick command reference

### Server management

```bash
sudo nginx -t                      # Test config syntax
sudo nginx -T                      # Test and dump entire config
sudo nginx -s reload               # Zero-downtime reload
sudo nginx -s stop                 # Graceful stop
sudo systemctl status nginx        # Check process status
sudo systemctl restart nginx       # Full restart (drops connections)
```

### Config testing and debugging

```bash
nginx -v                           # Show version
nginx -V                           # Show version + compile flags (modules)
curl -I http://localhost           # Check response headers
curl -sv https://example.com 2>&1 | grep -E "SSL|HTTP|< "
```

See `../networking/DNS-curl-dig.md` for deeper `curl` debugging techniques.

### Common location patterns

```nginx
# Exact match — only this path
location = /favicon.ico { return 204; access_log off; }

# Prefix match
location /api/ { proxy_pass http://backend; }

# Case-insensitive regex match
location ~* \.(jpg|jpeg|png|gif)$ { expires 30d; }

# Deny access to dot files
location ~ /\. { deny all; return 404; }

# SPA fallback — serve index.html for all unmatched routes
location / {
    try_files $uri $uri/ /index.html;
}
```

### Proxy settings

```nginx
proxy_pass http://backend;
proxy_http_version 1.1;
proxy_set_header Connection "";          # Required for keepalive
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_connect_timeout 5s;
proxy_read_timeout 60s;
proxy_buffering on;
```

### TLS

```bash
# Obtain certificate
sudo certbot --nginx -d example.com -d www.example.com

# Renew all certificates
sudo certbot renew --dry-run

# Check certificate expiry
echo | openssl s_client -connect example.com:443 2>/dev/null | openssl x509 -noout -dates
```

### Rate limiting

```nginx
# In http block:
limit_req_zone $binary_remote_addr zone=mylimit:10m rate=10r/s;

# In server/location:
limit_req zone=mylimit burst=20 nodelay;
limit_req_status 429;

# Per-connection limit (simultaneous connections per IP):
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
limit_conn conn_limit 10;
```

### Useful variables

```nginx
$host                        # Request Host header (or server_name if absent)
$remote_addr                 # Client IP
$request_uri                 # Full URI with query string
$uri                         # URI without query string (may be rewritten)
$args                        # Query string
$scheme                      # http or https
$upstream_addr               # IP of the backend that served the request
$upstream_response_time      # Backend response time in seconds
$upstream_cache_status       # HIT / MISS / BYPASS / EXPIRED
```

---

## Next steps after Day 2

- **`../networking/DNS-curl-dig.md`** — understand how DNS resolution works before Nginx even sees a request; `dig` and `curl -v` are your primary Nginx debugging tools
- **`../containers/Kubernetes.md`** — Nginx Ingress Controller, cert-manager for automated TLS, IngressClass configuration, and annotations for fine-grained routing
- **`../containers/Docker.md`** — multi-stage builds serving frontend bundles via Nginx, Docker Compose with Nginx as the edge service
- **`../linux/Linux.md`** — process signals, file descriptors, `ulimit` tuning, and `ss`/`netstat` for inspecting Nginx connections at the OS level
- **HAProxy** — if you need TCP-level load balancing, more advanced health check logic, or sub-millisecond failover; HAProxy is purpose-built for that problem
- **Envoy Proxy** — the CNCF alternative used in service mesh architectures (Istio, Consul Connect); more complex to configure but natively supports gRPC, HTTP/2, and distributed tracing

---

**The mantra:** Nginx does not run your app — it protects it, routes to it, and makes it fast; keep your app config in your app and your edge config in Nginx.
