# Exercise 2: Add a ConfigMap Per Environment

1. Add a configMapGenerator to base with LOG_LEVEL=debug
2. Override it in the production overlay to LOG_LEVEL=warn
3. Build both overlays and verify the difference
