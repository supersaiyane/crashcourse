# RabbitMQ — A 2-Day Crash Course

RabbitMQ is a message broker that routes messages between services — traditional queuing with exchanges, bindings, and acknowledgements for reliable async communication.

**Prerequisites:** None. Basic familiarity with Docker helps for Day 1 setup.

---

## Part 0 — Why RabbitMQ

Services need to talk to each other. The naive approach is direct HTTP calls — service A calls service B and waits. That works until B is slow, overloaded, or down. Now A is blocked, your latency spikes, and failures cascade.

RabbitMQ decouples producers from consumers. A publishes a message and moves on. B picks it up when it is ready. If B crashes, the message stays in the queue — nothing is lost. You can scale B horizontally without touching A. You can add a third service C that also processes the same messages without changing A at all.

This is the core trade: you give up the simplicity of direct calls and gain resilience, flexibility, and independent scalability.

---

## Vocabulary

**Producer** — Any application that sends messages to RabbitMQ. It publishes to an exchange, never directly to a queue.

**Consumer** — Any application that reads messages from a queue. It subscribes to a queue and processes messages as they arrive.

**Queue** — A buffer that holds messages until a consumer is ready. Queues are durable (survive broker restarts) or transient. Messages are ordered FIFO within a single queue.

**Exchange** — The routing layer. Producers send to exchanges; exchanges decide which queues get the message. There are four types:
- **direct** — routes by exact routing key match
- **topic** — routes by pattern matching on routing keys (uses `*` and `#` wildcards)
- **fanout** — routes to all bound queues, ignores routing key
- **headers** — routes by message header attributes instead of routing key

**Binding** — A rule that connects an exchange to a queue, optionally with a routing key or header filter. Bindings define the routing logic.

**Routing Key** — A string attached to a message by the producer. Exchanges use it (along with bindings) to decide where the message goes.

**Acknowledgement (ack)** — A signal from the consumer back to RabbitMQ confirming it processed a message successfully. Until acked, RabbitMQ holds the message as unconfirmed. If a consumer dies before acking, RabbitMQ requeues the message.

**Dead Letter** — A message that cannot be delivered: it expired, was rejected, or exceeded the queue's length limit. Dead letters are routed to a dead letter exchange (DLX) for inspection or retry.

**Virtual Host (vhost)** — A logical namespace inside a single RabbitMQ broker. Queues, exchanges, and bindings in one vhost are isolated from another. Use vhosts to separate environments (dev/staging/prod) on the same broker.

**Channel** — A lightweight connection multiplexed over a single TCP connection. You open one connection per process and multiple channels per connection. Channels are cheap; TCP connections are not.

**Connection** — A long-lived TCP connection to the broker. One per process. Channels are opened on top of connections.

---

## DAY 1 — Getting Up and Running

### Install with Docker

The easiest way to run RabbitMQ locally is Docker with the management plugin included:

```bash
docker run -d \
  --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  rabbitmq:3.13-management
```

Port `5672` is the AMQP protocol port — your applications connect here. Port `15672` is the management UI.

Verify it started:

```bash
docker logs rabbitmq
# look for: Server startup complete
```

### Management UI

Open `http://localhost:15672` in your browser. Default credentials: `guest` / `guest`.

The UI gives you:
- An overview of connections, channels, and queues
- The ability to manually publish and consume messages (useful for debugging)
- Exchange and queue configuration
- Real-time message rate graphs

Spend five minutes exploring before writing any code. The UI is your primary debugging tool.

### Publish and Consume — First Example

Using Python with the `pika` library:

```bash
pip install pika
```

**Producer:**

```python
import pika

connection = pika.BlockingConnection(
    pika.ConnectionParameters(host='localhost')
)
channel = connection.channel()

# Declare the queue (idempotent — safe to call if it already exists)
channel.queue_declare(queue='hello')

channel.basic_publish(
    exchange='',          # empty string = default direct exchange
    routing_key='hello',  # queue name when using default exchange
    body='Hello, RabbitMQ'
)

print("Sent: Hello, RabbitMQ")
connection.close()
```

**Consumer:**

```python
import pika

connection = pika.BlockingConnection(
    pika.ConnectionParameters(host='localhost')
)
channel = connection.channel()

channel.queue_declare(queue='hello')

def callback(ch, method, properties, body):
    print(f"Received: {body.decode()}")

channel.basic_consume(
    queue='hello',
    on_message_callback=callback,
    auto_ack=True
)

print("Waiting for messages...")
channel.start_consuming()
```

Run the consumer first, then the producer. You should see the message arrive.

### Exchange Types in Practice

**Direct exchange — point-to-point routing:**

```python
channel.exchange_declare(exchange='orders', exchange_type='direct')
channel.queue_declare(queue='order.created')
channel.queue_bind(exchange='orders', queue='order.created', routing_key='created')

channel.basic_publish(
    exchange='orders',
    routing_key='created',
    body='{"order_id": 42}'
)
```

**Topic exchange — pattern-based routing:**

Routing keys use dot notation: `order.created`, `order.shipped`, `payment.failed`.

Binding patterns:
- `order.*` — matches `order.created` and `order.shipped`, but not `order.item.added`
- `order.#` — matches `order.created`, `order.item.added`, and `order.item.color.red`
- `#` — matches everything

```python
channel.exchange_declare(exchange='events', exchange_type='topic')
channel.queue_declare(queue='all_order_events')
channel.queue_bind(
    exchange='events',
    queue='all_order_events',
    routing_key='order.#'
)
```

**Fanout exchange — broadcast:**

All bound queues receive every message regardless of routing key.

```python
channel.exchange_declare(exchange='notifications', exchange_type='fanout')
channel.queue_bind(exchange='notifications', queue='email_service')
channel.queue_bind(exchange='notifications', queue='sms_service')
channel.queue_bind(exchange='notifications', queue='push_service')
```

### Basic Acknowledgement

Disable `auto_ack` and ack manually after successful processing:

```python
def callback(ch, method, properties, body):
    try:
        process(body)
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception:
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)

channel.basic_consume(queue='hello', on_message_callback=callback)
```

With `auto_ack=True`, RabbitMQ removes the message the moment it delivers it — even if your code crashes mid-processing. Manual acks are almost always what you want in production.

Set prefetch to limit how many unacked messages a consumer holds at once:

```python
channel.basic_qos(prefetch_count=1)
```

Without `prefetch_count=1`, RabbitMQ can dump a large batch of messages onto a fast consumer while a slow consumer sits idle. With it, each consumer gets one message, processes it, acks, then gets the next.

---

## DAY 2 — Production Concerns

### Durability and Persistence

By default, queues and messages are transient — a broker restart loses everything. Make queues durable:

```python
channel.queue_declare(queue='orders', durable=True)
```

Mark messages persistent:

```python
channel.basic_publish(
    exchange='',
    routing_key='orders',
    body=json.dumps(order),
    properties=pika.BasicProperties(delivery_mode=2)  # 2 = persistent
)
```

⚠️ Durability only guarantees messages survive a clean restart. For stronger guarantees — especially in a cluster — use quorum queues (covered below). Classic durable queues with persistent messages can still lose data on an unclean shutdown or disk failure.

### Consumer Acknowledgement Patterns

Three ack outcomes:

- `basic_ack` — success, discard the message
- `basic_nack(requeue=True)` — processing failed, put it back on the queue
- `basic_nack(requeue=False)` — processing failed, discard or dead-letter it

Watch out for poison messages — messages your consumer cannot process no matter how many times it tries. Requeuing indefinitely causes an infinite retry loop and pegs your CPU. Track retry counts in message headers or route failures to a dead letter queue after N attempts.

### Dead Letter Queues

A dead letter exchange (DLX) catches messages that:
- Were rejected with `requeue=False`
- Expired (TTL elapsed)
- Exceeded the queue's `x-max-length`

Setup:

```python
# Declare the dead letter exchange and queue first
channel.exchange_declare('dlx', exchange_type='direct')
channel.queue_declare('dead_letters', durable=True)
channel.queue_bind('dead_letters', 'dlx', routing_key='failed')

# Declare the main queue with DLX configured
channel.queue_declare(
    queue='orders',
    durable=True,
    arguments={
        'x-dead-letter-exchange': 'dlx',
        'x-dead-letter-routing-key': 'failed',
        'x-message-ttl': 60000,   # messages expire after 60 seconds
        'x-max-length': 10000,    # queue depth limit
    }
)
```

Inspect dead letters in the management UI or consume from `dead_letters` to analyze failures, alert on them, or trigger manual intervention.

### Clustering and High Availability — Quorum Queues

A single RabbitMQ node is a single point of failure. For production you run a cluster of three or more nodes.

Classic queues in a cluster are not replicated by default. To replicate, you historically used mirrored queues — now deprecated. Use **quorum queues** instead.

Quorum queues are based on the Raft consensus protocol. They replicate message data across a majority of cluster members. If a node goes down, no messages are lost as long as a majority of replicas are up.

```python
channel.queue_declare(
    queue='orders',
    durable=True,
    arguments={'x-queue-type': 'quorum'}
)
```

Quorum queues require RabbitMQ 3.8+ and work best with odd-numbered clusters (3 or 5 nodes) so Raft can always achieve a majority.

Bootstrap a three-node cluster with Docker Compose:

```yaml
services:
  rabbit1:
    image: rabbitmq:3.13-management
    hostname: rabbit1
    environment:
      RABBITMQ_ERLANG_COOKIE: "secret-cookie"
    ports:
      - "5672:5672"
      - "15672:15672"

  rabbit2:
    image: rabbitmq:3.13-management
    hostname: rabbit2
    environment:
      RABBITMQ_ERLANG_COOKIE: "secret-cookie"

  rabbit3:
    image: rabbitmq:3.13-management
    hostname: rabbit3
    environment:
      RABBITMQ_ERLANG_COOKIE: "secret-cookie"
```

Join nodes 2 and 3 to node 1:

```bash
docker exec rabbit2 rabbitmqctl stop_app
docker exec rabbit2 rabbitmqctl reset
docker exec rabbit2 rabbitmqctl join_cluster rabbit@rabbit1
docker exec rabbit2 rabbitmqctl start_app
```

All nodes must share the same Erlang cookie for authentication.

### TLS

Never run RabbitMQ over an untrusted network without TLS. Generate certificates (use Let's Encrypt or your internal CA) and configure `rabbitmq.conf`:

```ini
listeners.ssl.default = 5671
ssl_options.cacertfile = /etc/rabbitmq/ca.pem
ssl_options.certfile   = /etc/rabbitmq/cert.pem
ssl_options.keyfile    = /etc/rabbitmq/key.pem
ssl_options.verify     = verify_peer
ssl_options.fail_if_no_peer_cert = true
```

Clients connect to port `5671` with TLS enabled. Disable the plain `5672` listener in production if you control all clients.

### Monitoring with Prometheus

Enable the Prometheus plugin:

```bash
rabbitmq-plugins enable rabbitmq_prometheus
```

RabbitMQ exposes metrics at `http://localhost:15692/metrics`. Scrape with Prometheus and import the official Grafana dashboard (ID `10991`).

Key metrics to watch:
- `rabbitmq_queue_messages` — queue depth; spikes mean consumers are falling behind
- `rabbitmq_queue_messages_unacked` — unacked message backlog; high values suggest slow or stuck consumers
- `rabbitmq_connections` — connection count; sudden drops indicate client crashes
- `rabbitmq_channel_messages_published_total` — publish rate
- `rabbitmq_channel_messages_delivered_ack_total` — consume and ack rate

Alert when queue depth grows unbounded or when unacked messages exceed your prefetch budget for an extended period.

### Flow Control

RabbitMQ protects itself when resources run low. When memory or disk usage crosses configured thresholds, the broker blocks publishing connections — producers stall until the pressure drops.

Default thresholds:
- Memory: 40% of available RAM (`vm_memory_high_watermark.relative = 0.4`)
- Disk: 50 MB free (`disk_free_limit.absolute = 50MB`)

Tune these in `rabbitmq.conf`:

```ini
vm_memory_high_watermark.relative = 0.6
disk_free_limit.relative = 0.1
```

Flow control is not a feature to rely on — it means your consumers cannot keep up with producers. It is a safety valve. When you see it triggered in the management UI or logs, address the root cause: scale up consumers, slow down producers, or increase hardware.

### RabbitMQ vs Kafka

This question comes up constantly. The short answer: they solve different problems.

| | RabbitMQ | Kafka |
|---|---|---|
| **Model** | Push (broker pushes to consumers) | Pull (consumers pull from broker) |
| **Message retention** | Deleted after ack by default | Retained for a configurable period |
| **Ordering** | Per-queue FIFO | Per-partition strict ordering |
| **Throughput** | Tens of thousands/sec per node | Millions/sec per cluster |
| **Routing** | Flexible — exchanges, bindings, patterns | Simple — topics and partitions |
| **Replay** | Not supported natively | Core feature — rewind and replay |
| **Latency** | Sub-millisecond | Single-digit milliseconds |
| **Operational complexity** | Lower | Higher (ZooKeeper/KRaft, partitions) |

Use RabbitMQ when:
- You need flexible routing logic (different message types to different services)
- Individual message acknowledgement and per-message retry matter
- You want low operational overhead
- Your scale is thousands of messages per second, not millions

Use Kafka when:
- You need to replay a stream of events (event sourcing, audit logs, ML pipelines)
- You need very high throughput
- Multiple independent consumer groups need to read the same stream at different offsets
- Log compaction or time-based retention is required

They are complementary, not competing. Some architectures use both.

### Shovel and Federation for Multi-Site

**Shovel** moves messages from a queue on one broker to an exchange on another, across data centers or cloud regions. It is a simple point-to-point bridge. Use it to drain a remote queue into a local one, or to migrate messages between clusters.

**Federation** creates a looser link between exchanges or queues across brokers. Unlike Shovel, it only forwards messages when there is a local consumer interested — it does not blindly replicate everything. Use Federation when you want geographic distribution with demand-based forwarding.

Both are plugins:

```bash
rabbitmq-plugins enable rabbitmq_shovel rabbitmq_shovel_management
rabbitmq-plugins enable rabbitmq_federation rabbitmq_federation_management
```

Configure them through the management UI or via policy definitions in `rabbitmq.conf`.

---

## Worked Example — Order Processing with Dead Letter Handling

An e-commerce platform publishes order events. Three services consume them: inventory reservation, payment processing, and notification dispatch.

**Setup:**

```python
import pika, json

conn = pika.BlockingConnection(pika.ConnectionParameters('localhost'))
ch = conn.channel()

# Dead letter infrastructure
ch.exchange_declare('dlx', exchange_type='direct')
ch.queue_declare('order.dead_letters', durable=True)
ch.queue_bind('order.dead_letters', 'dlx', routing_key='order.failed')

# Main exchange
ch.exchange_declare('order_events', exchange_type='topic')

# Three service queues — all with DLX and TTL
queue_args = {
    'x-queue-type': 'quorum',
    'x-dead-letter-exchange': 'dlx',
    'x-dead-letter-routing-key': 'order.failed',
    'x-message-ttl': 300000,   # 5 minutes
}

for q in ['inventory.orders', 'payment.orders', 'notification.orders']:
    ch.queue_declare(q, durable=True, arguments=queue_args)

ch.queue_bind('inventory.orders',    'order_events', routing_key='order.#')
ch.queue_bind('payment.orders',      'order_events', routing_key='order.#')
ch.queue_bind('notification.orders', 'order_events', routing_key='order.#')
```

**Producer:**

```python
order = {'order_id': 101, 'items': ['A', 'B'], 'total': 59.99}

ch.basic_publish(
    exchange='order_events',
    routing_key='order.created',
    body=json.dumps(order),
    properties=pika.BasicProperties(
        delivery_mode=2,
        content_type='application/json',
        message_id='ord-101',
    )
)
```

**Inventory consumer with retry tracking:**

```python
ch.basic_qos(prefetch_count=1)

def reserve_inventory(ch, method, properties, body):
    order = json.loads(body)
    headers = properties.headers or {}
    retry_count = int(headers.get('x-retry-count', 0))

    try:
        # ... reservation logic ...
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except TemporaryError:
        if retry_count < 3:
            ch.basic_publish(
                exchange='order_events',
                routing_key='order.created',
                body=body,
                properties=pika.BasicProperties(
                    delivery_mode=2,
                    headers={'x-retry-count': retry_count + 1}
                )
            )
        ch.basic_ack(delivery_tag=method.delivery_tag)  # ack the original
    except PermanentError:
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

ch.basic_consume('inventory.orders', on_message_callback=reserve_inventory)
ch.start_consuming()
```

The dead letter queue `order.dead_letters` collects orders that exhausted retries or hit permanent failures. A separate monitoring consumer reads from it, pages on-call, and optionally triggers a compensation workflow.

---

## Pitfalls

**Not setting prefetch.** Without `basic_qos(prefetch_count=N)`, RabbitMQ sends all available messages to the first consumer that connects. Your slowest consumer becomes a black hole.

**Using auto_ack in production.** If your consumer crashes after receiving but before finishing, the message is gone. Always ack manually.

**Unbounded retry loops.** Requeuing a poison message creates an infinite loop. Track retry counts in headers and dead-letter after a threshold.

**Declaring queues in only one place.** Both producers and consumers should declare queues idempotently on startup. If the consumer starts before the producer has ever declared the queue, it fails. Declaring in both places is safe and robust.

**One connection per channel.** Some libraries default to creating a new TCP connection per channel. Connections are expensive. Open one connection and multiplex channels over it.

**Ignoring disk alarms.** When RabbitMQ triggers a disk alarm, publishers block silently from the client's perspective. Add alarm monitoring and alert before the watermark is reached — not after.

**Classic queues without replication.** Using classic durable queues in a cluster gives you no replication. A node failure loses messages on that node. Use quorum queues for any data you care about.

**Mixing vhosts without policy.** If you share a broker across teams or environments, use separate vhosts with proper user permissions. A misconfigured consumer in one vhost cannot accidentally consume from another.

---

## Quick Reference

### rabbitmqctl

```bash
# List queues with message counts
rabbitmqctl list_queues name messages messages_ready messages_unacknowledged

# List exchanges
rabbitmqctl list_exchanges name type durable

# List bindings
rabbitmqctl list_bindings

# Purge a queue (delete all messages)
rabbitmqctl purge_queue <queue_name>

# Add a user and grant permissions
rabbitmqctl add_user myapp mypassword
rabbitmqctl set_permissions -p / myapp ".*" ".*" ".*"

# Check node status
rabbitmqctl status

# Cluster info
rabbitmqctl cluster_status
```

### Management HTTP API

The management plugin exposes a REST API at `http://localhost:15672/api/`.

```bash
# List queues
curl -u guest:guest http://localhost:15672/api/queues

# Get a specific queue
curl -u guest:guest http://localhost:15672/api/queues/%2F/my_queue

# Publish a message (for testing only — not for production use)
curl -u guest:guest -X POST http://localhost:15672/api/exchanges/%2F/amq.default/publish \
  -H "Content-Type: application/json" \
  -d '{"properties":{},"routing_key":"my_queue","payload":"hello","payload_encoding":"string"}'

# Get messages from a queue (requeues them — safe for inspection)
curl -u guest:guest -X POST http://localhost:15672/api/queues/%2F/my_queue/get \
  -H "Content-Type: application/json" \
  -d '{"count":5,"ackmode":"ack_requeue_true","encoding":"auto"}'
```

### Common rabbitmq.conf Settings

```ini
# Listener ports
listeners.tcp.default = 5672
listeners.ssl.default = 5671

# Memory and disk watermarks
vm_memory_high_watermark.relative = 0.4
disk_free_limit.relative = 0.1

# Default user (change or disable in production)
default_user = admin
default_pass = changeme

# Heartbeat interval in seconds
heartbeat = 60

# Max message size in bytes (0 = unlimited)
max_message_size = 134217728

# Log level
log.console.level = info
```

### Connection URL Format

```
amqp://username:password@host:port/vhost
amqps://username:password@host:5671/vhost
```

---

## Next Steps

Once you are comfortable with RabbitMQ basics, the natural next topics are:

- `Kafka.md` — high-throughput event streaming with replay and consumer groups
- `Redis.md` — if you need lightweight pub/sub or a simple task queue without a full broker
- `Docker.md` — container fundamentals underlying the RabbitMQ setup here
- `Kubernetes.md` — deploying and operating RabbitMQ clusters on Kubernetes using the RabbitMQ Cluster Operator

---

## Recommended learning resources

**YouTube channels & playlists:**
- [Hussein Nasser — RabbitMQ playlist](https://www.youtube.com/@haboread) — deep dives on exchange types, prefetch, acknowledgements, and comparing RabbitMQ to Kafka
- [CloudAMQP — RabbitMQ Tutorials](https://www.youtube.com/@CloudAMQP) — official hosting provider with clear walkthroughs on clustering, shovel, federation, and monitoring
- [Fireship — Message Queues Explained](https://www.youtube.com/@Fireship) — fast overview of the pub/sub and work-queue patterns RabbitMQ implements
- [TechWorld with Nana — RabbitMQ Crash Course](https://www.youtube.com/@TechWorldwithNana) — hands-on setup with Docker, exchanges, queues, and a simple producer/consumer
- [Michael Klishin — RabbitMQ Internals (Erlang Solutions)](https://www.youtube.com/@ErlangSolutions) — conference talks on Quorum Queues, flow control, and Erlang runtime tuning

**Official docs & blogs:**
- [RabbitMQ Official Documentation](https://www.rabbitmq.com/docs) — tutorials, guides on clustering, TLS, monitoring, and all exchange/queue types
- [RabbitMQ Blog](https://blog.rabbitmq.com/) — release notes, performance benchmarks, and migration guides for Quorum Queues and Streams
- [CloudAMQP Blog](https://www.cloudamqp.com/blog/) — practical production advice on sizing, monitoring, and common misconfigurations

---

## The Mantra

> Decouple first, optimize later. A queue between two services costs you a little complexity and buys you independent deployability, resilience under load, and the freedom to scale each side on its own terms. Most production incidents involving direct service calls would not have happened if there had been a queue in between.
