"""ObservaShop Gateway — routes HTTP requests to downstream services."""
import os, time, logging, json, uuid, requests
from flask import Flask, request, jsonify
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("gateway")

def log(level, msg, **extra):
    logger.info(json.dumps({"ts": time.time(), "service": "gateway", "level": level, "msg": msg, **extra}))

REQUEST_COUNT = Counter("gateway_requests_total", "Total requests", ["method", "endpoint", "status"])
REQUEST_LATENCY = Histogram("gateway_request_duration_seconds", "Request latency", ["endpoint"])

ORDER_SVC = os.getenv("ORDER_SVC_URL", "http://order-svc:8081")
PAYMENT_SVC = os.getenv("PAYMENT_SVC_URL", "http://payment-svc:8082")
INVENTORY_SVC = os.getenv("INVENTORY_SVC_URL", "http://inventory-svc:8083")

def trace_headers():
    tp = request.headers.get("traceparent")
    if not tp:
        tp = f"00-{uuid.uuid4().hex}-{uuid.uuid4().hex[:16]}-01"
    return {"traceparent": tp}

@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "gateway"})

@app.route("/metrics")
def metrics():
    return generate_latest(), 200, {"Content-Type": CONTENT_TYPE_LATEST}

@app.route("/api/orders", methods=["POST"])
def create_order():
    start = time.time()
    headers = trace_headers()
    body = request.get_json(force=True)
    log("info", "creating order", trace=headers["traceparent"], items=len(body.get("items", [])))
    for item in body.get("items", []):
        r = requests.post(f"{INVENTORY_SVC}/check", json=item, headers=headers, timeout=5)
        if r.status_code != 200:
            REQUEST_COUNT.labels("POST", "/api/orders", "400").inc()
            return jsonify({"error": f"Item {item['sku']} out of stock"}), 400
    order_resp = requests.post(f"{ORDER_SVC}/orders", json=body, headers=headers, timeout=5)
    payment_resp = requests.post(f"{PAYMENT_SVC}/pay", json={"order_id": order_resp.json().get("order_id"), "amount": body.get("total", 0)}, headers=headers, timeout=5)
    latency = time.time() - start
    REQUEST_LATENCY.labels("/api/orders").observe(latency)
    REQUEST_COUNT.labels("POST", "/api/orders", "200").inc()
    log("info", "order created", latency=round(latency, 3), order_id=order_resp.json().get("order_id"))
    return jsonify({"order": order_resp.json(), "payment": payment_resp.json()}), 201

@app.route("/api/orders", methods=["GET"])
def list_orders():
    r = requests.get(f"{ORDER_SVC}/orders", headers=trace_headers(), timeout=5)
    REQUEST_COUNT.labels("GET", "/api/orders", "200").inc()
    return jsonify(r.json())

@app.route("/api/inventory", methods=["GET"])
def list_inventory():
    r = requests.get(f"{INVENTORY_SVC}/inventory", headers=trace_headers(), timeout=5)
    REQUEST_COUNT.labels("GET", "/api/inventory", "200").inc()
    return jsonify(r.json())

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
