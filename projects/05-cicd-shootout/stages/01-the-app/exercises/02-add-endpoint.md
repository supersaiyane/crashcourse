# Exercise 2: Add a New Endpoint with Test

1. Add a PUT /api/items/<id> endpoint that updates an items name
2. Add input validation (name required, max 100 chars)
3. Write two tests: successful update and not-found case
4. Run pytest — verify all tests pass (old + new)
5. Rebuild the Docker image — it should pass the test stage
