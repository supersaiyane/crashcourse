# Exercise 2: Generate and Inspect SBOM

**Goal:** Generate a Software Bill of Materials and understand its contents.

## Step 1: Generate CycloneDX SBOM

```bash
trivy image --format cyclonedx --output sbom.json securebank:local
```

## Step 2: Inspect the SBOM

```bash
cat sbom.json | python3 -m json.tool | head -100
```

Count: how many components are listed?

## Step 3: Search for a specific package

```bash
cat sbom.json | python3 -c "import json,sys; data=json.load(sys.stdin); [print(c['name'],c['version']) for c in data.get('components',[]) if 'ssl' in c.get('name','').lower()]"
```

## Verify

You should have a JSON file listing every package in the image with name, version, and license.
