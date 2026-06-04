# Stage 1: Test
FROM python:3.11-slim AS test
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN python -m pytest -v
RUN ruff check .

# Stage 2: Production
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir flask
COPY app.py .
EXPOSE 5000
USER nobody
CMD ["python", "app.py"]
