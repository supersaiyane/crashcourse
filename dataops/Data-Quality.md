# Data Quality — A 2-Day Crash Course

Data quality is the practice of validating, monitoring, and enforcing that your data meets expectations — because wrong data is worse than no data.

---

## Part 0 — Why This Matters

Garbage in, garbage out. You've heard it. Here's what it actually looks like in production:

- A dashboard shows revenue up 40% — because a pipeline duplicated rows.
- An ML model recommends the wrong products — because a join silently dropped nulls.
- A compliance audit fails — because PII fields were populated inconsistently across regions.
- An on-call engineer gets paged at 2 AM — because no one noticed a source table went stale three days ago.

Bad data doesn't announce itself. It hides in joins, silently corrupts aggregates, and only surfaces when a stakeholder asks an uncomfortable question in a meeting. By then, the damage is done — trust is broken, decisions have already been made on wrong numbers, and you're doing archaeology instead of engineering.

The fix isn't heroics after the fact. It's treating data quality as a first-class concern — with the same rigor you apply to code: automated checks, contracts, monitoring, and alerts.

---

## Vocabulary

**Expectation** — a testable assertion about your data. "Column `user_id` is never null." "Column `price` is between 0 and 10,000." These are the atomic units of data quality.

**Validation** — the act of running expectations against actual data and recording pass/fail results.

**Data Contract** — a formal agreement between a data producer and consumer about schema, semantics, freshness, and SLAs. Think of it as an API contract, but for datasets.

**Freshness** — how recently data was updated. A table that should update hourly but hasn't in six hours is a quality failure even if all its rows are technically valid.

**Completeness** — the proportion of expected records or fields that are actually present. A 30% null rate in a required column is a completeness failure.

**Accuracy** — whether values reflect reality. Harder to test automatically — usually requires cross-referencing a source of truth or applying domain rules.

**Consistency** — the same fact represented the same way across systems and time. If `status = 'active'` in one table and `status = 1` in another, you have a consistency problem.

**Schema Validation** — asserting that a dataset has the expected columns, types, and structure — and alerting when it drifts.

**Anomaly Detection** — statistical or ML-based detection of values or distributions that fall outside normal ranges, without requiring you to hardcode every threshold.

**Great Expectations (GX)** — the most widely adopted open-source data quality framework. You define expectations in Python, run them against your data, and get structured pass/fail results with optional HTML reports.

**SLA for Data** — a service-level agreement applied to a dataset: "this table will be updated by 08:00 UTC daily with 99.5% completeness and zero schema drift."

---

## DAY 1 — The Foundations

### The Six Dimensions of Data Quality

You can't improve what you can't measure. Use these six dimensions as a diagnostic checklist for any dataset:

| Dimension | Question to ask | Example failure |
|---|---|---|
| Completeness | Are all expected values present? | 20% nulls in `email` |
| Accuracy | Do values reflect reality? | `age = -5` |
| Consistency | Is the same fact represented the same way everywhere? | `US` vs `United States` vs `usa` |
| Timeliness / Freshness | Is the data recent enough to be useful? | Orders table last updated 9 hours ago |
| Uniqueness | Are there unexpected duplicates? | Duplicate `order_id` rows |
| Validity | Do values conform to expected formats and ranges? | `phone = 'abc123'` |

When you encounter a data quality issue, start by classifying which dimension it belongs to. That tells you what kind of test to write.

### Setting Up Great Expectations

Great Expectations runs wherever Python runs — locally, in Airflow, in dbt, in CI.

```bash
pip install great_expectations
great_expectations init
```

This creates a `great_expectations/` directory with:

```
great_expectations/
  great_expectations.yml      # project config
  expectations/               # expectation suites (JSON)
  checkpoints/                # named validation runs
  uncommitted/
    data_docs/                # generated HTML reports
```

Connect a datasource — here, a Pandas DataFrame backed by a CSV, but the same pattern works for Postgres, Snowflake, Spark:

```python
import great_expectations as gx

context = gx.get_context()

datasource = context.sources.add_pandas("my_datasource")
asset = datasource.add_csv_asset("orders", filepath_or_buffer="orders.csv")
batch_request = asset.build_batch_request()
```

### Writing Expectations

Expectations are the core primitive. Learn these first — they cover 80% of real-world cases.

```python
validator = context.get_validator(
    batch_request=batch_request,
    expectation_suite_name="orders.basic"
)

# Column must not contain nulls
validator.expect_column_values_to_not_be_null("order_id")

# Values must be unique
validator.expect_column_values_to_be_unique("order_id")

# Numeric range
validator.expect_column_values_to_be_between(
    "total_amount", min_value=0, max_value=100_000
)

# Regex match — e.g. ISO date format
validator.expect_column_values_to_match_regex(
    "created_at", r"^\d{4}-\d{2}-\d{2}$"
)

# Column must exist
validator.expect_column_to_exist("customer_id")

# Set membership
validator.expect_column_values_to_be_in_set(
    "status", ["pending", "completed", "cancelled", "refunded"]
)

# Row count within expected range
validator.expect_table_row_count_to_be_between(
    min_value=1000, max_value=10_000_000
)

# Column type
validator.expect_column_values_to_be_of_type("total_amount", "float")

validator.save_expectation_suite()
```

### Validation in Pipelines

A checkpoint ties a batch of data to an expectation suite and records the result:

```python
checkpoint = context.add_or_update_checkpoint(
    name="orders_daily_checkpoint",
    validations=[
        {
            "batch_request": batch_request,
            "expectation_suite_name": "orders.basic",
        }
    ],
)

result = checkpoint.run()

if not result["success"]:
    raise ValueError("Data quality validation failed — halting pipeline.")
```

Run this inside your Airflow DAG, dbt post-hook, or CI step. If it fails, the pipeline stops. Downstream consumers never see bad data.

### Data Docs

After running a checkpoint, generate human-readable HTML reports:

```bash
great_expectations docs build
```

Open `great_expectations/uncommitted/data_docs/local_site/index.html`. You get a full audit trail — every expectation, every run, pass/fail with the percentage of failing rows. Share this with stakeholders who don't write code. It becomes your data quality paper trail.

---

## DAY 2 — Production-Grade Quality

### Data Contracts Between Teams

A data contract is a schema file plus a set of commitments. The producer owns it; the consumer depends on it. When the producer wants to change the schema, they update the contract — and every consumer that breaks gets notified before the change ships.

A minimal contract in YAML:

```yaml
# contracts/orders_v1.yaml
dataset: orders
owner: data-platform-team
sla:
  freshness_max_hours: 4
  completeness_min_pct: 99.5
schema:
  - name: order_id
    type: string
    nullable: false
    unique: true
  - name: customer_id
    type: string
    nullable: false
  - name: total_amount
    type: float
    nullable: false
    min: 0
  - name: status
    type: string
    values: [pending, completed, cancelled, refunded]
  - name: created_at
    type: timestamp
    nullable: false
```

Store contracts in version control alongside the pipeline code. Run contract validation in CI. Tools like `soda-core`, `dbt tests`, or custom Great Expectations suites can enforce contracts at ingestion time.

### Schema Evolution Testing

Schemas change. The question isn't whether — it's whether the change breaks downstream consumers.

Three categories of schema change:

- **Backward-compatible** — adding a nullable column. Consumers that don't read it are unaffected.
- **Breaking** — renaming or dropping a column, changing a type from string to int, making a nullable column non-nullable.
- **Subtle-breaking** — changing the semantics of a column without changing its name or type. The hardest to catch.

Test for breaking changes in CI:

```python
# compare current schema against the contract
import pandas as pd
import yaml

df = pd.read_parquet("orders.parquet")
contract = yaml.safe_load(open("contracts/orders_v1.yaml"))

contract_cols = {c["name"]: c for c in contract["schema"]}

for col in contract_cols:
    assert col in df.columns, f"Missing column: {col}"

for col, spec in contract_cols.items():
    if not spec.get("nullable", True):
        assert df[col].isnull().sum() == 0, f"Unexpected nulls in {col}"
```

Run this in your CI pipeline against a sample of production data or a staging snapshot. Fail the build if the contract is violated.

### Freshness Monitoring

Freshness is the easiest quality dimension to monitor and the most often ignored.

In dbt, you get freshness checks for free:

```yaml
# models/sources.yml
sources:
  - name: raw
    tables:
      - name: orders
        loaded_at_field: _etl_loaded_at
        freshness:
          warn_after: {count: 2, period: hour}
          error_after: {count: 6, period: hour}
```

Run `dbt source freshness` in your pipeline. If `_etl_loaded_at` is more than 6 hours ago, dbt errors. Add this step before your transformations run — no point transforming stale data.

For non-dbt pipelines, check a watermark table:

```sql
SELECT
  MAX(created_at)                                          AS latest_record,
  EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) / 3600    AS hours_stale
FROM orders;
```

If `hours_stale > threshold`, send an alert and halt the downstream pipeline.

### Anomaly Detection

Hardcoded thresholds break when business reality changes. Anomaly detection adapts.

The simplest approach — Z-score on a rolling window:

```python
import pandas as pd
import numpy as np

# daily row counts for the last 90 days
df = pd.read_sql(
    "SELECT date, COUNT(*) as cnt FROM orders GROUP BY date ORDER BY date",
    conn
)

window = 30
df["rolling_mean"] = df["cnt"].rolling(window).mean()
df["rolling_std"]  = df["cnt"].rolling(window).std()
df["z_score"]      = (df["cnt"] - df["rolling_mean"]) / df["rolling_std"]

anomalies = df[df["z_score"].abs() > 3]
if not anomalies.empty:
    alert(f"Row count anomaly detected: {anomalies.tail(1).to_dict('records')}")
```

⚠️ Z-score assumes roughly normal distribution. For highly seasonal data — e.g. e-commerce spiking on weekends — use a day-of-week aware baseline or a proper time-series model.

Monte Carlo, Anomalo, and elementary automate this at scale. They learn normal patterns from your data warehouse and alert on deviations without you writing thresholds manually.

### CI/CD for Data Tests

Data tests belong in CI, not just in scheduled pipeline runs.

In a GitHub Actions workflow:

```yaml
name: Data Quality CI

on: [pull_request]

jobs:
  data-quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: pip install great_expectations soda-core-postgres

      - name: Run schema contract validation
        run: python scripts/validate_contract.py

      - name: Run Great Expectations checkpoint
        run: python scripts/run_gx_checkpoint.py

      - name: Run dbt tests
        run: dbt test --target ci
```

Every PR that touches a pipeline, a model, or a schema contract runs the full quality suite before merge. Catch regressions before they reach production.

### Soda vs GX vs Monte Carlo vs elementary

| Tool | Type | Best for | Cost |
|---|---|---|---|
| Great Expectations | Open source | Flexible, code-first pipelines | Free |
| Soda Core | Open source + cloud | Declarative YAML checks, SaaS UI | Free / paid cloud |
| Monte Carlo | SaaS | Automated anomaly detection at warehouse scale | Paid |
| elementary | Open source, dbt-native | dbt projects wanting observability out of the box | Free / paid cloud |

Choose GX if you want maximum control and are comfortable with Python. Choose Soda Core if you want YAML-driven checks and a managed SaaS layer. Choose elementary if you're already on dbt and want table health reports with zero extra tooling. Choose Monte Carlo if you have a large warehouse, a budget, and want ML-driven anomaly detection without building it yourself.

### Alerting on Quality Failures

A quality failure that nobody sees is no better than no monitoring at all. Wire your validations to alerts.

In Python, a minimal Slack alert on checkpoint failure:

```python
import os
import requests

def alert_slack(message: str, webhook_url: str) -> None:
    requests.post(webhook_url, json={"text": message})

result = checkpoint.run()
if not result["success"]:
    stats = result.get_statistics()
    msg = (
        f"⚠️ Data quality failure on `orders.basic`\n"
        f"Failed expectations: {stats['unsuccessful_expectations']}\n"
        f"Run time: {stats['run_time']}"
    )
    alert_slack(msg, webhook_url=os.environ["SLACK_WEBHOOK_URL"])
    raise ValueError("Pipeline halted due to quality failure.")
```

For production, route alerts through PagerDuty or your incident management system for SLA-breaching failures. Use Slack for warnings. Don't alert on everything — alert fatigue is real, and once people start ignoring pages, you've lost the safety net.

### Data Quality SLAs

An SLA without a measurement system is a wish. Define SLAs in terms you can actually measure:

```yaml
sla:
  freshness_max_hours: 4          # measured by watermark check
  completeness_min_pct: 99.5      # measured by null rate checks
  schema_drift: false             # measured by contract validation
  anomaly_threshold_z: 3.0        # measured by rolling z-score
  availability_target: 99.9%      # measured by pipeline success rate
```

Track SLA compliance over time in a metrics table. Review it weekly. When you miss an SLA, treat it like a production incident — write a postmortem, find the root cause, add a test that would have caught it earlier.

---

## Worked Example — Data Quality Gates in an ETL Pipeline

You're ingesting raw orders from an upstream API, transforming them, and loading into a warehouse. Here's what a quality-gated pipeline looks like end to end:

```python
import great_expectations as gx
import pandas as pd

def extract() -> pd.DataFrame:
    return pd.read_json("https://api.example.com/orders")

def validate_raw(df: pd.DataFrame) -> None:
    context = gx.get_context()
    datasource = context.sources.add_or_update_pandas("raw_orders")
    asset = datasource.add_dataframe_asset("raw")
    batch_request = asset.build_batch_request(dataframe=df)

    validator = context.get_validator(
        batch_request=batch_request,
        expectation_suite_name="raw_orders.ingestion"
    )
    validator.expect_column_values_to_not_be_null("order_id")
    validator.expect_column_values_to_be_unique("order_id")
    validator.expect_column_values_to_be_between("amount", 0, 1_000_000)
    validator.expect_column_values_to_not_be_null("customer_id")
    validator.save_expectation_suite(discard_failed_expectations=False)

    result = context.run_checkpoint(
        checkpoint_name="raw_orders_gate",
        validations=[{
            "batch_request": batch_request,
            "expectation_suite_name": "raw_orders.ingestion"
        }]
    )
    if not result["success"]:
        raise ValueError("Raw data failed quality gate — aborting ETL.")

def transform(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["amount_usd"]   = df["amount"] / 100
    df["created_date"] = pd.to_datetime(df["created_at"]).dt.date
    return df

def validate_transformed(df: pd.DataFrame) -> None:
    assert df["amount_usd"].between(0, 10_000).all(), \
        "Transformed amounts out of range"
    assert df["created_date"].notnull().all(), \
        "Null dates after transform"

def load(df: pd.DataFrame) -> None:
    df.to_sql("orders_clean", con=engine, if_exists="append", index=False)

def run_pipeline() -> None:
    raw = extract()
    validate_raw(raw)                  # gate 1 — fail fast on bad source data
    transformed = transform(raw)
    validate_transformed(transformed)  # gate 2 — fail fast before loading
    load(transformed)
    print("Pipeline complete.")
```

Two gates. If either fails, the pipeline stops and nothing lands in the warehouse. Downstream dashboards and models never see corrupted data. The cost of the checks is milliseconds; the cost of skipping them is a midnight page and a week of trust repair.

---

## Pitfalls

**Testing only the happy path.** You write `not_null` checks but forget to test that the row count is reasonable. An upstream table that sends 10 rows instead of 10,000 passes your null checks just fine — and silently starves every downstream model.

**Ignoring freshness.** Schema and value checks pass, but the data is three days old. Freshness is a dimension of quality — monitor it explicitly, not as an afterthought.

**Alerting on everything.** If every minor anomaly pages someone, people start ignoring alerts. Tier your alerts: warnings for soft thresholds, pages for SLA breaches. Silence is not safety; noise is not safety either.

**Defining expectations against bad data.** If you profile a column that's currently 30% null and use the observed state as the baseline expectation — you've documented the problem, not set a standard. Define expectations against what the data *should* be, not what it currently is.

**No ownership.** Data quality checks without a named owner are orphans. Someone needs to be responsible for reviewing failures, updating expectations as the business changes, and holding upstream teams to their contracts.

**Skipping contract negotiation.** A data contract you write unilaterally and force on a producer is a recipe for conflict. Contracts work when both sides agree — producer commits to the schema, consumer agrees to handle changes via versioning, not surprise breaks.

**Treating data quality as a one-time project.** Business rules change, schemas evolve, source systems are replaced. Quality monitoring is maintenance work — budget for it the same way you budget for dependency upgrades.

---

## Quick Reference

```bash
# Great Expectations — init and scaffold
great_expectations init
great_expectations suite new

# Run a named checkpoint
great_expectations checkpoint run <checkpoint_name>

# Build data docs
great_expectations docs build

# dbt — run all tests
dbt test

# dbt — test a specific model
dbt test --select orders

# dbt — check source freshness
dbt source freshness

# Soda Core — run checks file
soda scan -d my_datasource -c checks.yaml

# elementary — generate observability report
edr report
```

Common GX expectations at a glance:

| Expectation | What it checks |
|---|---|
| `expect_column_values_to_not_be_null` | No nulls in column |
| `expect_column_values_to_be_unique` | No duplicates |
| `expect_column_values_to_be_between` | Numeric range |
| `expect_column_values_to_match_regex` | Regex pattern match |
| `expect_column_values_to_be_in_set` | Allowed value set |
| `expect_column_to_exist` | Column present in schema |
| `expect_table_row_count_to_be_between` | Row count range |
| `expect_column_values_to_be_of_type` | Column data type |
| `expect_column_mean_to_be_between` | Mean within range |
| `expect_column_proportion_of_unique_values_to_be_between` | Cardinality range |

---

## Next Steps

You now have the foundations. Go deeper in these directions:

- **`DataOps.md`** — the broader practice of applying DevOps principles to data pipelines: CI/CD, observability, and collaboration between data engineers and consumers.
- **`dbt.md`** — dbt has a built-in test framework that covers most of what GX does, natively, in SQL. If you're already on dbt, start there before reaching for GX.
- **`Airflow.md`** — learn how to wire quality gates into DAG tasks so a validation failure halts the entire run and triggers an alert downstream.
- **`PostgreSQL.md`** — understand the database-level constraints (NOT NULL, UNIQUE, CHECK, FOREIGN KEY) that enforce quality at the storage layer — before your pipeline even runs.

---

## Recommended learning resources

**YouTube channels & playlists:**
- [DataTalksClub — Data Quality](https://www.youtube.com/@DataTalksClub) — data validation, testing strategies, and quality frameworks in the modern data stack
- [dbt Labs — Testing and Data Quality](https://www.youtube.com/@daborsen) — built-in dbt tests, custom generic tests, and data contracts
- [Seattle Data Guy — Data Quality Engineering](https://www.youtube.com/@SeattleDataGuy) — practical data quality: profiling, anomaly detection, and pipeline validation
- [Great Expectations — Tutorials](https://www.youtube.com/results?search_query=great+expectations+data+quality) — expectation suites, data docs, and checkpoint workflows
- [Astronomer — Data Quality in Pipelines](https://www.youtube.com/@astronomerio) — wiring quality gates into Airflow DAGs

**Official docs & blogs:**
- [Great Expectations Documentation](https://docs.greatexpectations.io/) — expectations, data sources, checkpoints, and the validation workflow
- [dbt Documentation — Tests](https://docs.getdbt.com/docs/build/data-tests) — schema tests, data tests, and how to enforce contracts at transformation time

---

## The Mantra

> Validate at the boundary. Contract before you consume. Alert before the stakeholder does.
