# Exercise 1: Enable Auto-Instrumentation

1. Update the gateway Dockerfile to use `opentelemetry-instrument` as the entrypoint
2. Set environment variables: `OTEL_SERVICE_NAME=gateway`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317`
3. Rebuild and restart: `docker-compose build gateway && docker-compose up -d gateway`
4. Generate 10 orders via the API
5. In Tempo, find a trace — verify it has auto-generated spans for Flask routes and outgoing HTTP calls
6. Compare the span detail with the manual traceparent approach from Stage 3
