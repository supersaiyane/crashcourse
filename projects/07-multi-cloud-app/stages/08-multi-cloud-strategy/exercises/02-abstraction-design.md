# Exercise 2: Abstraction Design

**Goal:** Design a cloud-agnostic storage interface that works across S3, GCS, and Azure Blob, and evaluate the tradeoffs.

## Step 1: Define the interface

Write a `StorageClient` interface with these operations:

```text
StorageClient:
  - put(bucket, key, data, metadata) -> URL
  - get(bucket, key) -> data
  - delete(bucket, key) -> bool
  - list(bucket, prefix) -> [keys]
  - presign(bucket, key, expiry) -> signed_URL
```

## Step 2: Map each operation to cloud-specific APIs

For each method, note how S3, GCS, and Blob implement it differently:

```text
+------------+---------------------+---------------------+---------------------+
| Method     | AWS S3 (boto3)      | GCP GCS             | Azure Blob          |
+------------+---------------------+---------------------+---------------------+
| put        |                     |                     |                     |
| get        |                     |                     |                     |
| delete     |                     |                     |                     |
| list       |                     |                     |                     |
| presign    |                     |                     |                     |
+------------+---------------------+---------------------+---------------------+
```

## Step 3: Identify features you lose

List cloud-specific features that the abstraction cannot expose because they are not available on all three:
- S3 Select (query within objects)
- GCS fine-grained IAM (per-object ACLs)
- Azure Blob lifecycle tiers (hot/cool/archive)

## Step 4: Evaluate tradeoffs

For each tradeoff, write one sentence on how you would handle it:
- **Lowest common denominator:** What features are excluded?
- **Error normalisation:** How do you map three different exception types?
- **Maintenance burden:** Who maintains three SDK integrations?
- **Performance overhead:** Is the extra function call layer acceptable?

## Step 5: Make the build/buy decision

Should you build this abstraction now, or keep the interface and implement only one backend?

## Verify

You have a complete interface definition, a per-cloud API mapping, a list of lost features, and a written decision on whether to build the full abstraction or defer. You can defend the decision to a technical audience.
