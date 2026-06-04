# Exercise 1: Seal a Database Credential

1. Create a Kubernetes Secret with a database password (dry-run)
2. Seal it with kubeseal
3. Commit the SealedSecret to the dev overlay
4. Verify Flux applies it and the real Secret exists in the cluster
5. Verify the password matches: `kubectl get secret db-creds -o jsonpath='{.data.password}' | base64 -d`
