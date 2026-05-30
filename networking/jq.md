# jq — A 2-Day Crash Course

> **In one sentence:** jq is a command-line tool for slicing, filtering, and reshaping JSON — it
> turns the wall of JSON that APIs and cloud CLIs spit out into exactly the fields you want, right
> in your terminal or scripts.

> Builds on `Linux.md` (pipes) and pairs with `DNS-curl-dig.md` (parsing `curl` output). Almost
> every cloud CLI and API speaks JSON, so jq is everyday glue.

---

## Part 0 — Why jq exists and how to think about it

Modern tooling emits JSON everywhere: `aws ... --output json`, `kubectl get -o json`, `curl` to any
API, `docker inspect`. That JSON is often huge and deeply nested, and you usually want *one field*
or *a filtered list*. Trying to extract it with `grep`/`sed` is painful and fragile because JSON
isn't line-oriented. jq understands JSON's structure, so you can say "give me the `.name` of every
item where `.status` is running" cleanly.

**The mental model: jq is a pipeline, like the shell — but for JSON.** A jq program is a series of
**filters** connected by `|`, where each filter takes the JSON flowing in, transforms it, and
passes it on. The input enters as `.` (the "current value"). `.foo` extracts a field; `|` pipes
the result to the next filter. It mirrors how you already think about shell pipes, just operating
on JSON values instead of text lines.

```
echo '{"a":{"b":5}}' | jq '.a.b'      ->  5
                            ^current value (.) -> field a -> field b
```

**Mental model:** data flows through `.` and gets reshaped at each `|`. Read a jq program left to
right as "take the input, do this, then this, then this."

---

## DAY 1 — Extract and filter

### 1. The basics — identity and field access
```bash
echo '{"name":"api","port":8080}' | jq '.'          # '.' = identity (pretty-print the whole thing)
echo '{"name":"api","port":8080}' | jq '.name'      # "api"   — access a field
echo '{"a":{"b":{"c":1}}}'        | jq '.a.b.c'      # 1       — nested access
jq '.' file.json                                     # pretty-print/validate a file
curl -s https://api/data | jq '.'                    # the canonical pairing with curl
```
`jq '.'` alone pretty-prints and colorizes — already useful just to make JSON readable. `-r`
strips the quotes from string output (essential when feeding values into shell variables):
```bash
echo '{"name":"api"}' | jq -r '.name'    # api   (no quotes — use -r for scripts)
```

### 2. Arrays
```bash
echo '[1,2,3]'              | jq '.[0]'      # 1        — index
echo '[1,2,3]'              | jq '.[]'       # 1 2 3    — iterate (emit each element)
echo '[1,2,3]'              | jq '.[1:]'     # [2,3]    — slice
echo '{"items":[{"id":1},{"id":2}]}' | jq '.items[].id'   # 1 2  — dive into an array of objects
echo '[1,2,3]'             | jq 'length'     # 3
```
`.[]` (iterate) is the workhorse — it "unwraps" an array so subsequent filters apply to each
element. `.items[].id` = "for each item, give me its id."

### 3. Filtering with `select`
```bash
# keep only objects matching a condition
kubectl get pods -o json | jq '.items[] | select(.status.phase != "Running")'
echo '[{"n":"a","up":true},{"n":"b","up":false}]' \
  | jq '.[] | select(.up == false) | .n'           # "b"  — names where up is false
```
`select(condition)` passes through only the values where the condition is true — your main
filtering tool. Combine with `.[]` to filter a list.

### 4. Reshaping — build new objects/arrays
```bash
# pull out just the fields you care about into a tidy object
curl -s https://api/users | jq '.[] | {name: .name, email: .contact.email}'
# collect results back into an array with map or [ ]
jq '[.items[] | {name: .metadata.name, phase: .status.phase}]' pods.json
# arrays of values
jq '[.items[].metadata.name]' pods.json              # ["pod-a","pod-b",...]
```
`{key: .field}` constructs a new object; `[ ... ]` collects a stream back into an array. This is
how you turn verbose API output into exactly the shape you need.

### 5. Raw output for scripts (the practical bit)
```bash
# get a clean, newline-separated list to loop over in bash
for pod in $(kubectl get pods -o json | jq -r '.items[].metadata.name'); do
  echo "pod: $pod"
done
# tab-separated columns
jq -r '.items[] | [.metadata.name, .status.phase] | @tsv' pods.json
```
`-r` (raw) + `@tsv`/`@csv` produce shell- and spreadsheet-friendly output. This is the most common
real-world use: extract values from JSON into a Bash loop.

**By end of Day 1 you can:** pretty-print JSON, access nested fields, iterate arrays, `select`
matching items, reshape into new objects, and emit raw values for scripts. That covers most daily
needs.

---

## DAY 2 — Transform, aggregate, and compute

### 1. `map`, `select`, and array transforms
```bash
echo '[1,2,3,4]' | jq 'map(. * 2)'                 # [2,4,6,8]
echo '[1,2,3,4]' | jq 'map(select(. > 2))'          # [3,4]
jq '.items | map(.metadata.name)' pods.json         # array of names
jq '.items | map(select(.status.phase=="Running")) | length' pods.json   # count running pods
```
`map(f)` applies `f` to each element of an array (and keeps it an array) — `map(select(...))` is
the array-preserving filter (vs `.[] | select(...)` which produces a stream).

### 2. Aggregation and math
```bash
echo '[3,1,2]'  | jq 'add'                  # 6     (sum)
echo '[3,1,2]'  | jq 'max'                  # 3
echo '[3,1,2]'  | jq 'sort'                 # [1,2,3]
jq '[.items[].spec.containers | length] | add' pods.json    # total containers across pods
jq 'group_by(.status.phase) | map({phase: .[0].status.phase, count: length})' pods.json
```
`add`, `min`/`max`, `sort`, `sort_by(.field)`, `group_by(.field)`, `unique` cover most aggregation.

### 3. Built-in functions you'll actually use
```bash
keys           # the keys of an object        -> ["name","port"]
has("name")    # does the key exist?          -> true
to_entries     # object -> [{key,value}]       (great for iterating maps)
from_entries   # the reverse
contains(x)    # membership test
test("regex")  # regex match on a string
ascii_downcase/upcase   ltrimstr/rtrimstr   split(",")   join(", ")
tonumber / tostring     # type conversion
now | todate            # timestamps
```
```bash
# iterate a JSON object's key/value pairs
echo '{"a":1,"b":2}' | jq -r 'to_entries[] | "\(.key)=\(.value)"'   # a=1  b=2
```
`\(.expr)` is **string interpolation** — embed values inside a string, very handy for formatting.

### 4. Conditionals, defaults, and alternatives
```bash
jq '.name // "unknown"'                       # // = default if null/absent
jq 'if .up then "healthy" else "down" end'    # if/then/else
jq '.items[] | .status.phase // "Pending"'    # safe access with a fallback
jq '.a?'                                       # ? = don't error if the path is missing
```
`//` (alternative/default) and `?` (optional) prevent jq from erroring on missing/null fields —
important when API responses are inconsistent.

### 5. Real cloud/k8s examples (where you'll live)
```bash
# AWS: instance IDs + state as a table
aws ec2 describe-instances | jq -r \
  '.Reservations[].Instances[] | [.InstanceId, .State.Name, .PrivateIpAddress] | @tsv'

# Kubernetes: pods not Running, with their node
kubectl get pods -A -o json | jq -r \
  '.items[] | select(.status.phase!="Running") | "\(.metadata.namespace)/\(.metadata.name) on \(.spec.nodeName)"'

# extract a token / nested value from an API response
TOKEN=$(curl -s -X POST https://auth/login -d "$creds" | jq -r '.access_token')

# count by a field
kubectl get pods -o json | jq -r '.items[].status.phase' | sort | uniq -c
```

### 6. Slurp & multiple inputs
```bash
jq -s '.' a.json b.json            # -s "slurp": read multiple JSON inputs into ONE array
jq -s 'add' parts/*.json           # merge many JSON files
echo '{"a":1}{"a":2}'  | jq -s 'map(.a)'   # combine a stream of objects -> [1,2]
cat data.jsonl | jq -c '.'         # -c = compact (one line per object) for JSONL/streaming
```
`-s` (slurp) and `-c` (compact) handle multi-document and line-delimited JSON (JSONL), common in
logs and data pipelines.

---

## Worked example — find and report unhealthy pods
```bash
kubectl get pods -A -o json | jq -r '
  .items[]
  | select(.status.phase != "Running" and .status.phase != "Succeeded")
  | {
      ns:    .metadata.namespace,
      name:  .metadata.name,
      phase: .status.phase,
      restarts: ([.status.containerStatuses[]?.restartCount] | add // 0)
    }
  | "\(.ns)/\(.name)\t\(.phase)\trestarts=\(.restarts)"
'
# reads left to right: each pod -> keep non-Running -> build a summary object
# -> sum restart counts (default 0) -> format as a tab-separated line
```

---

## Common pitfalls
- **Forgetting `-r`.** Without it, strings come out with quotes (`"api"`), which breaks shell
  variables and loops. Use `-r` whenever feeding jq output into Bash.
- **`.[]` vs `.`** confusion. `.[]` emits each array element as a *separate* value (a stream);
  `map(...)` keeps it an *array*. Pick based on whether downstream wants a stream or an array.
- **Erroring on missing fields.** Inconsistent JSON breaks `.a.b.c`. Use `.a.b.c?` or `// default`
  to handle absent/null gracefully.
- **Quoting in the shell.** Wrap the jq program in **single quotes** so the shell doesn't expand
  `$`/`*`. For dynamic values use `--arg`: `jq --arg n "$NAME" '.[] | select(.name==$n)'`.
- **Confusing streams and arrays when slurping.** Multiple JSON docs need `-s` to become one
  array, or jq processes them one at a time.
- **Reaching for grep on JSON.** grep is line-based and brittle on structured data. Use jq —
  that's the whole point.

---

## Quick reference
```bash
# Access
.            identity / whole input        .foo  .foo.bar   nested field
.[]          iterate array (-> stream)     .[0]  .[2:5]     index / slice
.["key"]     field with special chars      ."weird-key"

# Filter / transform
select(cond)                 keep matching        map(f)    transform array elements
map(select(cond))            filter, keep array   to_entries / from_entries
{a: .x, b: .y}               build object         [ .a, .b ]   build array
.x // "default"              fallback             .x?         optional (no error)
if c then a else b end       conditional

# Aggregate
length  add  min  max  sort  sort_by(.f)  group_by(.f)  unique  reverse  flatten
keys  has("k")  contains(x)  any  all

# Strings
"\(.a)/\(.b)"   interpolation     split(",")  join(", ")  ascii_downcase  test("re")
ltrimstr("p")   ltrimstr/rtrimstr   tostring  tonumber

# Output formats
@tsv  @csv  @json  @base64  @uri     (use with -r:  jq -r '... | @tsv')

# CLI flags
-r raw (no quotes)   -c compact (one line)   -s slurp (inputs -> array)
-n null input (build from scratch)   --arg name val (inject a string safely)
--argjson name val (inject JSON)     -e exit code reflects output (for scripts)
```

---

## Next steps after Day 2
- **`yq`** — the same idea for YAML/Kubernetes manifests (see `yq.md`).
- Variables (`... as $x | ...`), `reduce`, and `--slurpfile` for advanced transforms.
- Build small jq "programs" in `.jq` files for reusable, complex extractions.
- Combine with `curl` for API workflows and with `kubectl`/cloud CLIs for ops automation in Bash
  scripts (see `Bash.md`).

**The mantra:** jq is a pipeline for JSON — data flows through `.`, reshaped at each `|`. `.field`
to extract, `.[]` to iterate, `select()` to filter, `{}` to reshape, `-r`+`@tsv` to feed the
shell. Single-quote the program, default missing fields with `//`.
