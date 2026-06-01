# Algo & DS Cheatsheets — A 2-Day Crash Course

The data structures and algorithms that actually matter in production systems and interviews — hash maps, trees, graphs, heaps, and sorting explained through real infrastructure, not competitive programming.

---

## Part 0 — Why This Matters

You use data structures every day without naming them. Every time you run `ps aux | sort -k3 -rn | head -5`, you're doing a heap operation in your head. Every time Redis serves a cache hit in microseconds, a hash table is doing the work. Every time Postgres plans a range query, a B-tree is walking you to the answer.

The gap between engineers who "know algorithms" and engineers who use them well is almost always this: one group learned them for competitive programming contests, the other learned them in context. This crash course is the second approach.

Two days is enough to build a working mental model. You are not going to memorize every edge case. You are going to understand *why* each structure exists, *what problem it solves*, and *how to explain your choices* when an interviewer or a senior engineer asks "why did you use that here?"

That last skill — explaining your choices — is what separates a passing interview from a strong one.

---

## Vocabulary — Terms You Need to Speak Fluently

**Array** — A contiguous block of memory. Indexing is O(1). Insertion in the middle is O(n) because everything shifts. The foundation of almost every other structure.

**Linked List** — Nodes where each points to the next. Insertion and deletion at a known position are O(1). Access by index is O(n). Rarely used directly in application code, but lives inside many higher-level structures.

**Hash Map / Hash Table** — Maps keys to values using a hash function. Average O(1) for get, set, delete. The workhorse of caching, deduplication, and counting. Collision handling (chaining vs. open addressing) affects worst-case behavior.

**Tree (BST, B-tree)** — A hierarchical structure. A Binary Search Tree keeps elements ordered — left child is smaller, right is larger — enabling O(log n) search. A B-tree generalizes this for disk reads, grouping many keys per node to minimize I/O. B-trees power every relational database index you have ever used.

**Heap / Priority Queue** — A tree where the parent is always the min (or max) of its subtree. Extracting the minimum is O(log n). Building a heap from n elements is O(n). Used wherever you need to repeatedly pull the highest-priority item.

**Graph** — Nodes (vertices) connected by edges. Directed or undirected. Weighted or unweighted. Service dependency maps, network topologies, and recommendation engines are all graphs. Most graph problems reduce to BFS, DFS, or shortest path.

**Stack** — Last in, first out. Push and pop are O(1). Naturally models recursion, undo histories, and depth-first traversal.

**Queue** — First in, first out. Enqueue and dequeue are O(1) with a linked list or circular buffer. Models task queues, BFS traversal, and rate limiting.

**Trie** — A tree where each node represents a character. Lookup, insert, and prefix search are O(k) where k is the key length, independent of how many keys are stored. Powers autocomplete and IP routing tables.

**Bloom Filter** — A probabilistic set. Tells you "definitely not in set" or "probably in set" — never "definitely in set." Uses multiple hash functions over a bit array. Zero false negatives, tunable false positive rate. Used to avoid expensive lookups for things that don't exist.

---

## DAY 1 — The Essential Structures

### Arrays — When Contiguity Is a Feature

Arrays are fast because CPUs love contiguous memory. When you read index 0, the cache line that gets pulled likely contains indices 1 through 7. Sequential access patterns are dramatically faster than random pointer chasing.

Use arrays when:
- You know the size upfront or can amortize resizing (dynamic arrays, slices)
- You need indexed access — "give me the 10th element"
- You're iterating in order — log line processing, time-series data
- You're doing matrix operations, image processing, or any numerical work

Avoid arrays when:
- You're frequently inserting or deleting from the middle
- The size varies wildly and you're memory-constrained

**Real example:** Prometheus stores its in-memory scrape data in sorted arrays of time-series samples. Querying a time range becomes a binary search followed by a linear scan — fast because of cache locality, simple to implement.

---

### Hash Maps — O(1) Lookup and the Three Problems They Solve

A hash map trades memory for speed. You compute a hash of the key, use that to find a bucket, and retrieve the value. Under low load, this is constant time regardless of how many entries are stored.

**Problem 1: Caching.** You have seen this in every system design interview. The pattern is: check the map first, if miss, compute or fetch, then store. Redis is a distributed hash map with persistence and expiry. Memcached is a pure in-memory hash map. Even HTTP ETags are essentially cache keys in a distributed map.

**Problem 2: Counting.** Frequency maps are the first instinct for "how many times does X appear." Word count, request rate per IP, error count per service — all solved with `map[key]++`. When you see a Prometheus counter, you're looking at the query layer over a persisted frequency map.

**Problem 3: Deduplication.** "Have I seen this before?" Store the item as a key. Lookup is O(1). This is how idempotency keys work in payment systems — every transaction ID is checked against a hash map before processing.

**Watch out for:**
- Hash collisions degrading to O(n) if your hash function is weak or an attacker controls input keys — Go and Python randomize hash seeds at startup for this reason
- High load factors — most implementations resize at 75% capacity to keep lookup fast
- Unhashable types — mutable structures cannot be keys because their hash would change

**Real example:** Nginx's shared memory zones for rate limiting use hash tables. Each client IP maps to a counter and timestamp. Every request touches the hash table once — O(1) per request, regardless of how many clients are tracked.

---

### Trees — Ordered Access and the Database Index

The reason every relational database uses a B-tree for its default index is that B-trees are optimized for disk I/O, not RAM. A binary search tree with millions of nodes would require millions of node fetches to traverse — each a potential disk seek. A B-tree packs hundreds of keys into each node, so a tree of depth 4 can index billions of rows with at most 4 disk reads.

**B-tree properties that matter for interviews:**
- Height is O(log_B n) where B is the branching factor — typically 100–1000
- Range queries are efficient — find the start, then scan leaf nodes sequentially
- Inserts and deletes maintain balance automatically
- Read-optimized: great for databases with mixed read/write workloads

**LSM Trees (Log-Structured Merge Trees)** — Used by Cassandra, RocksDB, LevelDB, InfluxDB. The write path appends to an in-memory structure (often a skip list or red-black tree), which periodically flushes to sorted files on disk. Background compaction merges these files. Reads are slower than B-trees (must check multiple levels), but writes are dramatically faster because they're always sequential.

This is why Cassandra is common in write-heavy time-series workloads and Postgres is common in read-heavy transactional workloads. The choice of tree structure inside the storage engine shapes the entire operational profile of the database.

**BST in application code:** You rarely implement a BST directly, but sorted maps (Go's `btree` package, Java's `TreeMap`, Python's `sortedcontainers.SortedDict`) are BST-backed and give you ordered iteration, range queries, and floor/ceiling lookups. Use one when you need "the 10 most recent unique events" or "all requests between timestamp A and timestamp B."

---

### Heaps — Always-Available Minimum (or Maximum)

A heap is a partially ordered tree stored as an array. The invariant: every parent is smaller than its children (min-heap) or larger (max-heap). This gives you:
- O(1) access to the minimum (or maximum)
- O(log n) insertion
- O(log n) extraction of the minimum

**Top-K pattern:** "Find the top 10 most error-prone services out of 10,000." Maintain a min-heap of size 10. For each new service error count, if it's larger than the heap's minimum, pop the minimum and push the new value. After processing all services, the heap contains the top 10. Time: O(n log k). Space: O(k). This is more efficient than sorting everything when k << n.

**Priority scheduling:** Every task queue that supports priority — Kubernetes scheduler, Celery with priority queues, Linux's process scheduler (conceptually) — uses a heap or a structure with equivalent guarantees.

**Timer wheels vs. heaps:** Many high-performance timer systems use a wheel (circular buffer) for O(1) timer operations when timeouts are bounded and quantized. Heaps are used when timeouts are arbitrary. Understanding the tradeoff lets you explain why Nginx's event loop uses a red-black tree for timers rather than a simple heap.

**Real example:** Elasticsearch's top-hits aggregation uses a heap internally. When you ask for the top 100 results across a billion documents, each shard maintains a local heap of 100, then the coordinator merges k heaps — a heap of heaps.

---

### Stacks and Queues — The Shape of Traversal

These are less about the structure and more about the access pattern.

**Stack (LIFO):**
- DFS traversal — explore one path to its end before backtracking
- Recursion is an implicit stack — every function call frame is pushed, returns pop it
- Undo/redo in editors, back navigation in browsers
- Expression evaluation and syntax parsing

In an interview, if you're solving a tree problem recursively, you're using a stack. If the interviewer says "now do it iteratively," you maintain an explicit stack yourself.

**Queue (FIFO):**
- BFS traversal — explore all neighbors at depth d before depth d+1
- Task queues — RabbitMQ, SQS, Kafka (at its simplest abstraction) are durable queues
- Rate limiting with a sliding window — maintain a queue of timestamps, drop expired ones from the front
- Level-order tree traversal

**Deque (double-ended queue):** Push and pop from both ends in O(1). Useful for sliding window problems — add to the back, remove from the front, and maintain a secondary deque of indices for "minimum in window" problems.

**Real example:** Kubernetes uses a work queue (FIFO) for reconciliation loops. When a resource changes, the controller enqueues the resource key. The worker dequeues, reconciles, and either requeues on failure or drops the item on success. The queue provides backpressure and retry semantics without the workers needing to know about each other.

---

## DAY 2 — Beyond the Basics

### Graphs — When Relationships Are the Point

Almost every interesting infrastructure problem is a graph problem in disguise.

**Representations:**
- Adjacency list — array of arrays, where `adj[v]` contains v's neighbors. Space O(V + E). Efficient for sparse graphs (most real-world graphs).
- Adjacency matrix — 2D array where `matrix[u][v] = weight`. Space O(V²). Efficient for dense graphs and "is there an edge between u and v?" queries.

**Traversal algorithms:**
- BFS — finds shortest path in unweighted graphs. Explores by distance from source. Use when you want the minimum number of hops.
- DFS — explores depth-first. Use for cycle detection, topological sort, connected components.
- Dijkstra's — shortest path in weighted graphs with non-negative edges. O((V + E) log V) with a heap.
- Topological sort — ordering nodes such that all edges point forward. Required for dependency resolution — build systems, package managers, DAG-based workflow engines.

**Real examples:**
- Service mesh dependency graph: if Service A calls B which calls C, and C is slow, you need to trace the call graph. This is a directed graph traversal.
- Network routing: BGP computes shortest paths across the internet graph.
- Kubernetes scheduling: node affinity constraints form a constraint graph. The scheduler finds a node satisfying all constraints — constraint satisfaction on a graph.
- Terraform's execution plan: resources with dependencies form a DAG. Terraform runs a topological sort, then executes independent nodes in parallel.

In interviews, recognize when a problem description contains "connected," "reachable," "shortest path," "detect cycle," or "dependency" — those are graph signals.

---

### Tries — Prefix Power

A trie is a tree where the path from root to a node spells out a key. All keys with the same prefix share the same path from the root.

**Why it matters:**
- Lookup is O(k) where k is key length — independent of how many keys are stored
- Prefix queries are O(k + results) — impossible to beat with a hash map
- Memory can be compressed with path compression (Patricia trie, radix tree)

**Real examples:**
- Autocomplete: every search engine, IDE, and terminal completion tool uses a trie or equivalent. Given prefix "api", return all keys starting with "api" — walk to the "api" node, then enumerate descendants.
- IP routing: routers use a radix trie (Patricia trie) over binary representations of IP prefixes. Longest-prefix matching — "which route is most specific for this destination IP?" — is a trie lookup. Linux's FIB (Forwarding Information Base) is a trie.
- DNS: the DNS hierarchy is literally a trie walked right-to-left (`.com` → `example` → `api`).

In interviews, tries appear as "implement autocomplete," "word search in a grid," or "find all words with this prefix." Recognize the prefix pattern and reach for a trie.

---

### Bloom Filters — Probabilistic Membership at Scale

A Bloom filter answers "is this element in the set?" with two possible answers: "definitely not" or "probably yes." There are no false negatives. False positive rate is tunable by adjusting the bit array size and number of hash functions.

**The mechanism:** Hash the element with k independent hash functions. Set those k bits to 1 in the bit array. To query, hash the element again — if all k bits are 1, probably present; if any bit is 0, definitely absent.

**Why this is powerful at scale:**
- Space: a Bloom filter representing 1 million elements with 1% false positive rate uses about 9.6 bits per element — under 1.2 MB. A hash set of the same elements might require 10–100x more.
- Speed: O(k) per operation where k is typically 7–15 — faster than most hash lookups for large key sets because you never follow pointers.

**Real examples:**
- Google Bigtable and Cassandra use Bloom filters per SSTable. Before checking a disk file for a key, check the filter. If "definitely not," skip the file. This eliminates most unnecessary disk reads.
- Chrome uses a Bloom filter for its safe browsing list — checking millions of malicious URLs locally without downloading the full list.
- Akamai uses Bloom filters to avoid caching one-hit-wonder objects — only cache something on its second request.
- Postgres 16 added Bloom filter indexes for equality queries on multiple columns.

⚠️ Bloom filters cannot delete elements (standard variant). Counting Bloom filters support deletion but use more space. Don't reach for a Bloom filter when you need exact membership — use a hash set.

---

### Sorting — When Order Is the Answer

Most of the time, you use a library sort and don't think about it. But knowing when sorting is the right move — and what the library is doing — matters.

**When to sort:**
- Deduplication: sort, then scan for adjacent duplicates. O(n log n) time, O(1) extra space.
- Interval merging: sort intervals by start time, then merge overlapping ones in a single pass.
- Scheduling problems: sort by deadline, duration, or weight depending on the objective.
- Binary search setup: you can only binary search a sorted collection.

**Algorithm properties:**

| Algorithm | Time | Space | Stable | Use When |
|---|---|---|---|---|
| Quicksort | O(n log n) avg | O(log n) | No | General purpose, cache-friendly |
| Mergesort | O(n log n) | O(n) | Yes | Stable sort required, linked lists |
| Heapsort | O(n log n) | O(1) | No | Guaranteed worst-case, no extra space |
| Timsort | O(n log n) | O(n) | Yes | Real-world data with natural runs (Python, Java default) |
| Counting sort | O(n + k) | O(k) | Yes | Integer keys, small range k |
| Radix sort | O(nk) | O(n + k) | Yes | Fixed-width keys (IPs, timestamps) |

In interviews, always ask: "Is the input already partially sorted? Are keys integers in a bounded range? Do I need stable sort?" Those answers determine whether a linear-time sort is available.

---

### Binary Search — Not Just for Arrays

Binary search is a mindset, not just an algorithm. Any time you have a monotonic function — "this value is too low, this value is too high" — you can binary search the answer space.

**Pattern:**
```
lo, hi = min_possible, max_possible
while lo < hi:
    mid = (lo + hi) // 2
    if condition(mid):
        hi = mid
    else:
        lo = mid + 1
return lo
```

**Real infrastructure uses:**
- Bisecting a deployment: "the bug was introduced between commit A and commit B" — `git bisect` is binary search over a commit history.
- Finding a performance threshold: "at what request rate does p99 latency exceed SLO?" — binary search the rate.
- Capacity planning: "what's the minimum number of shards to keep each shard under 100 GB?" — binary search over shard count.
- Sorted log files: binary search by timestamp to find the start of a time window without scanning from the beginning.

---

### Big-O Comparison Table

| Structure | Access | Search | Insert | Delete | Space |
|---|---|---|---|---|---|
| Array | O(1) | O(n) | O(n) | O(n) | O(n) |
| Linked List | O(n) | O(n) | O(1)* | O(1)* | O(n) |
| Hash Map | O(1) avg | O(1) avg | O(1) avg | O(1) avg | O(n) |
| BST (balanced) | O(log n) | O(log n) | O(log n) | O(log n) | O(n) |
| Heap | O(1) min | O(n) | O(log n) | O(log n) | O(n) |
| Trie | O(k) | O(k) | O(k) | O(k) | O(n·k) |
| Graph (adj. list) | — | O(V+E) | O(1) | O(E) | O(V+E) |

\* O(1) only when you already hold a pointer to the node.

---

### Choosing the Right Structure

Before picking a data structure, answer three questions:

1. **What operations do I need?** If you need ordered iteration and range queries, a sorted tree. If you need O(1) lookup by key, a hash map. If you need the minimum repeatedly, a heap.

2. **What are the constraints?** If memory is tight, a Bloom filter instead of a hash set. If writes are dominant, an LSM tree instead of a B-tree. If the key space is bounded integers, an array instead of a hash map.

3. **What is the access pattern?** Sequential reads favor arrays. Random reads favor hash maps. Hierarchical relationships favor trees. Many-to-many relationships favor graphs.

Write this on paper during interviews. It signals that you reason about tradeoffs, not just syntax.

---

## Worked Example — Design a Log Search System

You're asked to design a system to ingest logs from 1,000 services, index them, and support queries like "find all ERROR logs from service X in the last hour" and "what are the top 10 most frequent error messages today?"

Walk through each layer and name the structure.

**Ingestion and deduplication:** Logs often arrive duplicated (retry storms, at-least-once delivery). Use a hash map keyed by a fingerprint (service + timestamp + message hash) with a TTL. O(1) dedup check per log line.

**Existence check before indexing:** Before writing a log to the index, check a Bloom filter per time-window. If the log fingerprint is "definitely not seen," write it and add to the filter. Avoids loading the full index for duplicate checks. False positives mean occasional redundant writes — acceptable.

**Index for range queries:** Store log entries in a B-tree index keyed by (service, timestamp). A range query "service X, last hour" becomes a B-tree range scan — O(log n + results). This is exactly how Elasticsearch's Lucene indexes work under the hood, and how Postgres handles `WHERE service = 'X' AND ts > now() - interval '1 hour'`.

**Full-text search:** For "find logs containing ERROR," an inverted index is a specialized hash map: word → list of document IDs. Lucene, Elasticsearch, and PostgreSQL's full-text search all use inverted indexes.

**Top-K error messages:** Maintain a min-heap of size K. As logs are processed, update a frequency hash map (message → count). When a message's count increases, check if it belongs in the top K using the heap. O(log K) per update. At query time, the heap gives you the top K in O(K log K).

**Serving recent logs with low latency:** Keep the last N minutes of logs in a circular buffer (array with head/tail pointers). O(1) append, O(1) eviction of old entries, O(n) scan of recent window. Elasticsearch uses in-memory segment buffers for exactly this reason.

Each layer required a different structure because each layer has different dominant operations. That reasoning process — not memorizing the structures themselves — is what the interviewer is evaluating.

---

## Pitfalls

**Defaulting to hash maps for everything.** Hash maps are not ordered. If you store events in a hash map and then need them in time order, you've paid the insert cost and now need to sort. Use a sorted structure from the start when order matters.

**Ignoring constant factors.** O(n log n) quicksort is faster than O(n log n) mergesort in practice on most inputs because of cache locality. Big-O hides constants. At small n (under a few hundred elements), insertion sort beats both. Know when to reach for the theoretically suboptimal but practically faster option.

**Assuming hash map operations are always O(1).** Under high load factor or adversarial inputs, they degrade. Python dicts and Go maps rehash at capacity limits — during rehashing, a single insert is O(n). In latency-sensitive paths, consider whether worst-case matters.

**Treating trees as interchangeable.** A BST, a B-tree, a red-black tree, an AVL tree, and an LSM tree solve different problems. Saying "use a tree" in an interview without specifying which one and why signals shallow understanding.

**Using a Bloom filter when you need exact membership.** False positives mean you will sometimes believe an element is present when it isn't. If that leads to skipping a real query or blocking a legitimate request, the tradeoff is unacceptable. Know when exactness is required.

**Forgetting about space.** Tries use significant memory for sparse key sets. Adjacency matrices use O(V²) space — infeasible for large sparse graphs. Always ask "how much data is this?" before choosing a structure.

**Over-engineering in interviews.** If the problem is "find the most frequent word in a file," the answer is a hash map, not a trie with compressed paths and a Bloom filter pre-check. Match complexity to the problem.

---

## Quick Reference

### Data Structure Comparison

| Structure | Core Strength | Dominant Operations | Real System |
|---|---|---|---|
| Array | Sequential access, indexing | Read O(1), append O(1) amortized | Prometheus time-series, ring buffers |
| Hash Map | Key-value lookup | Get/set/delete O(1) avg | Redis, Nginx rate limiting, caches |
| B-tree | Ordered, range queries | Search/insert/delete O(log n) | Postgres indexes, filesystem metadata |
| LSM tree | Write throughput | Write O(1) amortized, read O(log n) | Cassandra, RocksDB, InfluxDB |
| Min-heap | Repeated minimum access | Extract-min O(log n), insert O(log n) | Kubernetes scheduler, top-K, Dijkstra |
| Trie | Prefix search | Lookup/insert O(k) | Autocomplete, IP routing, DNS |
| Bloom filter | Space-efficient membership | Query O(k), insert O(k) | Bigtable, Cassandra SSTable, Chrome |
| Graph (adj. list) | Relationship traversal | BFS/DFS O(V+E) | Service mesh, Terraform DAG, BGP |
| Queue | Ordered processing | Enqueue/dequeue O(1) | Kubernetes work queue, RabbitMQ |
| Stack | LIFO access | Push/pop O(1) | DFS, recursion, expression parsing |

### Big-O Cheatsheet

| Complexity | Name | Example |
|---|---|---|
| O(1) | Constant | Hash map lookup, array index |
| O(log n) | Logarithmic | Binary search, balanced tree |
| O(n) | Linear | Array scan, hash map iteration |
| O(n log n) | Linearithmic | Mergesort, Timsort, Heapsort |
| O(n²) | Quadratic | Nested loops, bubble sort |
| O(2ⁿ) | Exponential | Brute-force subset enumeration |
| O(n!) | Factorial | Brute-force permutations |

Rule of thumb: O(n log n) is acceptable for most interview problems. O(n²) is acceptable only for small n (< 1,000). O(2ⁿ) is a signal to look for dynamic programming.

---

## Next Steps

- `Coding-Interview.md` — translating these structures into interview solutions under time pressure
- `System-Design-Interview.md` — applying them at scale with replication, sharding, and consistency tradeoffs
- `PostgreSQL.md` — B-tree indexes, query planning, and when the DB's data structures are working for or against you
- `Redis.md` — hash maps, sorted sets, streams, and bloom filters as managed infrastructure primitives

---

## Recommended learning resources

**YouTube channels & playlists:**
- [NeetCode — Data Structures and Algorithms](https://www.youtube.com/@NeetCode) — pattern-based problem solving: arrays, trees, graphs, dynamic programming, and the NeetCode 150 roadmap
- [Abdul Bari — Algorithms](https://www.youtube.com/@abdul_bari) — clear, whiteboard-style explanations of sorting, searching, graph algorithms, and complexity analysis
- [Back To Back SWE — Algorithm Deep Dives](https://www.youtube.com/results?search_query=back+to+back+swe+data+structures) — detailed walkthroughs of tries, heaps, segment trees, and advanced patterns
- [Errichto — Competitive Programming](https://www.youtube.com/results?search_query=errichto+algorithms) — advanced algorithm techniques and optimisation strategies
- [ByteByteGo — Visual Data Structures](https://www.youtube.com/@ByteByteGo) — visual explanations of how data structures work under the hood

**Official docs & blogs:**
- [neetcode.io — Roadmap and Practice](https://neetcode.io/) — structured problem roadmap by pattern with video explanations
- [Big-O Cheat Sheet](https://www.bigocheatsheet.com/) — time and space complexity reference for all common data structures and algorithms

---

## The Mantra

**Know your access pattern before you pick your structure. The right tool chosen for the wrong reason is still the wrong choice.**

Every structure in this guide exists because someone hit a performance wall and needed to reason carefully about what operations mattered most. You don't need to memorize all of them — you need to internalize the question: *what does this system actually need to do fast?*

When you can answer that and explain why the structure you chose serves that need, you've moved from memorizing algorithms to thinking like an engineer.
