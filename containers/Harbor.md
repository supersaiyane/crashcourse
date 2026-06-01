# Harbor — A 2-Day Crash Course

Harbor is an open-source container registry with vulnerability scanning, RBAC, replication, and image signing — your private Docker Hub with enterprise security baked in.

**Prerequisite:** `Docker.md`

---

## Part 0 — Why Harbor Exists

Docker Hub works fine until it doesn't. You hit rate limits in CI. You have no way to enforce which teams can push to which repositories. A critical vulnerability ships to production because nothing blocked the image pull. Engineers tag images `latest` and overwrite each other's work silently.

Enterprises need a registry they control. Harbor solves exactly that:

- **Rate limits** — gone. You own the storage.
- **RBAC** — you decide who can push, pull, or delete per project.
- **Scan policy** — block image pulls when CVEs exceed a threshold.
- **Replication** — mirror images across regions or sync from Docker Hub on demand.
- **Signing** — cryptographic proof that an image came from your pipeline.
- **Audit log** — every push, pull, and delete is recorded.

If you run Kubernetes in production with more than five engineers, you need a private registry. Harbor is the open-source answer.

---

## Vocabulary

**Project** — the top-level namespace. Think of it like a GitHub organization or a Docker Hub account. All repositories live inside a project. Projects can be public or private, and all RBAC, quotas, and scan policies attach at this level.

**Repository** — a named image stream inside a project. `myproject/myapp` is a repository. It holds all versions of one image.

**Artifact** — anything stored in a repository. Usually a container image, but also Helm charts, OCI artifacts, and signatures.

**Tag** — a mutable label pointing to a specific artifact digest. `v1.2.3` and `latest` are tags. Tags can be made immutable (see below).

**Robot Account** — a non-human account with scoped permissions, designed for CI/CD pipelines. It has a name, a token, and a set of allowed operations. Use robot accounts instead of sharing your personal credentials.

**Replication Rule** — a policy that pushes or pulls artifacts between two registries on a schedule or trigger. Use it to mirror images to another region, back up to S3-compatible storage, or proxy-pull from Docker Hub.

**Vulnerability Scan** — Harbor integrates Trivy (or Clair) to scan image layers for known CVEs. Scans can run on push, on schedule, or on demand. Results are stored and surfaced in the UI and API.

**Immutable Tag** — a tag rule that prevents overwriting. Once `v1.2.3` is pushed, no one can push a different image to that tag. Forces teams into proper versioning.

**Quota** — a per-project cap on storage (bytes) or artifact count. Prevents one team from consuming all disk.

**Webhook** — an HTTP callback Harbor fires when events happen — image pushed, scan completed, image deleted. Use webhooks to trigger downstream pipelines or send Slack notifications.

---

## DAY 1 — Install, Push, Pull, RBAC, Scanning

### 1.1 Install Harbor with Helm

Harbor ships as a Helm chart. You need a Kubernetes cluster, Helm 3, a storage class, and a domain name (or `nip.io` for local testing).

```bash
helm repo add harbor https://helm.goharbor.io
helm repo update

helm install harbor harbor/harbor \
  --namespace harbor \
  --create-namespace \
  --set expose.type=ingress \
  --set expose.ingress.hosts.core=harbor.example.com \
  --set expose.tls.certSource=secret \
  --set expose.tls.secret.secretName=harbor-tls \
  --set externalURL=https://harbor.example.com \
  --set harborAdminPassword=changeme \
  --set persistence.enabled=true \
  --set persistence.persistentVolumeClaim.registry.storageClass=fast-ssd \
  --set persistence.persistentVolumeClaim.registry.size=50Gi
```

Key values to understand:

| Value | What it controls |
|---|---|
| `expose.type` | `ingress`, `clusterIP`, or `nodePort` |
| `externalURL` | The URL clients use — must match your ingress |
| `harborAdminPassword` | Initial admin password — rotate immediately |
| `trivy.enabled` | Defaults to `true` — Trivy is the bundled scanner |
| `persistence.enabled` | Set `false` only for throwaway dev clusters |

Check the rollout:

```bash
kubectl -n harbor get pods
# All pods should be Running within 3-5 minutes
```

Log in to the UI at `https://harbor.example.com` with `admin` / your password.

### 1.2 Configure Your Docker Client

Harbor uses TLS. If you used a self-signed cert, add it to Docker's trusted certs:

```bash
# macOS
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain harbor-ca.crt

# Linux — copy cert then reload
sudo cp harbor-ca.crt /usr/local/share/ca-certificates/harbor.crt
sudo update-ca-certificates
sudo systemctl restart docker
```

Log in:

```bash
docker login harbor.example.com
# Username: admin
# Password: changeme
```

### 1.3 Create a Project

Via the UI: System Admin → Projects → New Project → name it `myteam`, set it Private.

Via the API:

```bash
curl -u admin:changeme \
  -X POST https://harbor.example.com/api/v2.0/projects \
  -H 'Content-Type: application/json' \
  -d '{
    "project_name": "myteam",
    "public": false,
    "metadata": {
      "prevent_vul": "true",
      "severity": "high",
      "auto_scan": "true"
    }
  }'
```

The `metadata` fields above turn on auto-scan and block pulls of images with HIGH or higher CVEs — set this from day one.

### 1.4 Push and Pull Images

```bash
# Tag your image for Harbor
docker tag myapp:latest harbor.example.com/myteam/myapp:v1.0.0

# Push
docker push harbor.example.com/myteam/myapp:v1.0.0

# Pull
docker pull harbor.example.com/myteam/myapp:v1.0.0
```

After the push, go to the UI → myteam → myapp → Artifacts. You will see the digest, size, and vulnerability summary. If auto-scan is on, the scan starts immediately.

### 1.5 Basic RBAC

Harbor has four built-in project roles:

| Role | Can push | Can pull | Can delete | Can manage |
|---|---|---|---|---|
| Guest | No | Yes | No | No |
| Developer | Yes | Yes | No | No |
| Maintainer | Yes | Yes | Yes | No |
| Project Admin | Yes | Yes | Yes | Yes |

Add a user to a project:

```bash
curl -u admin:changeme \
  -X POST "https://harbor.example.com/api/v2.0/projects/myteam/members" \
  -H 'Content-Type: application/json' \
  -d '{
    "role_id": 2,
    "member_user": { "username": "alice" }
  }'
```

`role_id` mapping: 1=Project Admin, 2=Maintainer, 3=Developer, 4=Guest.

### 1.6 Vulnerability Scanning on Day 1

Trigger a manual scan:

```bash
curl -u admin:changeme \
  -X POST "https://harbor.example.com/api/v2.0/projects/myteam/repositories/myapp/artifacts/v1.0.0/scan"
```

Poll for results:

```bash
curl -u admin:changeme \
  "https://harbor.example.com/api/v2.0/projects/myteam/repositories/myapp/artifacts/v1.0.0/additions/vulnerabilities" \
  | jq '.["application/vnd.security.vulnerability.report; version=1.1"].vulnerabilities[] | select(.severity=="High") | .id'
```

In the UI you get a breakdown by severity: Critical, High, Medium, Low, Unknown. Click any CVE to see affected package, fixed version, and CVSSv3 score.

---

## DAY 2 — Replication, Robot Accounts, Signing, GC, Proxy Cache, Monitoring

### 2.1 Replication — Cross-Site Mirroring

Replication rules copy artifacts between Harbor instances or between Harbor and other registries (Docker Hub, ECR, GCR, Quay).

Create a replication endpoint first — the destination registry:

```bash
curl -u admin:changeme \
  -X POST "https://harbor.example.com/api/v2.0/registries" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "harbor-dr",
    "type": "harbor",
    "url": "https://harbor-dr.example.com",
    "credential": {
      "type": "basic",
      "access_key": "admin",
      "access_secret": "changeme-dr"
    },
    "insecure": false
  }'
```

Then create the rule:

```bash
curl -u admin:changeme \
  -X POST "https://harbor.example.com/api/v2.0/replication/policies" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "push-to-dr",
    "src_registry": null,
    "dest_registry": { "id": 1 },
    "dest_namespace": "myteam",
    "filters": [
      { "type": "name", "value": "myteam/**" },
      { "type": "tag", "value": "v*" }
    ],
    "trigger": { "type": "event_based", "trigger_settings": {} },
    "deletion": false,
    "override": true,
    "enabled": true
  }'
```

`event_based` means replicate immediately on push. You can also use `scheduled` with a cron expression for batch replication.

### 2.2 Robot Accounts for CI/CD

Never use a human account in a pipeline. Robot accounts have scoped permissions and rotatable secrets.

Create a project-scoped robot account:

```bash
curl -u admin:changeme \
  -X POST "https://harbor.example.com/api/v2.0/projects/myteam/robots" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "ci-pipeline",
    "description": "GitHub Actions push account",
    "duration": 365,
    "permissions": [
      {
        "kind": "project",
        "namespace": "myteam",
        "access": [
          { "resource": "repository", "action": "push" },
          { "resource": "repository", "action": "pull" },
          { "resource": "artifact", "action": "read" },
          { "resource": "scan", "action": "create" }
        ]
      }
    ]
  }'
```

The response includes a `secret`. Store it in your CI secrets vault — you will never see it again. The robot account username is `robot$myteam+ci-pipeline`.

In GitHub Actions:

```yaml
- name: Log in to Harbor
  uses: docker/login-action@v3
  with:
    registry: harbor.example.com
    username: ${{ secrets.HARBOR_ROBOT_USER }}
    password: ${{ secrets.HARBOR_ROBOT_SECRET }}
```

### 2.3 Scan Policies — Block Vulnerable Images

You already enabled `prevent_vul` at project creation. Verify it is enforced:

```bash
curl -u admin:changeme \
  "https://harbor.example.com/api/v2.0/projects/myteam" \
  | jq '.metadata'
# Should show: "prevent_vul": "true", "severity": "high"
```

When a pull is blocked you get:

```
Error response from daemon: unknown: current image with "High" vulnerability cannot be pulled
due to configured policy in 'Prevent images with vulnerability severity of "High" or higher from running.'
```

Adjust the threshold per project based on team tolerance. Use `"severity": "critical"` for projects that need more flexibility during remediation.

### 2.4 Immutable Tags

Prevent tag overwriting in production projects.

In the UI: Project → myteam → Policy → Tag Immutability → Add Rule.

Match repository `**` and tag `v*` — any semver tag becomes immutable. You can still push to `latest` or feature branches, but release tags are frozen.

Via API:

```bash
curl -u admin:changeme \
  -X POST "https://harbor.example.com/api/v2.0/projects/myteam/immutabletagrules" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "immutableTagRule",
    "template": "immutableTagRule",
    "tag_selectors": [{ "kind": "doublestar", "pattern": "v*" }],
    "scope_selectors": {
      "repository": [{ "kind": "doublestar", "decoration": "repoMatches", "pattern": "**" }]
    }
  }'
```

### 2.5 Image Signing with Cosign

Cosign signs OCI artifacts and stores signatures in the same registry as the image. Harbor supports OCI referrers — signatures appear in the UI as attached artifacts.

Generate a key pair:

```bash
cosign generate-key-pair
# Produces cosign.key and cosign.pub
```

Sign after pushing:

```bash
cosign sign \
  --key cosign.key \
  harbor.example.com/myteam/myapp:v1.0.0
```

Verify:

```bash
cosign verify \
  --key cosign.pub \
  harbor.example.com/myteam/myapp:v1.0.0
```

In Kubernetes, pair this with a policy engine (Kyverno or OPA Gatekeeper) to block unsigned images at admission. The policy calls `cosign verify` against your public key — any image without a valid signature is rejected before it ever runs.

Notation (CNCF standard, supported by Harbor 2.9+) works similarly:

```bash
notation sign harbor.example.com/myteam/myapp:v1.0.0
notation verify harbor.example.com/myteam/myapp:v1.0.0
```

### 2.6 Garbage Collection

Deleted tags do not free disk immediately. Blobs are orphaned until GC runs. Schedule it during off-hours:

In the UI: System Admin → Garbage Collection → Set Schedule (e.g., `0 2 * * 0` — every Sunday at 2am).

GC puts Harbor in read-only mode for the duration. For large registries this can take minutes to hours — run it when traffic is lowest.

⚠️ Do not run GC while replication or pushes are in progress. It can corrupt in-flight blobs.

### 2.7 Proxy Cache — Cache Docker Hub Locally

Instead of every node pulling from Docker Hub (and hitting rate limits), configure Harbor as a pull-through cache.

In the UI: System Admin → Registries → New Endpoint → type: Docker Hub → add credentials.

Then create a project of type "Proxy Cache" pointing to that endpoint. Engineers pull from `harbor.example.com/dockerhub-cache/library/nginx:alpine` — Harbor fetches from Docker Hub on first miss, caches locally, serves subsequent requests from disk.

This eliminates rate limits and speeds up builds in air-gapped or bandwidth-constrained environments.

### 2.8 Monitoring

Harbor exposes Prometheus metrics at `/metrics` on the Harbor core service (port 8080 by default).

```yaml
# prometheus scrape config
- job_name: harbor
  static_configs:
    - targets: ['harbor-core.harbor.svc:8080']
  metrics_path: /metrics
```

Key metrics to watch:

| Metric | What it tells you |
|---|---|
| `harbor_artifact_pulled_total` | Pull rate — spike = high demand or attack |
| `harbor_artifact_pushed_total` | Push rate — proxy for CI activity |
| `harbor_scan_total` | Scan throughput |
| `harbor_task_queue_size` | Backlog of async jobs (replication, GC) |
| `harbor_db_latency_seconds` | Database health |

Import the community Grafana dashboard (ID 14075) for a ready-made view.

### 2.9 Harbor vs ECR / GCR / GHCR

| Feature | Harbor | ECR | GCR/GAR | GHCR |
|---|---|---|---|---|
| Self-hosted | Yes | No | No | No |
| Cost | Infra only | Per GB + API | Per GB | Free (public) |
| RBAC granularity | Project-level | IAM policies | IAM policies | GitHub perms |
| Vulnerability scan | Trivy/Clair built-in | Inspector | Artifact Analysis | No |
| Replication | Any registry | Cross-account only | No | No |
| Proxy cache | Yes | No | No | No |
| Air-gap support | Yes | No | No | No |
| Signing | Cosign + Notation | Sigstore, Notation | Sigstore | No |

Choose Harbor when you need multi-cloud portability, air-gapped deployments, fine-grained RBAC, or you want to avoid vendor lock-in. Choose ECR/GCR when your workload is entirely within one cloud and you want zero ops overhead.

---

## Worked Example — CI/CD Pipeline with Scan Gate

This is a GitHub Actions workflow that builds an image, pushes it to Harbor, triggers a scan, waits for results, and fails the build if HIGH CVEs are found.

```yaml
name: build-and-push

on:
  push:
    branches: [main]

env:
  REGISTRY: harbor.example.com
  PROJECT: myteam
  IMAGE: myapp

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set image tag
        id: tag
        run: echo "TAG=v$(date +%Y%m%d)-${GITHUB_SHA::8}" >> $GITHUB_OUTPUT

      - name: Log in to Harbor
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ secrets.HARBOR_ROBOT_USER }}
          password: ${{ secrets.HARBOR_ROBOT_SECRET }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.PROJECT }}/${{ env.IMAGE }}:${{ steps.tag.outputs.TAG }}

      - name: Trigger vulnerability scan
        run: |
          curl -sf \
            -u "${{ secrets.HARBOR_ROBOT_USER }}:${{ secrets.HARBOR_ROBOT_SECRET }}" \
            -X POST \
            "${{ env.REGISTRY }}/api/v2.0/projects/${{ env.PROJECT }}/repositories/${{ env.IMAGE }}/artifacts/${{ steps.tag.outputs.TAG }}/scan"

      - name: Wait for scan completion
        run: |
          for i in $(seq 1 30); do
            STATUS=$(curl -sf \
              -u "${{ secrets.HARBOR_ROBOT_USER }}:${{ secrets.HARBOR_ROBOT_SECRET }}" \
              "${{ env.REGISTRY }}/api/v2.0/projects/${{ env.PROJECT }}/repositories/${{ env.IMAGE }}/artifacts/${{ steps.tag.outputs.TAG }}" \
              | jq -r '.scan_overview["application/vnd.security.vulnerability.report; version=1.1"].scan_status // "pending"')
            echo "Scan status: $STATUS"
            [ "$STATUS" = "Success" ] && break
            [ "$STATUS" = "Error" ] && echo "Scan failed" && exit 1
            sleep 10
          done

      - name: Check for HIGH CVEs
        run: |
          HIGH=$(curl -sf \
            -u "${{ secrets.HARBOR_ROBOT_USER }}:${{ secrets.HARBOR_ROBOT_SECRET }}" \
            "${{ env.REGISTRY }}/api/v2.0/projects/${{ env.PROJECT }}/repositories/${{ env.IMAGE }}/artifacts/${{ steps.tag.outputs.TAG }}/additions/vulnerabilities" \
            | jq '[.["application/vnd.security.vulnerability.report; version=1.1"].vulnerabilities[]
                   | select(.severity=="High" or .severity=="Critical")] | length')
          echo "HIGH/CRITICAL CVEs: $HIGH"
          [ "$HIGH" -gt 0 ] && echo "Build blocked: $HIGH unacceptable CVE(s) found" && exit 1
          echo "Scan clean — image approved"

      - name: Sign image
        run: |
          cosign sign --key env://COSIGN_PRIVATE_KEY \
            ${{ env.REGISTRY }}/${{ env.PROJECT }}/${{ env.IMAGE }}:${{ steps.tag.outputs.TAG }}
        env:
          COSIGN_PRIVATE_KEY: ${{ secrets.COSIGN_PRIVATE_KEY }}
          COSIGN_PASSWORD: ${{ secrets.COSIGN_PASSWORD }}
```

The pipeline only signs if the scan is clean. Your Kubernetes admission policy then requires a valid signature — no scan-gated signature means no deployment.

---

## Pitfalls

**Using `latest` everywhere.** Tags are mutable by default. Two engineers push `latest` in parallel and one silently wins. Use immutable tag rules for any tag matching `v*` from day one.

**Not rotating robot account secrets.** A leaked robot secret is a leaked registry. Set `duration` to 90 or 365 days, put rotation in your calendar, and automate it with your secrets manager.

**Running GC during business hours.** Harbor goes read-only during GC. A pull failure in production at noon is a bad day. Schedule GC for nights or weekends.

**Ignoring quota.** A runaway CI job that pushes every commit to `latest` can fill your disk in days. Set storage quotas per project before you hand them to teams.

**Trusting the scan result without checking the database age.** Trivy's vulnerability database has a timestamp. If it is more than 24 hours old, new CVEs are invisible. Harbor updates the Trivy DB automatically — verify this is working:

```bash
kubectl -n harbor logs -l component=trivy | grep "Updating" | tail -5
```

**Forgetting to configure the external URL correctly.** If `externalURL` does not match the actual URL clients use, redirect loops or TLS errors appear. Set it once and treat it as immutable — changing it later requires updating every robot account and every `docker login` cached credential.

**Not enabling Trivy before first scan.** Trivy is enabled by default in Helm installs but can be toggled off. Check `trivy.enabled=true` in your values file before going to production.

⚠️ Never disable vulnerability scanning in production projects to "speed things up." That is how a critical CVE ships silently.

---

## Quick Reference

```bash
# Log in
docker login harbor.example.com

# Push image
docker tag myapp:latest harbor.example.com/myteam/myapp:v1.0.0
docker push harbor.example.com/myteam/myapp:v1.0.0

# Trigger scan via API
curl -u user:pass -X POST \
  "https://harbor.example.com/api/v2.0/projects/myteam/repositories/myapp/artifacts/v1.0.0/scan"

# List vulnerabilities
curl -u user:pass \
  "https://harbor.example.com/api/v2.0/projects/myteam/repositories/myapp/artifacts/v1.0.0/additions/vulnerabilities" \
  | jq '.["application/vnd.security.vulnerability.report; version=1.1"].vulnerabilities[]
        | {id,severity,package:.package,fixed:.fix_version}'

# Sign with Cosign
cosign sign --key cosign.key harbor.example.com/myteam/myapp:v1.0.0

# Verify signature
cosign verify --key cosign.pub harbor.example.com/myteam/myapp:v1.0.0

# Create robot account (project scope)
curl -u admin:pass -X POST \
  "https://harbor.example.com/api/v2.0/projects/myteam/robots" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "ci",
    "duration": 365,
    "permissions": [{
      "kind": "project",
      "namespace": "myteam",
      "access": [
        {"resource": "repository", "action": "push"},
        {"resource": "repository", "action": "pull"}
      ]
    }]
  }'

# Check Harbor version
curl -u admin:pass "https://harbor.example.com/api/v2.0/systeminfo" | jq '.harbor_version'

# Trigger replication manually
curl -u admin:pass -X POST \
  "https://harbor.example.com/api/v2.0/replication/executions" \
  -H 'Content-Type: application/json' \
  -d '{"policy_id": 1}'

# Helm upgrade (update Harbor)
helm upgrade harbor harbor/harbor -n harbor -f values.yaml
```

---

## Next Steps

- `Docker.md` — fundamentals of building and running containers
- `Kubernetes.md` — deploying from Harbor using image pull secrets
- `Trivy.md` — running Trivy standalone for shift-left scanning before push
- `Cosign-Sigstore.md` — deep dive on keyless signing and transparency logs
- `Helm.md` — Harbor itself is deployed via Helm; understand what you are operating

---

## Recommended learning resources

**YouTube channels & playlists:**
- [CNCF — KubeCon Harbor & Registry Talks](https://www.youtube.com/@cncf) — conference sessions on Harbor architecture, multi-tenant registry design, and supply chain security
- [That DevOps Guy (Marcel Dempers)](https://www.youtube.com/@introsession) — production container registry setup including Harbor deployment, scanning, and CI/CD integration
- [Viktor Farcic (DevOps Toolkit)](https://www.youtube.com/@DevOpsToolkit) — container registry comparisons and supply chain security tooling evaluations
- [Rawkode Live — CNCF Projects](https://www.youtube.com/@rawkode) — hands-on walkthroughs of Harbor alongside Cosign, Trivy, and other CNCF security tools

**Official docs & blogs:**
- [Harbor Official Documentation](https://goharbor.io/docs/) — the reference for installation, RBAC, replication, vulnerability scanning, and API usage
- [CNCF Blog — Harbor Posts](https://www.cncf.io/blog/) — graduation announcements, roadmap updates, and enterprise adoption case studies

---

## The Mantra

> Own your registry. Scan before deploy. Sign what you ship. Block what fails. Rotate secrets. Schedule GC. Know your CVE db age. A registry without policy is just expensive storage.
