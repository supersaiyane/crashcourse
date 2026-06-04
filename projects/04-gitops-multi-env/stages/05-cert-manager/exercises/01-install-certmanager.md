# Exercise 1: Install and Configure cert-manager

1. Install cert-manager in your cluster
2. Create a ClusterIssuer for Let's Encrypt staging
3. Verify: `kubectl get clusterissuers` shows the issuer as Ready
4. Check cert-manager pods are running: `kubectl get pods -n cert-manager`
