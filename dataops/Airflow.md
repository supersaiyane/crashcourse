# Apache Airflow — A 2-Day Crash Course

Airflow is a workflow orchestrator — you define data pipelines as Python code (DAGs), schedule them, monitor them, and retry failures automatically.

---

## Part 0 — Why Airflow Exists

You've probably been here: a cron job runs a bash script at 2 AM, the script silently fails, nobody notices until a stakeholder asks why the dashboard is stale. You add more cron jobs, they start depending on each other implicitly, and now you have a distributed system held together by hope and `sleep 30`.

Cron plus bash gives you none of the following:

- **Dependency management** — task B should not run until task A succeeds
- **Retries with backoff** — if the API returns a 429, try again in 5 minutes
- **Backfills** — run yesterday's pipeline for the last 30 days because requirements changed
- **Visibility** — a single pane of glass showing what ran, what failed, and why
- **Parameterization** — run the same pipeline for different dates, regions, or tenants

Airflow solves all of these. It is not a data transformation engine — it does not move or transform data itself. It orchestrates the tools that do.

---

## Vocabulary

Before you write a single line, internalize these terms. They appear everywhere.

**DAG** (Directed Acyclic Graph) — your pipeline. A Python file that defines tasks and the order they run in. "Acyclic" means no cycles — task A cannot depend on task B if task B depends on task A.

**Task** — one unit of work inside a DAG. A task is an instance of an Operator.

**Operator** — a template for a task. Airflow ships with dozens. The ones you will use constantly:

| Operator | Does |
|---|---|
| `BashOperator` | Runs a shell command |
| `PythonOperator` | Calls a Python function |
| `EmailOperator` | Sends an email |
| `HttpSensor` | Waits until an HTTP endpoint returns 200 |
| `S3KeySensor` | Waits until a file appears in S3 |
| `PostgresOperator` | Runs SQL against Postgres |
| `DockerOperator` | Runs a Docker container |
| `KubernetesPodOperator` | Spins up a Kubernetes pod |

**Sensor** — a special Operator that polls a condition and blocks until it is true. Sensors consume a worker slot while waiting, so set `mode="reschedule"` unless you need tight polling.

**XCom** (Cross-Communication) — a key-value store for passing small data between tasks. Push with `xcom_push`, pull with `xcom_pull`. Keep values small — XComs are stored in the metadata database, not in object storage.

**Connection** — a named credential stored in Airflow (hostname, login, password, port, extras). Your tasks reference a connection by ID, not by hardcoded credentials. Manage connections in the UI or via environment variables (`AIRFLOW_CONN_MY_POSTGRES=...`).

**Pool** — a slot limiter. If you have 100 tasks that all hit the same database, you create a pool with 10 slots and assign those tasks to it. At most 10 run concurrently.

**Executor** — determines how tasks are actually run:

| Executor | When to use |
|---|---|
| `LocalExecutor` | Single machine, development or small workloads |
| `CeleryExecutor` | Multi-worker, Redis or RabbitMQ as broker |
| `KubernetesExecutor` | Each task gets its own pod — strong isolation |
| `CeleryKubernetesExecutor` | Mix of both — some tasks on Celery, some on K8s |

**Scheduler** — the Airflow process that reads your DAG files, creates DagRuns on schedule, and pushes tasks to the executor. It does not execute tasks itself.

**Trigger Rule** — controls when a task runs relative to its upstream tasks. The default is `all_success`. Others: `all_failed`, `one_success`, `none_failed`, `always`.

---


```mermaid
graph LR
    Input[Input] --> Airflow[Airflow]
    Airflow --> Output[Output]
```

## DAY 1 — Getting Running

### Install via Docker Compose

The fastest way to a working Airflow environment is the official Docker Compose file.

```bash
mkdir airflow-local && cd airflow-local

# Download the official compose file (Airflow 2.9)
curl -LfO 'https://airflow.apache.org/docs/apache-airflow/2.9.0/docker-compose.yaml'

# Create the directories Airflow expects
mkdir -p ./dags ./logs ./plugins ./config

# On Linux, set this so the container writes files as your user
echo "AIRFLOW_UID=$(id -u)" > .env

# Initialize the metadata database and create the default admin user
docker compose up airflow-init

# Start everything
docker compose up -d
```

Open `http://localhost:8080`. Username `airflow`, password `airflow`.

The `dags/` directory is volume-mounted into the scheduler and workers. Any `.py` file you drop there is picked up within 30 seconds.

### Your First DAG

Create `dags/hello_world.py`:

```python
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.python import PythonOperator

def say_hello():
    print("Hello from a Python task")

with DAG(
    dag_id="hello_world",
    start_date=datetime(2024, 1, 1),
    schedule="@daily",          # cron or preset: @hourly, @weekly, @monthly, None
    catchup=False,               # do NOT backfill from start_date to today
    default_args={
        "retries": 2,
        "retry_delay": timedelta(minutes=5),
        "owner": "data-team",
    },
    tags=["example"],
) as dag:

    t1 = BashOperator(
        task_id="print_date",
        bash_command="date",
    )

    t2 = PythonOperator(
        task_id="say_hello",
        python_callable=say_hello,
    )

    t1 >> t2   # t1 must succeed before t2 runs
```

Save the file. In the UI, toggle the DAG on and trigger it manually. Watch the Graph view — tasks turn green as they succeed.

### Task Dependencies

Airflow uses bitshift operators to express dependencies:

```python
# Sequential
t1 >> t2 >> t3

# Fan-out: t1 triggers t2 and t3 in parallel
t1 >> [t2, t3]

# Fan-in: both t2 and t3 must succeed before t4
[t2, t3] >> t4

# Equivalent explicit form
t2.set_downstream(t4)
t3.set_downstream(t4)
```

### Schedule Strings

Airflow accepts cron expressions and convenience strings:

```
"@once"          run exactly one time
"@hourly"        0 * * * *
"@daily"         0 0 * * *
"@weekly"        0 0 * * 0
"0 6 * * 1-5"   6 AM Monday through Friday
None             manual trigger only
```

Understand the execution date model: when Airflow runs the DAG scheduled for `2024-01-15`, the `logical_date` is `2024-01-15`, but it does not actually run until the interval ends — `2024-01-16 00:00`. This trips up almost everyone. `catchup=False` sidesteps this for new DAGs.

### XComs

```python
def push_value(**context):
    context["ti"].xcom_push(key="record_count", value=42)

def pull_value(**context):
    count = context["ti"].xcom_pull(task_ids="push_task", key="record_count")
    print(f"Got {count} records")

push_task = PythonOperator(task_id="push_task", python_callable=push_value)
pull_task = PythonOperator(task_id="pull_task", python_callable=pull_value)

push_task >> pull_task
```

⚠️ XComs are not for large data. If you need to pass a dataframe between tasks, write it to S3 or GCS and pass the path via XCom.

### Connections

In the UI: Admin → Connections → Add.

Or via environment variable — Airflow reads `AIRFLOW_CONN_<CONN_ID_UPPERCASE>`:

```bash
# In your .env file
AIRFLOW_CONN_MY_POSTGRES=postgresql://user:password@host:5432/mydb
```

Reference in a task:

```python
from airflow.providers.postgres.operators.postgres import PostgresOperator

run_query = PostgresOperator(
    task_id="run_query",
    postgres_conn_id="my_postgres",
    sql="SELECT COUNT(*) FROM orders WHERE dt = '{{ ds }}'",
)
```

`{{ ds }}` is a Jinja template — Airflow injects the execution date as `YYYY-MM-DD`.

### UI Tour

- **DAGs list** — all DAGs, their schedule, last run status, recent run history
- **Grid view** — execution history as a grid; click any cell to see logs
- **Graph view** — the DAG structure; task state shown by color
- **Gantt view** — execution timeline; useful for spotting bottlenecks
- **Logs** — per-task stdout/stderr; this is where you debug failures
- **Admin → Variables** — key-value store for config (not secrets)
- **Admin → Connections** — credentials
- **Admin → Pools** — concurrency limits

---

## DAY 2 — Production Patterns

### KubernetesExecutor

With `KubernetesExecutor`, each task spins up a fresh pod, runs, and exits. Benefits: complete isolation, no shared state, per-task resource requests, and you can use different Docker images per task.

Configure in `airflow.cfg` or environment:

```ini
[core]
executor = KubernetesExecutor

[kubernetes]
namespace = airflow
worker_container_repository = your-registry/airflow-worker
worker_container_tag = latest
in_cluster = True
```

Per-task resource overrides:

```python
from airflow.providers.cncf.kubernetes.operators.pod import KubernetesPodOperator
from kubernetes.client import models as k8s

heavy_task = KubernetesPodOperator(
    task_id="heavy_task",
    name="heavy-task-pod",
    namespace="airflow",
    image="your-registry/etl-worker:latest",
    cmds=["python", "-m", "etl.heavy_transform"],
    resources=k8s.V1ResourceRequirements(
        requests={"cpu": "500m", "memory": "1Gi"},
        limits={"cpu": "2", "memory": "4Gi"},
    ),
)
```

### Dynamic DAGs

You can generate DAGs programmatically. A common pattern: one DAG per client, or one task per partition.

```python
# dags/dynamic_client_dags.py
from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime

CLIENTS = ["acme", "globex", "initech"]

for client in CLIENTS:
    with DAG(
        dag_id=f"etl_{client}",
        start_date=datetime(2024, 1, 1),
        schedule="@daily",
        catchup=False,
    ) as dag:
        PythonOperator(
            task_id="extract",
            python_callable=lambda c=client: print(f"Extracting {c}"),
        )
    globals()[f"etl_{client}"] = dag
```

⚠️ The `globals()` assignment is required — Airflow's scheduler discovers DAGs by scanning module globals.

### TaskFlow API

The `@task` decorator is cleaner than `PythonOperator` for pure Python tasks. It also handles XComs automatically — return values from one task become inputs to the next.

```python
from airflow.decorators import dag, task
from datetime import datetime

@dag(
    dag_id="taskflow_example",
    start_date=datetime(2024, 1, 1),
    schedule="@daily",
    catchup=False,
)
def taskflow_example():

    @task
    def extract() -> dict:
        return {"count": 100, "source": "api"}

    @task
    def transform(data: dict) -> list:
        return [{"n": i} for i in range(data["count"])]

    @task
    def load(records: list) -> None:
        print(f"Loading {len(records)} records")

    records = transform(extract())
    load(records)

dag_instance = taskflow_example()
```

No `xcom_push` or `xcom_pull` — Airflow handles it. The task graph is inferred from the function calls.

### Sensors

```python
from airflow.sensors.http_sensor import HttpSensor
from airflow.sensors.filesystem import FileSensor

wait_for_api = HttpSensor(
    task_id="wait_for_api",
    http_conn_id="my_api",
    endpoint="/health",
    poke_interval=60,       # check every 60 seconds
    timeout=3600,           # fail after 1 hour
    mode="reschedule",      # release the worker slot between checks
)

wait_for_file = FileSensor(
    task_id="wait_for_file",
    filepath="/data/input/{{ ds }}/data.csv",
    poke_interval=300,
    mode="reschedule",
)
```

Always use `mode="reschedule"` for long waits. `mode="poke"` (the default) holds a worker slot the entire time, which starves other tasks.

### Branching

```python
from airflow.operators.python import BranchPythonOperator
from airflow.operators.empty import EmptyOperator

def choose_branch(**context):
    if context["logical_date"].weekday() < 5:
        return "weekday_task"
    return "weekend_task"

branch = BranchPythonOperator(
    task_id="branch",
    python_callable=choose_branch,
)

weekday_task = EmptyOperator(task_id="weekday_task")
weekend_task = EmptyOperator(task_id="weekend_task")

join = EmptyOperator(
    task_id="join",
    trigger_rule="none_failed_min_one_success",
)

branch >> [weekday_task, weekend_task] >> join
```

The skipped branch gets marked as `skipped`, not `failed`. The join task needs `trigger_rule="none_failed_min_one_success"` or it will also be skipped.

### SubDAGs vs TaskGroups

SubDAGs are the old way to group tasks — they create a nested DAG and have known deadlock issues. Avoid them.

TaskGroups are the replacement — visual grouping only, no separate scheduler state:

```python
from airflow.utils.task_group import TaskGroup

with DAG(...) as dag:

    with TaskGroup("extract", tooltip="Extract from all sources") as extract_group:
        extract_api = PythonOperator(task_id="extract_api", ...)
        extract_db = PythonOperator(task_id="extract_db", ...)

    with TaskGroup("load") as load_group:
        load_warehouse = PythonOperator(task_id="load_warehouse", ...)

    extract_group >> load_group
```

In the UI, TaskGroups collapse into a single node you can expand.

### Testing DAGs

Test at two levels: structure and behavior.

**Structure tests** — do the DAGs parse without error?

```python
# tests/test_dag_integrity.py
import pytest
from airflow.models import DagBag

def test_no_import_errors():
    dag_bag = DagBag(dag_folder="dags/", include_examples=False)
    assert not dag_bag.import_errors, dag_bag.import_errors

def test_dag_task_count():
    dag_bag = DagBag(dag_folder="dags/", include_examples=False)
    dag = dag_bag.get_dag("hello_world")
    assert dag is not None
    assert len(dag.tasks) == 2
```

**Unit tests** — test the Python functions that tasks call:

```python
# tests/test_transform.py
from etl.transform import normalize_record

def test_normalize_record():
    raw = {"Name": "Alice", "Revenue": "1,234.56"}
    result = normalize_record(raw)
    assert result == {"name": "Alice", "revenue": 1234.56}
```

Run DAG-level integration tests against a local SQLite metadata database:

```bash
pytest tests/ -v
airflow dags test hello_world 2024-01-15   # dry-run a full DAG run
airflow tasks test hello_world print_date 2024-01-15  # dry-run one task
```

### Monitoring

Airflow exposes a Prometheus-compatible `/metrics` endpoint when `statsd_on = True` in the config, or via `airflow[statsd]` with a StatsD-to-Prometheus bridge.

Key metrics to alert on:

| Metric | Alert when |
|---|---|
| `airflow_dag_processing_last_runtime` | > 30 seconds (scheduler overloaded) |
| `airflow_ti_failures` | rate > baseline |
| `airflow_pool_open_slots` | near zero (pool exhausted) |
| `airflow_scheduler_heartbeat` | stops incrementing (scheduler dead) |

A Grafana dashboard for Airflow: search for the official Grafana Labs dashboard ID `13643`.

### Airflow vs Dagster vs Prefect

| | Airflow | Dagster | Prefect |
|---|---|---|---|
| **Mental model** | DAG as scheduler | Asset graph + software-defined assets | Flow as function |
| **Learning curve** | Steep (many concepts) | Moderate (assets model is intuitive) | Low |
| **Data awareness** | None — tasks are opaque | First-class — tracks asset lineage | None |
| **Backfill story** | Good — built-in | Excellent — partition-aware | Manual |
| **Ecosystem** | Huge — 800+ providers | Growing | Growing |
| **Kubernetes native** | Yes (KubernetesPodOperator) | Yes | Yes |
| **When to choose** | You need a battle-tested, widely-supported orchestrator | You want asset lineage and type-checked pipelines | You want simplicity and fast setup |

If you are starting fresh and your team is Python-native, Prefect 2 or Dagster are worth evaluating. If you are in a large org with an existing Airflow deployment, learn Airflow deeply — it is going nowhere.

---

## Worked Example — Daily ETL Pipeline

This pipeline extracts orders from an API, normalizes them, loads to a Postgres warehouse, and sends an alert on failure.

```python
# dags/daily_orders_etl.py
from datetime import datetime, timedelta
from airflow.decorators import dag, task
from airflow.providers.postgres.hooks.postgres import PostgresHook
from airflow.providers.http.hooks.http import HttpHook
import json

DEFAULT_ARGS = {
    "retries": 3,
    "retry_delay": timedelta(minutes=10),
    "retry_exponential_backoff": True,
    "on_failure_callback": lambda ctx: notify_on_failure(ctx),
}

def notify_on_failure(context):
    dag_id = context["dag"].dag_id
    task_id = context["task"].task_id
    exec_date = context["logical_date"].isoformat()
    print(f"ALERT: {dag_id}.{task_id} failed at {exec_date}")
    # In production: POST to a Slack webhook or PagerDuty here

@dag(
    dag_id="daily_orders_etl",
    start_date=datetime(2024, 1, 1),
    schedule="0 3 * * *",   # 3 AM daily
    catchup=False,
    default_args=DEFAULT_ARGS,
    tags=["etl", "orders"],
)
def daily_orders_etl():

    @task(retries=3)
    def extract(logical_date=None) -> list:
        hook = HttpHook(http_conn_id="orders_api", method="GET")
        response = hook.run(
            endpoint=f"/orders?date={logical_date.strftime('%Y-%m-%d')}",
        )
        return json.loads(response.text)["orders"]

    @task
    def transform(raw_orders: list) -> list:
        cleaned = []
        for order in raw_orders:
            cleaned.append({
                "order_id": order["id"],
                "customer_id": order["customer"]["id"],
                "total_usd": float(order["total"].replace(",", "")),
                "status": order["status"].lower(),
                "created_at": order["created_at"],   # ISO 8601 string
            })
        return cleaned

    @task
    def load(orders: list) -> int:
        if not orders:
            return 0
        hook = PostgresHook(postgres_conn_id="warehouse")
        rows = [
            (o["order_id"], o["customer_id"], o["total_usd"],
             o["status"], o["created_at"])
            for o in orders
        ]
        hook.insert_rows(
            table="warehouse.orders",
            rows=rows,
            target_fields=["order_id", "customer_id", "total_usd",
                           "status", "created_at"],
            replace=True,
            replace_index="order_id",
        )
        return len(rows)

    @task
    def verify(record_count: int) -> None:
        if record_count == 0:
            raise ValueError("No records loaded — possible upstream issue")
        print(f"Loaded {record_count} orders successfully")

    raw = extract()
    cleaned = transform(raw)
    count = load(cleaned)
    verify(count)

dag_instance = daily_orders_etl()
```

Run a backfill for the last 7 days:

```bash
airflow dags backfill daily_orders_etl \
  --start-date 2024-01-08 \
  --end-date 2024-01-15 \
  --reset-dagruns
```

---

## Pitfalls

**Catchup silently creates hundreds of DagRuns.** If you set `start_date` to six months ago and `catchup=True`, Airflow will queue a run for every schedule interval since then. Always set `catchup=False` on new DAGs unless you explicitly need historical backfills.

**Top-level DAG file code runs in the scheduler process.** If you do expensive work at import time (database queries, HTTP calls), you slow down the scheduler for every DAG. Keep the top level to variable definitions and DAG construction only.

**XComs are stored in the metadata database.** Pushing megabytes of data through XCom is not just slow — it degrades your metadata database over time. Pass file paths or S3 keys, not data.

**`execution_date` is deprecated, use `logical_date`.** In Airflow 2.2+, the preferred name is `logical_date`. Both work, but new code should use the new name.

**Sensor deadlocks under LocalExecutor.** If all your worker slots are occupied by sensors in `poke` mode, no processing tasks can start. Set `mode="reschedule"` on sensors or configure a dedicated sensor pool with limited slots.

**Template fields are Jinja-rendered, not all fields are.** Only fields listed in the Operator's `template_fields` attribute support `{{ ds }}` and friends. If your variable is not rendering, check `template_fields`.

**DAG IDs must be globally unique.** If two files define a DAG with the same ID, the scheduler picks one arbitrarily and may flip between them on restarts.

**Pools block silently.** A task stuck in `queued` state is often waiting for a pool slot. Check Admin → Pools before investigating executor or scheduler issues.

---

## Quick Reference

### CLI Commands

```bash
# List all DAGs
airflow dags list

# Trigger a DAG run manually
airflow dags trigger daily_orders_etl

# Trigger with config
airflow dags trigger daily_orders_etl --conf '{"env": "prod"}'

# Pause / unpause
airflow dags pause daily_orders_etl
airflow dags unpause daily_orders_etl

# Test a single task (no DB write, prints to stdout)
airflow tasks test daily_orders_etl extract 2024-01-15

# Backfill
airflow dags backfill daily_orders_etl -s 2024-01-01 -e 2024-01-31

# Clear (rerun) failed tasks in a date range
airflow tasks clear daily_orders_etl -s 2024-01-15 -e 2024-01-15 --only-failed

# Show task state
airflow tasks states-for-dag-run daily_orders_etl <run_id>

# List connections
airflow connections list

# Add a connection
airflow connections add my_db \
  --conn-type postgres \
  --conn-host localhost \
  --conn-login airflow \
  --conn-password airflow \
  --conn-port 5432 \
  --conn-schema mydb

# Get / set an Airflow variable
airflow variables get MY_VAR
airflow variables set MY_VAR "some-value"
```

### Common Operators

```python
from airflow.operators.bash import BashOperator
from airflow.operators.python import PythonOperator, BranchPythonOperator
from airflow.operators.empty import EmptyOperator
from airflow.operators.trigger_dagrun import TriggerDagRunOperator
from airflow.operators.email import EmailOperator
from airflow.sensors.filesystem import FileSensor
from airflow.sensors.http_sensor import HttpSensor
from airflow.sensors.time_delta import TimeDeltaSensor
from airflow.providers.postgres.operators.postgres import PostgresOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook
from airflow.providers.amazon.aws.operators.s3 import S3CreateObjectOperator
from airflow.providers.amazon.aws.transfers.s3_to_redshift import S3ToRedshiftOperator
from airflow.providers.google.cloud.operators.bigquery import BigQueryInsertJobOperator
from airflow.providers.cncf.kubernetes.operators.pod import KubernetesPodOperator
from airflow.providers.slack.operators.slack_webhook import SlackWebhookOperator
from airflow.providers.http.operators.http import SimpleHttpOperator
from airflow.providers.dbt.cloud.operators.dbt import DbtCloudRunJobOperator
```

### Jinja Template Variables

```
{{ ds }}                  execution date as YYYY-MM-DD
{{ ds_nodash }}           execution date as YYYYMMDD
{{ ts }}                  execution timestamp ISO 8601
{{ logical_date }}        pendulum datetime object
{{ prev_ds }}             previous execution date
{{ next_ds }}             next execution date
{{ dag.dag_id }}          DAG ID string
{{ task.task_id }}        task ID string
{{ run_id }}              unique run ID
{{ params.key }}          value from dag's params dict
{{ var.value.MY_VAR }}    Airflow variable
{{ conn.my_conn.host }}   connection field
```

---



## Quick Quiz

Test your understanding with these rapid-fire questions (answers hidden):

<details>
<summary>1. What is the ONE core problem that Airflow solves?</summary>
Re-read Part 0 — the mental model section. If you can explain the "why" in one sentence, you understand the foundation.
</details>

<details>
<summary>2. Name the 3 most important terms from the vocabulary section.</summary>
Review Part 1. These are the building blocks every conversation about Airflow uses.
</details>

<details>
<summary>3. What is the first thing you would set up on Day 1?</summary>
Check the Day 1 section — the very first hands-on step that gets you a working result.
</details>

<details>
<summary>4. What is the most common production pitfall with Airflow?</summary>
Review the Common Pitfalls section. The first item listed is typically the most frequently encountered.
</details>

<details>
<summary>5. How does Airflow compare to its closest alternative?</summary>
Check the Comparison Matrix below — focus on the key differentiating row.
</details>



## Comparison Matrix

| Dimension | Airflow | Prefect | Dagster |
|-----------|---------|---------|---------|
| **Primary use case** | Core strength of Airflow | Core strength of Prefect | Core strength of Dagster |
| **Learning curve** | Moderate | Varies | Varies |
| **Community/ecosystem** | Active | Active | Growing |
| **Operational complexity** | Medium | Varies | Varies |
| **Best for** | See Part 0 | Different tradeoffs | Different tradeoffs |

> **How to read this matrix:** no tool wins on every dimension. Pick based on your specific constraints — team expertise, existing infrastructure, scale requirements, and compliance needs. The right choice is the one that fits your context, not the one with the most checkmarks.

## Next Steps

- `DataOps.md` — where Airflow fits in the broader DataOps discipline: data contracts, data quality, CI/CD for pipelines, observability
- `Kubernetes.md` — required reading before you put KubernetesExecutor into production; understand pods, namespaces, RBAC, and resource quotas
- `Docker.md` — every Airflow worker image is a Docker image; know how to build, tag, and push worker images reliably
- `Python-for-SRE.md` — Airflow DAGs are Python; know how to write testable, importable Python modules, not just scripts

---

## Recommended learning resources

**YouTube channels & playlists:**
- [Astronomer — Apache Airflow Tutorials](https://www.youtube.com/@astronomerio) — DAG design, TaskFlow API, dynamic task mapping, and production deployment patterns
- [DataTalksClub — Data Engineering Zoomcamp](https://www.youtube.com/@DataTalksClub) — Airflow modules in the context of end-to-end data engineering
- [Marc Lamberti — Airflow Tutorials](https://www.youtube.com/results?search_query=marc+lamberti+airflow) — practical Airflow: XCom, sensors, executors, and common pitfalls
- [coder2j — Apache Airflow](https://www.youtube.com/results?search_query=coder2j+airflow) — beginner-friendly walkthroughs of DAG authoring and operator usage
- [Databricks — Orchestration](https://www.youtube.com/@Databricks) — how Airflow fits into broader data platform orchestration

**Official docs & blogs:**
- [Apache Airflow Documentation](https://airflow.apache.org/docs/) — concepts, operators, executors, and the official tutorial
- [Astronomer Blog](https://www.astronomer.io/blog/) — production Airflow patterns, scaling strategies, and migration guides

---

## The Mantra

> Define it in Python. Schedule it. Let it retry. Read the logs. Backfill with confidence.

You are not gluing cron jobs together anymore. Each task is a node in a graph with explicit dependencies, retry logic, and a full execution history. When something breaks at 3 AM, you do not guess — you open the Grid view, click the red cell, and read the log. That is the point.

---

*Reads: 0/4. Tier reached: PEAK. Lessons added: 0.*

## Top 10 Interview Questions

<details>
<summary><strong>Q: What is a DAG in Airflow and how does it differ from a traditional cron job?</strong></summary>

A DAG (Directed Acyclic Graph) defines task dependencies — task B runs only after task A succeeds. Unlike cron, Airflow handles: dependency management (task ordering), retry logic (automatic retries with backoff), backfilling (run historical dates), monitoring (web UI shows task status, logs, duration), and alerting (email/Slack on failure). A cron job is a single scheduled command; a DAG is an orchestrated workflow with visibility and error handling.

</details>

<details>
<summary><strong>Q: How do you handle task dependencies and data passing between tasks?</strong></summary>

Dependencies are set with >> operator or set_upstream/set_downstream. Data passing uses XCom (cross-communication): tasks push small values to XCom, downstream tasks pull them. For large data, pass file paths or database table names via XCom, not the data itself — XCom is stored in the metadata database and is not designed for large payloads. The TaskFlow API (@task decorator) simplifies this with implicit XCom via function return values.

</details>

<details>
<summary><strong>Q: What are the different executor types and when do you use each?</strong></summary>

SequentialExecutor (development only — runs one task at a time), LocalExecutor (single machine, parallel tasks via processes — small to medium workloads), CeleryExecutor (distributed workers via Celery/Redis/RabbitMQ — production scale), KubernetesExecutor (spins up a pod per task — dynamic scaling, isolation, cloud-native). Choose KubernetesExecutor for: varied resource requirements per task, cost optimisation (scale to zero between runs), and task isolation. CeleryExecutor for: low-latency task startup and persistent workers.

</details>

<details>
<summary><strong>Q: How do you test Airflow DAGs before deploying to production?</strong></summary>

Unit test: validate DAG structure (no import errors, correct dependencies) with dag.test() or pytest. Integration test: run tasks locally against test data. Use airflow dags test CLI command to run a full DAG for a specific date. Test idempotency by running the same date twice — results should be identical. Validate with airflow dags list and check for import errors. In CI: parse all DAGs (catches syntax errors), run structural tests, and optionally run against a staging environment.

</details>

<details>
<summary><strong>Q: How do you handle failures and retries in Airflow?</strong></summary>

Set retries and retry_delay on tasks or DAG defaults. Use retry_exponential_backoff for transient failures. Configure on_failure_callback for custom alerting (Slack, PagerDuty). Use trigger rules: all_success (default), all_failed, one_success, one_failed, none_failed for branching logic. For manual intervention: mark tasks as success/failed in the UI, or clear a task to re-run it and all downstream dependencies. Design tasks to be idempotent so retries are safe.

</details>

<details>
<summary><strong>Q: What is the difference between Airflow, Prefect, and Dagster?</strong></summary>

Airflow: mature, large ecosystem, DAG-as-code, can be complex to operate. Prefect: modern, Pythonic, better local testing, hybrid execution model (cloud orchestration, local execution). Dagster: software-defined assets (data-centric rather than task-centric), strong typing, integrated testing. Choose Airflow for: established teams, large plugin ecosystem, complex scheduling. Prefect for: simpler developer experience, cloud-managed orchestration. Dagster for: data-centric workflows where assets (tables, files) are first-class.

</details>

<details>
<summary><strong>Q: How do you deploy and scale Airflow in production?</strong></summary>

Use the official Helm chart for Kubernetes deployment. Components: webserver (UI), scheduler (DAG parsing and task scheduling), workers (task execution), metadata database (PostgreSQL recommended), and message broker (Redis for CeleryExecutor). Scale workers horizontally based on task queue depth. Use KubernetesExecutor for dynamic scaling. Enable DAG serialization to reduce scheduler memory. Monitor: scheduler heartbeat, task queue length, worker resource usage, and DAG parse time.

</details>

<details>
<summary><strong>Q: How do you manage secrets and connections in Airflow?</strong></summary>

Use Airflow's Connections (Admin > Connections in UI) for database credentials, API keys, and service accounts. Enable a secrets backend (AWS Secrets Manager, Vault, GCP Secret Manager) so secrets are fetched at runtime, not stored in Airflow's metadata DB. Never hardcode secrets in DAG files. Use Variables for non-secret configuration. For Kubernetes deployments, mount secrets as environment variables or use the secrets backend. Rotate credentials without redeploying by updating the secrets backend.

</details>

<details>
<summary><strong>Q: What are sensors in Airflow and when should you use them?</strong></summary>

Sensors are special operators that wait for a condition: FileSensor (file appears), ExternalTaskSensor (another DAG's task completes), HttpSensor (API returns expected response), SqlSensor (query returns rows). Use sensors when your workflow depends on external events. Caveat: sensors occupy a worker slot while waiting — use mode='reschedule' (releases the slot between checks) instead of mode='poke' (holds the slot) for long waits. For very long waits, consider deferrable operators (async, no worker slot used).

</details>

<details>
<summary><strong>Q: How do you implement data quality checks in Airflow pipelines?</strong></summary>

Add validation tasks after data loading: use SQL checks (row counts, null checks, uniqueness), Great Expectations integration (schema validation, statistical tests), or custom Python operators that assert data quality rules. Fail the DAG if quality checks fail — this prevents bad data from propagating downstream. Use Airflow's BranchPythonOperator to route to different paths based on quality results (alert vs continue). Track quality metrics over time in a dedicated dashboard.

</details>

---

