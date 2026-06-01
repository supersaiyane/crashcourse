# Regex — A 2-Day Crash Course

Regular expressions are the universal pattern-matching language — every tool from grep to Python to Prometheus uses them, and they save hours of manual parsing.

---

## Part 0 — Why Bother

Text is everywhere in SRE work. Logs stream in at thousands of lines per second. Config files need validation. Metric labels need reshaping. Alert rules match on label values. You pipe output through grep, cut it with awk, rewrite it with sed, query it with PromQL relabeling.

Regex is the one skill that multiplies every other tool you already know. A single well-crafted pattern replaces a dozen fragile shell one-liners. It works in grep, sed, awk, Python, Go, JavaScript, Prometheus, Loki, Elasticsearch, and your editor's find-and-replace. Learn it once, use it everywhere.

Two days is enough to be dangerous — dangerous in the good way.

---

## Vocabulary

Before you write a single pattern, get these terms anchored in your head.

**Pattern** — the complete regex expression you write, e.g. `\d{3}-\d{4}`.

**Literal** — a character that matches itself exactly. `a` matches the character `a`. `9` matches `9`.

**Metacharacter** — a character with special meaning: `. * + ? ^ $ | \ [ ] { } ( )`. To match one literally, escape it with `\`.

**Character Class** — a set of characters inside `[ ]`. `[aeiou]` matches any single vowel. `[0-9]` matches any digit.

**Quantifier** — says how many times the preceding element must appear. `*` means zero or more, `+` means one or more, `?` means zero or one, `{n,m}` means between n and m times.

**Anchor** — asserts a position, not a character. `^` anchors to the start of a line. `$` anchors to the end. `\b` anchors to a word boundary.

**Group** — parentheses `( )` group subexpressions for quantifiers or alternation. `(ab)+` matches `ab`, `abab`, `ababab`, and so on.

**Capture Group** — a group that also saves the matched text for later use. `(\d+)` captures one or more digits.

**Backreference** — refers back to what a capture group matched. `\1` refers to the first group. Useful for finding repeated words like `the the`.

**Lookahead / Lookbehind** — zero-width assertions that check context without consuming characters. `foo(?=bar)` matches `foo` only when followed by `bar`. `(?<=foo)bar` matches `bar` only when preceded by `foo`.

**Greedy / Lazy** — quantifiers are greedy by default: they match as much as possible. Add `?` after a quantifier to make it lazy: match as little as possible. `.*` is greedy. `.*?` is lazy.

---

## DAY 1 — The Core Language

### Literals and the dot

The simplest regex is a literal string. `error` matches the substring `error` anywhere in a line.

The dot `.` matches any single character except a newline. `e.ror` matches `error`, `e_ror`, `e3ror`. If you want a literal dot, escape it: `\.`.

### Character classes

`[abc]` matches one character — either `a`, `b`, or `c`.

`[a-z]` matches any lowercase letter. `[A-Za-z0-9]` matches any alphanumeric character.

`[^abc]` — the caret inside brackets negates the class. Matches anything that is not `a`, `b`, or `c`.

Shorthand classes save typing:

| Shorthand | Equivalent      | Meaning          |
|-----------|-----------------|------------------|
| `\d`      | `[0-9]`         | digit            |
| `\D`      | `[^0-9]`        | non-digit        |
| `\w`      | `[a-zA-Z0-9_]`  | word character   |
| `\W`      | `[^a-zA-Z0-9_]` | non-word         |
| `\s`      | `[ \t\r\n\f]`   | whitespace       |
| `\S`      | `[^ \t\r\n\f]`  | non-whitespace   |

### Quantifiers

| Quantifier | Meaning         |
|------------|-----------------|
| `*`        | zero or more    |
| `+`        | one or more     |
| `?`        | zero or one     |
| `{n}`      | exactly n       |
| `{n,}`     | n or more       |
| `{n,m}`    | between n and m |

`\d+` matches one or more digits. `\d{1,3}` matches one to three digits. `colou?r` matches both `color` and `colour`.

### Anchors

`^error` matches `error` only at the start of a line. `error$` matches only at the end. `^error$` matches a line that contains only the word `error`.

`\b` is a word boundary. `\berror\b` matches the word `error` but not `errors` or `noerror`.

### Alternation

`|` means "or". `cat|dog` matches either `cat` or `dog`. Use groups to scope alternation: `gr(a|e)y` matches `gray` or `grey`.

### Basic grouping

Parentheses group subexpressions. `(ab)+` matches `ab`, `abab`, `ababab`. Without the group, `ab+` matches `a` followed by one or more `b`.

### Using regex with grep

```bash
# -E enables extended regex (ERE) — use this by default
grep -E 'error|warn' app.log

# -i case-insensitive
grep -Ei 'error|warn' app.log

# -v invert — lines that do NOT match
grep -Ev '^#|^$' nginx.conf

# -o print only the matched part, not the whole line
grep -Eo '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}' access.log

# -c count matching lines
grep -cE 'HTTP/1.1" 5[0-9]{2}' access.log

# -n show line numbers
grep -nE 'OOMKilled' /var/log/syslog
```

POSIX tools use BRE (Basic Regex Expressions) by default, where `+`, `?`, `{`, `}`, `(`, `)` are literals unless backslash-escaped. Always use `-E` with grep to get ERE behavior and avoid the confusion.

### Using regex with sed

sed uses BRE by default. Pass `-E` (or `-r` on older Linux) for ERE.

```bash
# Replace first match per line
sed 's/foo/bar/' file.txt

# Replace all matches on each line (global flag)
sed 's/foo/bar/g' file.txt

# Delete lines matching a pattern
sed '/^#/d' config.conf

# Extract with capture group — keep only the matched group
echo "2024-01-15 ERROR something failed" | sed -E 's/^([0-9-]+) .*/\1/'

# In-place edit — make a backup first in production
sed -i.bak 's/old_host/new_host/g' app.conf
```

### Using regex with awk

awk uses ERE natively.

```bash
# Print lines matching pattern
awk '/ERROR/' app.log

# Print specific fields from matching lines
awk '/ERROR/ { print $1, $2, $NF }' app.log

# Match on a specific field
awk '$9 ~ /^5[0-9]{2}$/ { print }' access.log

# Use ~ for match, !~ for no-match
awk '$3 !~ /^(GET|POST)$/ { print "Unusual method:", $0 }' access.log
```

---

## DAY 2 — Power Features

### Capture groups and backreferences

Wrap part of a pattern in `( )` to capture it. In sed or tools that support replacement strings, reference captured groups with `\1`, `\2`, etc.

```bash
# Swap first and last name
echo "Doe John" | sed -E 's/^(\w+) (\w+)/\2 \1/'
# Output: John Doe

# Find duplicate words
grep -Eo '\b(\w+) \1\b' draft.txt
```

In Python, captured groups are accessed via `match.group(1)`.

### Non-greedy matching

`.+` is greedy — it consumes as much as possible. `.+?` is lazy — it stops at the first opportunity.

Given the string `<b>bold</b> and <i>italic</i>`:

- `<.+>` matches the entire string from first `<` to last `>` — one big greedy slurp.
- `<.+?>` matches `<b>`, then `</b>`, then `<i>`, then `</i>` — four separate matches.

In log parsing you almost always want lazy matching when extracting fields between delimiters. Better still: use a negated character class like `[^>]+` — it avoids backtracking entirely and is faster.

### Named groups

Instead of `\1`, you can name groups for readability.

Python syntax: `(?P<name>pattern)`
JavaScript / Go / PCRE2 syntax: `(?<name>pattern)`

```python
import re
line = "2024-01-15T08:23:11Z ERROR pod/web-abc123 OOMKilled"
m = re.match(r'(?P<ts>\S+) (?P<level>\w+) (?P<target>\S+) (?P<msg>.+)', line)
if m:
    print(m.group('ts'))     # 2024-01-15T08:23:11Z
    print(m.group('level'))  # ERROR
```

Named groups make long patterns self-documenting and insulate your code from group-number changes when the pattern evolves.

### Lookahead and lookbehind

These are zero-width assertions — they check context without consuming characters.

| Syntax    | Name                | Meaning                   |
|-----------|---------------------|---------------------------|
| `(?=X)`   | positive lookahead  | followed by X             |
| `(?!X)`   | negative lookahead  | NOT followed by X         |
| `(?<=X)`  | positive lookbehind | preceded by X             |
| `(?<!X)`  | negative lookbehind | NOT preceded by X         |

```bash
# Match numbers followed by "ms" but don't capture the "ms"
grep -Po '\d+(?=ms)' timings.log

# Match "error" not preceded by "no "
grep -P '(?<!no )error' app.log
```

⚠️ Lookbehind in PCRE requires fixed-width patterns — `(?<=foo)` is fine, `(?<=fo+)` is not. Python's `re` module has the same restriction; use the third-party `regex` module if you need variable-width lookbehind.

### Regex in Python

```python
import re

# re.search — find anywhere in string, returns first match
m = re.search(r'\d+', 'port 8080 open')
if m:
    print(m.group())  # 8080

# re.match — anchored to start of string
m = re.match(r'\d{4}-\d{2}-\d{2}', '2024-01-15 ERROR ...')

# re.findall — list of all non-overlapping matches
ips = re.findall(r'\b\d{1,3}(?:\.\d{1,3}){3}\b', log_line)

# re.sub — replace matches
clean = re.sub(r'\x1b\[[0-9;]*m', '', colored_output)  # strip ANSI codes

# Compile for repeated use — measurably faster in tight loops
TIMESTAMP_RE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}')
```

Use raw strings `r'...'` for regex in Python. Without the `r`, every `\d` needs to be `\\d` to survive Python's string escaping before the regex engine even sees it.

### Regex in Go

Go's `regexp` package implements RE2 syntax — no lookaheads, no backreferences, but guaranteed linear-time matching regardless of input.

```go
import "regexp"

re := regexp.MustCompile(`(?P<level>ERROR|WARN|INFO)\s+(?P<msg>.+)`)
m := re.FindStringSubmatch(line)
if m != nil {
    idx := re.SubexpIndex("level")
    fmt.Println(m[idx])  // ERROR
}
```

### Regex in JavaScript

```javascript
// Literal syntax with flags
const re = /\d{4}-\d{2}-\d{2}/g;

// String methods
'2024-01-15 error'.match(/\d{4}-\d{2}-\d{2}/);   // ['2024-01-15']
'foo bar'.replace(/(\w+) (\w+)/, '$2 $1');         // 'bar foo'

// Named groups (ES2018+)
const m = '2024-01-15'.match(/(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})/);
console.log(m.groups.y);  // 2024
```

### Common patterns

These are the ones you will reach for most often. Test and adapt them against your actual data — edge cases vary by source.

```
# IPv4 address (loose — allows 999.999.999.999, fine for log extraction)
\b\d{1,3}(?:\.\d{1,3}){3}\b

# IPv4 address (strict — each octet 0-255)
\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b

# Email (good enough for log parsing, not RFC 5321 compliant)
[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}

# ISO 8601 timestamp
\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})

# Syslog timestamp (e.g., Jan 15 08:23:11)
[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}

# HTTP status code
[1-5][0-9]{2}

# URL (permissive)
https?://[^\s"'<>]+

# Key=value pair
(\w[\w.-]*)=("(?:[^"\\]|\\.)*"|\S+)

# JSON string field  "key": "value"
"(\w+)":\s*"([^"]*)"

# UUID
[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}

# Semver
\bv?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[a-z0-9.]+)?\b

# ANSI escape code (strip terminal colors)
\x1b\[[0-9;]*[mGKHF]
```

### Regex performance — catastrophic backtracking

The most dangerous bug in regex is catastrophic backtracking. It happens when a greedy pattern with nested quantifiers fails to match — the engine backtracks through exponentially many possibilities.

Classic trap: `(a+)+b` applied to `aaaaaaaaaaaaaaac`. The engine tries every possible way to split the `a`s between the outer and inner `+`, then fails, tries again, and again. Runtime grows as 2^n.

Rules to avoid it:

1. Never nest quantifiers over the same character class: `(\w+)+` is a trap. `\w+` is fine.
2. Use specific character classes over `.` when you know the character set — `[^"]+` instead of `.+` for quoted fields.
3. For user-supplied regex in a production service, use Go's `regexp` (RE2) or `re2` bindings — guaranteed O(n) matching, no backtracking possible.
4. Test on adversarial input, not just happy-path data.

⚠️ ReDoS (Regular Expression Denial of Service) is a real attack vector. If your service accepts user-supplied patterns, enforce RE2 or evaluate patterns inside a timeout.

### Testing at regex101.com

regex101.com is the best regex sandbox available. Paste your pattern, choose the engine flavor (PCRE2, Python, Go, JavaScript), paste real sample data, and see matches highlighted in real time. The explanation panel breaks down every token. The debugger tab shows exactly how the engine steps through the match — invaluable for diagnosing backtracking.

Use it before putting any pattern into production code.

---

## Worked Example — Parsing Structured Log Lines

You have nginx access logs in this format:

```
10.0.1.42 - alice [15/Jan/2024:08:23:11 +0000] "GET /api/health HTTP/1.1" 200 512 "-" "Go-http-client/2.0"
```

Goal: extract IP, user, timestamp, method, path, and status code.

```python
import re

LOG_RE = re.compile(
    r'(?P<ip>\S+)'           # client IP
    r' \S+ '                 # ident (ignored)
    r'(?P<user>\S+) '        # auth user
    r'\[(?P<ts>[^\]]+)\] '   # timestamp inside [ ]
    r'"(?P<method>\w+) '     # HTTP method
    r'(?P<path>\S+) \S+" '   # request path, skip protocol
    r'(?P<status>[1-5]\d{2})'# status code
)

def parse_access_log(line: str) -> dict | None:
    m = LOG_RE.match(line)
    if not m:
        return None
    return m.groupdict()

# Result:
# {
#   'ip':     '10.0.1.42',
#   'user':   'alice',
#   'ts':     '15/Jan/2024:08:23:11 +0000',
#   'method': 'GET',
#   'path':   '/api/health',
#   'status': '200'
# }
```

The pattern is compiled once outside the function. In a loop over a million log lines, that single compile call pays back immediately.

The timestamp is captured as a raw string — parse it with `datetime.strptime` in a separate step. Keep regex focused on extraction; delegate type conversion to the next layer.

---

## Pitfalls

**Greedy by default.** `<.*>` on `<a>foo</a>` matches the entire string, not just `<a>`. Use `<.*?>` or better yet `<[^>]*>` — no backtracking risk, and faster.

**Dot does not match newline.** Pass `re.DOTALL` in Python (or the `s` flag in JavaScript) if your text spans multiple lines and you need `.` to cross line boundaries.

**Anchors mean different things in multiline mode.** By default, `^` and `$` match start and end of the entire string. Pass `re.MULTILINE` in Python (or `m` flag in JavaScript) to make them match line boundaries within a multi-line string.

**Character class metacharacters.** `[.]` matches a literal dot, not any character. Most metacharacters lose their special meaning inside `[ ]`. You do not need to escape `.` inside brackets, but escaping it is harmless.

**grep without -E.** In BRE mode, `+`, `?`, `{`, `}` are literals unless backslash-escaped. Always use `-E` to avoid this confusion.

**Empty match infinite loops.** In some languages, `re.findall(r'a*', 'bbb')` returns four empty strings because `a*` matches zero times at every position. Handle empty matches explicitly.

**Regex is not a parser.** Do not parse HTML, JSON, or YAML with regex in production. Use a proper parser. Nested and recursive structures are outside what regex can handle reliably — the classic horror story is trying to parse HTML with a single pattern.

**Encoding surprises.** `\w` in Python 3 matches Unicode word characters by default. If you want ASCII only, pass `re.ASCII` or use the explicit class `[a-zA-Z0-9_]`.

---

## Quick Reference — Common Patterns by Use Case

### Infrastructure and logs

```bash
# Find all 5xx responses in nginx access log
grep -Eo '"[A-Z]+ \S+ HTTP/[0-9.]+" 5[0-9]{2}' access.log

# Extract pod names from kubectl output
kubectl get pods | grep -Eo '[a-z0-9][a-z0-9-]{1,61}[a-z0-9]'

# Strip timestamps from log lines for diffing
sed -E 's/^[0-9T:Z.+-]{20,} //' app.log

# Extract all unique IPs from a log file
grep -Eo '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' access.log | sort -u

# Flag lines with response times over 1 second (naive fixed-width approach)
grep -E 'duration=[1-9][0-9]{3,}ms' app.log
```

### Validation and audit

```bash
# Flag config files with hardcoded IP addresses
grep -En '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' *.conf

# Check a file contains only valid semver lines
grep -Ev '^v?[0-9]+\.[0-9]+\.[0-9]+' versions.txt
```

### Transformation with sed

```bash
# Redact passwords in config output before logging
sed -E 's/(password\s*=\s*)\S+/\1[REDACTED]/g'

# Normalize log level to uppercase (GNU sed)
sed -E 's/\b(error|warn|info|debug)\b/\U\1/gI'

# Remove ANSI color codes from captured output
sed -E 's/\x1b\[[0-9;]*[mGKHF]//g'
```

### Prometheus PromQL relabeling (RE2 syntax)

```yaml
# Keep only pods in the prod namespace
- source_labels: [namespace]
  regex: prod
  action: keep

# Rewrite instance label — strip port number
- source_labels: [instance]
  regex: '([^:]+):\d+'
  target_label: instance
  replacement: '$1'

# Drop metrics from test pods
- source_labels: [pod]
  regex: '.*-test-.*'
  action: drop
```

---

## Next Steps

Once regex is solid, these files extend the same skill into adjacent tools:

- `awk.md` — field-based processing where regex filters rows and field-splitting handles the rest
- `sed.md` — stream editing, multi-line patterns, hold space tricks
- `Bash.md` — `[[ $var =~ pattern ]]` for regex in conditionals and the `BASH_REMATCH` array
- `jq.md` — `test/1`, `capture/1`, `scan/1` for regex inside JSON processing pipelines
- `Prometheus.md` — PromQL `label_replace()` and relabeling rules, both RE2

---

## Recommended learning resources

**YouTube channels & playlists:**
- [Fireship — Regular Expressions in 100 Seconds](https://www.youtube.com/@Fireship) — fast mental model of what regex is and the core syntax you need
- [Corey Schafer — Python Regular Expressions](https://www.youtube.com/@coreyms) — thorough walkthrough of regex in Python with real examples
- [The Coding Train — Regular Expressions](https://www.youtube.com/@TheCodingTrain) — visual, step-by-step regex tutorials that make complex patterns intuitive
- [NetworkChuck — Regex for Beginners](https://www.youtube.com/@NetworkChuck) — approachable introduction to regex with grep and practical log-parsing examples
- [LearnLinuxTV — grep and Regex](https://www.youtube.com/@LearnLinuxTV) — regex in the context of grep, sed, and everyday Linux text processing

**Official docs & blogs:**
- [regex101.com](https://regex101.com/) — interactive regex tester with real-time explanation, debugger, and flavour switching (PCRE, Python, Go RE2, JavaScript)
- [Regular-Expressions.info](https://www.regular-expressions.info/) — the most comprehensive regex reference on the web, covering every flavour and feature
- [GNU grep Manual — Regular Expressions](https://www.gnu.org/software/grep/manual/grep.html) — the reference for BRE and ERE syntax used in grep, sed, and awk

---

## The Mantra

Write the pattern, test it against real data, name your groups, compile once, reuse everywhere.
