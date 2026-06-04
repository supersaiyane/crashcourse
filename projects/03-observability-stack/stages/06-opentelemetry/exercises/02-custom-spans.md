# Exercise 2: Add Custom Spans and Attributes

1. Import `from opentelemetry import trace` in `gateway/app.py`
2. Create a tracer: `tracer = trace.get_tracer("gateway")`
3. Wrap the inventory check loop in a custom span: `with tracer.start_as_current_span("check_inventory")`
4. Add attributes: `span.set_attribute("items.count", len(items))`
5. Add a span event on failure: `span.add_event("inventory_check_failed", {"sku": item["sku"]})`
6. Rebuild, generate traffic, and verify the custom span appears in Tempo with your attributes
