# Coding Interview — A 2-Day Crash Course

A practical framework for passing the coding round as an SRE, DevOps, or Platform engineer — focused on problem-solving process, communication, and the pattern recognition that actually matters, not algorithmic grinding.

---

## Part 0 — Why This Is Different

SRE and Platform coding interviews are not LeetCode competitions. The interviewer is not trying to catch you on dynamic programming or graph traversal. They are watching how you think when you hit a problem you have never seen before.

The signal they want:

- Can you break a vague problem into concrete steps?
- Do you write readable, maintainable code — not just code that runs?
- Can you reason about failure modes, edge cases, and production behavior?
- Do you communicate while you work, or go dark and hope for the best?

The problems themselves tend to be grounded in real SRE work: parsing logs, building small automation tools, transforming data, writing retry logic, implementing a basic rate limiter. You are not expected to memorize Dijkstra's algorithm. You are expected to solve a problem a junior engineer might file a ticket for.

Two days is enough to get from zero to confident, if you spend them on the right things.

---

## Vocabulary

These terms come up constantly. Know them cold.

**Time Complexity (Big-O)** — How the runtime of your solution scales with input size. O(n) means linear: double the input, roughly double the time. O(n²) means quadratic: double the input, four times the time. You need to state this for every solution you give.

**Space Complexity** — How much memory your solution uses relative to input size. O(1) is constant — no extra memory regardless of input size. O(n) means you are storing something proportional to the input.

**Edge Cases** — Inputs that are unusual, boundary-touching, or potentially breaking. Empty input, null values, a single element, very large input, duplicate values, negative numbers. Always name these out loud before you code.

**Brute Force** — The naive, obvious solution that works but may be slow. Start here. Always. A working brute force is worth more in an interview than a half-finished optimization.

**Optimize** — Moving from the brute force to a more efficient solution by identifying the bottleneck and eliminating redundant work.

**Test Cases** — Specific inputs you run through your code mentally (or literally) to verify correctness. A basic case, an edge case, and a stress case.

**Clarifying Questions** — Questions you ask the interviewer before writing a single line of code. What format is the input? What should I return? Are there constraints on memory or time? Can input be empty?

**Pseudocode** — Writing the logic of your solution in plain English or rough code before committing to syntax. Faster to draft, easier to change.

**Dry Run** — Manually tracing your code line by line with a specific input to verify it does what you think it does before submitting.

---

## DAY 1 — The Framework

### The Six Steps

Every problem, without exception, goes through these six steps in order. Never skip ahead. Never start coding at step one.

**1. Clarify**

Spend two to three minutes here. Ask the interviewer:

- What is the input format and type?
- What should I return?
- What are the constraints? (input size, character set, value ranges)
- Are there duplicates? Can values be negative? Can the input be empty?
- Do I need to handle errors, or assume valid input?

This signals maturity. Jumping straight to code without clarifying is the most common red flag interviewers report.

**2. Work Examples**

Take the example the interviewer gives you. Trace through it by hand. Then create your own example — one slightly different, one edge case. This forces you to understand the problem before you think about the solution.

Say it out loud: "Let me walk through this example — if the input is X, I expect the output to be Y because..."

**3. Brute Force**

State the simplest solution that works. Do not apologize for it. Say: "The brute force approach is to do X. That is O(n²) time and O(1) space. Let me describe it before we optimize."

Even if you already know the optimal solution, naming the brute force shows you understand the problem space.

**4. Optimize**

Ask: what is the bottleneck? What work is being repeated? What data structure would give me faster lookups here?

Common upgrades:
- Nested loop → hash map for O(1) lookup
- Repeated sort → use a heap or keep data sorted incrementally
- Linear scan → binary search if input is sorted
- Multiple passes → single pass with a running state

**5. Code**

Now write actual code. Use the language you know best. In SRE interviews, Python and Go are the most common and most expected. If you ask "can I use Python?" the answer is almost always yes.

Write clean code. Name variables what they are. Add a comment for any non-obvious step. Do not optimize prematurely inside the code — write readable first.

**6. Test**

Walk through your code with the example input. Then try an edge case. Say what you expect at each step. If you find a bug, fix it calmly — finding your own bugs is a positive signal, not a negative one.

---

### How to Think Out Loud

This is a separate skill from coding. You need to narrate your thought process, not just produce output. The interviewer cannot read your mind. If you go quiet for three minutes, they do not know if you are about to solve it or completely lost.

Practice these phrases:

- "My first instinct is to..."
- "I am thinking about this edge case where..."
- "I could use a hash map here to avoid the nested loop..."
- "Let me trace through this to make sure my logic is right..."
- "I think this is O(n log n) because of the sort — does that concern you?"
- "I am stuck on X — let me think through it differently..."

You are not performing. You are collaborating. The interview is a simulation of the kind of thinking-out-loud you would do when pair debugging with a teammate at 2am.

---

### Common SRE Coding Topics

These are the domains that actually come up. Know these, not competitive programming.

**String and Log Parsing** — Extract fields from log lines, count occurrences, filter by pattern, parse structured text. You will see this format constantly: `2024-01-15 10:23:45 ERROR [auth-service] Connection timeout host=db01`.

**API Calls and HTTP** — Write a function that calls an endpoint, handles retries, respects rate limits, parses JSON response, handles HTTP errors gracefully.

**Automation Scripts** — Given a directory of files, do X. Given a list of servers, do Y. Filter, transform, aggregate, report.

**Data Transformation** — Convert one data format to another, normalize fields, merge datasets, compute aggregates.

**Basic Algorithms** — Sorting, searching, deduplication, frequency counting, two-pointer problems on lists. Not advanced algorithms — practical ones.

---

### Python vs Go as Interview Languages

**Python** — Use this if you know it. It is fast to write, readable, and has excellent standard library support for strings, files, collections, and HTTP. The `collections` module alone covers 40% of what you need.

**Go** — Use this if the role is heavy on Go infrastructure. It forces you to think about error handling explicitly, which is actually what good SRE code does. The downside is verbosity — it takes more lines to express the same logic.

Whichever you choose, know these by heart:
- String splitting, joining, stripping, replacing
- Reading a file line by line
- Dictionary/map creation and lookup
- List/slice filtering and sorting
- Basic error handling

---

## DAY 2 — Patterns and Live Coding

### The 15 Patterns That Cover 80% of Problems

You do not need to know 200 patterns. You need to know these 15 well enough to recognize them fast.

**1. Hash Map / Frequency Count**
Use when: counting occurrences, fast lookup, grouping by key.
Signal phrase: "find all X that appear more than Y times", "group by", "find duplicates".

**2. Two Pointers**
Use when: working on a sorted array or string, finding pairs, comparing from both ends.
Signal phrase: "find two elements that sum to X", "reverse a string in place", "remove duplicates from sorted array".

**3. Sliding Window**
Use when: finding a subarray or substring of a specific size or property, moving through input without restarting.
Signal phrase: "maximum sum subarray of size k", "longest substring without repeating characters".

**4. Stack**
Use when: matching brackets, tracking "last seen", processing in LIFO order.
Signal phrase: "valid parentheses", "evaluate expression", "find the next greater element".

**5. BFS (Breadth-First Search)**
Use when: shortest path in an unweighted graph, level-by-level traversal.
Signal phrase: "shortest path", "minimum steps", "all nodes at distance k".

**6. DFS (Depth-First Search)**
Use when: exploring all paths, tree traversal, connected components.
Signal phrase: "all paths", "can you reach", "connected components".

**7. Binary Search**
Use when: input is sorted, or you can define "too big" / "too small" on the answer.
Signal phrase: "find in sorted array", "minimum/maximum value that satisfies condition", "search in rotated array".

**8. Sorting + Greedy**
Use when: locally optimal choices lead to a globally optimal result, ordering matters.
Signal phrase: "minimum number of X", "schedule tasks", "assign intervals".

**9. Recursion / Divide and Conquer**
Use when: problem breaks into identical subproblems.
Signal phrase: "generate all", "all combinations", "merge sort"-style problems.

**10. Prefix Sum**
Use when: repeated range sum queries on an array.
Signal phrase: "sum of elements from index i to j", "count subarrays with sum k".

**11. Heap / Priority Queue**
Use when: repeatedly need the k smallest or largest, top-k problems, streaming data.
Signal phrase: "top k", "kth largest", "merge k sorted lists".

**12. Graph — Adjacency List**
Use when: representing relationships, dependencies, connections.
Signal phrase: "build a dependency graph", "find cycles", "topological sort".

**13. String Pattern Matching**
Use when: searching for substrings, regex-like problems, anagram detection.
Signal phrase: "find all anagrams", "check if string contains pattern", "longest common prefix".

**14. Matrix Traversal**
Use when: 2D grid problems, flood fill, island counting.
Signal phrase: "grid", "matrix", "connected cells", "island".

**15. Memoization / Dynamic Programming (Light)**
Use when: recursive solution has overlapping subproblems, you are recomputing the same state.
Signal phrase: "number of ways", "minimum cost path", "can you reach end".

For SRE roles, patterns 1–9 cover the vast majority of what you will actually see.

---

### SRE-Specific Coding Problems

These are the domain problems that show up specifically in SRE and Platform interviews. Practice these concretely.

**Health Checker** — Takes a list of URLs, makes concurrent GET requests, returns `{url: status}`. Key concerns: timeouts per request, catching `ConnectionError` and `Timeout` separately, not letting one failure kill the batch. Use `ThreadPoolExecutor` + `as_completed` for concurrency. Return `"up"` / `"down"` / `"timeout"` / `"error"` as status strings.

**Log Parser** — See the worked example section below.

**Rate Limiter (Token Bucket)** — Track `tokens` (float) and `last_refill` timestamp. On each `allow()` call: compute elapsed time, refill tokens up to `rate` ceiling, then consume one token if available. The key is using `time.monotonic()` — never wall clock — and storing tokens as float so fractional refills accumulate correctly.

**CLI Tool Pattern** — Know `argparse` in Python or `flag` in Go cold. The pattern is always: parse args → validate inputs → open file with proper error handling → process → output. Handle `FileNotFoundError` explicitly and exit with code 1, not a traceback.

---

### Live Coding Tips

**Start slow to go fast.** Spending two minutes clarifying and outlining saves ten minutes of rewriting wrong code.

**Type out loud.** As you write each function or loop, say what it does. "I am iterating over each line, splitting on whitespace, and taking the first field as the IP."

**If the syntax escapes you, say so.** "I know Python's heapq module has a nlargest function — let me write the logic manually to be safe." Interviewers do not penalize you for not memorizing standard library signatures.

**Use descriptive names.** `ip_count` not `d`. `log_line` not `l`. You are writing code you would actually commit to a repo.

**Leave comments for complex parts.** A one-line comment on a non-obvious regex or bit manipulation shows you know what you wrote.

---

### Handling "I'm Stuck"

Being stuck is not failure. Staying stuck silently is. When you hit a wall:

**Restate the problem.** "I need to find X given Y and return Z." Sometimes this alone unlocks it. **Work a tiny example by hand** — what would you do manually with three items? **Name what you know** — listing known constraints often reveals the missing piece. **Ask for a hint** — "Is there a constraint I should be thinking about?" is a seniority signal, not weakness. **Pick the brute force and move** — a working O(n²) solution beats a broken optimal one every time.

---

## Worked Example — Log Parser

**Problem:** Write a function that parses a log file and returns the top 10 IPs by request count.

**Sample log line:**
```
192.168.1.1 - - [15/Jan/2024:10:23:45 +0000] "GET /api/health HTTP/1.1" 200 512
```

### Step 1: Clarify

"A few quick questions: Is this always Apache/Nginx combined log format, or could it vary? Should I handle malformed lines? Is 'top 10' always 10, or should it be configurable? Can the file be very large — should I stream it or load it all at once?"

Assume: standard format, skip malformed lines, top N is configurable, file can be large so stream it.

### Step 2: Example

Input line: `192.168.1.1 - - [15/Jan/2024:10:23:45 +0000] "GET /api/health HTTP/1.1" 200 512`

The IP is always the first whitespace-delimited field. So `line.split()[0]` gets it.

Output: `[("192.168.1.1", 47), ("10.0.0.5", 31), ...]` — sorted by count, descending, top 10.

### Step 3: Brute Force

Read all lines, split each, take field 0, build a dict counting occurrences, sort by value, return top 10.

Time: O(n log n) — dominated by the sort.
Space: O(u) where u is unique IPs.

This is already decent. But we can improve the "get top 10" part.

### Step 4: Optimize

Instead of sorting all IP counts to find the top 10, use a heap. `heapq.nlargest(n, counter.items(), key=lambda x: x[1])` runs in O(u log k) where k=10 — faster when there are many unique IPs.

For very large files, stream line by line rather than loading into memory.

### Step 5: Code

```python
import heapq
from collections import defaultdict

def top_ips(filepath: str, n: int = 10) -> list[tuple[str, int]]:
    """Return top n IPs by request count. Streams file, skips malformed lines."""
    ip_count: dict[str, int] = defaultdict(int)

    with open(filepath, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) < 1:
                continue  # malformed line — skip silently
            ip = parts[0]
            ip_count[ip] += 1

    return heapq.nlargest(n, ip_count.items(), key=lambda x: x[1])
```

### Step 6: Test

Run three cases mentally before saying done:

- Normal input: five lines for `1.1.1.1`, three for `2.2.2.2` → `[("1.1.1.1", 5), ("2.2.2.2", 3)]` ✓
- Empty file → `[]` — `nlargest` on empty dict returns empty list ✓
- Fewer than 10 unique IPs → returns all of them, no crash — `nlargest` handles n > len(iterable) gracefully ✓

### Complexity

Time: O(n) to scan + O(u log k) for heap — effectively O(n). Space: O(u) unique IPs.

---

## Pitfalls

**Starting to code without clarifying.** You solve the wrong problem and have to restart. Always ask first.

**Narrating nothing.** The interviewer does not know if you are thinking or frozen. Say something.

**Jumping to the optimal solution and getting it wrong.** A correct brute force beats a broken optimal. Brute force first.

**Forgetting edge cases until the end.** Bring them up early: "What happens if the file is empty? What if a line is malformed?" This shows production thinking.

**Apologizing for your code.** "Sorry this is messy" is noise. Either clean it up or do not, but narrating your own dissatisfaction wastes time and signals low confidence.

**Using vague variable names.** `x`, `temp`, `data`, `result` with no context — these slow down both you and the interviewer following your logic.

**Not testing your own code.** Trace through at least one example before saying "I think this is done." It is almost never done on the first pass.

**Treating silence as failure.** Pausing to think is fine. Pausing for 30 seconds with zero narration is not. Bridge the gap: "Give me a moment to think through the edge case here."

---

## Quick Reference

### Big-O Cheatsheet

| Operation | Complexity |
|---|---|
| Array access by index | O(1) |
| Hash map get / set | O(1) average |
| Array linear scan | O(n) |
| Sort (comparison-based) | O(n log n) |
| Nested loop over same array | O(n²) |
| Binary search | O(log n) |
| BFS / DFS on graph | O(V + E) |
| Heap insert / extract | O(log n) |
| Heap nlargest(k, n items) | O(n log k) |

### Pattern Decision Tree

```
Do you need fast lookup or counting?
  → Hash map

Is the input sorted, or can you sort it?
  → Two pointers, binary search, or greedy

Do you need the k largest/smallest?
  → Heap

Is it a sequence / window problem?
  → Sliding window

Is it a tree or graph problem?
  → BFS (shortest path) or DFS (all paths, components)

Are you tracking a "last seen" or matching brackets?
  → Stack

Does the problem have overlapping subproblems?
  → Memoization
```

### Python Snippets

```python
# Frequency count
from collections import Counter
counts = Counter(items)
top_10 = counts.most_common(10)

# Default dict for grouping
from collections import defaultdict
groups = defaultdict(list)
groups[key].append(value)

# Heap — top k
import heapq
top_k = heapq.nlargest(k, iterable, key=lambda x: x[1])

# Read file line by line (streaming — handles large files)
with open(path) as f:
    for line in f:
        process(line.strip())

# Regex field extraction
import re
pattern = re.compile(r'(\d+\.\d+\.\d+\.\d+)')
match = pattern.search(line)
if match:
    ip = match.group(1)
```

### Go Snippets

```go
// Frequency count
counts := make(map[string]int)
counts[key]++

// Stream file line by line
file, _ := os.Open(path)
defer file.Close()
scanner := bufio.NewScanner(file)
for scanner.Scan() {
    parts := strings.Fields(scanner.Text())
    if len(parts) > 0 { counts[parts[0]]++ }
}
```

---

## Next Steps

- `Algo-DS-Cheatsheets.md` — data structures and algorithm patterns with complexity tables
- `System-Design-Interview.md` — open-ended architecture questions for SRE roles
- `Python-for-SRE.md` — Python idioms and standard library patterns for infrastructure work

---

## The Mantra

You are not here to impress with brilliance. You are here to show that you solve problems the way a good engineer does — by understanding the problem first, starting simple, thinking out loud, and iterating until it works.

The process is the signal. The code is the artifact.

Show the process.
