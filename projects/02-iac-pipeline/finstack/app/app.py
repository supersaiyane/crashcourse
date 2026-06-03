"""
FinStack Payment API — a minimal Flask service to prove the infrastructure works.

Endpoints:
  GET  /health          → liveness/readiness probe
  GET  /api/balance     → fetch account balance from PostgreSQL
  POST /api/payment     → record a payment transaction
  GET  /api/statements  → list statement files from S3
"""

import os
import datetime
import uuid

from flask import Flask, jsonify, request

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Configuration — pulled from environment variables (injected by Vault / EKS)
# ---------------------------------------------------------------------------
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "finstack")
DB_USER = os.getenv("DB_USER", "finstack_app")
DB_PASS = os.getenv("DB_PASS", "changeme")          # Vault replaces this at runtime
S3_BUCKET = os.getenv("S3_BUCKET", "finstack-statements-dev")
AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")


def get_db_connection():
    """Return a psycopg2 connection. Fails gracefully when DB is unavailable."""
    try:
        import psycopg2
        return psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
        )
    except Exception as exc:
        app.logger.warning("DB connection failed: %s", exc)
        return None


def get_s3_client():
    """Return a boto3 S3 client, respecting LocalStack endpoint if set."""
    import boto3
    endpoint = os.getenv("AWS_ENDPOINT_URL")           # set when using LocalStack
    return boto3.client(
        "s3",
        region_name=AWS_REGION,
        endpoint_url=endpoint,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    """Liveness / readiness probe for Kubernetes."""
    return jsonify({
        "status": "ok",
        "timestamp": datetime.datetime.utcnow().isoformat(),
    })


@app.route("/api/balance", methods=["GET"])
def get_balance():
    """Fetch account balance. Falls back to a stub when DB is unavailable."""
    conn = get_db_connection()
    if conn is None:
        return jsonify({
            "account_id": "ACC-001",
            "balance": 250000.00,
            "currency": "INR",
            "note": "stub — database not connected",
        })
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT account_id, balance, currency FROM accounts LIMIT 1"
            )
            row = cur.fetchone()
            if row is None:
                return jsonify({"error": "no accounts found"}), 404
            return jsonify({
                "account_id": row[0],
                "balance": float(row[1]),
                "currency": row[2],
            })
    finally:
        conn.close()


@app.route("/api/payment", methods=["POST"])
def create_payment():
    """Record a payment transaction. Stub when DB is unavailable."""
    data = request.get_json(silent=True) or {}
    amount = data.get("amount", 0)
    currency = data.get("currency", "INR")

    if amount <= 0:
        return jsonify({"error": "amount must be positive"}), 400

    txn_id = f"txn_{uuid.uuid4().hex[:12]}"

    conn = get_db_connection()
    if conn is None:
        return jsonify({
            "transaction_id": txn_id,
            "amount": amount,
            "currency": currency,
            "status": "accepted",
            "note": "stub — database not connected",
        }), 201

    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO transactions (txn_id, amount, currency, created_at) "
                "VALUES (%s, %s, %s, NOW()) RETURNING txn_id",
                (txn_id, amount, currency),
            )
            conn.commit()
        return jsonify({
            "transaction_id": txn_id,
            "amount": amount,
            "currency": currency,
            "status": "accepted",
        }), 201
    finally:
        conn.close()


@app.route("/api/statements", methods=["GET"])
def list_statements():
    """List statement PDFs stored in S3."""
    try:
        s3 = get_s3_client()
        resp = s3.list_objects_v2(
            Bucket=S3_BUCKET, Prefix="statements/", MaxKeys=20
        )
        files = [obj["Key"] for obj in resp.get("Contents", [])]
        return jsonify({"bucket": S3_BUCKET, "files": files})
    except Exception as exc:
        return jsonify({
            "bucket": S3_BUCKET,
            "files": [],
            "note": f"S3 unavailable — {exc}",
        })


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
