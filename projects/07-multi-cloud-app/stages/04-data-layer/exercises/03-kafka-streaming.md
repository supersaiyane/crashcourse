# Exercise 3: Kafka Event Streaming

**Goal:** Start a Kafka broker in KRaft mode, create the analytics-events topic with 3 partitions, and test producing and consuming messages.

## Step 1: Start Kafka

```bash
docker compose -f docker-compose.kafka.yml up -d # start Kafka in KRaft mode
```

Expected output:
- `[+] Running 1/1` with container `kafka` started

## Step 2: Create the analytics topic

```bash
docker exec -it kafka kafka-topics --create \
  --topic analytics-events \
  --partitions 3 \
  --replication-factor 1 \
  --bootstrap-server localhost:9092              # 3 partitions for parallelism
```

Expected output:
- `Created topic analytics-events.`

## Step 3: Describe the topic

```bash
docker exec -it kafka kafka-topics --describe \
  --topic analytics-events \
  --bootstrap-server localhost:9092
```

Expected output:
- `PartitionCount: 3`, `ReplicationFactor: 1`
- Three partition entries (0, 1, 2) each with Leader: 1

## Step 4: Produce and consume test messages

```bash
# Terminal 1: start a consumer
docker exec -it kafka kafka-console-consumer \
  --topic analytics-events --from-beginning \
  --bootstrap-server localhost:9092

# Terminal 2: produce messages (type each, press Enter)
docker exec -it kafka kafka-console-producer \
  --topic analytics-events \
  --bootstrap-server localhost:9092
# {"event_type":"page_view","user_id":"usr_abc123","page":"/dashboard"}
# {"event_type":"click","user_id":"usr_abc123","button":"export"}
# {"event_type":"purchase","user_id":"usr_def456","amount":99.99}
# Ctrl+C to stop
```

Expected output:
- Consumer terminal displays all three JSON messages

## Verify

```bash
docker exec -it kafka kafka-topics --list \
  --bootstrap-server localhost:9092              # should show analytics-events
```

You should see: `analytics-events` listed — the topic is ready for the CloudPlatform processor.
