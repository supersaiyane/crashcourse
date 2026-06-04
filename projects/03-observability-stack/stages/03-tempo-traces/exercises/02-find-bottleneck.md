# Exercise 2: Find the Slowest Span

1. Generate 20 orders rapidly: `for i in $(seq 1 20); do curl -s -X POST http://localhost:8080/api/orders -H "Content-Type: application/json" -d '{"items": [{"sku": "CABLE-001", "quantity": 1}], "total": 12.99}'; done`
2. In Tempo, sort traces by duration (descending)
3. Open the slowest trace — which service/span took the most time?
4. Check if the payment-svc simulated delay (50-200ms) is the consistent bottleneck
5. Write down: what would you optimise first in production?
