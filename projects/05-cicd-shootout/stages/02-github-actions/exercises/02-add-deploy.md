# Exercise 2: Add a Deployment Step

1. Add a deploy job that runs after scan
2. Use the `actions/deploy-pages` action (or echo a placeholder)
3. Make it only run on pushes to main (not on PRs)
4. Use `if: github.ref == 'refs/heads/main'` condition
5. Push and verify the deploy job runs only on main
