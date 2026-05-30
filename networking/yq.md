# yq — A 2-Day Crash Course

> **In one sentence:** yq is jq for YAML — it reads, filters, and edits YAML (and JSON/XML/TOML)
> from the command line, which makes it the go-to tool for surgically editing Kubernetes manifests,
> Helm values, CI configs, and any other YAML in scripts and pipelines.

> Read `jq.md` first — yq (the popular Go version by Mike Farah) uses **jq-style syntax**, so most
> of what you know transfers directly. This focuses on the YAML-specific superpowers and gotchas.

---

## Part 0 — Why yq exists

DevOps runs on YAML: Kubernetes manifests, Helm `values.yaml`, Docker Compose, GitHub
Actions/GitLab CI configs, Ansible playbooks. You constantly need to *read* a value out of YAML
("what image tag is this deployment using?") or *change one* in a pipeline ("bump the tag to the
new build SHA") — without hand-editing files (error-prone) or writing a YAML parser in Python
(overkill). `sed` can't safely edit YAML because indentation and structure matter.

yq solves this: it understands YAML structure, so you can query and edit precisely, in scripts,
**preserving formatting and comments** (a big deal for config you commit to Git). It's the missing
link between "I have YAML" and "I want to automate changes to it."

**Two important notes before anything else:**
1. **There are two different `yq` tools.** The widely-used one is **Mike Farah's Go yq**
   (jq-style syntax, `mikefarah/yq`). An older Python `yq` is a thin jq wrapper with different
   syntax. This guide is the **Go version** — check with `yq --version`. If your syntax errors,
   you may have the other tool.
2. **yq's query language mirrors jq.** `.spec.replicas`, `.[]`, `select()`, `|` all work the same.
   So jq fluency ≈ yq fluency. The new parts are *editing in place* and *multi-document* handling.

**Mental model:** same pipeline-of-filters model as jq (`.` flows through `|`), but the data is
YAML and yq can write changes *back into the file* while keeping comments and layout intact.

---

## DAY 1 — Read and query YAML

### 1. The basics (identical feel to jq)
```bash
yq '.' file.yaml                       # pretty-print / validate
yq '.spec.replicas' deploy.yaml        # read a nested value -> 3
yq '.metadata.name' deploy.yaml
yq '.spec.template.spec.containers[0].image' deploy.yaml   # the image of the first container
```
`yq '.'` pretty-prints; field access and array indexing work exactly like jq.

### 2. Iterating and filtering
```bash
yq '.spec.containers[].name' pod.yaml          # each container name
yq '.items[] | .metadata.name' list.yaml       # name of each item
yq '.spec.containers[] | select(.name == "app") | .image' pod.yaml   # filter then extract
yq '.[] | select(.enabled == true) | .name' services.yaml
```
`.[]`, `select()`, and `|` behave as in jq — pick the elements you want, then pull the field.

### 3. Output formats — convert between YAML and JSON
A daily-useful trick: yq converts formats, so you can YAML→JSON→jq and back:
```bash
yq -o=json '.' file.yaml               # YAML -> JSON
yq -o=yaml '.' file.json               # JSON -> YAML (yq reads JSON natively — JSON is valid YAML)
yq -o=json '.spec' deploy.yaml | jq '.replicas'   # hand off to jq if you prefer
cat values.json | yq -P                # -P = pretty YAML output
```
This makes yq the bridge: convert a JSON API response into a YAML manifest, or vice versa.

### 4. Raw output for scripts
```bash
yq -r '.metadata.name' deploy.yaml     # raw string (no quotes) — though yq strings are often unquoted already
for img in $(yq '.spec.template.spec.containers[].image' deploy.yaml); do
  echo "image: $img"
done
```

**By end of Day 1 you can:** read and validate YAML, query nested fields and arrays, filter with
`select()`, and convert YAML↔JSON. If you know jq, this is mostly muscle memory.

---

## DAY 2 — Edit YAML (the part jq can't do safely)

### 1. In-place editing — the killer feature
This is why yq exists. Change a value and write it back to the file, preserving structure:
```bash
yq -i '.spec.replicas = 5' deploy.yaml                 # -i = in place
yq -i '.image.tag = "1.4.2"' values.yaml
yq -i '.spec.template.spec.containers[0].image = "myapp:abc123"' deploy.yaml
```
`= value` sets a field; `-i` writes back. Crucially, the Go yq **preserves comments and
formatting** in the rest of the file — vital for config you keep in Git and review.

### 2. Using variables and environment (CI/CD bread and butter)
```bash
# inject a shell/CI value safely with env()
TAG=abc123 yq -i '.spec.template.spec.containers[0].image = "myapp:" + env(TAG)' deploy.yaml
# or strenv() to force string interpretation
yq -i '.metadata.labels.version = strenv(GIT_SHA)' deploy.yaml
```
`env(VAR)` / `strenv(VAR)` pull in environment variables — this is exactly how a CI pipeline bumps
an image tag to the new build SHA before `kubectl apply` or a GitOps commit (see `ArgoCD.md`).

### 3. Adding, deleting, and merging
```bash
yq -i '.metadata.labels.team = "payments"' deploy.yaml   # add/set a nested key (creates path)
yq -i 'del(.spec.template.spec.containers[0].resources)' deploy.yaml   # delete a key
yq -i '.spec.ports += [{"name":"metrics","port":9090}]' svc.yaml       # append to an array
yq ea '. as $item ireduce ({}; . * $item)' a.yaml b.yaml   # deep-merge documents
yq '.a *= load("override.yaml")' base.yaml                  # merge another file in
```
`del()` removes, `+=` appends, `*` deep-merges. Setting a deep path (`.a.b.c = x`) creates the
intermediate maps if they don't exist.

### 4. Multi-document YAML (Kubernetes manifests!)
Kubernetes files often contain several docs separated by `---`. yq handles them:
```bash
yq '.kind' multi.yaml                       # prints the kind of EACH document
yq 'select(.kind == "Deployment")' multi.yaml          # only the Deployment doc(s)
yq 'select(.kind == "Service") | .spec.ports' multi.yaml
yq -i 'select(.kind == "Deployment") | .spec.replicas = 3' multi.yaml   # edit just one doc
yq ea '[.]' multi.yaml                       # ea = evaluate-all: treat all docs as one array
```
`select(.kind == "...")` is the standard way to target one resource inside a multi-doc manifest.
`-ea`/`eval-all` loads *all* documents together (needed for cross-document operations and merges).

### 5. Reading values into scripts and back (the CI loop)
```bash
# read current values
replicas=$(yq '.spec.replicas' deploy.yaml)
image=$(yq '.spec.template.spec.containers[0].image' deploy.yaml)

# the classic GitOps tag bump in a pipeline:
yq -i ".spec.template.spec.containers[0].image = \"$REGISTRY/app:$GIT_SHA\"" deploy.yaml
git add deploy.yaml && git commit -m "deploy app:$GIT_SHA" && git push   # Argo CD syncs it
```

### 6. Validate and pretty-print (lint your YAML)
```bash
yq '.' file.yaml >/dev/null && echo "valid YAML" || echo "INVALID"
yq -P -i '.' file.yaml                       # normalize/pretty-print in place
yq 'keys' file.yaml                           # top-level keys
yq 'explode(.)' file.yaml                      # expand YAML anchors/aliases (&/*) into full values
```
`explode(.)` is handy for YAML with anchors/aliases — it resolves them so you see the real,
expanded structure.

---

## Worked example — CI bumps an image tag in a K8s manifest
```bash
#!/usr/bin/env bash
set -euo pipefail
# $GIT_SHA and $REGISTRY come from the CI environment (see GitHub-Actions.md / GitLab-CI.md)

MANIFEST="k8s/deployment.yaml"

# 1. read what's there now (for logging / sanity)
echo "current image: $(yq '.spec.template.spec.containers[0].image' "$MANIFEST")"

# 2. set the new image tag in place, preserving all comments/formatting
yq -i ".spec.template.spec.containers[0].image = \"${REGISTRY}/app:${GIT_SHA}\"" "$MANIFEST"

# 3. also stamp a label for traceability
GIT_SHA="$GIT_SHA" yq -i '.metadata.labels.commit = strenv(GIT_SHA)' "$MANIFEST"

# 4. commit -> GitOps tool (Argo CD) detects the change and syncs the cluster
git add "$MANIFEST"
git commit -m "deploy app:${GIT_SHA}"
git push
```

---

## Common pitfalls
- **Wrong yq.** Two tools share the name. The jq-style syntax here is **Mike Farah's Go yq**.
  `yq --version`; if `.foo` syntax errors, you likely have the Python wrapper (which uses jq via
  `yq '.foo' -`).
- **Forgetting `-i`.** Without it, yq prints the result to stdout and leaves the file unchanged.
  Add `-i` to actually edit the file (and ideally commit to Git first so you can diff/undo).
- **Multi-doc surprises.** A file with `---` separators has multiple documents; a bare query runs
  per-document. Use `select(.kind=="...")` to target one, and `-ea` for cross-document ops.
- **String vs number/bool coercion.** `.replicas = "3"` writes a string `"3"`; `.replicas = 3`
  writes a number. For env values that must be strings (versions like `1.10`), use `strenv()` to
  avoid YAML turning `1.10` into `1.1`.
- **Quoting in the shell.** Single-quote the yq program; when injecting shell vars, prefer
  `env()`/`strenv()` over string interpolation to avoid quoting bugs.
- **Assuming comments survive everywhere.** The Go yq preserves comments for most edits, but heavy
  restructuring can drop them — diff the result.
- **Editing with `sed` instead.** `sed` doesn't understand indentation/structure and will corrupt
  YAML. Use yq.

---

## Quick reference (Mike Farah's Go yq)
```bash
# Read
yq '.' f.yaml                       pretty-print/validate
yq '.a.b.c' f.yaml                  nested field
yq '.list[0]'  '.list[]'            index / iterate
yq '.x | select(.k=="v")' f.yaml    filter
yq 'keys'  'length'  '.. | .name?'  keys, length, recursive descent

# Edit (add -i to write in place)
yq -i '.a.b = 5' f.yaml             set (creates path)
yq -i 'del(.a.b)' f.yaml            delete
yq -i '.list += [item]' f.yaml      append to array
yq -i '.a *= load("b.yaml")' f.yaml merge a file in
env(VAR) / strenv(VAR)              inject env (strenv forces string)

# Multi-document
yq 'select(.kind=="Deployment")' m.yaml      target one doc
yq -ea '[.]' m.yaml                          eval-all: all docs as array
yq 'explode(.)' f.yaml                        resolve anchors/aliases

# Formats
yq -o=json '.' f.yaml               YAML -> JSON
yq -o=yaml '.' f.json               JSON -> YAML
yq -P f.yaml                        pretty YAML
yq -o=props '.' f.yaml              -> java properties (also: csv, tsv, xml)

# Flags
-i in-place   -o=FORMAT output   -P pretty   -ea/eval-all multi-doc   -n null input
```

---

## Next steps after Day 2
- Pair with **`jq`** (convert YAML→JSON for jq-only features, then back) — see `jq.md`.
- Use in **CI/CD** to bump tags/versions and in **GitOps** commits (`ArgoCD.md`).
- Kustomize/Helm cover templated config at scale; yq is for surgical, scripted edits and reads.
- `yq` for non-YAML: it also reads/writes JSON, XML, TOML, and properties — one tool for config
  format conversion.

**The mantra:** yq is jq for YAML — same `.`-through-`|` pipeline to read, plus `= value` with
`-i` to edit files in place (comments preserved). `select(.kind==...)` for multi-doc manifests,
`env()`/`strenv()` to inject CI values, and never edit YAML with `sed`.
