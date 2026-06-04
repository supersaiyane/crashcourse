# Exercise 2: Provision a TLS Certificate

1. Add an Ingress for BillFlow with the cert-manager annotation
2. Watch the Certificate resource: `kubectl get certificates --watch`
3. Verify the TLS secret was created: `kubectl get secret billflow-tls`
4. Test HTTPS access to the BillFlow API
