"""ObservaShop Payment Service — processes payments (simulated)."""
import time, logging, json, random, uuid
from flask import Flask, request, jsonify
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("payment-svc")

def log(level, msg, **extra):
    logger.info(json.dumps({"ts": time.time(), "service": "payment-svc", "level": level, "msg": msg, **extra}))

PAYMENTS_TOTAL = Counter("payments_total", "Total payment attempts", ["status"])
PAYMENT_AMOUNT = Histogram("payment_amount_dollars", "Payment amounts", buckets=[10, 50, 100, 500, 1000, 5000])
PAYMENT_LATENCY = Histogram("payment_processing_seconds", "Payment processing time")

@app.route("/health")
def health(): return jsonify({"status": "ok", "service": "payment-svc"})

@app.route("/metrics")
def metrics(): return generate_latest(), 200, {"Content-Type": CONTENT_TYPE_LATEST}

@app.route("/pay", methods=["POST"])
def process_payment():
    start = time.time()
    body = request.get_json(force=True)
    order_id, amount = body.get("order_id", "unknown"), body.get("amount", 0)
    time.sleep(random.uniform(0.05, 0.2))  # simulate latency
    if random.random() < 0.05:  # 5% failure rate
        PAYMENTS_TOTAL.labels("failed").inc()
        log("error", "payment failed", order_id=order_id, amount=amount)
        return jsonify({"status": "failed", "order_id": order_id, "reason": "card_declined"}), 402
    tx_id = str(uuid.uuid4())[:8]
    PAYMENTS_TOTAL.labels("success").inc()
    PAYMENT_AMOUNT.observe(amount)
    PAYMENT_LATENCY.observe(time.time() - start)
    log("info", "payment processed", order_id=order_id, tx_id=tx_id, amount=amount)
    return jsonify({"status": "success", "order_id": order_id, "tx_id": tx_id, "amount": amount})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8082)
