# Agentic Patterns — A 2-Day Crash Course

Agentic patterns are the architectural building blocks for AI agents — ReAct, planning, reflection, tool use, and multi-agent coordination that turn an LLM from a text generator into an autonomous problem solver.

---

## Part 0 — Why Agentic Patterns Exist

A raw LLM call is a one-shot transformation: you send a prompt, you get a completion. That works for summarization, translation, and drafting. It hits a ceiling the moment a problem requires multiple steps, external data, verification, or coordination.

Consider asking an LLM to "investigate why the API latency spiked at 03:00." A single call returns a guess. An agent equipped with the right patterns can query metrics, read logs, correlate errors, form a hypothesis, verify it against a second data source, and return a grounded answer — all without you holding its hand between steps.

The patterns in this guide are not frameworks or libraries. They are architectural ideas — ways to structure reasoning and action that you can implement in any language, with any model.

---

## Vocabulary

**Agent** — An LLM paired with a loop that lets it take actions and observe results until a goal is reached or a stopping condition fires.

**ReAct (Reason + Act)** — A prompting and looping strategy where the agent alternates between writing a reasoning trace (Thought) and issuing an action (Act), then receives an observation before reasoning again.

**Tool Use** — The mechanism by which an agent calls external functions — APIs, databases, code interpreters, search engines — and receives structured results back.

**Planning** — Decomposing a high-level goal into a sequence of sub-tasks before executing any of them. Can be done once up front (static) or revised as execution reveals new information (dynamic).

**Reflection** — A step where the agent critiques its own output or reasoning, identifies flaws, and optionally rewrites before moving forward.

**Multi-Agent** — A system where multiple agents collaborate, each with a specialized role, rather than one agent handling everything.

**Supervisor** — An agent (or model call) responsible for routing tasks to worker agents and deciding when the overall goal is complete.

**Worker** — An agent with a narrowly scoped role — code writer, web searcher, data analyst — that receives a sub-task and returns a result.

**Handoff** — The act of transferring context and control from one agent to another, including passing relevant state so the receiving agent can continue without losing information.

**Memory (short-term)** — Context within a single agent run: the conversation history, tool results, and reasoning trace accumulated in the current session.

**Memory (long-term)** — Persistent storage outside the LLM context window — vector databases, key-value stores, files — that agents can read and write across runs.

**Orchestrator** — The component (code or agent) that manages the flow of execution across agents, decides sequencing, handles errors, and enforces stopping conditions.

---

## DAY 1 — Core Patterns

### 1. ReAct — Think, Act, Observe, Repeat

ReAct is the foundational loop pattern. The agent does not try to solve the whole problem in one pass. Instead it reasons about its current state, decides on a single action, executes it, reads the result, and loops.

```
Thought: I need to find the current error rate for the payments service.
Act: query_metrics(service="payments", metric="error_rate", window="1h")
Observation: error_rate=4.7%, baseline=0.3%, spike started at 02:48 UTC

Thought: Error rate is 15x normal. I should check recent deployments.
Act: query_deployments(service="payments", since="02:00 UTC")
Observation: deploy v2.4.1 at 02:45 UTC by user jsmith

Thought: The deployment preceded the spike. Check the diff.
Act: get_diff(service="payments", from="v2.4.0", to="v2.4.1")
Observation: Changed database connection pool size from 20 to 5
```

The loop terminates when the agent decides it has enough information to answer, or when a hard iteration limit is reached.

**Why it works** — each reasoning step is informed by real observations, not hallucinated continuations. The agent is grounded at every turn.

**What to watch** — without a hard stop condition (max iterations, goal detection), the loop can spiral. Always set a ceiling.

---

### 2. Tool Use — Function Calling

Tools are how agents interact with the world. You define a schema for each tool — name, description, parameters, return type — and pass that schema to the model. The model decides when and how to call a tool; your code executes the call and returns the result.

A minimal tool definition looks like this:

```json
{
  "name": "query_metrics",
  "description": "Query time-series metrics for a service",
  "parameters": {
    "service": "string — the service name",
    "metric": "string — metric name",
    "window": "string — time window e.g. '1h', '30m'"
  },
  "returns": "object with value, unit, and timestamps"
}
```

**Design principles for tools:**

- Keep each tool focused on one operation. A tool that does five things is hard to describe and easy for the model to misuse.
- Write the description as if explaining to a competent colleague who cannot see the implementation. The description is the contract.
- Return structured, parseable data — not prose. The model reads tool results programmatically, not conversationally.
- Include error cases in the return schema. A tool that silently returns an empty result on failure will confuse the agent.
- Rate-limit and timeout every external call. Agents in a loop will retry; you need guardrails at the tool layer.

**Parallel tool calls** — modern APIs let the model request multiple tools in a single turn. When sub-tasks are independent, encourage parallel execution. It cuts latency significantly.

---

### 3. Basic Planning — Decompose, Execute, Verify

Planning separates thinking about what to do from doing it. Before touching any tool, the agent produces a plan.

```
Goal: Migrate the user authentication service to the new OAuth provider

Plan:
1. Audit current auth endpoints and their dependencies
2. Read OAuth provider documentation for the new token format
3. Write migration script for existing sessions
4. Write tests for the new auth flow
5. Run tests and verify pass rate >= 100%
6. Generate rollback procedure
7. Output migration report
```

**Static planning** — generate the full plan up front, execute steps in order. Simpler to reason about, works when the problem is well-understood.

**Dynamic planning (replanning)** — after each step, the agent reassesses the plan. If step 3 reveals an unexpected dependency, the plan is updated before continuing. More robust for open-ended tasks; more expensive.

**Verification steps** — build explicit checkpoints into the plan. After executing a step, the agent checks whether the expected output was produced before moving on. This catches drift early.

---

### 4. Reflection — Critique Before You Ship

Reflection is a dedicated pass where the agent reads its own output and asks whether it is correct, complete, and well-reasoned.

```
[Draft output]
The deployment of v2.4.1 caused the error spike because it reduced
the connection pool size.

[Reflection prompt]
Review the above conclusion. Is it supported by the evidence?
Are there alternative explanations? What is missing?

[Reflection output]
The timeline correlation is strong but not causal. Alternative causes:
- A database-side change at the same time
- A traffic spike that would have overwhelmed the original pool size too
Missing: check database change log, check traffic volume at 02:45
```

Reflection can be self-reflection (same model reads its own output) or cross-reflection (a second model or agent critiques the first). Cross-reflection with a more capable model on the critic side is expensive but effective for high-stakes outputs.

**When to use reflection:**
- Before returning a final answer on a consequential task
- After a plan is generated, before execution begins
- When a tool returns an unexpected result and you need to decide whether to trust it

---

## DAY 2 — Advanced Patterns

### 5. Multi-Agent Architectures

Single-agent systems have a natural ceiling — context window limits, task complexity, and the difficulty of being a generalist at everything simultaneously. Multi-agent systems distribute work across specialized agents.

**Supervisor / Worker**

```
          ┌─────────────────────┐
          │      Supervisor     │
          │  (routes, decides,  │
          │   terminates)       │
          └──────┬──────┬───────┘
                 │      │
        ┌────────┘      └────────┐
        ▼                        ▼
 ┌─────────────┐          ┌─────────────┐
 │ Code Writer │          │  Researcher │
 │   Agent     │          │   Agent     │
 └─────────────┘          └─────────────┘
```

The supervisor receives the top-level goal and decides which worker to invoke next. Workers do focused work and return results. The supervisor synthesizes results and decides when the goal is satisfied.

**Peer-to-peer**

Agents communicate directly with each other without a central coordinator. One agent completes its portion of a task and hands off to the next. Works well for linear pipelines where the sequence is fixed.

```
 Triage Agent → Investigation Agent → Remediation Agent
```

**Hierarchical**

Supervisors can have their own supervisors. Large systems — a software engineering team simulation, for example — may have a project manager agent supervising a developer agent and a QA agent, while a CTO agent supervises the project manager.

Use hierarchy sparingly. Every layer adds latency and a new point of failure.

---

### 6. Human-in-the-Loop

Not every decision should be autonomous. Some actions are irreversible, expensive, or require accountability. Human-in-the-loop (HITL) patterns introduce checkpoints where a human must approve before the agent proceeds.

**Interrupt triggers** — define explicit conditions that pause execution and surface to a human:
- Confidence score below a threshold
- Action is destructive (delete, deploy to production, send to external party)
- Cost estimate exceeds a budget
- Agent has retried the same step more than N times

**Structured approval requests** — when the agent pauses for human review, it should present:
1. What it has done so far
2. What it is about to do
3. Why it chose this action
4. What happens if the human rejects it

Vague pause prompts ("should I continue?") create friction without insight. Structured ones let humans make informed decisions quickly.

---

### 7. Memory Patterns

**Short-term memory** is the conversation context. It is fast but finite. Manage it actively — summarize earlier turns when approaching context limits rather than truncating blindly.

**Long-term memory** requires external storage. Common patterns:

- **Episodic memory** — store summaries of past runs ("on 2025-11-14, we investigated a similar latency spike caused by connection pool exhaustion"). Retrieve by semantic similarity when a new task resembles a past one.
- **Semantic memory** — store facts and knowledge ("payments service uses PostgreSQL 15, connection pool default is 20"). Retrieve when the agent needs domain knowledge.
- **Procedural memory** — store successful plans and tool sequences ("to investigate a latency spike: step 1 query metrics, step 2 check deployments..."). Retrieve when the agent needs to decide how to approach a task type it has handled before.

**Write discipline** — agents should write to long-term memory at task completion, not during execution. Partial writes create inconsistent state.

---

### 8. Error Recovery and Retries

Agents operate in unreliable environments. Tools fail. APIs return unexpected formats. Models hallucinate tool calls with invalid parameters. Your architecture needs explicit recovery logic.

**Retry with context** — when a tool call fails, include the error in the next reasoning step. Do not silently retry. The agent should read the error and adjust its approach.

```
Observation: ERROR — query_metrics returned 500: upstream timeout

Thought: The metrics API is unavailable. I can try the secondary
metrics endpoint, or fall back to reading the most recent Prometheus
snapshot from the cache.
Act: query_metrics_cache(service="payments", metric="error_rate")
```

**Exponential backoff** — implement at the tool layer for transient failures (rate limits, timeouts). The agent should not be aware of individual retry attempts; it sees a single clean result or a final error.

**Graceful degradation** — define what a partial result looks like and communicate it clearly. An agent that cannot complete step 3 of a 7-step plan should report what it found in steps 1-2 rather than returning nothing.

⚠️ **Avoid infinite retry loops.** Always set a maximum retry count at both the tool layer (for transient errors) and the agent loop layer (for repeated failures on the same step).

---

### 9. Evaluation — Measuring Agent Quality

You cannot improve what you cannot measure. Evaluating agents is harder than evaluating single-turn LLM outputs because you need to assess a trajectory, not just a final answer.

**Trajectory evaluation** — did the agent take reasonable steps to reach its conclusion? A correct answer arrived at through a flawed reasoning chain is fragile.

**Tool use accuracy** — did the agent call the right tools with the correct parameters? Track tool call precision and recall across a benchmark set.

**Goal completion rate** — across a test suite of representative tasks, what fraction does the agent complete successfully?

**Step efficiency** — how many tool calls and reasoning steps did the agent use? An agent that takes 40 steps to do what a well-designed one does in 8 is too expensive for production.

**Failure mode analysis** — when agents fail, categorize why: hallucinated tool parameters, premature termination, incorrect plan, tool failure not recovered from. Each category points to a specific fix.

Build an evaluation harness before you build the agent. It will tell you whether your architectural changes are helping.

---

### 10. Orchestration Frameworks

You can implement every pattern in this guide from scratch. You probably should not. These frameworks encode the patterns as primitives.

**LangGraph** — models agent execution as a directed graph of nodes (reasoning steps, tool calls) and edges (transitions, conditional routing). Excellent for complex multi-agent flows where you need fine-grained control over state and transitions. State is explicit and inspectable.

**CrewAI** — higher-level abstraction focused on role-based multi-agent teams. You define agents as personas (a "senior researcher", a "code reviewer"), assign them tools and goals, and define how they collaborate. Lower boilerplate for team-style workflows.

**AutoGen** — Microsoft's framework, strong for code generation and execution agents. Built-in support for code interpreter loops and human-in-the-loop conversations.

**When to avoid frameworks** — if your agent pattern is a simple ReAct loop with 3-4 tools, a framework adds more abstraction than it removes boilerplate. Build it directly. Add a framework when you need stateful multi-agent coordination, complex routing logic, or built-in evaluation tooling.

---

### 11. Production Considerations

**Cost** — every tool call and every reasoning step costs tokens. Track cost per task from day one. A poorly designed agent that takes 30 reasoning steps where 8 would suffice will exceed budget quickly. Cache tool results aggressively when the underlying data does not change frequently.

**Latency** — sequential agents are slow. Parallelize wherever dependencies allow. Profile your agent's critical path — the longest sequential chain of steps — and optimize that first.

**Safety** — an autonomous agent with write access to production systems is a risk surface. Apply least-privilege to tool permissions. An investigation agent does not need write access. A remediation agent should require human approval before any destructive action. Log every tool call with its inputs and outputs for audit.

**Observability** — structured traces for every agent run are non-negotiable in production. Log: task input, each reasoning step, each tool call with parameters and result, final output, total tokens, latency, and termination reason. Without this, debugging failures is guesswork.

**Prompt versioning** — system prompts and tool descriptions are code. Version them, test changes against your eval suite before deploying, and have a rollback path.

---

## Worked Example — Multi-Agent Incident Response

You receive a PagerDuty alert: "Payments API error rate above 2% for 5 minutes."

**Architecture:**

```
   Alert
     │
     ▼
┌────────────────────────────────────────────────┐
│                  Supervisor Agent               │
│  Routes tasks, synthesizes results, decides    │
│  when to escalate to human approval            │
└───────────┬───────────────┬────────────────────┘
            │               │
            ▼               ▼
  ┌──────────────┐   ┌──────────────────┐
  │ Triage Agent │   │Investigation Agent│
  │ Classifies   │   │ Deep-dives into   │
  │ severity,    │   │ logs, metrics,    │
  │ identifies   │   │ traces, deploys   │
  │ blast radius │   └────────┬─────────┘
  └──────┬───────┘            │
         │                    ▼
         │          ┌──────────────────┐
         │          │Remediation Agent │
         │          │Proposes fixes,   │
         │          │drafts runbook    │
         │          └────────┬─────────┘
         │                   │
         └──────────┬─────────┘
                    ▼
          ┌──────────────────┐
          │  Human Approval  │
          │  Gate            │
          └────────┬─────────┘
                   │
                   ▼
            Execute or Escalate
```

**Flow:**

1. Supervisor receives the alert. It spawns Triage Agent and provides it the alert payload.

2. Triage Agent queries error rate trends, identifies that only the `/payments/charge` endpoint is affected, confirms error rate is 4.7%, and classifies severity as SEV-2. It hands off to Supervisor with a structured triage report.

3. Supervisor spawns Investigation Agent with the triage report as context. Investigation Agent runs a ReAct loop: queries deployment history, finds v2.4.1 deployed 3 minutes before the spike, retrieves the diff, identifies the connection pool change, queries the database connection log to confirm pool exhaustion, then terminates with a root cause hypothesis.

4. Supervisor spawns Remediation Agent with the investigation report. Remediation Agent proposes two options: (a) roll back v2.4.1 immediately, (b) hotfix the connection pool config without rollback. It assesses risk for each and drafts a runbook section for the post-incident review.

5. Supervisor detects that the proposed action (rollback or deploy) is production-modifying. It triggers the Human Approval gate, presenting the triage report, root cause, proposed options, and risk assessment.

6. On-call engineer reviews and approves option (a). Supervisor routes the approval to a Deployment Worker Agent, which executes the rollback via the deployment API.

7. Supervisor waits for post-rollback metrics, confirms error rate has returned to baseline, and closes the incident. It writes a summary to long-term memory for future incident pattern matching.

---

## Pitfalls

**Prompt injection via tool results** — a malicious value in a tool result can contain instructions that alter the agent's behavior. Sanitize tool outputs before inserting them into the reasoning context.

**Context stuffing** — every tool result gets appended to the context. In a long-running agent loop, the context fills with intermediate results the agent no longer needs. Summarize and prune actively.

**Overconfident termination** — agents sometimes decide they are done before they actually are, either because the task description was ambiguous or because they pattern-matched to an earlier similar task. Write explicit completion criteria into your system prompt.

**Plan hallucination** — a planning agent may generate a plan that includes tools it does not have, or assumes capabilities that do not exist. Validate the plan against the actual tool registry before executing.

**Cascading failures in multi-agent systems** — a worker agent that returns a subtly wrong result will cause the supervisor to route incorrectly, and the next worker to compound the error. Validate worker outputs at the supervisor layer, not just at the task boundary.

**Runaway costs** — an agent stuck in a retry loop or a planning cycle it cannot exit will accumulate cost rapidly. Always set hard limits on iterations, total tokens, and wall-clock time.

⚠️ **Never give an agent more permissions than it needs for its specific role.** The blast radius of a compromised or misbehaving agent should be bounded by its tool access.

---

## Quick Reference

### Pattern Decision Tree

```
Is the task answerable in one LLM call?
  ├── Yes → Use a single prompt, no agent needed
  └── No
      ├── Does it require external data or actions?
      │     ├── Yes → Use ReAct with tool use
      │     └── No → Use chain-of-thought or planning prompt
      ├── Does it require multiple sequential decisions?
      │     └── Yes → Use ReAct loop with planning step
      ├── Does it require specialized expertise per sub-task?
      │     └── Yes → Use multi-agent (supervisor + workers)
      ├── Does it involve irreversible actions?
      │     └── Yes → Add human-in-the-loop approval gate
      └── Does it need to learn from past runs?
            └── Yes → Add long-term memory layer
```

### Architecture Diagrams

**Single ReAct Agent**
```
 User Goal
     │
     ▼
┌─────────────────────────────────┐
│           Agent Loop            │
│  Thought → Act → Observe → ...  │
│         (max N iterations)      │
└──────────────────┬──────────────┘
                   │
                   ▼
             Final Answer
```

**Supervisor + Workers**
```
 Goal
  │
  ▼
Supervisor ──► Worker A ──► Result A ──┐
     │                                  ▼
     └────► Worker B ──► Result B ──► Synthesize ──► Output
```

**Sequential Pipeline**
```
 Input → Agent 1 → Agent 2 → Agent 3 → Output
          (triage) (investigate) (remediate)
```

**Hierarchical**
```
          Top Supervisor
         /              \
   Supervisor A      Supervisor B
   /        \            |
Worker    Worker      Worker
```

---

## Next Steps

- `LangGraph.md` — implement the patterns in this guide using LangGraph's stateful graph primitives
- `LLM-Fundamentals.md` — understand what is happening inside the model that powers your agents
- `MCP.md` — the Model Context Protocol: a standard for tool and resource exposure to agents
- `Claude-Code.md` — Claude Code as a production agentic system: how Anthropic applies these patterns

---

## Recommended learning resources

**YouTube channels & playlists:**
- [DeepLearning.AI — Building Agentic AI](https://www.youtube.com/@Deeplearningai) — Andrew Ng's courses on agent design patterns: ReAct, planning, multi-agent, and tool use
- [AI Jason — Agent Tutorials](https://www.youtube.com/@AIJasonZ) — practical agent implementations with tool calling, memory, and multi-step reasoning
- [Sam Witteveen — Agent Patterns](https://www.youtube.com/@samwitteveen) — weekly coverage of agent architectures, orchestration patterns, and real-world agent builds
- [AI Engineer — Agent Architecture Talks](https://www.youtube.com/@aiaboratories) — conference talks on production agent systems, evaluation, and failure modes
- [Andrej Karpathy — LLM Agents](https://www.youtube.com/@AndrejKarpathy) — foundational thinking on why agents work, tool use mechanics, and the ReAct loop

**Official docs & blogs:**
- [Anthropic Documentation — Tool Use & Agents](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) — Claude's tool calling API, agent patterns, and multi-turn agent design
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/) — the primary framework for implementing stateful agent patterns with graphs
- [Simon Willison's Blog](https://simonwillison.net/) — practical analysis of agent capabilities, limitations, and real-world agentic system design

---

## The Mantra

> One prompt, one answer — that is a calculator.
> Think, act, observe, repeat — that is an agent.
> Know which one the problem needs.
