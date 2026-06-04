# Exercise 1: Dynamic Database Credentials

## Step 1: Start Vault in dev mode
## Step 2: Enable the database secrets engine and configure PostgreSQL
## Step 3: Create the securebank-api role with 1-hour TTL
## Step 4: Generate credentials three times — each should be unique
## Step 5: Connect to PostgreSQL with the generated credentials
## Step 6: Set TTL to 1 minute, generate creds, wait for expiry, confirm revocation

## Verify

Generated credentials should connect. After TTL expiry, they should fail with "authentication failed."
