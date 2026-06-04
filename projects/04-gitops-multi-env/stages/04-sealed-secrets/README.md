# Stage 4: Sealed Secrets

**Goal:** Encrypt Kubernetes Secrets so they can be safely stored in Git alongside your manifests — solving the "secrets in GitOps" problem without compromising security.

**Prerequisites:** Stage 3 complete (Flux running). kubeseal CLI installed (`brew install kubeseal` or download from GitHub releases).

---

## 1. Theory (What & Why)

### The GitOps secrets problem

GitOps says everything lives in Git. But Kubernetes Secrets are base64-encoded — not encrypted. Base64 is encoding, not security:

```bash
echo "c3VwZXJzZWNyZXQ=" | base64 -d
# supersecret
```

If you commit a Secret to Git, anyone with repo access can decode it. You have just published your database password. Even in a private repo, this violates the principle of least privilege — not everyone who can read code should see production credentials.

But without secrets in Git, your GitOps pipeline is incomplete. Flux can deploy everything except the secrets. Someone must manually apply the secrets — defeating the purpose of GitOps.

### How Sealed Secrets works

Sealed Secrets is a Kubernetes controller + CLI tool (kubeseal) that solves this with asymmetric encryption:

```text
Developer                              Kubernetes Cluster

1. Create Secret    kubeseal           3. Controller decrypts
   (plaintext)   ───────────────>        with private key
                  encrypts with
                  public key           4. Creates real Secret

2. Commit SealedSecret to Git
   (safe - encrypted)
```

The workflow:
1. You create a regular Kubernetes Secret (locally, never committed)
2. `kubeseal` encrypts it using the controller's **public key**
3. You commit the encrypted SealedSecret to Git — safe, because only the private key (inside the cluster) can decrypt it
4. Flux applies the SealedSecret to the cluster
5. The Sealed Secrets controller detects it, decrypts it, and creates the real Secret

The private key never leaves the cluster. The public key is public — anyone can encrypt, only the cluster can decrypt.

### Why not Vault, SOPS, or External Secrets?

| Tool | How it works | Pros | Cons |
|------|-------------|------|------|
| **Sealed Secrets** | Encrypt secrets, commit to Git | Simple, pure GitOps, no external deps | Key rotation requires re-sealing |
| **SOPS** | Encrypt files with AWS KMS, GCP KMS, or age | Works with any backend, Flux native support | Requires cloud KMS access |
| **External Secrets Operator** | Sync secrets from Vault/AWS SM into K8s | Secrets never in Git at all | Adds dependency on external service |
| **HashiCorp Vault** | Full secrets management platform | Dynamic secrets, lease mgmt, audit | Complex to operate, heavy for simple cases |

For BillFlow, Sealed Secrets is the right choice — simple, no external services, everything stays in Git.

---

## 2. Hands-On: Seal Secrets for BillFlow

### 2.1 Install the controller

```bash
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.27.1/controller.yaml

kubectl wait --for=condition=ready pod -l name=sealed-secrets-controller \
  -n kube-system --timeout=60s

# Fetch the public key (for offline sealing)
kubeseal --fetch-cert > pub-cert.pem
```

### 2.2 Create a database credential

Create a regular Secret locally — never commit this file:

```bash
kubectl create secret generic billflow-db-creds \
  --namespace=billflow-dev \
  --from-literal=DB_HOST=postgres.billflow-dev.svc \
  --from-literal=DB_USER=billflow \
  --from-literal=DB_PASSWORD=dev-password-change-me \
  --from-literal=DB_NAME=billflow \
  --dry-run=client -o yaml > /tmp/db-creds.yaml
```

The values are base64 encoded but not encrypted — anyone can decode them.

### 2.3 Seal it

```bash
kubeseal --format yaml < /tmp/db-creds.yaml > k8s/overlays/dev/sealed-db-creds.yaml
```

The sealed version contains encrypted values that only the cluster's controller can decrypt. This file is safe to commit.

### 2.4 Add to Kustomize overlay

Update `k8s/overlays/dev/kustomization.yaml`:

```yaml
resources:
  - ../../base
  - sealed-db-creds.yaml    # add this line
```

### 2.5 Commit and let Flux deploy

```bash
# Delete the plaintext secret immediately
rm /tmp/db-creds.yaml

# Commit the sealed version
git add k8s/overlays/dev/sealed-db-creds.yaml k8s/overlays/dev/kustomization.yaml
git commit -m "feat: add sealed database credentials for dev environment"
git push
```

Flux will detect the SealedSecret, the controller will decrypt it, and a real Secret appears:

```bash
kubectl get sealedsecrets -n billflow-dev
kubectl get secrets -n billflow-dev
kubectl get secret billflow-db-creds -n billflow-dev \
  -o jsonpath='{.data.DB_PASSWORD}' | base64 -d
# dev-password-change-me
```

### 2.6 Seal secrets for all environments

Each environment gets its own sealed secret with different credentials:

```bash
# Staging
kubectl create secret generic billflow-db-creds \
  --namespace=billflow-staging \
  --from-literal=DB_HOST=postgres.billflow-staging.svc \
  --from-literal=DB_USER=billflow \
  --from-literal=DB_PASSWORD=staging-password-rotate-monthly \
  --from-literal=DB_NAME=billflow \
  --dry-run=client -o yaml | kubeseal --format yaml \
  > k8s/overlays/staging/sealed-db-creds.yaml

# Production — use a strong, unique password
kubectl create secret generic billflow-db-creds \
  --namespace=billflow-production \
  --from-literal=DB_HOST=postgres.billflow-production.svc \
  --from-literal=DB_USER=billflow \
  --from-literal=DB_PASSWORD=$(openssl rand -base64 32) \
  --from-literal=DB_NAME=billflow \
  --dry-run=client -o yaml | kubeseal --format yaml \
  > k8s/overlays/production/sealed-db-creds.yaml
```

### 2.7 Use the secret in the deployment

Mount the secret as environment variables. Add to `k8s/base/deployment.yaml`:

```yaml
env:
  - name: NODE_ENV
    value: development
  - name: DB_HOST
    valueFrom:
      secretKeyRef:
        name: billflow-db-creds
        key: DB_HOST
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: billflow-db-creds
        key: DB_PASSWORD
```

---

## 3. Key patterns

### Scope: strict vs cluster-wide

By default, SealedSecrets are **strict** — they can only be decrypted in the exact namespace and with the exact name specified during sealing. If someone copies the SealedSecret to another namespace, it fails.

Scope options:
- **strict** (default): locked to exact namespace + name. Most secure.
- **namespace-wide**: same namespace, any name.
- **cluster-wide**: any namespace, any name. Least secure.

Use strict for production.

### Key rotation

The controller generates a new signing key every 30 days by default. Old keys are kept, so existing SealedSecrets still decrypt. Periodically re-seal secrets with the latest key:

```bash
kubeseal --fetch-cert > pub-cert.pem
kubeseal --cert pub-cert.pem < /tmp/db-creds.yaml > sealed-db-creds.yaml
```

### Backup the private key

If you lose the cluster and the private key, you cannot decrypt your SealedSecrets. Back it up:

```bash
kubectl get secret -n kube-system \
  -l sealedsecrets.bitnami.com/sealed-secrets-key \
  -o yaml > sealed-secrets-key-backup.yaml
```

Store this backup in a secure vault (AWS Secrets Manager, HashiCorp Vault) — NOT in Git.

---

## 4. Common mistakes

- **Committing the plaintext Secret:** The whole point is to commit the SealedSecret, not the original. Delete plaintext secrets immediately after sealing.
- **Sealing with the wrong public key:** If you seal with one cluster's key and apply to another cluster, decryption fails. Always fetch the cert from the target cluster.
- **Forgetting to update kustomization.yaml:** The SealedSecret file exists but Kustomize does not include it. Add it to `resources:`.
- **Not backing up the private key:** Cluster migration or disaster recovery will fail without it.
- **Using cluster-wide scope in production:** Strict scope (default) is safer. Only use broader scopes when you have a specific need.

---

## Exercises

1. [Exercise 1 — Seal a database credential](exercises/01-seal-secret.md)
2. [Exercise 2 — Rotate a sealed secret](exercises/02-rotate-secret.md)

**Next stage:** [05-cert-manager](../05-cert-manager/README.md) — automated TLS certificates.
