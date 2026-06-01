# Apache Spark — A 2-Day Crash Course

Spark is a distributed data processing engine — it splits your data across a cluster and processes it in parallel, turning hours of computation into minutes.

---

## Part 0 — Why Spark Exists

Your laptop has 16–64 GB of RAM. A single day of production logs at a mid-size company can be 500 GB. A week of clickstream data at a large platform is easily several terabytes. Pandas loads data into memory — when the data doesn't fit, you're stuck.

The traditional answer was Hadoop MapReduce: split the data across dozens of machines, process locally, aggregate. It worked, but it was slow because every intermediate result got written to disk. Hadoop jobs that took two hours weren't unusual.

Spark changed the model. It keeps intermediate data in memory across transformation steps. It uses a lazy evaluation model — it doesn't execute anything until you ask for a result, which lets it optimize the entire computation plan before running a single line. A job that took two hours in MapReduce often runs in four minutes in Spark.

If you're still using pandas on a single machine with a cron job and you're processing more than a few gigabytes per run, you're fighting the wrong battle. Spark is the answer.

---

## Vocabulary — Know These Before Day 1

**Driver** — the process that runs your application code. It builds the execution plan and coordinates everything. Think of it as the conductor.

**Executor** — a JVM process running on a worker node. It does the actual computation and holds data partitions in memory or on disk. You'll have many executors across your cluster.

**RDD (Resilient Distributed Dataset)** — the original low-level abstraction. A distributed collection of objects. You rarely use RDDs directly in modern Spark; DataFrames sit on top of them.

**DataFrame** — a distributed table with named columns and a schema. This is what you'll work with 95% of the time. It's similar to a pandas DataFrame but distributed across the cluster.

**SparkSession** — your entry point into Spark. You create one at the start of every application. It replaces the older `SparkContext`, `SQLContext`, and `HiveContext`.

**Transformation (lazy)** — an operation that describes what to do but doesn't execute yet: `filter`, `select`, `groupBy`, `join`. Spark builds a DAG (directed acyclic graph) of transformations.

**Action (triggers execution)** — an operation that forces Spark to actually compute: `show`, `count`, `collect`, `write`. The moment you call an action, Spark compiles and runs the plan.

**Partition** — a chunk of your data. A 10 GB file might be split into 80 partitions of ~128 MB each. Each partition is processed by one executor core at a time.

**Shuffle** — when data needs to be redistributed across partitions (for a `groupBy` or `join`), Spark shuffles it over the network. Shuffles are the most expensive operations — understanding them is the key to tuning Spark.

**Catalyst Optimizer** — Spark's query optimizer. It takes your logical plan (what you asked for) and rewrites it into a physical plan (how to execute it efficiently). It pushes filters down, eliminates redundant operations, and picks join strategies.

**Spark SQL** — a module that lets you query DataFrames using SQL syntax. The same Catalyst optimizer applies.

**PySpark** — the Python API for Spark. You write Python; it talks to the JVM under the hood. This is what most data engineers use day to day.

---

## DAY 1 — Getting Started

### Install PySpark Locally

You don't need a cluster to learn Spark. Run it in local mode on your machine.

```bash
pip install pyspark

# Verify
python -c "import pyspark; print(pyspark.__version__)"
```

Local mode uses your machine's cores as "executors." It's real Spark — the API is identical to production.

---

### SparkSession — Your Starting Point

```python
from pyspark.sql import SparkSession

spark = (
    SparkSession.builder
    .appName("crash-course")
    .master("local[*]")          # use all local cores
    .config("spark.sql.shuffle.partitions", "8")  # smaller for local dev
    .getOrCreate()
)
```

`local[*]` means local mode with as many threads as you have CPU cores. In production you'd replace `master(...)` with your cluster URL or remove it entirely if submitting via `spark-submit`.

---

### Reading Data

```python
# CSV
df = spark.read.option("header", "true").option("inferSchema", "true").csv("data/logs.csv")

# Parquet (preferred — columnar, compressed, schema-embedded)
df = spark.read.parquet("data/events/")

# JSON
df = spark.read.json("data/records.json")

# Explicitly define schema — always faster than inferSchema in production
from pyspark.sql.types import StructType, StructField, StringType, LongType, TimestampType

schema = StructType([
    StructField("user_id",     StringType(),    nullable=False),
    StructField("event_type",  StringType(),    nullable=True),
    StructField("timestamp",   TimestampType(), nullable=True),
    StructField("bytes_sent",  LongType(),      nullable=True),
])

df = spark.read.schema(schema).parquet("data/events/")
```

Always define your schema explicitly in production jobs. `inferSchema` reads the entire dataset twice and is slow on large files.

---

### Writing Data

```python
# Parquet — your default for most analytical workloads
df.write.mode("overwrite").parquet("output/events/")

# Partitioned output — creates subdirectories like date=2025-01-01/
df.write.mode("overwrite").partitionBy("date").parquet("output/events_partitioned/")

# CSV for downstream systems that don't speak Parquet
df.write.mode("overwrite").option("header", "true").csv("output/report.csv")
```

---

### Transformations — Describing Your Logic

These are lazy. Nothing runs until you call an action.

```python
from pyspark.sql import functions as F

# Select specific columns
df_slim = df.select("user_id", "event_type", "bytes_sent")

# Filter rows
df_errors = df.filter(F.col("status_code") >= 400)

# Add or transform a column
df = df.withColumn("mb_sent", F.col("bytes_sent") / 1_048_576)

# Rename and drop
df = df.withColumnRenamed("bytes_sent", "bytes")
df = df.drop("internal_id")

# GroupBy and aggregate
df_summary = (
    df
    .groupBy("user_id", "event_type")
    .agg(
        F.count("*").alias("event_count"),
        F.sum("bytes_sent").alias("total_bytes"),
        F.avg("bytes_sent").alias("avg_bytes"),
        F.max("timestamp").alias("last_seen"),
    )
)

# Join
users = spark.read.parquet("data/users/")
df_enriched = df.join(users, on="user_id", how="left")

# Window functions
from pyspark.sql.window import Window

window = Window.partitionBy("user_id").orderBy(F.col("timestamp").desc())
df = df.withColumn("row_num", F.row_number().over(window))
df_latest = df.filter(F.col("row_num") == 1)
```

---

### Actions — Triggering Execution

```python
# Print the first 20 rows (truncated)
df.show()

# Print with full column values
df.show(50, truncate=False)

# Count rows — triggers a full scan
count = df.count()

# Bring all data to the driver — dangerous on large datasets
rows = df.collect()

# Sample safely
sample = df.limit(100).collect()

# Inspect schema and statistics
df.printSchema()
df.describe("bytes_sent", "status_code").show()
```

⚠️ Never call `collect()` on a large DataFrame. You'll OOM your driver. Use `limit()` first, or write to storage instead.

---

### Spark SQL

```python
# Register the DataFrame as a temporary view
df.createOrReplaceTempView("events")

# Query it with SQL
result = spark.sql("""
    SELECT
        user_id,
        DATE(timestamp)   AS event_date,
        COUNT(*)          AS event_count,
        SUM(bytes_sent)   AS total_bytes
    FROM events
    WHERE status_code < 400
    GROUP BY user_id, DATE(timestamp)
    ORDER BY total_bytes DESC
    LIMIT 100
""")

result.show()
```

Spark SQL and the DataFrame API compile to the same physical plan. Use whichever is clearer for the transformation at hand.

---

## DAY 2 — Production Thinking

### Partitioning Strategy

Partitions are the unit of parallelism. Too few — your executors sit idle. Too many — you drown in scheduling overhead and tiny files.

Aim for partitions of 100–200 MB each. Default HDFS block size is 128 MB, which is a reasonable target.

```python
# Check current partition count
print(df.rdd.getNumPartitions())

# Repartition — full shuffle, use when you need even distribution
df = df.repartition(200)

# Repartition by column — useful before writing partitioned output
df = df.repartition(200, F.col("date"))

# Coalesce — reduces partitions without a full shuffle (merge only)
df = df.coalesce(10)
```

When writing partitioned Parquet, each unique partition key value creates a directory. Partitioning by `date` on 30 days of data gives you 30 directories — that's fine. Partitioning by `user_id` on millions of users creates millions of tiny files — avoid it.

---

### Broadcast Joins

When you join a large table to a small table, tell Spark to broadcast the small one. Spark sends a copy of the small table to every executor, eliminating the shuffle entirely.

```python
from pyspark.sql.functions import broadcast

# Small lookup table — under 10 MB is ideal, up to a few hundred MB is workable
country_codes = spark.read.parquet("data/country_codes/")

df_enriched = df.join(broadcast(country_codes), on="country_code", how="left")
```

Without the hint, Spark may choose a sort-merge join, which shuffles both tables. On a 500 GB left table that shuffle takes minutes. With a broadcast join, the 500 GB table never moves.

```python
# Or configure the auto-broadcast threshold
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", 50 * 1024 * 1024)  # 50 MB
```

---

### Caching

If you use the same DataFrame more than once, cache it to avoid recomputation.

```python
df_clean = (
    df
    .filter(F.col("status_code") < 500)
    .withColumn("date", F.to_date("timestamp"))
)

df_clean.cache()
df_clean.count()  # force materialization — cache is lazy too

df_daily  = df_clean.groupBy("date").count()
df_by_user = df_clean.groupBy("user_id").count()

df_clean.unpersist()  # release when done
```

Storage levels give you control:

```python
from pyspark import StorageLevel

df.persist(StorageLevel.MEMORY_ONLY)        # default cache
df.persist(StorageLevel.MEMORY_AND_DISK)    # disk fallback — safer for large DataFrames
df.persist(StorageLevel.MEMORY_ONLY_SER)    # serialized — less memory, slower access
```

---

### UDFs — User Defined Functions

When built-in functions aren't enough, register a Python function as a UDF. Use them sparingly — they break out of the JVM and serialize data row-by-row through Python, which is slow.

```python
from pyspark.sql.functions import udf
from pyspark.sql.types import StringType

def classify_response(code):
    if code is None: return "unknown"
    if code < 300:   return "success"
    if code < 400:   return "redirect"
    if code < 500:   return "client_error"
    return "server_error"

classify_udf = udf(classify_response, StringType())
df = df.withColumn("response_class", classify_udf(F.col("status_code")))
```

Prefer Pandas UDFs (vectorized) — they operate on entire partitions at once using Arrow, not row by row:

```python
from pyspark.sql.functions import pandas_udf
import pandas as pd

@pandas_udf(StringType())
def classify_vectorized(series: pd.Series) -> pd.Series:
    def classify(code):
        if pd.isna(code): return "unknown"
        if code < 300:    return "success"
        if code < 400:    return "redirect"
        if code < 500:    return "client_error"
        return "server_error"
    return series.map(classify)

df = df.withColumn("response_class", classify_vectorized(F.col("status_code")))
```

---

### Structured Streaming — Basics

Structured Streaming extends the DataFrame API to continuous data. Your query looks almost identical to a batch query.

```python
stream_df = (
    spark.readStream
    .format("kafka")
    .option("kafka.bootstrap.servers", "kafka:9092")
    .option("subscribe", "web-events")
    .load()
)

from pyspark.sql.types import StructType, StructField, StringType, LongType

event_schema = StructType([
    StructField("user_id",    StringType()),
    StructField("event_type", StringType()),
    StructField("bytes_sent", LongType()),
])

events = stream_df.select(
    F.from_json(F.col("value").cast("string"), event_schema).alias("d")
).select("d.*")

windowed = (
    events
    .withWatermark("timestamp", "10 minutes")
    .groupBy(F.window("timestamp", "5 minutes"), "event_type")
    .count()
)

query = (
    windowed.writeStream
    .outputMode("append")
    .format("console")
    .start()
)

query.awaitTermination()
```

Watermarking tells Spark how late data can arrive before a window is finalized. Without a watermark, Spark retains state forever.

---

### Spark on Kubernetes

In production, most teams run Spark on Kubernetes rather than a dedicated Hadoop cluster.

```bash
spark-submit \
  --master k8s://https://<k8s-api-server>:6443 \
  --deploy-mode cluster \
  --name my-spark-job \
  --conf spark.executor.instances=10 \
  --conf spark.executor.memory=4g \
  --conf spark.executor.cores=2 \
  --conf spark.driver.memory=2g \
  --conf spark.kubernetes.container.image=my-registry/spark:3.5.0 \
  --conf spark.kubernetes.namespace=data-processing \
  local:///opt/spark/jobs/my_job.py
```

The driver runs as a pod. Each executor is its own pod — created at job start, terminated when the job finishes. Your cluster scales exactly as needed.

For recurring jobs, use the Spark Operator (a Kubernetes CRD) instead of raw `spark-submit`. It gives you declarative job definitions and integrates cleanly with Airflow or Argo Workflows.

---

### Performance Tuning

**Shuffle tuning** — the default `spark.sql.shuffle.partitions` is 200. On a small dataset that creates 200 tiny partitions; on a massive dataset it creates 200 huge ones. Let Adaptive Query Execution handle it automatically in Spark 3.x:

```python
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
```

**Data skew** — if one key has 90% of your data, one partition gets 90% of the work. That executor runs for ten minutes while the other 99 finish in 30 seconds.

Detect it first:

```python
df.groupBy("join_key").count().orderBy(F.col("count").desc()).show(20)
```

Fix with salting:

```python
# Distribute the heavy key across N buckets
N = 10
df_salted = df.withColumn(
    "salted_key",
    F.concat(F.col("join_key"), F.lit("_"), (F.rand() * N).cast("int").cast("string"))
)
```

**Memory configuration:**

```
spark.executor.memory=8g          # JVM heap
spark.executor.memoryOverhead=2g  # off-heap: native memory, shuffle buffers
spark.memory.fraction=0.6         # fraction of heap for execution + storage
spark.memory.storageFraction=0.5  # fraction of above reserved for caching
```

---

### Spark vs Flink vs Beam

| Dimension | Spark | Flink | Beam |
|---|---|---|---|
| Primary model | Micro-batch streaming / batch | True event-at-a-time streaming | Unified batch + streaming API |
| Latency | Seconds (streaming) | Milliseconds | Depends on runner |
| Maturity | Very high | High | High |
| Ecosystem | Massive | Strong | Moderate |
| SQL support | Excellent | Good | Limited |
| State management | Good (structured streaming) | Excellent | Good |
| When to use | Batch-first, large-scale analytics | Low-latency streaming, complex stateful logic | Portability across runners |

If your primary workload is batch analytics and streaming is secondary, Spark is the right choice. If you need sub-second latency on streaming with complex stateful event processing, look at Flink.

---

### Monitoring — Spark UI and Prometheus

The Spark UI runs at `http://localhost:4040` during local development. In production it's accessible at the driver pod's port 4040.

Key tabs to check:

- **Jobs** — execution timeline; which stages are slow
- **Stages** — task duration distribution; a long tail means skew
- **Storage** — what's cached, how much memory it consumes
- **Environment** — confirms your Spark config is what you think it is
- **SQL** — the physical plan for each query; check for sort-merge joins where you expected broadcast joins

For production monitoring, expose metrics to Prometheus:

```
spark.metrics.conf.*.sink.prometheusServlet.class=org.apache.spark.metrics.sink.PrometheusServlet
spark.metrics.conf.*.sink.prometheusServlet.path=/metrics/prometheus
```

Scrape `http://driver-pod:4040/metrics/prometheus` and build Grafana dashboards from there. Track executor memory usage, shuffle read/write bytes, and task failure rates.

---

## Worked Example — Processing Web Server Logs at Scale

You have 30 days of Nginx access logs in Parquet format in S3, about 2 TB total. You need a daily summary of traffic by endpoint and response class.

```python
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField,
    StringType, LongType, TimestampType, IntegerType
)

spark = (
    SparkSession.builder
    .appName("nginx-log-summary")
    .config("spark.sql.adaptive.enabled", "true")
    .config("spark.sql.adaptive.coalescePartitions.enabled", "true")
    .getOrCreate()
)

schema = StructType([
    StructField("timestamp",   TimestampType(), True),
    StructField("method",      StringType(),    True),
    StructField("path",        StringType(),    True),
    StructField("status_code", IntegerType(),   True),
    StructField("bytes_sent",  LongType(),      True),
    StructField("user_agent",  StringType(),    True),
    StructField("remote_addr", StringType(),    True),
])

logs = (
    spark.read
    .schema(schema)
    .parquet("s3a://your-bucket/nginx-logs/")
    .filter(F.col("date") >= "2025-01-01")   # partition pruning
)

# Normalize endpoint — strip query strings and numeric IDs
def normalize_path(path):
    import re
    if path is None:
        return "unknown"
    path = re.sub(r"/\d+", "/{id}", path)   # replace numeric segments
    path = path.split("?")[0]               # drop query string
    return path.lower()

normalize_udf = F.udf(normalize_path, StringType())

logs_enriched = (
    logs
    .withColumn("date", F.to_date("timestamp"))
    .withColumn("endpoint", normalize_udf(F.col("path")))
    .withColumn(
        "response_class",
        F.when(F.col("status_code") < 300, "2xx")
         .when(F.col("status_code") < 400, "3xx")
         .when(F.col("status_code") < 500, "4xx")
         .otherwise("5xx")
    )
)

daily_summary = (
    logs_enriched
    .groupBy("date", "endpoint", "response_class")
    .agg(
        F.count("*").alias("request_count"),
        F.sum("bytes_sent").alias("total_bytes"),
        F.percentile_approx("bytes_sent", 0.95).alias("p95_bytes"),
    )
    .orderBy("date", "endpoint")
)

(
    daily_summary
    .write
    .mode("overwrite")
    .partitionBy("date")
    .parquet("s3a://your-bucket/nginx-summaries/")
)

spark.stop()
```

Submit to your cluster:

```bash
spark-submit \
  --master k8s://https://k8s-api:6443 \
  --deploy-mode cluster \
  --executor-memory 8g \
  --executor-cores 4 \
  --num-executors 20 \
  --conf spark.sql.adaptive.enabled=true \
  nginx_summary.py
```

---

## Pitfalls

**Calling `collect()` without `limit()`** — you'll move terabytes to your driver and OOM it. Always use `write` or `limit(1000).collect()` for sampling.

**Calling `count()` in a loop** — each call triggers a full scan. Batch your checks or use `describe()`.

**Skipping explicit schema in production** — `inferSchema` does a full pass over your data just to guess types. Define the schema up front.

**Over-partitioning small data** — repartitioning a 1 GB dataset into 200 partitions gives you 5 MB tasks. Spark spends more time on scheduling overhead than computation.

**Joining without checking for skew** — a skewed join will run for hours. Always inspect key distribution before joining on high-cardinality columns.

**Caching everything** — caching consumes executor memory. Cache only DataFrames that are used two or more times. Caching something used once wastes memory and adds write overhead.

**Using Python UDFs when SQL functions exist** — `F.regexp_extract`, `F.to_date`, `F.explode`, `F.from_json` cover a vast surface area. Check built-in functions before writing a UDF.

**Ignoring `spark.sql.shuffle.partitions`** — the default of 200 is wrong for most workloads. On local dev set it to `8`. In production tune it to roughly `data_size_bytes / 128_000_000`.

---

## Quick Reference — PySpark Patterns

```python
# Null handling
df.filter(F.col("x").isNotNull())
df.fillna({"status": "unknown", "bytes": 0})
df.dropna(subset=["user_id", "timestamp"])

# String operations
df.withColumn("domain", F.regexp_extract("email", r"@(.+)$", 1))
df.withColumn("path_lower", F.lower(F.col("path")))
df.filter(F.col("path").startswith("/api/"))

# Date and time
df.withColumn("date", F.to_date("timestamp"))
df.withColumn("hour", F.hour("timestamp"))
df.withColumn("week", F.weekofyear("timestamp"))

# Array columns
df.withColumn("tags_exploded", F.explode("tags"))
df.withColumn("tag_count", F.size("tags"))
df.filter(F.array_contains("tags", "premium"))

# Struct columns
df.select("user.id", "user.email")
df.withColumn("user_id", F.col("user.id"))

# Pivot
df.groupBy("date").pivot("event_type").count()

# Deduplication
df.dropDuplicates(["user_id", "session_id"])
df.select("user_id").distinct().count()

# Combine DataFrames
df1.union(df2)           # by position
df1.unionByName(df2)     # by column name

# Explain the physical plan
df.explain(mode="formatted")
```

---

## Next Steps

You've covered the core of Spark — enough to write production jobs and understand why they slow down when they do. The natural path forward:

- **`DataOps.md`** — the broader discipline this sits inside: pipelines, data quality, orchestration
- **`Airflow.md`** — scheduling and orchestrating Spark jobs in production
- **`Kafka.md`** — the streaming source most Spark Structured Streaming jobs read from
- **`Kubernetes.md`** — the platform your Spark jobs run on; understanding pods and resource management makes you a better Spark operator

---

## Recommended learning resources

**YouTube channels & playlists:**
- [Databricks — Apache Spark](https://www.youtube.com/@Databricks) — Spark Summit talks, performance tuning, Structured Streaming, and Delta Lake integration
- [DataTalksClub — Data Engineering Zoomcamp](https://www.youtube.com/@DataTalksClub) — Spark modules covering batch processing, partitioning, and cluster management
- [Rock the JVM — Spark with Scala](https://www.youtube.com/@rockthejvm) — deep Spark internals: DAGs, stages, shuffles, and catalyst optimizer
- [Seattle Data Guy — Spark Tutorials](https://www.youtube.com/@SeattleDataGuy) — practical PySpark: DataFrames, joins, window functions, and common performance mistakes
- [Bryan Cafferky — PySpark](https://www.youtube.com/results?search_query=bryan+cafferky+pyspark) — beginner-friendly PySpark walkthroughs with real datasets

**Official docs & blogs:**
- [Apache Spark Documentation](https://spark.apache.org/docs/latest/) — programming guides for RDDs, DataFrames, Structured Streaming, and MLlib
- [Databricks Blog](https://www.databricks.com/blog) — Spark performance tuning, Photon engine, and production deployment patterns

---

## The Mantra

**Transformations describe. Actions execute. Shuffles cost. Schema first, collect never, tune after you measure.**

You don't need to memorize every API. You need to understand the execution model — lazy evaluation, partitions as the unit of parallelism, and shuffles as the bottleneck. Everything else is a lookup away.
