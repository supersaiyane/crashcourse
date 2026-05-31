# Database Internals — A 2-Day Crash Course

Understanding why databases actually work — B-trees, MVCC, WAL, query planners, and lock contention explained so you can debug production database issues instead of just running commands.

**Prereq:** `PostgreSQL.md`

---

## Part 0 — Why

Knowing how to operate a database is good. Knowing how it works internally is what separates "restart it" from "fix it."

Most engineers treat the database as a black box. They run queries, check slow query logs, add an index, and hope for the best. That works — until it doesn't. Until autovacuum is eating your IOPS at 2 AM, or a query plan flips from index scan to sequential scan with no warning, or you have a deadlock that only reproduces under load.

Internals knowledge gives you a mental model of what the database is actually doing. Not the SQL you wrote — the bytes it's reading, the pages it's locking, the versions it's juggling. With that model, a slow query stops being mysterious. A deadlock becomes readable. A bloated table has an obvious cause and a clear fix.

You don't need to read source code. You need to understand the five or six big ideas well enough to reason forward from symptoms to root cause. That's what this crash course builds.

---

## Vocabulary

**B-tree** — A self-balancing tree data structure where every node can have multiple children. Keeps data sorted and allows searches, insertions, and deletions in O(log n). The foundation of most relational database indexes.

**B+ tree** — A variant of the B-tree where all actual data records live in leaf nodes, and internal nodes hold only keys for routing. Leaf nodes are linked, making range scans fast. PostgreSQL uses B+ trees for its default index type.

**LSM Tree (Log-Structured Merge Tree)** — An alternative to B-trees optimized for write-heavy workloads. Writes go to an in-memory buffer first, then are flushed to sorted files on disk and merged in the background. Used by RocksDB, Cassandra, LevelDB.

**WAL (Write-Ahead Log)** — A sequential log of every change made to the database, written to disk before the change is applied to the actual data files. The source of truth for crash recovery and replication.

**MVCC (Multi-Version Concurrency Control)** — A technique that stores multiple versions of each row simultaneously, allowing readers to see a consistent snapshot without blocking writers and vice versa.

**Buffer Pool** — The in-memory cache between disk and the database engine. Pages (blocks of data) are read into the buffer pool and kept there as long as possible. Cache hits avoid disk I/O entirely.

**Query Planner / Optimizer** — The component that takes a parsed SQL query and generates an execution plan — decisions about which indexes to use, in what order to join tables, and whether to scan or seek. It aims to minimize estimated cost.

**Cost Estimation** — The planner's internal model for predicting how expensive an operation will be, expressed in abstract "cost units" (roughly proportional to I/O and CPU). Based on table statistics, not actual timing.

**Lock (Shared / Exclusive)** — Shared locks allow multiple readers to hold them simultaneously. Exclusive locks block everything else — only one writer can hold an exclusive lock on a resource at a time.

**Deadlock** — Two transactions each holding a lock the other needs, causing both to wait forever. The database detects this and rolls back one of them.

**VACUUM** — PostgreSQL's process for reclaiming space occupied by dead row versions left behind by MVCC. Without it, tables bloat indefinitely.

**Checkpoint** — A point in time where the database guarantees all dirty pages in the buffer pool have been written to disk. Limits how far back WAL replay needs to go after a crash.

**Page / Block** — The atomic unit of storage in most databases. PostgreSQL uses 8 KB pages. Every read and write operates on whole pages, even if you're changing one row.

---

## Day 1 — How the Database Stores and Protects Your Data

### Storage Engines — Pages, B-trees, Heap Files

When PostgreSQL stores a table, it doesn't write rows as continuous records into a file. It writes them into **pages** — 8 KB chunks. A table file is a sequence of pages. A row lives somewhere inside a page, at a specific offset.

The structure of a page looks roughly like this:

```
[ page header | item pointers → ... ← tuple data ]
```

Item pointers (called `ctid` in PostgreSQL) are small fixed-size slots at the start of the page that point to the actual tuple data growing from the end. When a row is deleted, its item pointer is marked as dead but the space isn't immediately reclaimed — that's VACUUM's job.

**Heap files** are the actual table storage: unordered pages. Rows are wherever they were inserted. There's no inherent order to a heap file. When you run `SELECT * FROM orders`, without an index the database reads every page in sequence — a sequential scan.

**B+ tree indexes** impose order. An index is a separate on-disk structure, a tree where leaf nodes contain the indexed column value paired with the heap pointer (`ctid`) of the matching row. Internal nodes are pure routing keys.

When you query `WHERE id = 42`, the planner can:
1. Descend the B+ tree in O(log n) to find the leaf node containing `id = 42`
2. Read the `ctid` from that leaf
3. Go directly to the right page in the heap file and read the row

That's an **index scan** — fast for selective queries. For queries that return most of the table, the index detour is slower than just reading all the heap pages in sequence — which is why the planner sometimes ignores your index even when it exists.

**Index pages also get written to WAL and cached in the buffer pool.** An index isn't free. Every write to a table requires updating all indexes on it. A table with six indexes pays six index write costs per insert.

---

### WAL — Why Write-Ahead Logging Exists

Consider what happens if PostgreSQL crashes mid-write. You've modified a row in the buffer pool but haven't flushed the page to disk yet. On restart, that change is gone. Worse — if you were halfway through updating multiple pages, your data is inconsistent.

WAL solves this. Before any page modification is applied, PostgreSQL writes a description of the change to the WAL — a sequential, append-only log on disk. Sequential writes are cheap. Only after the WAL record is durable does the change proceed.

On crash recovery, PostgreSQL replays the WAL from the last checkpoint forward, re-applying all changes that hadn't been flushed to the heap yet. This is called **REDO recovery**. The heap pages on disk may be stale, but the WAL contains everything needed to reconstruct the correct state.

WAL gives you two things beyond crash recovery:

**Replication.** Streaming replication works by shipping WAL segments from primary to replica. The replica replays the same WAL, maintaining an identical copy. Physical replication is binary-exact.

**Point-in-time recovery (PITR).** Archive your WAL segments and you can restore to any moment, not just the last backup.

The WAL is located in `$PGDATA/pg_wal/`. Segments are 16 MB by default. `wal_level`, `archive_mode`, and `archive_command` control what gets written and where it goes.

A **checkpoint** is a synchronization point where PostgreSQL writes all dirty buffer pool pages to disk and records the checkpoint location in the WAL. After a checkpoint, recovery only needs to replay WAL from that point forward. Too infrequent checkpoints mean long recovery times. Too frequent checkpoints mean high write amplification. `checkpoint_completion_target` and `max_wal_size` are the main tuning knobs.

---

### MVCC — How Readers Never Block Writers

Traditional locking databases block reads when a write is in progress. PostgreSQL doesn't, because of MVCC.

Every transaction in PostgreSQL gets a **transaction ID (XID)**. When you insert a row, PostgreSQL stamps it with your XID as `xmin` — the transaction that created it. When you delete a row, PostgreSQL stamps it with your XID as `xmax` — the transaction that deleted it. The row isn't removed; it's marked as deleted.

When you read a row, PostgreSQL evaluates **visibility rules**:
- The row is visible to you if `xmin` committed before your snapshot and `xmax` is either not set or committed after your snapshot.

This means you see a consistent point-in-time view of the database — your **snapshot** — regardless of what other transactions are doing. A long-running read won't block a concurrent writer and vice versa.

The cost: **dead tuples accumulate.** Every `UPDATE` creates a new row version (new `xmin`) and marks the old one dead (sets `xmax`). Every `DELETE` marks a row dead. These dead tuples sit in heap pages consuming space. Until VACUUM removes them, queries scan past them.

Transaction IDs are 32-bit integers. They wrap around. PostgreSQL uses **freeze** to mark old rows as permanently visible, preventing XID exhaustion. `VACUUM FREEZE` does this explicitly. If autovacuum falls too far behind on freeze, the database will go into shutdown mode to protect itself — a scenario called **XID wraparound**, and it's one of the worst production failures you can face.

---

### Buffer Pool — The Cache Between Disk and Queries

`shared_buffers` is PostgreSQL's buffer pool — the chunk of RAM it allocates for caching pages. The default is 128 MB, which is too small for most production workloads. A common recommendation is 25% of total RAM.

When a query needs a page, the database checks the buffer pool first. A **cache hit** avoids disk I/O entirely. A **cache miss** reads the page from disk into the pool, potentially evicting a less recently used page.

PostgreSQL uses a clock-sweep algorithm for eviction — cheaper than LRU but good enough in practice.

The operating system also caches file data independently. `effective_cache_size` is not an allocation — it's a hint to the query planner about how much total cache is available (buffer pool + OS page cache). Setting it correctly influences whether the planner trusts that an index will be fast.

High `blks_hit / (blks_hit + blks_read)` ratio in `pg_stat_database` means your buffer pool is doing its job. If your cache hit rate is below ~95% on an OLTP workload, you probably need more `shared_buffers` or more RAM.

---

## Day 2 — How the Database Makes Decisions

### Query Planner — Cost Estimation and EXPLAIN ANALYZE

The query planner is a cost-based optimizer. When you run a query, it generates multiple possible execution plans and picks the one with the lowest estimated cost.

Cost is measured in abstract units. A sequential page read costs `seq_page_cost` (default 1.0). A random page read costs `random_page_cost` (default 4.0, meaning random I/O is assumed to be 4x more expensive — reasonable for spinning disks, often too high for SSDs). CPU operations have their own cost factors.

The planner uses **statistics** — histograms and cardinality estimates stored in `pg_statistic`, updated by `ANALYZE` — to estimate how many rows each operation will produce. A wrong estimate leads to a wrong plan.

**EXPLAIN** shows the plan without executing it. **EXPLAIN ANALYZE** executes the query and shows actual row counts and timing alongside estimates. The gap between estimated and actual rows is where problems hide.

Reading EXPLAIN ANALYZE output:

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42 AND status = 'pending';
```

```
Bitmap Heap Scan on orders  (cost=4.58..36.71 rows=10 width=120)
                            (actual time=0.082..1.234 rows=847 loops=1)
  Recheck Cond: (customer_id = 42)
  Filter: (status = 'pending')
  Rows Removed by Filter: 1203
  ->  Bitmap Index Scan on orders_customer_id_idx
        (cost=0.00..4.58 rows=30 width=0)
        (actual time=0.041..0.041 rows=2050 loops=1)
        Index Cond: (customer_id = 42)
Planning Time: 0.312 ms
Execution Time: 1.289 ms
```

The planner estimated 10 rows, got 847. It estimated the index would return 30 rows, got 2050. These estimates are stale — `ANALYZE` hasn't run recently enough, or the data distribution is skewed. The plan may still work fine, but if that 847 were actually 847,000, you'd be in trouble.

Key things to look for:
- **Large estimate vs actual gaps** — stale statistics or skewed data
- **Sequential scan on a large table with a WHERE clause** — missing index or planner correctly avoiding a bad index
- **Nested loop with a large outer relation** — often becomes a hash join problem at scale
- **High "Rows Removed by Filter"** — the index isn't selective enough, or you need a composite index

Run `ANALYZE tablename;` to refresh statistics immediately. For permanent fixes, check `autovacuum_analyze_scale_factor` and `autovacuum_analyze_threshold`.

---

### Indexing Internals — When They Help and When They Don't

A B+ tree index is a sorted on-disk tree. The leaf level contains every indexed value paired with the `ctid` of the corresponding heap row. Non-leaf pages are purely navigational — they hold separator keys and child page pointers.

When the database walks an index, it starts at the root, compares keys at each level, and descends to a leaf in O(log n) steps. Then, for a range scan, it can follow leaf-level links to read adjacent leaf pages — this is why B+ trees (not B-trees) are used: the linked leaf pages make range scans efficient without going back to the root.

**When indexes help:**
- High-selectivity WHERE clauses (returning a small fraction of the table)
- ORDER BY on the indexed column (the index is already sorted)
- JOIN columns with many distinct values
- Covering indexes where all needed columns are in the index (no heap fetch required)

**When indexes hurt or are ignored:**
- Low-selectivity columns (status with 3 possible values — an index scan plus heap fetches is slower than a sequential scan)
- Small tables (a sequential scan of a few pages is faster than an index lookup)
- Queries that return >5-10% of the table — the planner may correctly choose a seqscan
- Columns with high write volume — every write has to maintain the index

**Partial indexes** index only rows matching a condition:
```sql
CREATE INDEX orders_pending_idx ON orders (created_at) WHERE status = 'pending';
```
Smaller, faster, only used when the query matches the partial condition.

**Covering indexes** (using `INCLUDE`) add non-indexed columns to leaf pages so the query never has to touch the heap:
```sql
CREATE INDEX orders_customer_covering ON orders (customer_id) INCLUDE (status, total);
```
Eliminates the heap fetch for queries that only need those columns.

**Expression indexes** index a computed value:
```sql
CREATE INDEX users_lower_email ON users (lower(email));
```
Only used if your query uses the same expression: `WHERE lower(email) = 'foo@example.com'`.

---

### Locking — Shared, Exclusive, Row, Table, Deadlock

PostgreSQL has a hierarchy of lock modes. The two you reason about most:

**Shared lock (S)** — Multiple transactions can hold shared locks simultaneously. Taken by readers in some isolation levels and by foreign key checks.

**Exclusive lock (X)** — Only one transaction can hold it. Blocks all other lock acquisitions. Taken by `UPDATE`, `DELETE`, `INSERT` at the row level.

Row-level locks are fine-grained and cheap. Table-level locks are coarse and expensive. `ALTER TABLE` takes an `ACCESS EXCLUSIVE` table lock, which blocks everything — reads and writes — until it completes. This is why schema migrations on live tables are dangerous.

`SELECT ... FOR UPDATE` takes a row-level exclusive lock without modifying the row — used to signal "I'm about to update this, nobody else touch it."

**Deadlocks** happen when two transactions are waiting on each other:
- Transaction A holds lock on row 1, wants lock on row 2
- Transaction B holds lock on row 2, wants lock on row 1

PostgreSQL detects deadlocks every `deadlock_timeout` (default 1 second) and rolls back one transaction with: `ERROR: deadlock detected`. The fix is usually to ensure all transactions acquire locks in the same order, or to use advisory locks for complex coordination.

Monitor lock contention with:
```sql
SELECT pid, wait_event_type, wait_event, query
FROM pg_stat_activity
WHERE wait_event_type = 'Lock';
```

For detailed lock information:
```sql
SELECT * FROM pg_locks pl
JOIN pg_stat_activity pa ON pa.pid = pl.pid
WHERE NOT granted;
```

---

### VACUUM Internals — Dead Tuples, Bloat, Autovacuum

Every `UPDATE` in PostgreSQL leaves a dead tuple behind (the old row version). Every `DELETE` leaves a dead tuple. These accumulate.

VACUUM does two things:
1. **Marks dead tuples as free space** — pages can reuse that space for new rows
2. **Advances the freeze horizon** — protects against XID wraparound

VACUUM does not return space to the operating system by default. It marks pages as reusable for future inserts. `VACUUM FULL` rewrites the entire table and does return space to the OS, but takes an `ACCESS EXCLUSIVE` lock and should be used sparingly.

**Bloat** is when a table or index is significantly larger than its live data because dead tuples fill pages. A table with 1M live rows but 5M dead rows wastes disk, slows sequential scans, and makes index scans fetch more pages.

Detect bloat:
```sql
SELECT relname,
       n_live_tup,
       n_dead_tup,
       round(n_dead_tup::numeric / nullif(n_live_tup + n_dead_tup, 0) * 100, 1) AS dead_pct,
       last_autovacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;
```

**Autovacuum** runs in the background automatically. It triggers when dead tuples exceed `autovacuum_vacuum_scale_factor * reltuples + autovacuum_vacuum_threshold`. The defaults (20% + 50 rows) are fine for small tables, catastrophic for large ones — a table with 100M rows won't trigger autovacuum until 20M rows are dead.

For large tables, set table-level autovacuum parameters:
```sql
ALTER TABLE orders SET (
  autovacuum_vacuum_scale_factor = 0.01,  -- 1% instead of 20%
  autovacuum_vacuum_threshold = 1000
);
```

⚠️ A table with runaway bloat and a lagging autovacuum is one of the most common production performance problems. Always check `pg_stat_user_tables` before concluding a slow query is an index problem.

---

### LSM Trees — How Write-Heavy Databases Differ

B+ trees are read-optimized. Random writes require finding the right page, modifying it in place, and writing back — costly for high-throughput write workloads.

**LSM trees** flip the trade-off. Writes go first to an in-memory buffer (the **memtable**). When the memtable fills, it's flushed to disk as an immutable sorted file (an **SSTable**). These SSTables are periodically merged and compacted in the background.

The key insight: writes are always sequential (appends), which is much faster than random writes. The cost is paid later during compaction.

**Read amplification** is the penalty — a read may need to check multiple SSTables at different levels, plus the memtable, to find the most recent version of a key. **Bloom filters** (probabilistic data structures) are used to skip SSTables that definitely don't contain a key.

Databases using LSM trees: RocksDB (the engine behind many distributed databases), Apache Cassandra, InfluxDB, TiKV (TiDB's storage layer).

PostgreSQL uses B+ trees. If you're seeing high write latency in a time-series or append-heavy workload, that's often a signal to evaluate an LSM-based storage layer.

---

## Worked Example — Debugging a Slow Query

**Symptom:** A query that used to run in 200ms is now taking 12 seconds.

```sql
SELECT o.*, c.email
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'pending'
  AND o.created_at > now() - interval '7 days'
ORDER BY o.created_at DESC;
```

**Step 1: EXPLAIN ANALYZE**

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT ...
```

Output shows a sequential scan on `orders` with estimated 50 rows, actual 180,000 rows. Buffers: 42,000 shared hit, 18,000 read. Planning time 0.8ms, execution time 11,900ms.

**Finding:** Estimate is wildly off (50 vs 180,000). Statistics are stale.

```sql
ANALYZE orders;
```

Re-run EXPLAIN ANALYZE. Now it estimates 175,000 rows and switches to an index scan on `orders_created_at_idx`. But execution time is still 4 seconds.

**Step 2: Check bloat**

```sql
SELECT n_live_tup, n_dead_tup, last_autovacuum
FROM pg_stat_user_tables
WHERE relname = 'orders';
```

Output: 2.1M live tuples, 1.8M dead tuples. Last autovacuum: 6 days ago.

**Finding:** The table is heavily bloated. The index scan is fetching heap pages that are mostly dead tuples, wasting I/O on data the query doesn't return.

**Step 3: Check autovacuum configuration**

```sql
SELECT reloptions FROM pg_class WHERE relname = 'orders';
```

Default settings — scale factor 20%, threshold 50. For a table this size, autovacuum won't trigger until 400,000 dead tuples accumulate.

**Fix:**

```sql
-- Manually vacuum to clear current bloat
VACUUM ANALYZE orders;

-- Tune autovacuum for this table going forward
ALTER TABLE orders SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 500
);
```

After VACUUM: query runs in 280ms.

**Step 4: Index improvement (optional)**

The query filters on `status = 'pending'` and `created_at`. Most orders are not pending. Add a partial covering index:

```sql
CREATE INDEX orders_pending_recent ON orders (created_at DESC)
INCLUDE (customer_id, status)
WHERE status = 'pending';
```

Query now runs in 40ms and avoids the heap entirely.

**Root cause chain:** Stale statistics → wrong plan → slow query → investigate → bloat from lagging autovacuum → fix autovacuum threshold → tune index.

---

## Pitfalls

**Assuming an index will be used.** The planner makes cost-based decisions. A low-cardinality column, a small table, or a query returning a large fraction of rows may correctly bypass your index. Always EXPLAIN ANALYZE before concluding the index is missing.

**Running ANALYZE too infrequently.** After bulk loads or large deletes, statistics go stale immediately. Run `ANALYZE tablename` explicitly after significant data changes — don't wait for autovacuum.

**Treating VACUUM FULL as routine maintenance.** VACUUM FULL takes an ACCESS EXCLUSIVE lock and rewrites the whole table. It blocks all reads and writes for the duration. Use it only for one-time bloat recovery, not regular maintenance.

**Setting shared_buffers too low.** The default (128 MB) is a leftover from when PostgreSQL ran on very small machines. On a 16 GB server, 4 GB is reasonable. Cache misses are expensive.

**Ignoring XID age.** `SELECT max(age(datfrozenxid)) FROM pg_database;` — if any database has an XID age above 1.5 billion, you're approaching the wraparound danger zone. Autovacuum with freeze must run on all tables before the 2 billion mark.

**Schema migrations without a lock strategy.** Some DDL takes ACCESS EXCLUSIVE locks. Use `pg_repack` or online schema change tools for large tables in production.

**Misconfiguring random_page_cost for SSDs.** The default (4.0) assumes spinning disks. On SSDs, set `random_page_cost = 1.1` and the planner will be far more willing to use indexes.

**Not monitoring lock waits.** A migration holding a lock for 30 seconds doesn't just block writes for 30 seconds — every subsequent query queuing behind it also blocks. A lock queue can cascade into a full connection pile-up in seconds.

---

## Quick Reference

### Storage Engine Comparison

| Characteristic | B+ Tree (PostgreSQL) | LSM Tree (RocksDB/Cassandra) |
|---|---|---|
| Write pattern | Random in-place updates | Sequential appends |
| Read performance | Fast (single tree path) | Slower (multiple SSTables) |
| Write amplification | Moderate | High (compaction) |
| Space amplification | Low-moderate (bloat if no VACUUM) | Moderate (SSTable overlap) |
| Best for | OLTP, mixed read/write | Write-heavy, time-series, append |
| Compaction needed? | No (VACUUM instead) | Yes (background merge) |

### EXPLAIN ANALYZE Output Cheatsheet

| Field | What it means |
|---|---|
| `cost=X..Y` | Estimated cost to start..finish (planner units) |
| `rows=N` | Estimated output rows |
| `actual time=X..Y` | Real milliseconds to first..last row |
| `actual rows=N` | Actual rows returned |
| `loops=N` | How many times this node executed |
| `Buffers: hit=N read=N` | Pages from cache vs disk |
| `Rows Removed by Filter` | Rows scanned but not returned — index not covering filter |
| `Planning Time` | Time spent in the planner |
| `Execution Time` | Total wall time |

Large gap between `rows=` (estimated) and `actual rows=` means stale statistics. Run `ANALYZE`.

### VACUUM Monitoring Queries

```sql
-- Dead tuple ratio per table
SELECT relname,
       n_live_tup,
       n_dead_tup,
       round(n_dead_tup::numeric / nullif(n_live_tup + n_dead_tup, 0) * 100, 1) AS dead_pct,
       last_autovacuum,
       last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 20;

-- XID age — how close to wraparound
SELECT datname, age(datfrozenxid) AS xid_age
FROM pg_database
ORDER BY xid_age DESC;

-- Currently running autovacuum workers
SELECT pid, query, state, now() - xact_start AS duration
FROM pg_stat_activity
WHERE query LIKE 'autovacuum%';

-- Tables with lagging autovacuum (> 1 day)
SELECT relname, last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
WHERE last_autovacuum < now() - interval '1 day'
   OR last_autovacuum IS NULL
ORDER BY last_autovacuum NULLS FIRST;
```

---

## Next Steps

- `PostgreSQL.md` — operational tuning, connection pooling, replication setup
- `Redis.md` — in-memory data structures, eviction policies, persistence modes
- `etcd.md` — distributed key-value storage, Raft consensus, watch semantics
- `System-Design.md` — how storage engines factor into larger architecture decisions

---

## The Mantra

**You don't fix what you can't see. EXPLAIN ANALYZE first, hypothesize second, change third.**

Every production database investigation follows the same path: get the actual execution plan, compare estimates to actuals, check table health (bloat, statistics, autovacuum lag), then act. The internals knowledge you've built here is not trivia — it's the reason the symptoms are legible. A 180,000-row estimate of 50 isn't mysterious anymore. A query that slows after a bulk load isn't random. A deadlock under load isn't bad luck.

The database is telling you what's wrong. You now speak enough of its language to listen.
