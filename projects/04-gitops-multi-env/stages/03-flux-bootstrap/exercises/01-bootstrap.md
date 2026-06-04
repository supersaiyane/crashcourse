# Exercise 1: Bootstrap Flux

1. Install Flux CLI: `curl -s https://fluxcd.io/install.sh | sudo bash`
2. Bootstrap Flux on your cluster pointing to the BillFlow flux/ directory
3. Verify all three Kustomizations appear: `flux get kustomizations`
4. Check that billflow-dev pods are running: `kubectl get pods -n billflow-dev`
