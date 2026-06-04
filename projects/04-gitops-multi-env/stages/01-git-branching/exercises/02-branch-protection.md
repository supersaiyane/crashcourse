# Exercise 2: Branch Protection Rules

1. Enable branch protection on main: require 1 review, require status checks
2. Try pushing directly to main and verify it is blocked
3. Create a PR with a failing test and verify merge is blocked
4. Fix the test, push, wait for CI green, then merge
