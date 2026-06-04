"""ObservaShop Inventory Service — manages stock levels."""
import time, logging, json
from flask import Flask, request, jsonify
from prometheus_client import Counter, Gauge, generate_latest, CONTENT_TYPE_LATEST

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("inventory-svc")

def log(level, msg, **extra):
    logger.info(json.dumps({"ts": time.time(), "service": "inventory-svc", "level": level, "msg": msg, **extra}))

STOCK_CHECKS = Counter("inventory_checks_total", "Total stock checks", ["result"])
STOCK_LEVEL = Gauge("inventory_stock_level", "Current stock level", ["sku"])

inventory = {
    "LAPTOP-001": {"name": "ThinkPad X1 Carbon", "stock": 50, "price": 1299.99},
    "PHONE-001":  {"name": "Pixel 8 Pro", "stock": 120, "price": 899.99},
    "CABLE-001":  {"name": "USB-C Cable 2m", "stock": 500, "price": 12.99},
    "MOUSE-001":  {"name": "MX Master 3S", "stock": 75, "price": 99.99},
    "KB-001":     {"name": "Keychron K2", "stock": 30, "price": 89.99},
}
for sku, item in inventory.items():
    STOCK_LEVEL.labels(sku).set(item["stock"])

@app.route("/health")
def health(): return jsonify({"status": "ok", "service": "inventory-svc"})

@app.route("/metrics")
def metrics(): return generate_latest(), 200, {"Content-Type": CONTENT_TYPE_LATEST}

@app.route("/inventory", methods=["GET"])
def list_inventory(): return jsonify({"inventory": inventory})

@app.route("/check", methods=["POST"])
def check_stock():
    body = request.get_json(force=True)
    sku, qty = body.get("sku", ""), body.get("quantity", 1)
    item = inventory.get(sku)
    if not item:
        STOCK_CHECKS.labels("not_found").inc()
        return jsonify({"error": f"SKU {sku} not found"}), 404
    if item["stock"] < qty:
        STOCK_CHECKS.labels("out_of_stock").inc()
        return jsonify({"error": f"Insufficient stock for {sku}"}), 400
    item["stock"] -= qty
    STOCK_LEVEL.labels(sku).set(item["stock"])
    STOCK_CHECKS.labels("ok").inc()
    log("info", "stock reserved", sku=sku, qty=qty, remaining=item["stock"])
    return jsonify({"sku": sku, "reserved": qty, "remaining": item["stock"]})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8083)
