# Stage 5: cert-manager

**Goal:** Automate TLS certificate provisioning with cert-manager and Let's Encrypt for the BillFlow API.

**Prerequisites:** Stage 4 complete. An Ingress controller installed.

---

## 1. Theory (What & Why)

### Why automate certificates?

Manual certificate management fails at scale: certificates expire silently, renewals are forgotten, and outages happen at 3am. cert-manager watches Ingress resources, requests certificates from issuers (Let's Encrypt, Vault, self-signed), and renews them automatically before expiry.

### Key resources

- **Issuer / ClusterIssuer** — where to get certificates (Let's Encrypt, Vault)
- **Certificate** — what domain, which issuer, where to store (Secret name)
- **Ingress annotation** — `cert-manager.io/cluster-issuer: letsencrypt-prod` triggers automatic cert provisioning

---

## 2. Hands-On

### 2.1 Install cert-manager

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.0/cert-manager.yaml
```

### 2.2 Create a ClusterIssuer

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: you@example.com
    privateKeySecretRef:
      name: letsencrypt-staging-key
    solvers:
      - http01:
          ingress:
            class: nginx
```

### 2.3 Annotate the Ingress

Add `cert-manager.io/cluster-issuer: letsencrypt-staging` to the BillFlow Ingress. cert-manager will automatically provision a TLS certificate.

---

## Exercises

1. [Exercise 1 — Install and configure cert-manager](exercises/01-install-certmanager.md)
2. [Exercise 2 — Provision a TLS certificate](exercises/02-tls-cert.md)

**Next stage:** [06-promotion-flow](../06-promotion-flow/README.md)
