"""ObservaShop Order Service — creates and tracks orders."""
import time, logging, json, uuid
from flask import Flask, request, jsonify
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("order-svc")

def log(level, msg, **extra):
    logger.info(json.dumps({"ts": time.time(), "service": "order-svc", "level": level, "msg": msg, **extra}))

ORDERS_CREATED = Counter("orders_created_total", "Total orders created")
ORDER_LATENCY = Histogram("order_processing_seconds", "Order processing time")
orders = []

@app.route("/health")
def health(): return jsonify({"status": "ok", "service": "order-svc"})

@app.route("/metrics")
def metrics(): return generate_latest(), 200, {"Content-Type": CONTENT_TYPE_LATEST}

@app.route("/orders", methods=["POST"])
def create_order():
    start = time.time()
    body = request.get_json(force=True)
    order = {"order_id": str(uuid.uuid4())[:8], "items": body.get("items", []), "total": body.get("total", 0), "status": "created", "created_at": time.time()}
    orders.append(order)
    ORDERS_CREATED.inc()
    ORDER_LATENCY.observe(time.time() - start)
    log("info", "order created", order_id=order["order_id"], items=len(order["items"]))
    return jsonify(order), 201

@app.route("/orders", methods=["GET"])
def list_orders(): return jsonify({"orders": orders, "total": len(orders)})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8081)
