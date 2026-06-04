# Exercise 2: Rollback a Bad Deploy

1. Push a change that breaks the health check (return 500)
2. Watch dev deploy the broken version
3. Verify staging does NOT deploy (dev is unhealthy, dependency blocks it)
4. Revert the commit: `git revert HEAD && git push`
5. Watch dev recover, then staging and production follow
