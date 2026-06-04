# Exercise 2: AppRole Authentication

## Step 1: Enable AppRole auth method
## Step 2: Create a policy allowing read on database/creds/securebank-api
## Step 3: Create an AppRole with that policy
## Step 4: Get role-id and generate secret-id
## Step 5: Authenticate and get a Vault token
## Step 6: Use the token to generate database credentials
## Step 7: Confirm the token cannot access other secret paths

## Verify

AppRole token should only access securebank-api database credentials.
