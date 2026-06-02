# ELK Stack — A 2-Day Crash Course

> You don't read logs — you query them. ELK turns raw text into a searchable, visual record of everything your infrastructure has ever said.

---

## Part 0 — Why ELK?

Before you touch a single config file, understand the problem ELK solves.

You have ten services. Each writes logs somewhere on disk. When something breaks at 2 a.m., you SSH into five boxes, run `grep` pipelines, and try to stitch together a timeline from timestamped strings in five different formats. This scales to exactly zero.

ELK gives you a centralized place to send every log line from every service — and then lets you search, filter, and visualize them in seconds.

The three components map to a library:

- **Logstash** is the librarian — it receives raw material, processes it, stamps it, and shelves it correctly.
- **Elasticsearch** is the catalog — a distributed, inverted-index search engine that stores every document and makes it instantly searchable.
- **Kibana** is the reading room — a browser UI where you write queries, build dashboards, and explore your data.

A fourth component — **Beats** — is the courier. A Filebeat agent on each host reads log files and ships them to Logstash or directly to Elasticsearch.

This is not a heavy academic stack. Two hours of hands-on work is enough to have logs flowing end-to-end.

---

## Vocabulary

You need these terms before touching anything.

| Term | What it means |
|---|---|
| **Index** | A named collection of documents — roughly equivalent to a database table. `logs-app-2026.05.31` is an index. |
| **Document** | A single JSON record — one log line, one metric event. The unit of storage. |
| **Shard** | A slice of an index. Elasticsearch splits an index across shards so it can parallelize reads and writes. A 5-shard index can use 5 CPU cores simultaneously. |
| **Replica** | A copy of a shard on a different node. Provides redundancy. If the primary shard's node dies, the replica promotes. |
| **Mapping** | The schema — defines field types (`keyword`, `text`, `date`, `integer`). Wrong mappings cause silent query failures. |
| **Analyzer** | A pipeline that tokenizes and normalizes text before indexing. The `standard` analyzer lowercases and splits on whitespace. Relevant for full-text fields. |
| **Logstash Pipeline** | An `input → filter → output` config that describes how Logstash receives, transforms, and routes events. |
| **Beats** | Lightweight shippers — Filebeat (logs), Metricbeat (metrics), Packetbeat (network). They run on your hosts and forward data upstream. |
| **Kibana** | The web UI for Elasticsearch. Also manages index patterns, dashboards, alerts, and ILM policies. |
| **ILM** | Index Lifecycle Management. Automates rolling, shrinking, and deleting indices by age or size. Essential for production. |
| **KQL** | Kibana Query Language. A lightweight syntax for filtering in Discover and dashboards — simpler than the full Elasticsearch Query DSL. |

---


```mermaid
graph LR
    Sources[Data Sources] --> Collect[ELK Stack Collector]
    Collect --> Process[Processing / Indexing]
    Process --> Store[(Storage)]
    Store --> Query[Query Engine]
    Query --> Dashboard[Dashboards / Alerts]
```

## DAY 1 — Get Something Running

### 1.1 Prerequisites

You need Docker and Docker Compose. That is all.

```bash
docker --version   # 24+
docker compose version  # 2.x
```

Set the virtual memory limit Elasticsearch requires:

```bash
# Linux
sudo sysctl -w vm.max_map_count=262144

# Make it permanent
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```

### 1.2 Docker Compose Stack

Create a working directory and the compose file:

```bash
mkdir elk-lab && cd elk-lab
```

`docker-compose.yml`:

```yaml
version: "3.8"

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false   # disable for local lab only
      - ES_JAVA_OPTS=-Xms1g -Xmx1g
    ports:
      - "9200:9200"
    volumes:
      - esdata:/usr/share/elasticsearch/data

  logstash:
    image: docker.elastic.co/logstash/logstash:8.13.0
    ports:
      - "5044:5044"
      - "5000:5000/udp"
    volumes:
      - ./logstash/pipeline:/usr/share/logstash/pipeline
    depends_on:
      - elasticsearch

  kibana:
    image: docker.elastic.co/kibana/kibana:8.13.0
    ports:
      - "5601:5601"
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
    depends_on:
      - elasticsearch

  filebeat:
    image: docker.elastic.co/beats/filebeat:8.13.0
    user: root
    volumes:
      - ./filebeat/filebeat.yml:/usr/share/filebeat/filebeat.yml:ro
      - /var/log:/var/log:ro
    depends_on:
      - logstash

volumes:
  esdata:
```

### 1.3 Minimal Logstash Pipeline

```bash
mkdir -p logstash/pipeline
```

`logstash/pipeline/main.conf`:

```
input {
  beats {
    port => 5044
  }
}

filter {
  # placeholder — Day 2 adds grok here
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "logs-%{+YYYY.MM.dd}"
  }
  stdout { codec => rubydebug }
}
```

### 1.4 Filebeat Configuration

```bash
mkdir -p filebeat
```

`filebeat/filebeat.yml`:

```yaml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/*.log

output.logstash:
  hosts: ["logstash:5044"]
```

### 1.5 Start the Stack

```bash
docker compose up -d
docker compose ps        # all services should be Up
docker compose logs -f elasticsearch   # watch for "started" message
```

Elasticsearch is ready when you see `"message": "started"` in the logs. It typically takes 30–60 seconds.

Verify:

```bash
curl http://localhost:9200
# {"name":"...","cluster_name":"docker-cluster","version":{"number":"8.13.0",...}}
```

### 1.6 Basic Elasticsearch Queries

Elasticsearch exposes a REST API. You interact with it via `curl`, the Kibana Dev Tools console, or any HTTP client.

**List all indices:**

```bash
curl http://localhost:9200/_cat/indices?v
```

**Index a document manually:**

```bash
curl -X POST http://localhost:9200/logs-test/_doc \
  -H 'Content-Type: application/json' \
  -d '{"timestamp":"2026-05-31T10:00:00Z","level":"ERROR","message":"disk full on /dev/sda1","host":"web-01"}'
```

**Search all documents in an index:**

```bash
curl http://localhost:9200/logs-test/_search?pretty
```

**Search with a filter:**

```bash
curl -X GET http://localhost:9200/logs-test/_search \
  -H 'Content-Type: application/json' \
  -d '{
    "query": {
      "match": { "level": "ERROR" }
    }
  }'
```

**Term query (exact match on keyword field):**

```bash
curl -X GET http://localhost:9200/logs-test/_search \
  -H 'Content-Type: application/json' \
  -d '{
    "query": {
      "term": { "host": "web-01" }
    }
  }'
```

### 1.7 Kibana Discover

Open `http://localhost:5601` in your browser.

1. Go to **Stack Management → Index Patterns** (or **Data Views** in newer versions).
2. Create a data view matching `logs-*`.
3. Set `@timestamp` as the time field.
4. Go to **Discover**.
5. Set the time range to the last 15 minutes.

You should see log documents appearing as Filebeat ships `/var/log/*.log` through Logstash into Elasticsearch.

Try the search bar:

```
level: ERROR
host: web-01 AND level: WARN
message: "connection refused"
```

This is KQL — you will go deeper on Day 2.

---

## DAY 2 — Production-Grade Setup

### 2.1 Logstash Grok Filters

Raw log lines are strings. Grok parses them into structured fields.

A typical nginx access log line:

```
192.168.1.10 - - [31/May/2026:10:15:00 +0000] "GET /api/health HTTP/1.1" 200 512
```

Grok filter to parse it:

```
filter {
  grok {
    match => {
      "message" => '%{IPORHOST:client_ip} - - \[%{HTTPDATE:timestamp}\] "%{WORD:method} %{URIPATHPARAM:request} HTTP/%{NUMBER:http_version}" %{NUMBER:response_code:int} %{NUMBER:bytes:int}'
    }
  }

  date {
    match => ["timestamp", "dd/MMM/yyyy:HH:mm:ss Z"]
    target => "@timestamp"
  }

  mutate {
    remove_field => ["timestamp"]
  }
}
```

Test grok patterns at `http://localhost:5601` → Dev Tools → Grok Debugger before deploying.

Common grok patterns:

| Pattern | Matches |
|---|---|
| `%{IP:field}` | IPv4/IPv6 address |
| `%{NUMBER:field}` | Integer or float |
| `%{WORD:field}` | Single word |
| `%{DATA:field}` | Anything (lazy) |
| `%{GREEDYDATA:field}` | Anything (greedy, to end of line) |
| `%{LOGLEVEL:level}` | ERROR, WARN, INFO, DEBUG |

⚠️ Grok is a regex engine under the hood. A bad pattern on a high-volume pipeline stalls Logstash. Always test with representative samples before pushing to production.

### 2.2 Index Lifecycle Management

Without ILM, your indices grow until the disk fills. ILM automates the rotation.

A minimal ILM policy — hot for 7 days, warm for 23 days, delete after 30:

```bash
curl -X PUT http://localhost:9200/_ilm/policy/logs-policy \
  -H 'Content-Type: application/json' \
  -d '{
    "policy": {
      "phases": {
        "hot": {
          "min_age": "0ms",
          "actions": {
            "rollover": {
              "max_age": "7d",
              "max_size": "50gb"
            }
          }
        },
        "warm": {
          "min_age": "7d",
          "actions": {
            "shrink": { "number_of_shards": 1 },
            "forcemerge": { "max_num_segments": 1 }
          }
        },
        "delete": {
          "min_age": "30d",
          "actions": { "delete": {} }
        }
      }
    }
  }'
```

Attach the policy to an index template so all new `logs-*` indices inherit it automatically.

### 2.3 Cluster Sizing

For a production three-node cluster, a reasonable starting point:

| Role | RAM | Heap | Disk |
|---|---|---|---|
| Master-eligible | 8 GB | 4 GB | 50 GB SSD |
| Data (hot) | 32 GB | 16 GB | 2 TB NVMe |
| Data (warm) | 16 GB | 8 GB | 8 TB HDD |

Rules of thumb:

- Heap is always 50% of node RAM, capped at 31 GB. Beyond 31 GB, the JVM loses compressed pointer optimization.
- One shard per 30–50 GB of data. Too many small shards waste overhead; too few large shards bottleneck parallel reads.
- Replicas add read throughput but double storage cost. One replica is standard.

### 2.4 Security

The `xpack.security.enabled=false` lab setting is for local experimentation only. In any real environment:

**Enable TLS and authentication:**

```yaml
# elasticsearch.yml
xpack.security.enabled: true
xpack.security.transport.ssl.enabled: true
xpack.security.http.ssl.enabled: true
```

Generate certificates with the built-in tool:

```bash
bin/elasticsearch-certutil ca
bin/elasticsearch-certutil cert --ca elastic-stack-ca.p12
```

**Create users and roles via the API or Kibana:**

- Assign the `kibana_system` built-in role to the Kibana service account.
- Assign the `logstash_writer` role (write access to `logs-*`) to the Logstash service account.
- Assign read-only roles to analysts.

**Network hardening:**

- Bind Elasticsearch to internal interfaces only — never expose port 9200 to the internet.
- Put Kibana behind an authenticating reverse proxy (nginx + OAuth, or Cloudflare Access).
- Filebeat and Logstash connections to Elasticsearch should use TLS with certificate verification.

### 2.5 KQL Reference

KQL works in the Kibana search bar, dashboards, and alerting rules.

```
# Exact field match
status: 500

# Boolean operators
level: ERROR AND service: "checkout"

# Range
response_time_ms >= 1000

# Wildcard
host: web-*

# Phrase match
message: "out of memory"

# Exists check
not tags: debug

# Nested with parentheses
(level: ERROR OR level: WARN) AND datacenter: us-east-1
```

KQL compiles to Elasticsearch Query DSL under the hood. For complex analytics — aggregations, cardinality, percentiles — you need the full DSL or Kibana Lens.

### 2.6 ELK vs Loki

| Dimension | ELK | Loki |
|---|---|---|
| Storage model | Full-text inverted index | Compressed log chunks indexed only by labels |
| Query language | KQL / Lucene / DSL | LogQL |
| Search capability | Full-text search over any field | Label-based filtering + log line regex |
| Resource cost | High — indexing everything is expensive | Low — index only metadata labels |
| Best fit | Structured logs, compliance search, rich analytics | High-volume logs with Prometheus-style label sets |
| Grafana integration | Via plugin | Native |

If you are already on Prometheus and Grafana, Loki is the lower-friction path. If you need full-text search across unstructured log content or have compliance requirements for log search, ELK earns its resource cost.

### 2.7 Performance Tuning

**Elasticsearch:**

- Bulk index in batches of 5–15 MB rather than one document at a time. Filebeat and Logstash do this automatically.
- Set `refresh_interval: 30s` on hot indices to reduce write amplification. The default 1s is excessive for log workloads.
- Use `_source: false` on indices where you store all fields explicitly — saves ~20% storage.
- Avoid `wildcard` queries on high-cardinality `text` fields — they perform a full index scan.

**Logstash:**

- Increase `pipeline.workers` to match CPU core count.
- Increase `pipeline.batch.size` (default 125) for high-throughput ingestion.
- Use the persistent queue (`queue.type: persisted`) to avoid data loss if Logstash restarts.

**Filebeat:**

- Set `close_inactive: 5m` to release file handles on quiet log files.
- Use `processors` in Filebeat to drop or add fields before shipping — reduces payload size downstream.

---

## Worked Example — Centralized Logging for Microservices

Scenario: three services — `auth`, `orders`, `payments` — running on separate hosts. You want all logs in one place, queryable by service and severity.

**Step 1 — Filebeat on each host**

Add a `fields` block to Filebeat config so each host tags its logs:

```yaml
filebeat.inputs:
  - type: log
    paths:
      - /var/log/app/*.log
    fields:
      service: auth     # change per host
      environment: prod
    fields_under_root: true
```

**Step 2 — Logstash route by service**

```
filter {
  grok {
    match => { "message" => "%{TIMESTAMP_ISO8601:ts} %{LOGLEVEL:level} %{GREEDYDATA:log_message}" }
  }

  if [service] == "payments" {
    mutate { add_tag => ["pci"] }
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "logs-%{service}-%{+YYYY.MM.dd}"
  }
}
```

This creates separate indices per service — `logs-auth-2026.05.31`, `logs-orders-2026.05.31`, etc. — which lets you apply different ILM policies per service (payments logs retained 90 days, debug logs 7 days).

**Step 3 — Kibana data view**

Create a data view matching `logs-*` covering all services, or per-service views for teams that only need their own logs.

**Step 4 — Build a dashboard**

In Kibana → Dashboard → Create:

- Bar chart: document count by `service` over time — shows which service is noisy.
- Pie chart: `level` distribution — proportion of ERROR vs WARN vs INFO.
- Data table: top 10 `log_message` values — surfaces repeated errors instantly.

**Step 5 — Alert on error rate**

In Kibana → Alerting → Create rule → Elasticsearch query rule:

- Query: `level: ERROR AND service: payments`
- Threshold: count > 50 in 5 minutes
- Action: send to Slack webhook

You now have end-to-end visibility: logs flow from disk to Elasticsearch, parsed and routed by Logstash, visualized and alerted on in Kibana.

---

## Pitfalls

**Mapping explosions.** Elasticsearch infers field types on first ingest. If your JSON logs have dynamic keys that vary per event, you end up with thousands of mapped fields — the "mapping explosion" problem. Set `dynamic: false` on indices and map only the fields you query.

**Timestamp mismatches.** If the `@timestamp` field is not parsed correctly, Kibana shows documents at the wrong time. Always use a `date` filter in Logstash to parse the original log timestamp into `@timestamp`. Never rely on ingest time alone.

**Heap pressure and GC pauses.** Elasticsearch is a JVM application. Watch `jvm.mem.heap_used_percent` in Kibana Monitoring. Above 85%, GC pressure degrades query latency. If you hit this regularly, add nodes or increase heap (up to 31 GB).

**Shard imbalance.** If one node holds significantly more shards than others, rebalancing traffic is uneven. Use the `_cluster/reroute` API or let Elasticsearch's auto-rebalancing handle it — but make sure `cluster.routing.rebalance.enable` is not set to `none`.

**Single node in production.** A single Elasticsearch node has no redundancy. Any restart means downtime. Even in a small environment, run three master-eligible nodes.

**Logstash as a SPOF.** A single Logstash instance is a single point of failure. Run two Logstash instances with Filebeat configured to send to both (load-balanced). Or ship Filebeat directly to Elasticsearch and skip Logstash for simple pipelines.

**Not setting ILM.** Skipping ILM is the fastest way to fill your disk. Set it before you go live, not after you get a 3 a.m. disk-full alert.

⚠️ The Elasticsearch heap size is set at startup — you cannot change it without restarting the node. Size it correctly from the start.

---

## Quick Reference

```bash
# Cluster health
curl http://localhost:9200/_cluster/health?pretty

# List indices with size and doc count
curl http://localhost:9200/_cat/indices?v&s=store.size:desc

# Check a specific index's mapping
curl http://localhost:9200/logs-app-2026.05.31/_mapping?pretty

# Delete an index
curl -X DELETE http://localhost:9200/logs-app-2026.05.31

# Force a segment merge (use carefully — CPU-intensive)
curl -X POST http://localhost:9200/logs-app-2026.05.31/_forcemerge?max_num_segments=1

# Check ILM status for an index
curl http://localhost:9200/logs-app-2026.05.31/_ilm/explain?pretty

# Logstash — test a config file
bin/logstash -f pipeline/main.conf --config.test_and_exit

# Filebeat — test config and connection
filebeat test config
filebeat test output

# Kibana — restart from Docker
docker compose restart kibana
```

**KQL cheat sheet:**

```
level: ERROR                               # exact match
level: ERROR AND host: web-*              # boolean + wildcard
response_ms >= 500 AND response_ms < 2000  # range
message: "timeout" AND NOT service: batch  # negation
```

---



## Top 10 Interview Questions

<details>
<summary><strong>Q: What is ELK Stack and what problem does it solve?</strong></summary>

ELK Stack addresses a specific need in modern engineering workflows. Understanding the core problem it solves — and the alternatives it replaced — is the foundation for every subsequent interview question. Frame your answer around the pain point first, then the solution.

</details>

<details>
<summary><strong>Q: How does ELK Stack compare to its main alternatives?</strong></summary>

Every tool exists in an ecosystem of alternatives. Be prepared to articulate the specific tradeoffs: when ELK Stack is the right choice, when an alternative is better, and what factors drive the decision (scale, team expertise, existing infrastructure, compliance requirements).

</details>

<details>
<summary><strong>Q: What are the most common production pitfalls with ELK Stack?</strong></summary>

Production experience is what separates senior from junior engineers. Common pitfalls include: misconfiguration that works in dev but fails at scale, security oversights, inadequate monitoring, and operational procedures that are untested until an incident occurs. Cite specific examples from your experience.

</details>

<details>
<summary><strong>Q: How do you monitor and observe ELK Stack in production?</strong></summary>

Key metrics to track, alerting thresholds to set, dashboards to build, and log patterns to watch. Production monitoring should cover: health/liveness, performance (latency, throughput), capacity (resource utilisation), and business impact (error rates affecting users). Explain which metrics are leading indicators versus lagging.

</details>

<details>
<summary><strong>Q: How do you scale ELK Stack as load increases?</strong></summary>

Scaling strategies depend on the bottleneck: horizontal scaling (add more instances), vertical scaling (bigger instances), caching (reduce load), sharding (distribute data), and async processing (decouple components). Explain which approach applies to ELK Stack and at what scale each strategy becomes necessary.

</details>

<details>
<summary><strong>Q: How do you handle security and access control with ELK Stack?</strong></summary>

Security is non-negotiable in production. Cover: authentication and authorization mechanisms, secrets management (never in code), encryption (at rest and in transit), network security (firewalls, private networks), audit logging, and compliance requirements relevant to your industry.

</details>

<details>
<summary><strong>Q: How do you implement disaster recovery for ELK Stack?</strong></summary>

DR planning requires defining RTO (recovery time objective) and RPO (recovery point objective), implementing backup strategies, testing restore procedures, and documenting runbooks. Explain your backup strategy, how you test restores, and what your recovery procedure looks like.

</details>

<details>
<summary><strong>Q: How do you automate ELK Stack deployment and configuration management?</strong></summary>

Infrastructure as code, CI/CD pipelines, configuration management, and GitOps workflows. Explain how you version, test, deploy, and roll back changes. Cover: what is automated, what requires manual approval, and how you handle configuration drift.

</details>

<details>
<summary><strong>Q: How do you troubleshoot issues with ELK Stack in production?</strong></summary>

A systematic debugging approach: check health endpoints, review recent changes (deploys, config changes), examine logs and metrics, reproduce the issue, identify root cause, fix, verify, and write a postmortem. Explain your actual debugging workflow with concrete examples.

</details>

<details>
<summary><strong>Q: What are the best practices for ELK Stack that you have learned from experience?</strong></summary>

Best practices that go beyond documentation: lessons learned from production incidents, configuration patterns that prevent common issues, testing strategies that catch bugs before production, and operational procedures that reduce toil. Share specific examples where following (or not following) a best practice had measurable impact.

</details>

---

## Next Steps

You have a working ELK stack. The natural places to go next:

- **[Loki.md](Loki.md)** — if you want lower-overhead log aggregation alongside Prometheus. Loki and ELK can coexist, with ELK handling structured audit logs and Loki handling high-volume application logs.
- **[Prometheus.md](Prometheus.md)** — metrics are the complement to logs. When Kibana shows you a spike in error logs, Prometheus tells you whether CPU, memory, or a downstream dependency caused it.
- **[OpenTelemetry.md](OpenTelemetry.md)** — traces tie logs and metrics together into a single request timeline. OTel can ship logs directly to Elasticsearch via the OTLP exporter, replacing Filebeat in modern architectures.

---

## Recommended learning resources

**YouTube channels & playlists:**
- [Elastic Official — ELK Stack Tutorials](https://www.youtube.com/@Elastic) — official Elasticsearch, Logstash, Kibana walkthroughs and Elastic{ON} conference recordings
- [TechWorld with Nana — ELK Stack for Beginners](https://www.youtube.com/@TechWorldwithNana) — beginner-friendly setup of Elasticsearch, Filebeat, and Kibana dashboards
- [DevOps Toolkit (Viktor Farcic) — ELK vs Loki](https://www.youtube.com/@DevOpsToolkit) — practical comparison of log aggregation stacks and when each fits
- [CNCF — KubeCon Observability Track](https://www.youtube.com/@caborstudio) — conference talks on centralised logging, EFK variants, and log pipeline design
- [Grafana Labs — Loki as ELK Alternative](https://www.youtube.com/@GrafanaLabs) — understanding where Loki complements or replaces ELK in your stack

**Official docs & blogs:**
- [Elasticsearch Official Documentation](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)
- [Kibana Official Documentation](https://www.elastic.co/guide/en/kibana/current/index.html)
- [Elastic Blog](https://www.elastic.co/blog) — deep technical posts on index lifecycle management, mapping strategies, and cluster tuning

## The Mantra

Logs without search are archaeology. Search without structure is guessing. Structure without retention is amnesia.

ELK gives you all three — but only if you define your mappings before data arrives, set ILM before the disk fills, and secure the cluster before it goes anywhere near production. The stack rewards the engineer who thinks ahead. It punishes the one who treats it as a fire-and-forget installation.

Build the pipeline once, correctly. Then let it run.
