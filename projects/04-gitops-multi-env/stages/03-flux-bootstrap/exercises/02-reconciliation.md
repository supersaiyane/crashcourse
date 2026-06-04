# Exercise 2: Watch Reconciliation

1. Change the dev overlay replica count from 1 to 2
2. Commit and push
3. Watch `flux get kustomizations --watch` — note when it reconciles
4. Verify: `kubectl get pods -n billflow-dev` shows 2 pods
5. Revert to 1 replica, push, watch Flux scale back down
