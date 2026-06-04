# Stage 4: Supply Chain Security

**Goal:** Sign SecureBank container images with Cosign/Sigstore and configure Kubernetes to reject unsigned images — ensuring only verified, trusted images run in production.

**Prerequisites:** Stage 3 complete. Cosign CLI installed (`go install github.com/sigstore/cosign/v2/cmd/cosign@latest`). A container registry (ghcr.io, Docker Hub, or local).

---

## 1. Theory (What & Why)

### The supply chain attack surface

Your container image goes through many hands: you build it, push it to a registry, pull it on a cluster. At any point, it could be tampered with:

- **Registry compromise** — attacker pushes a malicious image with the same tag
- **Build pipeline compromise** — attacker modifies the CI to inject malware
- **Man-in-the-middle** — attacker intercepts the pull and substitutes a different image
- **Tag mutation** — someone pushes a new image to the same `:v1.0.0` tag

Signing solves this: you cryptographically sign the image after building it. The cluster verifies the signature before running it. If the signature does not match, the image is rejected.

### How Cosign/Sigstore works

```text
BUILD:
  docker build -t securebank:v1.0.0 .
  cosign sign --key cosign.key securebank:v1.0.0
       |
       v
  Registry stores: image + signature (as an OCI artifact)

DEPLOY:
  kubectl apply -f deployment.yaml
       |
       v
  Policy controller checks: is the image signed by a trusted key?
  YES -> allow       NO -> reject
```

Sigstore provides three tools:
- **Cosign** — signs and verifies container images
- **Rekor** — transparency log (public, immutable record of all signatures)
- **Fulcio** — keyless signing using OIDC identity (GitHub, Google)

### Keyless vs key-pair signing

| Approach | How it works | Pros | Cons |
|----------|-------------|------|------|
| **Key-pair** | Generate cosign.key + cosign.pub, sign with private key | Simple, offline capable | Must protect and rotate the private key |
| **Keyless** | Sign with your identity (GitHub OIDC), no persistent key | No key management, identity-based | Requires internet, depends on Fulcio/Rekor |

For SecureBank (BFSI compliance), key-pair signing gives you full control. Keyless is simpler for open-source projects.

---

## 2. Hands-On: Sign SecureBank Images

### 2.1 Generate a key pair

```bash
cosign generate-key-pair
# Enter password for private key:
# Creates: cosign.key (private, keep secret) + cosign.pub (public, distribute)
```

### 2.2 Build and push the image

```bash
docker build -t ghcr.io/supersaiyane/securebank:v1.0.0 ./transaction-api
docker push ghcr.io/supersaiyane/securebank:v1.0.0
```

### 2.3 Sign the image

```bash
cosign sign --key cosign.key ghcr.io/supersaiyane/securebank:v1.0.0
```

Cosign pushes the signature as an OCI artifact alongside the image in the registry.

### 2.4 Verify the signature

```bash
cosign verify --key cosign.pub ghcr.io/supersaiyane/securebank:v1.0.0
```

If the image has been tampered with or is unsigned, verification fails.

### 2.5 Enforce in Kubernetes

Deploy a policy controller (Sigstore Policy Controller or Kyverno) that rejects unsigned images:

```yaml
apiVersion: policy.sigstore.dev/v1beta1
kind: ClusterImagePolicy
metadata:
  name: require-signed-images
spec:
  images:
    - glob: "ghcr.io/supersaiyane/**"
  authorities:
    - key:
        data: |
          -----BEGIN PUBLIC KEY-----
          <your cosign.pub contents>
          -----END PUBLIC KEY-----
```

Now unsigned images are rejected at admission — even if someone has kubectl access.

---

## 3. Key patterns

### Keyless signing in CI

```yaml
# GitHub Actions — sign with OIDC identity (no key management)
- uses: sigstore/cosign-installer@v3
- run: cosign sign --yes ghcr.io/supersaiyane/securebank:${{ github.sha }}
  env:
    COSIGN_EXPERIMENTAL: "true"
```

### Verify before deploy

Add verification to your deployment pipeline:

```bash
cosign verify --key cosign.pub $IMAGE || exit 1
kubectl set image deployment/securebank api=$IMAGE
```

### SBOM attestation

Attach the SBOM (from Stage 1) as an attestation to the image:

```bash
cosign attest --key cosign.key --predicate sbom.json --type cyclonedx ghcr.io/supersaiyane/securebank:v1.0.0
```

Now the SBOM is cryptographically linked to the image — verifiable and tamper-proof.

---

## 4. Common mistakes

- **Committing cosign.key to Git:** The private key must never be in Git. Store in Vault, AWS KMS, or GitHub Secrets.
- **Not verifying in the cluster:** Signing without enforcement is security theatre. Deploy a policy controller.
- **Mutable tags:** If someone pushes a new image to `:v1.0.0`, the old signature is invalidated. Use immutable tags or digest-based references.
- **Ignoring transparency logs:** Rekor provides an audit trail of all signatures. In BFSI, this audit trail is evidence for regulators.

---

## Exercises

1. [Exercise 1 — Sign and verify an image](exercises/01-sign-verify.md)
2. [Exercise 2 — Enforce signed images in K8s](exercises/02-enforce-signed.md)

**Next stage:** [05-runtime-security](../05-runtime-security/README.md) — detect runtime threats with Falco.
