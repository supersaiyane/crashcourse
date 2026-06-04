# Stage 4: Sealed Secrets

**Goal:** Encrypt Kubernetes Secrets so they can be safely stored in Git alongside your manifests.

**Prerequisites:** Stage 3 complete. kubeseal CLI installed.

---

## 1. Theory (What & Why)

### The problem with Secrets in Git

Kubernetes Secrets are base64-encoded, not encrypted. Committing them to Git exposes credentials to anyone with repo access. But GitOps requires everything in Git. Sealed Secrets solves this: encrypt secrets client-side, commit the encrypted version, the controller decrypts them in-cluster.

### How Sealed Secrets works

1. You create a regular Kubernetes Secret YAML
2. kubeseal encrypts it using the clusters public key
3. You commit the SealedSecret to Git
4. The Sealed Secrets controller decrypts it in-cluster and creates the real Secret

Only the controller has the private key. Even if someone reads the SealedSecret from Git, they cannot decrypt it.

---

## 2. Hands-On

### 2.1 Install the controller

```bash
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.26.0/controller.yaml
```

### 2.2 Create and seal a secret

```bash
kubectl create secret generic db-creds --from-literal=password=supersecret --dry-run=client -o yaml | kubeseal --format yaml > sealed-db-creds.yaml
```

### 2.3 Commit and apply

The SealedSecret is safe to commit. Flux will apply it, the controller will decrypt it.

---

## Exercises

1. [Exercise 1 — Seal a database credential](exercises/01-seal-secret.md)
2. [Exercise 2 — Rotate a sealed secret](exercises/02-rotate-secret.md)

**Next stage:** [05-cert-manager](../05-cert-manager/README.md)
