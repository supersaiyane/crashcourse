# Exercise 1: Sign and Verify

## Step 1: Generate a Cosign key pair
## Step 2: Build and push SecureBank to a registry
## Step 3: Sign the image with your private key
## Step 4: Verify the signature with the public key
## Step 5: Tamper test — push a different image to the same tag, verify again (should fail)

## Verify

`cosign verify --key cosign.pub <image>` should succeed for the signed image and fail for the tampered one.
