FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.12-slim AS runtime
WORKDIR /app
RUN groupadd -r cutlink && useradd -r -g cutlink cutlink
COPY --from=builder /usr/local /usr/local
COPY app.py .
EXPOSE 5000
USER cutlink
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')"
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
