# Contributing

Thanks for your interest in contributing! Here's how to add a new crash course.

## Format

Every file follows the same arc. Use any existing file as a template:

```
Why it exists --> Mental model --> Vocabulary --> DAY 1 (get it working)
--> DAY 2 (make it real) --> Worked example --> Common pitfalls
--> Quick command reference --> Next steps --> "The Mantra" (one-liner)
```

## Steps

1. Fork the repo
2. Create a branch: `git checkout -b add-<tool-name>`
3. Write your crash course in the appropriate category directory
4. Add it to the index table in `README.md`
5. Open a PR with a brief description of what the file covers

## Guidelines

- **One file per tool** - keep it focused
- **Teach, don't list** - concepts and mental models before commands
- **Day 1 / Day 2 structure** - the reader should be productive after reading
- **Cross-link** other files in the repo where relevant
- **End with "The Mantra"** - one line that captures the essence

## What we're looking for

See the "Wanted topics" section in README.md for ideas. But any DevOps/SRE/Cloud tool is welcome as long as it follows the format.
