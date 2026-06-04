# Exercise 1: End-to-End Promotion

1. Make a code change to the billing service
2. Push to main and watch dev auto-deploy
3. Verify staging auto-deploys after dev is healthy
4. Suspend production: `flux suspend kustomization billflow-production`
5. Verify staging is healthy, then resume production
6. Verify all three environments are running the new version
