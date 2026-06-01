# Claude Code — A 2-Day Crash Course

Claude Code is Anthropic's agentic coding CLI — it reads your codebase, writes code, runs commands, and manages git workflows autonomously from the terminal.

---

## Part 0 — Why Claude Code Exists

Most AI coding tools operate at the file level. They complete lines, suggest functions, or answer questions about a snippet you paste in. That is useful, but it misses the nature of real software work. Real work spans dozens of files, layered dependencies, build systems, test suites, and git histories. Context is everything, and file-level autocomplete cannot hold it.

Claude Code operates at the project level. When you ask it to fix a bug, it reads the stack trace, finds the relevant files, understands the call graph, writes the fix, runs the tests, and commits — without you hand-holding each step. It uses real tools: bash, file reads, grep, git. It is not simulating a coding assistant; it is one that can actually execute.

The shift this represents is from "help me write code" to "build this for me while I think about harder problems." That is the frame to carry into the next two days.

---

## Vocabulary

Before you touch the CLI, get these terms sharp.

**CLAUDE.md** — A markdown file you place at the root of your project (or in `~/.claude/` for global rules). Claude Code reads it at session start. It is your persistent instruction layer: coding standards, architecture decisions, forbidden patterns, team conventions. Think of it as a contract between you and the agent.

**Hooks** — Scripts that fire at specific lifecycle points. Three types:
- `PreToolUse` — runs before a tool executes. Use it to validate, block, or modify parameters.
- `PostToolUse` — runs after a tool executes. Use it to auto-format, lint, or log.
- `Stop` — runs when the session ends. Use it for final checks or cleanup.

Hooks are configured in `~/.claude/settings.json` and are enforced by the harness, not by the model.

**MCP Server** — Model Context Protocol server. An extension point that adds new tools to Claude Code. An MCP server exposes capabilities — database queries, internal APIs, Slack access, custom search — that Claude Code can call just like it calls bash or grep. You connect MCP servers in your project config or globally.

**Slash Commands** — Shortcuts to reusable workflows. Type `/fix` to invoke a focused fix skill, `/plan` to enter plan mode, or custom commands you define in `~/.claude/skills/`. They are shortcuts to complex multi-step behaviors.

**Extended Thinking** — A mode where Claude reserves internal reasoning budget before responding. Enabled by default (up to 31,999 tokens of internal reasoning). Toggle with `Option+T` on macOS. Use it for architectural decisions and complex debugging where shallow reasoning is likely to miss things.

**Plan Mode** — A mode where Claude presents a plan and waits for your approval before executing. Useful for non-trivial changes where you want to review the approach before code starts changing. Enter it with `/plan` or `Shift+Tab` twice.

**Agent Tool** — The mechanism Claude Code uses to spawn sub-agents. A sub-agent runs in a fresh context, does a bounded piece of work, and returns results. This keeps the main context lean for large multi-step tasks.

**Worktree** — A git worktree is a second checkout of your repo in a separate directory. Claude Code can run parallel agents across multiple worktrees without branch conflicts. Useful when you want to implement two features simultaneously and compare results.

**Permissions (allowedTools)** — The `allowedTools` list in `~/.claude/settings.json` controls which tools Claude Code can use without prompting you. Restricting this is your primary safety mechanism in sensitive codebases.

---

## DAY 1 — Getting Operational

### Install

```bash
npm install -g @anthropic-ai/claude-code
```

You need Node 18+ and an Anthropic API key. Set it:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Or add it to your shell profile. Confirm the install:

```bash
claude --version
```

### First Session

Navigate to a project directory and launch:

```bash
cd your-project
claude
```

Claude Code reads your directory structure, any existing `CLAUDE.md`, and prepares context. You are now in an interactive session. Try something concrete immediately:

```
> explain what this codebase does
```

Then try something that requires action:

```
> there's a failing test in the auth module — find it and fix it
```

Watch how it moves: reads files, runs the test command, identifies the failure, writes a fix, runs tests again to confirm. You are observing the agentic loop in action.

Exit a session with `/exit` or `Ctrl+C`.

### CLAUDE.md — Your Instruction Layer

Create a `CLAUDE.md` at your project root. This is the most impactful five minutes you will spend with Claude Code.

```markdown
# Project: payments-service

## Stack
- Node 20, TypeScript, Fastify
- PostgreSQL via Prisma
- Jest for tests

## Conventions
- All functions under 50 lines
- No mutation — return new objects
- Errors must be handled explicitly, never swallowed
- Use parameterized queries — no string concatenation in SQL

## Forbidden
- No console.log in committed code
- No hardcoded credentials
- Do not modify migration files — create new ones

## Test requirement
- 80% coverage minimum
- Write tests before implementation (TDD)
```

Claude Code will follow these rules for the entire session. They also persist across sessions because the file is always read on startup.

You can have nested `CLAUDE.md` files — one at the repo root, one in a subdirectory for a service with different rules. Claude Code merges them with the more specific file taking precedence.

### Basic Workflows

**Bug fix:**
```
> fix the null pointer in UserService.getProfile — stack trace is in the logs
```

Pass the stack trace directly if you have it. Claude Code will grep for the relevant code, read the file, patch the issue, and verify with tests.

**Feature:**
```
> add rate limiting to the /api/auth/login endpoint — max 5 requests per IP per minute, return 429 on breach
```

Claude Code will look at the existing route structure, find how other middleware is applied, implement the feature consistently with your patterns, and write a test.

**Refactoring:**
```
> the UserRepository is 600 lines — extract the query methods into a separate QueryBuilder class
```

For non-trivial refactors, use Plan Mode first. Claude Code will show you what it intends to do before touching a single file.

### Git Integration

Claude Code is git-aware by default. It reads your branch, understands your history, and can commit on your behalf. Common patterns:

```
> commit the current changes with a conventional commit message
> create a new branch feature/rate-limiting and push it
> show me what changed since main
```

You can configure whether Claude Code can push automatically in `~/.claude/settings.json`. Default behavior is to ask before pushing to remote.

### Permissions Model

Claude Code will ask permission before running anything destructive the first time. You can make those permissions persistent:

```json
// ~/.claude/settings.json
{
  "allowedTools": ["bash", "read", "write", "edit", "grep", "glob"],
  "disallowedTools": ["bash(rm -rf*)"]
}
```

The permissions model is intentionally conservative. Expand it deliberately as you understand what Claude Code needs for your workflow. For production systems, keep `allowedTools` narrow.

### Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Toggle extended thinking | `Option+T` | `Alt+T` |
| Enter plan mode | `Shift+Tab` twice | `Shift+Tab` twice |
| Interrupt current action | `Ctrl+C` | `Ctrl+C` |
| Verbose (show thinking) | `Ctrl+O` | `Ctrl+O` |
| New line in input | `Shift+Enter` | `Shift+Enter` |
| Submit | `Enter` | `Enter` |

---

## DAY 2 — Advanced Workflows

### Hooks — Automating Pre and Post Actions

Hooks fire outside the model's control — they are enforced by the harness. That makes them reliable for things you absolutely cannot let slip.

Example: auto-run prettier after every file write.

```json
// ~/.claude/settings.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "write|edit",
        "command": "prettier --write {{file}}"
      }
    ]
  }
}
```

Example: block writes to migration files.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "write|edit",
        "command": "python3 ~/.claude/hooks/guard_migrations.py {{file}}",
        "blockOnFailure": true
      }
    ]
  }
}
```

The `guard_migrations.py` script exits non-zero if the file path matches `migrations/` — Claude Code stops the write and reports why.

End-of-session hook to verify coverage:

```json
{
  "hooks": {
    "Stop": [
      {
        "command": "npm run coverage -- --passWithNoTests --coverageThreshold '{\"global\":{\"lines\":80}}'"
      }
    ]
  }
}
```

If coverage drops below 80%, the session ends with a visible warning.

### MCP Servers — Extending Claude Code's Reach

MCP servers give Claude Code access to tools it does not have natively. You connect them in your project config or globally.

Common use cases:
- Internal API access — let Claude Code query your staging database directly
- Slack — let Claude Code post to a channel when a build completes
- Jira/Linear — let Claude Code create issues from bugs it discovers
- Custom search — let Claude Code search your internal documentation

Connecting an MCP server:

```json
// .claude/mcp.json or ~/.claude/mcp.json
{
  "servers": [
    {
      "name": "internal-db",
      "command": "node",
      "args": ["~/.claude/mcp/internal-db-server.js"],
      "env": {
        "DB_URL": "${STAGING_DB_URL}"
      }
    }
  ]
}
```

Once connected, Claude Code can call the server's tools like any other tool. You will see them listed when you ask `what tools do you have?`.

⚠️ MCP servers run with the same permissions as Claude Code. Vet any third-party MCP server before connecting it.

### Sub-Agents — Keeping Main Context Lean

For large tasks with independent subtasks, spawn sub-agents explicitly:

```
> implement the new notifications system — spawn separate agents for the database schema, the API endpoints, and the email templates. Run them in parallel and merge the results.
```

Claude Code uses the Agent tool to launch these sub-agents. Each gets a fresh context and a bounded scope. The main agent coordinates and integrates results. This keeps the main context from filling up with code it already wrote.

You can also use worktrees for genuinely parallel work:

```bash
git worktree add ../feature-a -b feature/notifications-schema
git worktree add ../feature-b -b feature/notifications-api
```

Then open two Claude Code sessions, one in each directory. They share the git history but cannot step on each other's files.

### Custom Slash Commands

Create reusable workflows as slash commands. Place a `SKILL.md` file in `~/.claude/skills/your-command/`:

```markdown
# /deploy-check

Run this before any deployment:
1. Run full test suite
2. Check for console.log statements in committed code
3. Verify no hardcoded credentials (scan with truffleHog)
4. Confirm migration files are in order
5. Print a go/no-go summary

If any check fails, explain what to fix before deploying.
```

Now `/deploy-check` is available in any Claude Code session. Use slash commands to encode institutional knowledge — the checks your team always forgets, the steps buried in a wiki no one reads.

### CI/CD Integration — Headless Mode

Claude Code runs non-interactively for CI pipelines:

```bash
claude --headless --print "review this PR for security issues and output a JSON report"
```

Or pipe input:

```bash
git diff main...HEAD | claude --headless --print "summarize these changes for a pull request description"
```

GitHub Actions example:

```yaml
- name: Claude Code Review
  run: |
    git diff ${{ github.base_ref }}...HEAD > /tmp/diff.txt
    claude --headless --print "$(cat /tmp/diff.txt)
    Review this diff for: security issues, missing tests, and convention violations.
    Output markdown with severity levels." > review.md
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

⚠️ Headless mode runs with whatever permissions are in your `settings.json`. For CI, create a separate settings file with `allowedTools` restricted to read-only operations.

### Multi-Model Routing

You do not have to use the same model for every task. Configure routing in your settings:

```json
{
  "models": {
    "default": "claude-sonnet-4-6",
    "thinking": "claude-opus-4-5",
    "fast": "claude-haiku-4-5"
  }
}
```

Use Haiku for high-frequency tasks (quick lookups, formatting, simple completions). Use Sonnet for the main development loop. Reserve Opus for architectural decisions and hard debugging sessions where deep reasoning pays for itself.

You can also override inline: `claude --model claude-opus-4-5` for a single session.

### IDE Integration

**VS Code:** Install the Claude Code extension from the marketplace. It surfaces Claude Code inside the editor panel — you get the same CLI capabilities without leaving your editor. The extension shares your `~/.claude/settings.json` configuration.

**JetBrains:** The Claude Code plugin integrates with IntelliJ, WebStorm, PyCharm, and the rest of the JetBrains family. Same capabilities, IDE-native panel.

Both integrations give you inline diff previews before Claude Code applies changes — useful when you want to review a change in context rather than in the terminal.

---

## Worked Example — Feature End-to-End

You are adding a feature: users can now export their account data as a CSV. Here is the full workflow.

**Step 1 — Plan**

```
> I need to add a GET /api/users/:id/export endpoint that returns a CSV of the user's transaction history. Show me a plan before touching any code.
```

Claude Code enters Plan Mode, reads the existing route structure, finds the transaction model, and outlines:
- New route file: `src/routes/export.ts`
- New service method: `TransactionService.exportForUser(userId)`
- CSV serialization utility
- Auth middleware (reusing existing)
- Test file: `src/routes/export.test.ts`

Review the plan. Ask for changes if anything looks wrong. Then approve.

**Step 2 — TDD**

```
> write the tests first — cover the happy path, missing user (404), and unauthorized access (401)
```

Claude Code writes `export.test.ts` with three test cases. They all fail — the implementation does not exist yet. Good. That is the red phase.

**Step 3 — Implement**

```
> now implement the minimum code to make those tests pass
```

Claude Code writes the route, the service method, and the CSV utility. It runs the tests. If they fail, it reads the output and iterates. You do not have to watch every step — you can give it space to work.

**Step 4 — Review**

```
> review the implementation — check for security issues, missing edge cases, and anything that violates our CLAUDE.md conventions
```

Claude Code performs a self-review. It will flag things like: missing input sanitization on the userId param, no rate limiting on the export endpoint, CSV injection risk if transaction descriptions contain formula characters.

Fix the issues it finds. This is faster than code review catching them later.

**Step 5 — Commit**

```
> commit with a conventional commit message
```

```
feat(export): add GET /api/users/:id/export endpoint for CSV transaction history

- Implements TransactionService.exportForUser with CSV serialization
- Adds auth middleware and rate limiting (10 req/hour per user)
- Sanitizes CSV fields to prevent formula injection
- 94% test coverage on new code
```

Done. What would have taken a day of focused work took a focused 45-minute session.

---

## Pitfalls

**Giving vague instructions.** "Fix the bug" with no context forces Claude Code to guess. "Fix the null pointer in `UserService.getProfile` — it happens when the user has no address on file, stack trace attached" gets a first-attempt fix instead of two rounds of exploration.

**Not using CLAUDE.md.** Without it, Claude Code applies generic coding conventions. With it, your team's specific standards are always in context. An hour writing a good `CLAUDE.md` saves dozens of correction cycles.

**Approving plans you did not read.** Plan Mode exists for a reason. When Claude Code shows you a plan, actually read it. The model is confident by nature — it will proceed with a wrong plan just as smoothly as a right one.

**Running headless CI with too-broad permissions.** A headless agent with write access to production config files is a supply-chain risk. Scope `allowedTools` tightly for automated pipelines.

**Treating Claude Code as infallible.** It makes mistakes. It sometimes misreads a codebase, implements the wrong abstraction, or writes a test that passes for the wrong reason. Your job shifts from writing code to reviewing code — which is faster, but still requires your judgment.

**Letting context fill up.** When you are deep into a session with 50 tool calls and 15 file reads, quality degrades. Start fresh sessions for new tasks. Use sub-agents for work that can be isolated.

**Skipping the test step.** Claude Code will write tests if you ask. If you do not ask, it may skip them. Your `CLAUDE.md` should make TDD the default, and your Stop hook should enforce coverage.

---

## Quick Reference

### Key Commands

| Command | What it does |
|---------|--------------|
| `claude` | Start interactive session in current directory |
| `claude --headless --print "..."` | Non-interactive single query |
| `claude --model claude-opus-4-5` | Override model for session |
| `/plan` | Enter plan mode |
| `/exit` | End session |
| `Ctrl+C` | Interrupt current action |

### settings.json Structure

```json
{
  "allowedTools": ["bash", "read", "write", "edit", "grep", "glob"],
  "disallowedTools": [],
  "models": {
    "default": "claude-sonnet-4-6"
  },
  "hooks": {
    "PreToolUse": [],
    "PostToolUse": [],
    "Stop": []
  }
}
```

Location: `~/.claude/settings.json` (global) or `.claude/settings.json` (project).

### Hooks Config Reference

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "write|edit",
        "command": "prettier --write {{file}}",
        "blockOnFailure": false
      }
    ],
    "PreToolUse": [
      {
        "matcher": "bash",
        "command": "python3 ~/.claude/hooks/validate_command.py {{command}}",
        "blockOnFailure": true
      }
    ],
    "Stop": [
      {
        "command": "npm test -- --passWithNoTests"
      }
    ]
  }
}
```

### CLAUDE.md Template

```markdown
# Project: [name]

## Stack
- [runtime/language/framework]
- [database]
- [test framework]

## Conventions
- [style rules]
- [naming patterns]
- [error handling approach]

## Forbidden
- [things Claude Code must never do]

## Testing
- Coverage minimum: 80%
- Write tests before implementation
- Test files live next to source files

## Git
- Conventional commits required
- Never commit directly to main
```

---

## Next Steps

These files build on what you learned here:

- **`LLM-Fundamentals.md`** — understand the model beneath the tool: context windows, tokenization, sampling, why it makes the mistakes it makes
- **`MCP.md`** — go deep on the Model Context Protocol, build your own MCP server, connect Claude Code to internal systems
- **`Git.md`** — the git operations Claude Code automates assume you understand what is happening underneath
- **`Prompt-Engineering.md`** — the quality of your instructions determines the quality of the output; this applies to CLAUDE.md, slash commands, and session prompts equally

---

## Recommended learning resources

**YouTube channels & playlists:**
- [Anthropic Official — Claude Code Guides](https://www.youtube.com/@AnthropicAI) — official tutorials on Claude Code setup, CLAUDE.md configuration, slash commands, and MCP integration
- [AI Engineer — Claude Code Talks](https://www.youtube.com/@aiaboratories) — conference talks on agentic coding tools, Claude Code architecture, and production workflows
- [DeepLearning.AI — AI Coding Assistants](https://www.youtube.com/@Deeplearningai) — short courses on working effectively with AI coding tools and prompt-driven development
- [Sam Witteveen — Claude & Anthropic Tools](https://www.youtube.com/@samwitteveen) — practical guides on Claude's tool use, context management, and agent capabilities

**Official docs & blogs:**
- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code) — installation, configuration, CLAUDE.md reference, hooks, MCP servers, and best practices
- [Anthropic Cookbook](https://github.com/anthropics/anthropic-cookbook) — example patterns for Claude: tool use, structured output, and multi-turn agent workflows
- [Anthropic Blog](https://www.anthropic.com/blog) — product updates, Claude capabilities, and engineering insights from the Anthropic team

---

## The Mantra

> Describe the outcome, not the steps. Provide context, not instructions. Review the output, not the process. Trust the tool to execute — trust yourself to judge.

Claude Code is fastest when you tell it what done looks like and get out of the way. The closer your prompts are to "here is the requirement, here is the context, here is the acceptance criterion" — and the less they look like step-by-step directions — the better the results. Your leverage is in clear problem definition and sharp review, not in micromanaging the implementation.
