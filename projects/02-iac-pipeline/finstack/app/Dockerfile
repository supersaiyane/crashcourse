# FinStack Payment API — multi-stage build
# Stage 1: install dependencies in a builder
# Stage 2: copy only what's needed into a slim runtime image

# -- Builder --
FROM python:3.12-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# -- Runtime --
FROM python:3.12-slim
LABEL maintainer="finstack-sre"
LABEL org.opencontainers.image.description="FinStack Payment API"

# Non-root user for security
RUN groupadd -r finstack && useradd -r -g finstack finstack

WORKDIR /app
COPY --from=builder /install /usr/local
COPY app.py .

# Environment defaults (overridden by Vault / K8s env injection)
ENV DB_HOST=localhost \
    DB_PORT=5432 \
    DB_NAME=finstack \
    S3_BUCKET=finstack-statements-dev \
    AWS_REGION=ap-south-1

EXPOSE 8080

USER finstack

CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--timeout", "30", "app:app"]
