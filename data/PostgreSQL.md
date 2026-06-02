# PostgreSQL — A 2-Day Crash Course

> **In one sentence:** PostgreSQL is the most advanced open-source relational database — it's the workhorse behind most production systems you'll encounter, and knowing how to operate it (not just query it) is a core SRE skill. Prerequisite: basic SQL familiarity.

---

## Part 0 — Why PostgreSQL exists

Data has three non-negotiable requirements: it must survive a crash, it must stay consistent even when multiple things write at once, and it must be queryable in arbitrary ways. Files, object stores, and caches handle some of these, but none handle all three. That's the gap PostgreSQL fills.

The design reflects this directly. Every write goes first to the **Write-Ahead Log (WAL)** — a sequential, append-only journal on disk — before the actual data pages are modified. If the server dies mid-write, recovery replays the WAL. Your data doesn't vanish.

Concurrent access is handled by **Multi-Version Concurrency Control (MVCC)**. Every row stores the transaction IDs that created and deleted it. When a reader starts a query, it sees a snapshot of the database as it was at that moment. Writers create new row versions; they don't overwrite in place. Readers never wait for writers. Writers never block readers. Locks are taken only for conflicting writes — the common read-heavy workload pays almost no contention cost.

**ACID** is the umbrella guarantee: Atomicity (a transaction either fully commits or fully rolls back), Consistency (constraints and triggers always hold), Isolation (concurrent transactions don't see each other's partial work), Durability (committed data survives crashes). Postgres enforces all four.

**Mental model:** Postgres is a fortress for structured data — WAL is the audit trail that makes it crash-proof, MVCC is the concurrency mechanism that makes it fast under mixed load, and ACID is the contract it keeps with every application that trusts it.

---


```mermaid
graph LR
    Client[Client] --> ConnPool[Connection Pool]
    ConnPool --> Postgres[PostgreSQL Server]
    Postgres --> WAL[Write-Ahead Log]
    WAL --> Replica[(Streaming Replica)]
    Postgres --> SharedBuf[Shared Buffers]
    SharedBuf --> Disk[(Data Files)]
    Postgres --> Vacuum[Autovacuum]
    Postgres --> Stats[Statistics Collector]
    Stats --> Planner[Query Planner]
```

## Part 1 — The vocabulary

Before you touch commands, get these concepts anchored. You'll see them repeatedly.

**Database / Schema / Table** — A Postgres *cluster* is one running server process managing multiple *databases*. Inside a database, *schemas* are namespaces (think folders). Tables live inside schemas. The default schema is `public`. You connect to one database at a time; cross-database queries require foreign data wrappers or application-side logic.

**WAL (Write-Ahead Log)** — The sequential journal described above. Location: `$PGDATA/pg_wal/`. WAL segments are 16 MB by default. They are also the foundation of replication — standbys consume the primary's WAL stream to stay in sync.

**MVCC (Multi-Version Concurrency Control)** — Postgres never updates a row in place. An `UPDATE` writes a new row version and marks the old one as dead. This means old versions accumulate — hence the need for VACUUM.

**VACUUM** — The housekeeping process that removes dead row versions, reclaims space, and updates the visibility map. Without regular vacuuming, tables bloat and query plans degrade. `autovacuum` runs this automatically but needs tuning for write-heavy tables.

**Index** — A separate on-disk structure that lets Postgres find rows without scanning the whole table. Types you'll use most: `B-tree` (default, good for equality and range queries), `GIN` (inverted index, good for arrays, JSONB, and full-text search), `GiST` (generalized search tree, good for geometric and custom types). Indexes speed reads and slow writes — add them deliberately.

**Replication (streaming / logical)** — *Streaming replication* ships WAL segments from primary to standby in near-real-time; the standby replays them and stays a byte-for-byte copy. *Logical replication* decodes WAL into row-level change events — useful for selective replication or cross-version upgrades.

**pg_dump / pg_restore** — Logical backup and restore. `pg_dump` exports a database as SQL or custom-format binary. `pg_restore` loads it back. Does not require downtime. Not a substitute for point-in-time recovery — it captures a snapshot, not continuous WAL history.

**Connection Pooling** — Postgres spawns one OS process per connection. At 200+ concurrent connections you're burning RAM and CPU on process overhead. A connection pooler (PgBouncer) sits in front of Postgres, multiplexing many application connections onto a small pool of real backend connections.

**EXPLAIN** — The query planner's output: a tree of nodes describing how Postgres intends to execute a query. `EXPLAIN ANALYZE` actually runs the query and shows real timing and row counts next to the estimates. This is your primary debugging tool for slow queries.

---

## DAY 1 — Operate it

### 1. Install and start

On Ubuntu/Debian:

```bash
sudo apt update && sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo systemctl status postgresql
```

The data directory defaults to `/var/lib/postgresql/<version>/main`. The config files live there: `postgresql.conf`, `pg_hba.conf`, `pg_ident.conf`. See `Linux.md` for systemd service management patterns.

### 2. psql basics

`psql` is the interactive terminal. You'll live here.

```bash
# Connect as the postgres OS user (default superuser)
sudo -u postgres psql

# Connect to a specific database as a specific user
psql -h 127.0.0.1 -U myuser -d mydb

# Connect with a URI
psql "postgresql://myuser:mypassword@localhost:5432/mydb"
```

Inside `psql`, backslash commands control the client:

```
\l          -- list databases
\c mydb     -- connect to database
\dt         -- list tables in current schema
\d mytable  -- describe table structure
\dn         -- list schemas
\du         -- list roles
\timing     -- toggle query timing
\x          -- toggle expanded output (useful for wide rows)
\q          -- quit
```

### 3. Create a database, user, and table

```sql
-- As superuser
CREATE USER appuser WITH PASSWORD 'strongpassword';
CREATE DATABASE appdb OWNER appuser;

-- Connect to the new database
\c appdb

-- Create schema and table
CREATE SCHEMA app;

CREATE TABLE app.orders (
    id          BIGSERIAL PRIMARY KEY,
    customer_id BIGINT      NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'pending',
    total_cents INT         NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT USAGE ON SCHEMA app TO appuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO appuser;
```

### 4. CRUD

```sql
-- Insert
INSERT INTO app.orders (customer_id, status, total_cents)
VALUES (42, 'pending', 1999);

-- Read
SELECT id, status, total_cents FROM app.orders WHERE customer_id = 42;

-- Update
UPDATE app.orders SET status = 'shipped' WHERE id = 1;

-- Delete
DELETE FROM app.orders WHERE id = 1;

-- Upsert (insert or update on conflict)
INSERT INTO app.orders (id, customer_id, status, total_cents)
VALUES (1, 42, 'pending', 1999)
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;
```

### 5. Basic indexing

```sql
-- B-tree index on a frequently filtered column
CREATE INDEX idx_orders_customer_id ON app.orders (customer_id);

-- Partial index — only index rows matching a condition
CREATE INDEX idx_orders_pending ON app.orders (created_at)
WHERE status = 'pending';

-- Check index usage
SELECT indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE relname = 'orders';
```

### 6. Logical backup with pg_dump

```bash
# Custom-format backup (compressed, supports parallel restore)
pg_dump -U appuser -d appdb -Fc -f /backups/appdb_$(date +%Y%m%d).dump

# Plain SQL backup
pg_dump -U appuser -d appdb -Fp -f /backups/appdb_$(date +%Y%m%d).sql

# Restore from custom format
pg_restore -U appuser -d appdb_restore -Fc /backups/appdb_20240101.dump
```

### 7. Reading logs

Postgres logs go to `/var/log/postgresql/` on Debian-based systems, or to `$PGDATA/log/`. Key things to grep for:

```bash
# Slow queries (requires log_min_duration_statement to be set)
grep "duration:" /var/log/postgresql/postgresql-*.log | sort -t= -k2 -rn | head -20

# Connection errors
grep "FATAL\|ERROR" /var/log/postgresql/postgresql-*.log | tail -50

# Lock waits
grep "lock" /var/log/postgresql/postgresql-*.log
```

Enable slow query logging in `postgresql.conf`:

```
log_min_duration_statement = 1000   # log queries taking > 1s
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
```

### 8. Connection management

```sql
-- See current connections
SELECT pid, usename, application_name, client_addr, state, query_start
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start;

-- Kill a specific connection
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = 12345;

-- Kill all connections to a database (before drop/restore)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'appdb' AND pid <> pg_backend_pid();
```

**By end of Day 1 you can:** install Postgres, connect with psql, create databases and users, run CRUD, add basic indexes, take a logical backup, and diagnose connections and slow queries from logs.

---

## DAY 2 — Make it real

### 1. EXPLAIN ANALYZE — reading query plans

`EXPLAIN` shows estimates. `EXPLAIN ANALYZE` shows reality. Always use `ANALYZE` when debugging — estimates lie.

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM app.orders WHERE customer_id = 42 AND status = 'pending';
```

Key things to look at in the output:

- **Seq Scan** — full table scan. Usually bad on large tables. Means no usable index.
- **Index Scan** — found an index. Good.
- **Index Only Scan** — all needed columns are in the index (covering index). Very good.
- **rows=X (actual rows=Y)** — if X and Y differ by orders of magnitude, statistics are stale. Run `ANALYZE tablename`.
- **Buffers: shared hit=X read=Y** — `hit` is cache, `read` is disk. High `read` means working set exceeds `shared_buffers`.
- **Nested Loop / Hash Join / Merge Join** — join strategies. Hash join is often fastest for large sets but requires memory.

Wrap destructive statements in a transaction and roll back:

```sql
BEGIN;
EXPLAIN ANALYZE DELETE FROM app.orders WHERE customer_id = 99;
ROLLBACK;
```

### 2. Indexing strategy

The cost of an index is paid on every write. Add indexes for columns that appear in `WHERE`, `JOIN ON`, `ORDER BY`, or `GROUP BY` clauses — and only when the table is large enough that a seq scan is measurably slow.

```sql
-- Composite index: column order matters — put the most selective column first
CREATE INDEX idx_orders_customer_status ON app.orders (customer_id, status);

-- Covering index: include extra columns to enable index-only scans
CREATE INDEX idx_orders_customer_covering
ON app.orders (customer_id) INCLUDE (status, total_cents);

-- GIN index for JSONB
ALTER TABLE app.orders ADD COLUMN metadata JSONB;
CREATE INDEX idx_orders_metadata ON app.orders USING GIN (metadata);

-- Check for unused indexes (waste write overhead with no read benefit)
SELECT indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND indexrelname NOT LIKE '%_pkey';
```

⚠️ Foreign key columns are not automatically indexed. A missing index on a foreign key causes sequential scans on every join and on every delete from the parent table.

### 3. VACUUM and autovacuum tuning

MVCC dead rows accumulate until VACUUM removes them. Autovacuum runs in the background but defaults are conservative for write-heavy tables.

```sql
-- Manual vacuum (non-blocking)
VACUUM VERBOSE app.orders;

-- VACUUM FULL reclaims disk space but takes an exclusive lock — avoid in production
VACUUM FULL app.orders;  -- use only during maintenance windows

-- Check table bloat and autovacuum stats
SELECT relname, n_dead_tup, n_live_tup, last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;
```

For high-write tables, lower the autovacuum thresholds per-table:

```sql
ALTER TABLE app.orders SET (
    autovacuum_vacuum_scale_factor = 0.01,   -- vacuum when 1% of rows are dead
    autovacuum_analyze_scale_factor = 0.005
);
```

### 4. Streaming replication and failover

Streaming replication ships WAL from primary to standby continuously. The standby runs in recovery mode, replaying WAL as it arrives.

On the primary, in `postgresql.conf`:

```
wal_level = replica
max_wal_senders = 5
wal_keep_size = 1GB
```

Create a replication user:

```sql
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'replpass';
```

Allow it in `pg_hba.conf`:

```
host  replication  replicator  standby-ip/32  scram-sha-256
```

Monitor replication lag from the primary:

```sql
SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn,
       (sent_lsn - replay_lsn) AS lag_bytes
FROM pg_stat_replication;
```

### 5. Connection pooling with PgBouncer

PgBouncer is a lightweight proxy. Install it on the application tier or on the database host. Configuration in `pgbouncer.ini`:

```ini
[databases]
appdb = host=127.0.0.1 port=5432 dbname=appdb

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction          ; transaction pooling is most efficient
max_client_conn = 1000
default_pool_size = 20
min_pool_size = 5
reserve_pool_size = 5
server_idle_timeout = 600
log_connections = 0
log_disconnections = 0
```

`transaction` pool mode releases the server connection back to the pool after each transaction completes. Your application connects to port 6432 instead of 5432. See `Docker.md` for running PgBouncer as a sidecar container.

⚠️ `transaction` pool mode breaks prepared statements and advisory locks. Use `session` mode if your application relies on either.

### 6. Monitoring with pg_stat views

```sql
-- Active queries and their duration
SELECT pid, now() - query_start AS duration, state, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC;

-- Table-level statistics: reads, writes, seq scans
SELECT relname, seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup
FROM pg_stat_user_tables
ORDER BY seq_scan DESC;

-- Cache hit ratio (should be > 99% for OLTP)
SELECT sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) AS cache_hit_ratio
FROM pg_statio_user_tables;

-- Lock waits
SELECT pid, locktype, relation::regclass, mode, granted
FROM pg_locks
WHERE NOT granted;

-- Database-level stats
SELECT datname, xact_commit, xact_rollback, blks_hit, blks_read, conflicts
FROM pg_stat_database
WHERE datname = 'appdb';
```

For long-term monitoring, deploy `postgres_exporter` and scrape with Prometheus. See `Prometheus.md` for alerting rules. Key metrics to alert on: replication lag, transaction ID age (approaching wraparound), connection saturation, and dead tuple count.

### 7. Backup strategies

Three complementary approaches — use all three in production:

**pg_dump** — logical snapshot. Point-in-time. Fast to restore a single table or schema. No continuous recovery.

**pg_basebackup** — physical copy of the data directory. Foundation for streaming replication standbys and PITR.

```bash
pg_basebackup -h primary-host -U replicator -D /var/lib/postgresql/standby \
  -P -Xs -R
# -Xs: stream WAL during backup
# -R: write recovery config automatically
```

**WAL archiving + pgBackRest** — continuous WAL archiving enables point-in-time recovery to any second. pgBackRest manages the archive, handles incremental backups, and provides parallel restore.

In `postgresql.conf`:

```
archive_mode = on
archive_command = 'pgbackrest --stanza=main archive-push %p'
```

pgBackRest stanza config in `/etc/pgbackrest/pgbackrest.conf`:

```ini
[main]
pg1-path=/var/lib/postgresql/data

[global]
repo1-path=/var/backups/pgbackrest
repo1-retention-full=2
start-fast=y
```

```bash
# Full backup
pgbackrest --stanza=main --type=full backup

# Point-in-time restore to 2024-03-15 14:30:00
pgbackrest --stanza=main --type=time "--target=2024-03-15 14:30:00" restore
```

### 8. Security — roles, pg_hba.conf, SSL

Postgres security has three layers: network access (`pg_hba.conf`), authentication method, and object-level privileges.

`pg_hba.conf` is processed top-to-bottom, first match wins:

```
# TYPE  DATABASE    USER        ADDRESS           METHOD
local   all         postgres                      peer
host    appdb       appuser     10.0.0.0/8        scram-sha-256
host    replication replicator  standby-ip/32     scram-sha-256
host    all         all         0.0.0.0/0         reject
```

⚠️ `trust` authentication on any network-accessible line is a critical vulnerability. Use `scram-sha-256` for all remote connections.

Enable SSL in `postgresql.conf`:

```
ssl = on
ssl_cert_file = '/etc/ssl/certs/server.crt'
ssl_key_file  = '/etc/ssl/private/server.key'
ssl_min_protocol_version = 'TLSv1.2'
```

Apply least-privilege role design:

```sql
-- Read-only role
CREATE ROLE readonly;
GRANT CONNECT ON DATABASE appdb TO readonly;
GRANT USAGE ON SCHEMA app TO readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT ON TABLES TO readonly;

-- Assign to user
GRANT readonly TO reporting_user;
```

### 9. Performance tuning — key knobs

These live in `postgresql.conf`. Tune them after understanding your workload.

**shared_buffers** — Postgres's own buffer cache. Start at 25% of total RAM. Higher is better up to around 40%; beyond that, the OS page cache stops helping.

```
shared_buffers = 4GB          # on a 16GB server
```

**work_mem** — Memory per sort or hash operation, per query, per parallel worker. Multiply by max connections and parallel workers to get worst-case usage. Too low causes temp file spills; too high causes OOM.

```
work_mem = 64MB               # conservative starting point
```

**effective_cache_size** — Planner's estimate of total available cache (shared_buffers + OS page cache). Affects index vs seq scan decisions. Set to ~75% of total RAM.

```
effective_cache_size = 12GB
```

**max_connections** — Set this lower than you think. Use PgBouncer to multiplex. Each connection is a process; 500 idle connections burn ~500 MB just for overhead.

```
max_connections = 100         # with PgBouncer in front
```

**wal_compression** — Reduces WAL volume, especially with repetitive data patterns. Near-zero CPU cost on modern hardware.

```
wal_compression = on
```

After changing `postgresql.conf`, most settings require `pg_ctl reload` (SIGHUP). A few (`shared_buffers`, `max_connections`) require a full restart.

---

## Worked example — Setting up streaming replication

You have one primary at `10.0.1.10` and one standby at `10.0.1.11`. Both are running Postgres 15 on Linux. See `Linux.md` for OS-level prep and `Docker.md` if you're containerizing.

### Step 1 — Configure the primary

Edit `/etc/postgresql/15/main/postgresql.conf`:

```
wal_level = replica
max_wal_senders = 3
wal_keep_size = 512MB
listen_addresses = '*'
```

Edit `/etc/postgresql/15/main/pg_hba.conf` — add:

```
host  replication  replicator  10.0.1.11/32  scram-sha-256
```

Create the replication user:

```sql
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'replpass';
```

Reload config:

```bash
sudo systemctl reload postgresql
```

### Step 2 — Bootstrap the standby

On the standby server (as `postgres` user):

```bash
# Stop any running postgres
sudo systemctl stop postgresql

# Wipe the data directory
sudo rm -rf /var/lib/postgresql/15/main/*

# Base backup from primary
sudo -u postgres pg_basebackup \
  -h 10.0.1.10 \
  -U replicator \
  -D /var/lib/postgresql/15/main \
  -P --wal-method=stream -R

# -R writes a standby.signal file and recovery settings into postgresql.auto.conf
```

Start the standby:

```bash
sudo systemctl start postgresql
```

### Step 3 — Verify replication

On the primary:

```sql
SELECT client_addr, state, sent_lsn, replay_lsn,
       (sent_lsn - replay_lsn) AS lag_bytes
FROM pg_stat_replication;
```

On the standby:

```sql
SELECT pg_is_in_recovery();   -- should return true
SELECT pg_last_wal_replay_lsn(), pg_last_wal_receive_lsn();
```

### Step 4 — Failover scenario

Primary goes down at 02:00. You're on call.

On the standby, promote it to primary:

```bash
sudo -u postgres pg_ctl promote -D /var/lib/postgresql/15/main
```

Verify it's no longer in recovery:

```sql
SELECT pg_is_in_recovery();   -- now returns false
```

Update your application's database connection string to point to `10.0.1.11`. If you're running on Kubernetes, see `Kubernetes.md` for how to update a Service endpoint without downtime.

After the original primary is restored, it cannot simply rejoin as a standby — it has diverged. Re-bootstrap it using `pg_basebackup` from the new primary, following Step 2 again.

---

## Common pitfalls

- **Bloated tables from skipped VACUUM.** MVCC dead rows never disappear on their own. If autovacuum is disabled or misconfigured on high-write tables, tables grow without bound and query plans degrade. Check `n_dead_tup` in `pg_stat_user_tables` weekly.

- **Missing indexes on foreign key columns.** Postgres does not create indexes on foreign keys automatically. Every join from child to parent, and every `DELETE` from the parent, will seq scan the child table. Add them explicitly after adding the constraint.

- **Too many direct connections.** Each Postgres backend is an OS process. At 300+ connections you start paying significant overhead in RAM, CPU scheduling, and lock table contention — even if most connections are idle. Put PgBouncer in front before you hit this wall, not after.

- **Not using connection pooling until it's too late.** Applications under load spike connections faster than you expect. Connection exhaustion looks like a database outage but is actually a resource limit. PgBouncer is a one-hour setup; deploy it early.

- **Running EXPLAIN without ANALYZE.** `EXPLAIN` alone shows planner estimates, which can be wildly wrong on tables with stale statistics. `EXPLAIN ANALYZE` runs the query and shows real numbers. The tradeoff is that `ANALYZE` actually executes the statement — wrap in a transaction and roll back for mutations.

- **VACUUM FULL in production.** `VACUUM FULL` rewrites the entire table and holds an `AccessExclusiveLock` for the duration. That blocks all reads and writes. Use it only in maintenance windows. For online space reclamation, investigate `pg_squeeze` or accept the bloat until the next maintenance.

- **Ignoring transaction ID wraparound.** Postgres uses 32-bit transaction IDs. After ~2 billion transactions, IDs wrap around and data becomes invisible. Monitor `age(datfrozenxid)` in `pg_database`. Alert before you reach 1.5 billion.

- **Forgetting to archive WAL before deleting old base backups.** If you delete a base backup whose associated WAL segments are still needed for PITR, you lose the ability to restore to any point since that backup. pgBackRest handles this dependency tracking automatically. DIY scripts often don't.

---

## Quick command reference

### psql client

```bash
psql -U user -d database -h host -p 5432
psql "postgresql://user:pass@host:5432/db?sslmode=require"

\l                   # list databases
\c dbname            # switch database
\dt schema.*         # list tables
\d tablename         # describe table
\di                  # list indexes
\df                  # list functions
\du                  # list roles
\x                   # toggle expanded display
\timing on           # show query time
\e                   # open query in $EDITOR
\copy table TO file  # client-side copy
\q                   # quit
```

### SQL operations

```sql
-- Create objects
CREATE DATABASE mydb;
CREATE USER myuser WITH PASSWORD 'pass';
CREATE SCHEMA myschema;
CREATE TABLE t (id BIGSERIAL PRIMARY KEY, val TEXT NOT NULL);

-- Permissions
GRANT CONNECT ON DATABASE mydb TO myuser;
GRANT USAGE ON SCHEMA myschema TO myuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA myschema TO myuser;

-- Query plan
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT ...;

-- Table maintenance
VACUUM VERBOSE tablename;
ANALYZE tablename;
REINDEX TABLE CONCURRENTLY tablename;

-- Kill connection
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = 1234;
```

### Backup and restore

```bash
# Logical backup
pg_dump -U user -d db -Fc -f backup.dump
pg_dump -U user -d db -Fp -f backup.sql

# Restore logical
pg_restore -U user -d newdb -Fc backup.dump
psql -U user -d newdb -f backup.sql

# Physical backup (for replication or PITR base)
pg_basebackup -h primary -U replicator -D /path/to/standby -P -Xs -R

# pgBackRest
pgbackrest --stanza=main --type=full backup
pgbackrest --stanza=main --type=incr backup
pgbackrest --stanza=main --type=time "--target=2024-03-15 14:30:00" restore
pgbackrest --stanza=main info
```

### Replication

```sql
-- On primary: check standby status
SELECT client_addr, state, sent_lsn, replay_lsn,
       (sent_lsn - replay_lsn) AS lag_bytes
FROM pg_stat_replication;

-- On standby: check recovery status
SELECT pg_is_in_recovery();
SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;
SELECT pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();
```

```bash
# Promote standby to primary
pg_ctl promote -D /var/lib/postgresql/data
```

### Monitoring queries

```sql
-- Long-running queries
SELECT pid, now() - query_start AS duration, state, left(query, 80) AS query
FROM pg_stat_activity
WHERE state = 'active' AND query_start < now() - interval '30 seconds'
ORDER BY duration DESC;

-- Cache hit ratio
SELECT round(100.0 * sum(heap_blks_hit) /
       nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) AS cache_hit_pct
FROM pg_statio_user_tables;

-- Table bloat proxy
SELECT relname, n_live_tup, n_dead_tup,
       round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,
       last_autovacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 20;

-- Transaction ID age (wraparound risk)
SELECT datname, age(datfrozenxid) AS xid_age
FROM pg_database
ORDER BY xid_age DESC;

-- Index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Lock waits
SELECT pid, locktype, relation::regclass, mode, granted, query
FROM pg_locks l
JOIN pg_stat_activity a USING (pid)
WHERE NOT granted;
```

### Config reload and restart

```bash
# Reload config (no restart needed for most settings)
sudo systemctl reload postgresql
# Or from psql:
SELECT pg_reload_conf();

# Full restart (required for shared_buffers, max_connections)
sudo systemctl restart postgresql

# Check what requires restart vs reload
SELECT name, setting, context
FROM pg_settings
WHERE context IN ('postmaster', 'sighup');
```

---


## Top 10 Interview Questions

<details>
<summary><strong>Q: What is MVCC in PostgreSQL and why does it matter?</strong></summary>

Multi-Version Concurrency Control allows readers and writers to operate simultaneously without blocking each other. Each transaction sees a snapshot of the database at its start time. When a row is updated, PostgreSQL creates a new version rather than overwriting — old versions remain visible to transactions that started before the update. This is why PostgreSQL needs VACUUM: dead tuple versions accumulate and must be cleaned up. MVCC enables high concurrency but requires understanding of transaction isolation levels and vacuum tuning.

</details>

<details>
<summary><strong>Q: How does the Write-Ahead Log (WAL) work and why is it critical?</strong></summary>

WAL ensures durability: every change is written to the WAL (sequential log on disk) before the actual data files are modified. On crash, PostgreSQL replays the WAL to recover committed transactions. WAL also enables streaming replication (replicas apply WAL records) and point-in-time recovery (PITR — replay WAL to any timestamp). Key tuning: wal_level (replica or logical), max_wal_size (checkpoint frequency), and archive_mode (for PITR). WAL is the foundation of PostgreSQL's reliability guarantees.

</details>

<details>
<summary><strong>Q: How do you diagnose and fix slow queries in PostgreSQL?</strong></summary>

Use EXPLAIN ANALYZE to see the actual execution plan with timing. Look for: sequential scans on large tables (add an index), nested loop joins on large datasets (might need hash/merge join), poor row estimates (run ANALYZE to update statistics), and disk-heavy sorts (increase work_mem). Check pg_stat_statements for the top queries by total time. Common fixes: add targeted indexes (partial, covering, GIN for arrays/JSONB), rewrite subqueries as joins, add appropriate WHERE clauses, and ensure statistics are current.

</details>

<details>
<summary><strong>Q: What is autovacuum and how do you tune it for production?</strong></summary>

Autovacuum reclaims space from dead tuples (created by MVCC updates/deletes) and updates planner statistics. Default settings are conservative. For high-write workloads: reduce autovacuum_vacuum_cost_delay (make vacuum faster), increase autovacuum_max_workers for large databases, lower autovacuum_vacuum_scale_factor for large tables (trigger vacuum sooner). Monitor: pg_stat_user_tables.n_dead_tup and last_autovacuum. Symptoms of inadequate vacuuming: table bloat, index bloat, and transaction ID wraparound warnings.

</details>

<details>
<summary><strong>Q: How do you set up streaming replication in PostgreSQL?</strong></summary>

Configure the primary: set wal_level=replica, max_wal_senders, and create a replication user. On the replica: use pg_basebackup to take a base backup, configure primary_conninfo in postgresql.conf, and start. The replica streams WAL from the primary in real-time. For HA, use synchronous_commit=on with synchronous_standby_names to ensure no data loss on failover. Use Patroni or repmgr for automated failover management. Monitor replication lag via pg_stat_replication.

</details>

<details>
<summary><strong>Q: What are the different index types in PostgreSQL and when do you use each?</strong></summary>

B-tree (default — equality and range queries, most use cases), Hash (equality only — rarely better than B-tree), GIN (arrays, JSONB, full-text search — inverted index), GiST (geometric data, full-text, range types), BRIN (very large tables with naturally ordered data — uses minimal storage), and SP-GiST (non-balanced data structures like tries). Use B-tree for 90% of cases. GIN for JSONB containment queries. BRIN for time-series tables with timestamp ordering. Partial indexes for selective queries.

</details>

<details>
<summary><strong>Q: How do you handle connection management in PostgreSQL?</strong></summary>

PostgreSQL forks a process per connection (expensive — each uses ~10MB). Direct connections from applications with many instances exhaust limits quickly. Use a connection pooler: PgBouncer (lightweight, transaction-mode pooling — connections are returned to the pool between transactions) or PgPool-II (adds load balancing and query caching). Set max_connections conservatively (100-300, not thousands), and let the pooler multiplex. Monitor: pg_stat_activity for active connections and wait events.

</details>

<details>
<summary><strong>Q: What is the difference between logical and physical replication?</strong></summary>

Physical replication streams the entire WAL — byte-for-byte copy of all databases. Logical replication streams decoded changes (INSERT, UPDATE, DELETE) for selected tables. Use physical for HA failover (exact replica). Use logical for: selective table replication, cross-version replication (upgrading by replicating to a newer version), data integration (replicating to analytics systems), and multi-master setups (via BDR or Citus). Logical has more overhead but more flexibility.

</details>

<details>
<summary><strong>Q: How do you perform zero-downtime schema migrations?</strong></summary>

Key rules: never lock tables for long (avoid ALTER TABLE on large tables without CONCURRENTLY). Add columns with DEFAULT NULL (instant in PG 11+). Create indexes with CREATE INDEX CONCURRENTLY (no lock). Drop columns by first removing application references, then dropping. For type changes: add a new column, backfill in batches, switch application reads, drop the old column. Use tools like pg_repack for table rewrites without locks. Test migrations against production-sized data to estimate lock time.

</details>

<details>
<summary><strong>Q: How do you backup and restore PostgreSQL in production?</strong></summary>

Three strategies: pg_dump (logical — portable, table-level, slower for large DBs), pg_basebackup + WAL archiving (physical — fast, enables PITR), and filesystem snapshots (fastest for very large DBs, requires WAL for consistency). For production BFSI: use pg_basebackup with continuous WAL archiving to S3 for PITR capability. Tools like pgBackRest handle compression, encryption, incremental backups, and parallel restore. Test restores regularly — backup without tested restore is wishful thinking.

</details>

---



## Quick Quiz

Test your understanding with these rapid-fire questions (answers hidden):

<details>
<summary>1. What is the ONE core problem that PostgreSQL solves?</summary>
Re-read Part 0 — the mental model section. If you can explain the "why" in one sentence, you understand the foundation.
</details>

<details>
<summary>2. Name the 3 most important terms from the vocabulary section.</summary>
Review Part 1. These are the building blocks every conversation about PostgreSQL uses.
</details>

<details>
<summary>3. What is the first thing you would set up on Day 1?</summary>
Check the Day 1 section — the very first hands-on step that gets you a working result.
</details>

<details>
<summary>4. What is the most common production pitfall with PostgreSQL?</summary>
Review the Common Pitfalls section. The first item listed is typically the most frequently encountered.
</details>

<details>
<summary>5. How does PostgreSQL compare to its closest alternative?</summary>
Check the Comparison Matrix below — focus on the key differentiating row.
</details>



## Comparison Matrix

| Dimension | PostgreSQL | MySQL | SQL Server |
|-----------|------------|-------|------------|
| **Primary use case** | Core strength of PostgreSQL | Core strength of MySQL | Core strength of SQL Server |
| **Learning curve** | Moderate | Varies | Varies |
| **Community/ecosystem** | Active | Active | Growing |
| **Operational complexity** | Medium | Varies | Varies |
| **Best for** | See Part 0 | Different tradeoffs | Different tradeoffs |

> **How to read this matrix:** no tool wins on every dimension. Pick based on your specific constraints — team expertise, existing infrastructure, scale requirements, and compliance needs. The right choice is the one that fits your context, not the one with the most checkmarks.

## Next steps after Day 2

- [`Redis.md`](../data/Redis.md) — When you need sub-millisecond reads, caching query results, or pub/sub. Postgres and Redis are complementary; most production stacks use both.
- [`Kafka.md`](../data/Kafka.md) — When you need to stream change events out of Postgres at scale. Logical replication slots feed Debezium to Kafka for CDC pipelines.
- [`Docker.md`](../containers/Docker.md) — Running Postgres in containers for development and testing. Understand volume mounts and how `pg_hba.conf` interacts with container networking.
- [`Kubernetes.md`](../containers/Kubernetes.md) — StatefulSets, PersistentVolumeClaims, and operators (CloudNativePG, Zalando) for running Postgres in Kubernetes. Failover behavior differs significantly from bare metal.
- [`Prometheus.md`](../observability/Prometheus.md) — Deploy `postgres_exporter`, scrape the metrics endpoint, and build alerting rules for replication lag, connection saturation, bloat, and XID age.

---

## Recommended learning resources

**YouTube channels & playlists:**
- [Hussein Nasser — PostgreSQL playlist](https://www.youtube.com/@haboread) — internals-first deep dives on indexing, WAL, MVCC, connection pooling, and replication
- [CMU Database Group — Intro to Database Systems (Andy Pavlo)](https://www.youtube.com/@CMUDatabaseGroup) — full university lecture series covering storage engines, query processing, and concurrency control with Postgres examples
- [Fireship — PostgreSQL in 100 Seconds](https://www.youtube.com/@Fireship) — fast conceptual overview to orient before diving deeper
- [Citus Data — Scaling Postgres](https://www.youtube.com/@citusdata) — weekly short episodes on EXPLAIN plans, partitioning, extensions, and operational tuning
- [Postgres FM Podcast](https://www.youtube.com/@PostgresFM) — practitioner conversations on upgrades, vacuuming, logical replication, and day-to-day operations

**Official docs & blogs:**
- [PostgreSQL Official Documentation](https://www.postgresql.org/docs/current/) — the canonical reference; start with the Tutorial and Server Administration sections
- [Use The Index, Luke](https://use-the-index-luke.com/) — the best resource on SQL indexing and EXPLAIN plans, language-agnostic but heavily Postgres-flavoured
- [Crunchy Data Blog](https://www.crunchydata.com/blog) — production-focused articles on performance, extensions, and Kubernetes operators

---

**The mantra:** Own the data layer — if you can't read an EXPLAIN plan, tune a VACUUM, and promote a standby at 2am, you don't yet operate Postgres, you just use it.
