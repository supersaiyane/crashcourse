# Cloudflare — A 2-Day Crash Course

> You already understand DNS and HTTP — now you're going to put a force field in front of everything you build. Prerequisites: `DNS-curl-dig.md`.

---

## Part 0 — Why Cloudflare

When traffic hits your server directly, every request is your problem: DDoS packets, scrapers, slow TLS handshakes, cache misses, and cold boots. Cloudflare sits between the internet and your origin. It is not just a CDN — it is an edge network that spans 300+ cities and handles the hostile internet on your behalf before a single byte reaches your machine.

Think of it as a force field. Legitimate requests pass through, accelerated and cached. Attacks are absorbed or dropped at the edge, never reaching your origin. Your Workers code runs inside that force field, milliseconds from every user on earth.

The mental model that matters: **your origin is optional**. Cloudflare can serve cached responses, run serverless functions, store objects, and terminate connections entirely — without touching your server. You want to design toward that outcome, not against it.

---

## Vocabulary

| Term | What it means |
|---|---|
| **Edge** | Cloudflare's global data centers — your code and cache live here, close to users |
| **Proxy** | Cloudflare terminates the TCP/TLS connection and forwards requests to your origin — your origin IP stays hidden |
| **CDN** | Content Delivery Network — static assets cached at edge nodes worldwide |
| **WAF** | Web Application Firewall — inspects HTTP requests and blocks malicious patterns (SQLi, XSS, known CVEs) |
| **Workers** | V8-based serverless functions running at the edge, triggered by HTTP requests — no cold starts |
| **Pages** | Cloudflare's JAMstack hosting platform — deploy frontends from Git, backed by Workers for dynamic routes |
| **R2** | S3-compatible object storage with zero egress fees — sits inside the Cloudflare network |
| **Zero Trust** | Network access model where every request is verified regardless of origin — replaces VPN with identity-based access |

---

## DAY 1 — Domain, DNS, Proxy, SSL, Caching, Firewall

### 1.1 Add Your Domain

Sign up at dash.cloudflare.com. Click **Add a Site**, enter your domain, and pick a plan (Free works for most things here).

Cloudflare scans your existing DNS records via AXFR or lookup. Review them carefully — it will import A, AAAA, CNAME, MX, TXT records automatically. Do not skip this review. Missing an MX record breaks your email.

Cloudflare gives you two nameservers:

```
aria.ns.cloudflare.com
bob.ns.cloudflare.com
```

Go to your domain registrar (Namecheap, GoDaddy, Google Domains, etc.) and replace the existing nameservers with these two. Propagation takes a few minutes to 48 hours, but usually under 30 minutes.

Verify with:

```bash
dig NS yourdomain.com +short
```

When you see Cloudflare's nameservers in the output, you are active.

### 1.2 DNS Records and the Orange Cloud

In the DNS tab you will see each record with a proxy toggle — an orange cloud icon. This is the single most important toggle in Cloudflare.

- **Orange cloud (proxied):** Traffic flows through Cloudflare. Your origin IP is hidden. WAF, caching, and all edge features apply.
- **Grey cloud (DNS only):** Cloudflare resolves the DNS record but passes traffic directly. No protection. No caching.

For your web-facing A and CNAME records, orange cloud is almost always what you want. For records that should not be proxied — mail servers, FTP, internal services — leave them grey.

⚠️ Never proxy your MX records. Email must resolve directly to your mail server.

### 1.3 SSL/TLS Modes

Go to **SSL/TLS > Overview**. You have four modes:

| Mode | What happens |
|---|---|
| **Off** | HTTP only. Do not use this. |
| **Flexible** | Cloudflare terminates HTTPS from the browser, but connects to your origin over plain HTTP. Your origin needs no certificate. Risk: traffic between Cloudflare and your origin is unencrypted. |
| **Full** | Cloudflare connects to your origin over HTTPS but does not validate the certificate. You can use a self-signed cert on origin. |
| **Full (Strict)** | Cloudflare connects over HTTPS and validates the certificate. Use this if your origin has a valid cert (Let's Encrypt, etc.). This is the correct default. |

Set it to **Full (Strict)** unless you have a specific reason not to. If your origin does not have a certificate yet, issue one with Certbot before flipping this.

Also enable **Always Use HTTPS** and **Automatic HTTPS Rewrites** under SSL/TLS > Edge Certificates. This forces all HTTP requests to redirect to HTTPS before they ever reach your code.

### 1.4 Caching

Under **Caching > Configuration**, set the **Caching Level** to Standard. This caches files based on query strings intelligently.

**Browser Cache TTL** controls how long Cloudflare tells browsers to cache assets. Set this to at least 4 hours for production.

**Purge Cache** lets you invalidate everything or by URL. Do this after deployments if you are caching HTML.

Page Rules (legacy) or the newer **Cache Rules** (recommended) let you override caching per URL pattern. For example:

```
URL: yourdomain.com/api/*
Cache Level: Bypass
```

This bypasses Cloudflare's cache for all API routes while still caching your static assets. You almost always want this separation.

To verify a cache hit:

```bash
curl -I https://yourdomain.com/static/app.js | grep cf-cache-status
```

You want to see `HIT`. `MISS` means the edge fetched from origin. `BYPASS` means caching was explicitly disabled for that path.

### 1.5 Firewall Rules (Security > WAF)

The WAF has a managed ruleset that covers OWASP Top 10, known CVE exploits, and common bot patterns. Enable it under **Security > WAF > Managed rules**.

Start with the Cloudflare Managed Ruleset set to **Block**. Observe the logs for a week before tuning. Do not tune blindly upfront.

**Custom Rules** let you write your own logic with Cloudflare's Ruleset Language:

```
(http.request.uri.path contains "/wp-admin" and not ip.src in {203.0.113.0/24})
```

This blocks all `/wp-admin` access except from your office IP. You can also challenge (CAPTCHA), log, or rate-limit instead of blocking.

**Bot Fight Mode** (free) and **Super Bot Fight Mode** (Pro+) fingerprint bots and challenge or block them. Enable Bot Fight Mode immediately — it is free and blocks a significant volume of junk traffic.

Under **Security > Events** you can see what the WAF is doing in near-real time. Keep this tab open when you first deploy new rules.

---

## DAY 2 — Workers, Pages, R2, Rate Limiting, Zero Trust, Terraform, Wrangler

### 2.1 Workers

Workers are JavaScript (or WebAssembly, Python, Rust via WASM) functions that run at Cloudflare's edge. They intercept HTTP requests before they reach your origin. Latency is typically under 5ms worldwide.

Install Wrangler, the Workers CLI:

```bash
npm install -g wrangler
wrangler login
```

Create a Worker:

```bash
wrangler init my-worker
cd my-worker
```

The default `src/index.js`:

```javascript
export default {
  async fetch(request, env, ctx) {
    return new Response('Hello from the edge', { status: 200 });
  },
};
```

Deploy:

```bash
wrangler deploy
```

Your Worker is now live at `my-worker.youraccount.workers.dev`. You can also route it to your domain under **Workers Routes** in the dashboard.

Workers can proxy requests, modify headers, authenticate users, rewrite URLs, serve A/B tests, fetch from R2, query a D1 database, or call external APIs — all without your origin being involved.

Key bindings in `wrangler.toml`:

```toml
name = "my-worker"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[r2_buckets]]
binding = "ASSETS"
bucket_name = "my-bucket"

[vars]
ENVIRONMENT = "production"
```

### 2.2 Pages

Cloudflare Pages is for frontend deployments. Connect your GitHub or GitLab repo, configure the build command and output directory, and Cloudflare builds and deploys on every push.

```
Build command: npm run build
Build output directory: dist
```

Every pull request gets a unique preview URL. Every push to `main` deploys to production. Zero-configuration CDN, HTTPS, and custom domains are included.

Pages Functions (the `functions/` directory in your repo) are Workers that run alongside your static site. Use them for API routes, authentication, form handling — anything dynamic.

```
my-app/
  public/
  src/
  functions/
    api/
      users.js    # Available at /api/users
```

### 2.3 R2 Object Storage

R2 is S3-compatible storage with no egress fees. You pay for storage and operations, not bandwidth. This is a significant cost difference from AWS S3 at scale.

Create a bucket in the dashboard or via Wrangler:

```bash
wrangler r2 bucket create my-bucket
```

Upload a file:

```bash
wrangler r2 object put my-bucket/hello.txt --file ./hello.txt
```

Access R2 from a Worker:

```javascript
export default {
  async fetch(request, env) {
    const object = await env.ASSETS.get('hello.txt');
    if (!object) return new Response('Not found', { status: 404 });
    return new Response(object.body, {
      headers: { 'Content-Type': object.httpMetadata.contentType },
    });
  },
};
```

R2 also supports public buckets — expose objects directly via a `r2.dev` subdomain or your custom domain without a Worker in between.

For S3-compatible access (tools like rclone, AWS SDKs), generate an API token with R2 permissions and use the endpoint `https://<account_id>.r2.cloudflarestorage.com`.

### 2.4 WAF Rules and Rate Limiting

**Rate Limiting** lives under **Security > WAF > Rate limiting rules**. Example: limit login attempts to 5 per minute per IP:

```
URL: yourdomain.com/login
Method: POST
Rate: 5 requests per 60 seconds
Action: Block for 10 minutes
```

This stops credential stuffing attacks cold. Set it up before you launch anything with a login form.

For API protection, rate limit by IP and path:

```
URL: yourdomain.com/api/*
Rate: 100 requests per 10 seconds per IP
Action: Managed Challenge
```

Managed Challenge uses Cloudflare's JS-based fingerprinting — legitimate browsers pass silently, bots fail. This is better than a hard block for API consumers because it does not break real clients.

**Custom WAF rules** with scoring let you combine signals: if the request has a suspicious user agent AND comes from a datacenter ASN AND the path matches `/admin`, block it. You can combine multiple conditions with `and`/`or`.

### 2.5 Zero Trust

Cloudflare Zero Trust (formerly Cloudflare Access) lets you put an identity gate in front of any URL — internal tools, staging environments, admin panels — without a VPN.

Go to **Zero Trust > Access > Applications**, add an application:

- Application name: Grafana Staging
- Session duration: 8 hours
- URL: staging.yourdomain.com

Add a policy:

- Rule name: Team only
- Include: Emails ending in `@yourcompany.com`

Now anyone who hits `staging.yourdomain.com` gets redirected to a Cloudflare-managed login page. After authenticating with Google/GitHub/email OTP, they get a signed JWT cookie and access is granted. Your origin never handles authentication.

Cloudflare Tunnel (`cloudflared`) completes the picture — it creates an outbound-only connection from your server to Cloudflare, so your origin has no public ports at all.

```bash
# Install cloudflared
brew install cloudflared

# Authenticate
cloudflared tunnel login

# Create a tunnel
cloudflared tunnel create my-tunnel

# Run it
cloudflared tunnel run --url http://localhost:3000 my-tunnel
```

No inbound firewall rules. No exposed ports. Your service is reachable only through Cloudflare's Zero Trust layer.

### 2.6 Terraform Provider

Cloudflare has a well-maintained Terraform provider. Use it to manage DNS, WAF rules, Workers, and Access policies as code.

```hcl
terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

resource "cloudflare_record" "www" {
  zone_id = var.zone_id
  name    = "www"
  value   = "203.0.113.10"
  type    = "A"
  proxied = true
}

resource "cloudflare_ruleset" "rate_limit" {
  zone_id     = var.zone_id
  name        = "API rate limiting"
  description = "Protect API endpoints"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules {
    action = "block"
    ratelimit {
      characteristics     = ["ip.src"]
      period              = 10
      requests_per_period = 100
      mitigation_timeout  = 600
    }
    expression  = "(http.request.uri.path matches \"^/api/\")"
    description = "Limit API to 100 req/10s per IP"
    enabled     = true
  }
}
```

Store your API token in a secrets manager or environment variable — never commit it to source control. Use a scoped token with only the permissions the Terraform run actually needs.

### 2.7 Wrangler CLI Reference

```bash
# Authenticate
wrangler login

# Deploy a Worker
wrangler deploy

# Tail live logs
wrangler tail

# Run locally
wrangler dev

# Manage KV (key-value store)
wrangler kv:namespace create MY_NAMESPACE
wrangler kv:key put --namespace-id=<id> mykey "myvalue"

# Manage R2
wrangler r2 bucket list
wrangler r2 object get my-bucket/file.txt

# Manage secrets
wrangler secret put API_KEY

# Check account info
wrangler whoami
```

`wrangler dev` runs your Worker locally with hot reload. It proxies to a local miniflare instance that emulates the Workers runtime, including bindings to KV, R2, and D1. Use this before every deploy.

---

## Worked Example — Full-Stack App on Cloudflare

You are deploying a React SPA with a REST API and file uploads. Here is how it maps to Cloudflare:

**Frontend:** Cloudflare Pages, deployed from GitHub. Build command: `npm run build`, output: `dist`. Custom domain: `app.yourdomain.com`. Free CDN, HTTPS, preview deployments — zero config.

**API:** A Worker at `app.yourdomain.com/api/*`. It handles authentication (validates JWTs), calls a Postgres database via Hyperdrive (Cloudflare's connection pooling proxy), and returns JSON. No origin server needed for the API layer.

**File uploads:** Users upload directly to R2 via presigned URLs generated by the Worker. Files are served back through a public R2 bucket at `assets.yourdomain.com`. Zero egress fees.

**Admin panel:** Protected by Cloudflare Access. Only `@yourcompany.com` Google accounts can reach `admin.yourdomain.com`. The origin is a small internal service running behind a Cloudflare Tunnel — no public IP, no open ports.

**WAF:** Cloudflare Managed Ruleset on Block. Rate limiting on `/api/auth/*` at 10 req/min per IP. Bot Fight Mode enabled.

**Terraform:** All DNS records, WAF rules, Access policies, and Worker routes are in a `cloudflare/` Terraform module. Changes go through a PR — `terraform plan` runs in CI, `terraform apply` runs on merge to main.

The result: your origin Postgres is the only thing you pay to run. Everything else runs inside Cloudflare's network.

---

## Pitfalls

**Flexible SSL with a non-HTTPS origin.** If you set SSL mode to Flexible and your origin later starts redirecting HTTP to HTTPS, you get an infinite redirect loop. Cloudflare sends HTTP, origin redirects to HTTPS, Cloudflare sends HTTP again. Fix: use Full or Full (Strict).

**Caching HTML by accident.** If your Cache Rules are too broad, Cloudflare caches your HTML and users see stale content after deployments. Be explicit: cache `*.js`, `*.css`, `*.png` — not `text/html`.

**Proxying MX records.** Email breaks. The orange cloud must be grey for anything mail-related. This is a common mistake when bulk-importing records.

**Workers size limits.** A single Worker bundle is limited to 10 MB compressed. If you are bundling a large dependency, split it or rethink the approach. Workers are not Node.js — some npm packages will not work in the V8 isolate environment.

**Wrangler dev vs. production parity.** `wrangler dev` emulates the runtime locally but is not identical to production. Test with `wrangler dev --remote` occasionally — this runs your Worker on Cloudflare's actual infrastructure against your real bindings.

**Zone vs. account API tokens.** Terraform and API calls need tokens scoped correctly. A zone-level token cannot manage account-level resources like Workers scripts or R2 buckets. Create separate tokens for zone management and account management.

⚠️ Rate limit rules do not apply to Cloudflare's own health checks or certain internal traffic. Do not rely on rate limiting as your only anti-abuse layer — combine it with WAF rules and application-level checks.

**Purging cache on deploy.** If you deploy a new frontend build without purging the cache, users may see old JS loading against a new API. Automate cache purging in your CI pipeline using the Cloudflare API:

```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

**Tunnel restarts.** `cloudflared` should run as a system service, not a foreground process. On Linux: `cloudflared service install` registers it with systemd. On a crash, it restarts automatically.

---

## Quick Reference

```bash
# DNS check
dig NS yourdomain.com +short
dig A yourdomain.com +short

# Cache status check
curl -sI https://yourdomain.com/static/app.js | grep -i cf-cache-status

# Worker deploy
wrangler deploy

# Worker logs (live)
wrangler tail --format=pretty

# Worker local dev
wrangler dev

# R2 upload
wrangler r2 object put my-bucket/file.txt --file ./file.txt

# Purge cache via API
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"files":["https://yourdomain.com/static/app.js"]}'

# Cloudflare Tunnel
cloudflared tunnel create my-tunnel
cloudflared tunnel run --url http://localhost:3000 my-tunnel

# List tunnels
cloudflared tunnel list

# Terraform
terraform init
terraform plan -var="cloudflare_api_token=$CF_API_TOKEN"
terraform apply
```

**Dashboard shortcuts:**
- WAF events: Security > Events
- Cache analytics: Caching > Cache Analytics
- Worker analytics: Workers & Pages > your worker > Metrics
- DNS: DNS > Records
- SSL status: SSL/TLS > Edge Certificates

**Free tier limits worth knowing:**
- Workers: 100,000 requests/day, 10ms CPU per request
- Workers KV: 100,000 reads/day, 1,000 writes/day
- R2: 10 GB storage, 1M Class A ops, 10M Class B ops per month
- Pages: unlimited sites, 500 builds/month

---

## Next Steps

- `DNS-curl-dig.md` — deepen your understanding of what happens below the orange cloud
- `Nginx.md` — configure your origin server to trust Cloudflare's IP ranges and reject direct traffic
- `Terraform.md` — manage Cloudflare infrastructure alongside your cloud resources in a single state file

---

## The Mantra

> Put Cloudflare in front of everything public. Your origin should only ever see traffic that has passed through the force field — cached, filtered, authenticated, and rate-limited before it arrives. If a request reaches your server, it earned it.
