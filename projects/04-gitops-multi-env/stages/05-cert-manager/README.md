# Stage 5: cert-manager

**Goal:** Automate TLS certificate provisioning with cert-manager and Let's Encrypt for the BillFlow API — so HTTPS works across all three environments without manual certificate management.

**Prerequisites:** Stage 4 complete. An Ingress controller installed (nginx-ingress or Traefik). For production certificates, a domain name pointing to your cluster.

---

## 1. Theory (What & Why)

### Why certificates matter

Every HTTP request between a client and BillFlow carries sensitive data — API keys, customer details, payment information. Without TLS, this data travels in plaintext. Anyone on the network path can read it.

TLS encrypts the connection. The certificate proves the server is who it claims to be.

### The certificate lifecycle problem

Certificates expire. Let's Encrypt certificates expire every 90 days. Manual renewal means someone remembers to renew (they forget), someone has access to the DNS provider (they are on holiday), and the site goes down at 2am on a Saturday because the cert expired.

cert-manager automates the entire lifecycle: request, validate, provision, renew — without human intervention.

### How cert-manager works

cert-manager runs as controllers inside your Kubernetes cluster:

```text
1. You create a Certificate resource (or annotate an Ingress)
2. cert-manager creates an ACME Order with Let's Encrypt
3. Let's Encrypt issues a challenge (HTTP-01 or DNS-01)
4. cert-manager solves the challenge automatically
5. Let's Encrypt validates and issues the certificate
6. cert-manager stores it as a Kubernetes TLS Secret
7. The Ingress controller picks up the Secret and serves HTTPS
8. cert-manager monitors expiry and auto-renews 30 days before expiration
```

### Key resources

| Resource | Purpose | Scope |
|----------|---------|-------|
| **ClusterIssuer** | Where to get certs (Let's Encrypt, Vault, self-signed) | Cluster-wide |
| **Issuer** | Same but namespace-scoped | Single namespace |
| **Certificate** | Explicit cert request — domain, issuer, secret name | Namespace |
| **Ingress annotation** | Shortcut — annotate Ingress, cert-manager creates Certificate automatically | Per Ingress |

### Challenge types

| Challenge | How it works | Pros | Cons |
|-----------|-------------|------|------|
| **HTTP-01** | Serves a token at `/.well-known/acme-challenge/` | Simple, works everywhere | Needs port 80 reachable from internet |
| **DNS-01** | Creates a DNS TXT record | Works for wildcard certs, no port 80 | Needs DNS provider API access |

### Staging vs production issuers

Let's Encrypt has rate limits — 50 certs per domain per week in production. Always test with **staging** first:

- **Staging:** No rate limits, browsers show warnings (untrusted CA)
- **Production:** Trusted certificates, rate-limited

---

## 2. Hands-On: TLS for BillFlow

### 2.1 Install cert-manager

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.1/cert-manager.yaml

kubectl wait --for=condition=ready pod --all -n cert-manager --timeout=120s

kubectl get pods -n cert-manager
# cert-manager-xxx              1/1   Running
# cert-manager-cainjector-xxx   1/1   Running
# cert-manager-webhook-xxx      1/1   Running
```

### 2.2 Create a staging ClusterIssuer

```yaml
# cluster-issuer-staging.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-staging-key
    solvers:
      - http01:
          ingress:
            class: nginx
```

```bash
kubectl apply -f cluster-issuer-staging.yaml
kubectl get clusterissuers
# NAME                  READY   AGE
# letsencrypt-staging   True    10s
```

READY=True means cert-manager successfully registered with Let's Encrypt.

### 2.3 Create an Ingress with TLS

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: billflow
  namespace: billflow-production
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-staging
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - billflow.example.com
      secretName: billflow-tls    # cert-manager creates this Secret
  rules:
    - host: billflow.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: billflow
                port:
                  number: 80
```

```bash
kubectl apply -f ingress.yaml
```

### 2.4 Watch the certificate lifecycle

```bash
kubectl get certificates -n billflow-production --watch
# NAME          READY   SECRET        AGE
# billflow-tls  False   billflow-tls  5s     <- requesting
# billflow-tls  True    billflow-tls  30s    <- issued

kubectl describe certificate billflow-tls -n billflow-production
# Events:
#   Normal  Issuing    cert-manager  Issuing certificate
#   Normal  Generated  cert-manager  Stored new private key
#   Normal  Requested  cert-manager  Created new CertificateRequest
#   Normal  Issuing    cert-manager  The certificate has been successfully issued
```

### 2.5 Test HTTPS access

```bash
# Staging cert (self-signed warning expected, -k skips validation)
curl -k https://billflow.example.com/health
# {"status":"ok","env":"production","version":"1.0.0"}
```

### 2.6 Switch to production issuer

Once staging works:

```yaml
# cluster-issuer-prod.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            class: nginx
```

Update the Ingress annotation to `letsencrypt-prod`. Delete the old certificate to force re-issue:

```bash
kubectl delete certificate billflow-tls -n billflow-production
```

cert-manager will request a new, production-trusted certificate.

### 2.7 Per-environment TLS strategy

| Environment | Issuer | Why |
|-------------|--------|-----|
| **Dev** | Self-signed (`selfSigned: {}`) | No DNS needed, instant, local dev |
| **Staging** | Let's Encrypt staging | Tests ACME flow, no rate limits |
| **Production** | Let's Encrypt production | Trusted by all browsers |

Create a self-signed Issuer for dev:

```yaml
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: selfsigned
  namespace: billflow-dev
spec:
  selfSigned: {}
```

---

## 3. Key patterns

### Wildcard certificates with DNS-01

For `*.billflow.example.com`:

```yaml
solvers:
  - dns01:
      route53:
        region: us-east-1
        hostedZoneID: Z1234567890
```

Requires AWS Route53 access. cert-manager creates the TXT record automatically.

### Certificate renewal monitoring

cert-manager renews certificates 30 days before expiry by default. Monitor with Prometheus:

```promql
# Certificates expiring within 14 days (safety net)
certmanager_certificate_expiration_timestamp_seconds - time() < 14 * 24 * 3600
```

### GitOps integration

Commit the ClusterIssuer and Ingress to Git:

```bash
git add cluster-issuer-staging.yaml cluster-issuer-prod.yaml ingress.yaml
git commit -m "feat: add cert-manager TLS with Let's Encrypt"
git push
```

Flux manages certificates alongside everything else. No manual certificate operations in production.

---

## 4. Common mistakes

- **Starting with the production issuer:** Hit rate limits, locked out for a week. Always test with staging first.
- **Port 80 blocked:** HTTP-01 challenges need port 80 reachable from the internet. If blocked, the challenge fails silently. Use DNS-01 instead.
- **Wrong Ingress class:** The solver's `ingress.class` must match your controller (nginx, traefik). Mismatched class means the challenge pod is never created.
- **DNS not pointing to the cluster:** The domain must resolve to your cluster's external IP. Otherwise Let's Encrypt cannot reach the challenge endpoint.
- **Not deleting old certificates after issuer change:** Changing the annotation does not re-issue. Delete the Certificate and Secret to force re-issue.
- **Forgetting to commit to Git:** In GitOps, manually applied certificates are drift. Flux cannot manage what it does not know about.

---

## Exercises

1. [Exercise 1 — Install and configure cert-manager](exercises/01-install-certmanager.md)
2. [Exercise 2 — Provision a TLS certificate](exercises/02-tls-cert.md)

**Next stage:** [06-promotion-flow](../06-promotion-flow/README.md) — end-to-end environment promotion.
