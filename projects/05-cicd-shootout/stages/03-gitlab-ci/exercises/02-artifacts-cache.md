# Exercise 2: Add Artifacts and Caching

1. Add `artifacts: reports: junit: api/report.xml` to the test stage
2. Add `--junitxml=report.xml` to the pytest command
3. Add pip cache using the built-in cache keyword
4. Verify artifacts appear in the pipeline view
5. Compare cache hit times on subsequent runs
