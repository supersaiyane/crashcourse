"""PipelineAPI — Flask REST API for CI/CD comparison project."""
import time, uuid
from flask import Flask, request, jsonify

app = Flask(__name__)
items = []

@app.route("/health")
def health():
    return jsonify({"status": "ok", "version": "1.0.0", "timestamp": time.time()})

@app.route("/api/items", methods=["GET"])
def list_items():
    return jsonify({"items": items, "total": len(items)})

@app.route("/api/items", methods=["POST"])
def create_item():
    body = request.get_json(force=True)
    name = body.get("name", "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    if len(name) > 100:
        return jsonify({"error": "name must be under 100 characters"}), 400
    item = {"id": str(uuid.uuid4())[:8], "name": name, "created": time.time()}
    items.append(item)
    return jsonify(item), 201

@app.route("/api/items/<item_id>", methods=["GET"])
def get_item(item_id):
    item = next((i for i in items if i["id"] == item_id), None)
    if not item:
        return jsonify({"error": "not found"}), 404
    return jsonify(item)

@app.route("/api/items/<item_id>", methods=["DELETE"])
def delete_item(item_id):
    global items
    before = len(items)
    items = [i for i in items if i["id"] != item_id]
    if len(items) == before:
        return jsonify({"error": "not found"}), 404
    return jsonify({"deleted": True})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
