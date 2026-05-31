# Testing Strategies — A 2-Day Crash Course

Master the test pyramid, contract tests, testing in production, and the strategy that prevents both "ship and pray" and "test everything twice" — what to test, how much, and when.

---

## Part 0 — Why

Untested code is a liability. You're not shipping confidence — you're shipping assumption. Every time you deploy without a test strategy, you're betting your uptime on a gut feeling.

But over-tested code is its own problem. If your CI pipeline takes 45 minutes to run 10,000 unit tests for a CRUD service, you've traded one risk for another: slow feedback, slower deploys, and engineers who skip tests because running them isn't worth the wait.

The goal isn't maximum coverage. The goal is maximum confidence per test dollar. The right strategy gives you fast feedback on the things most likely to break, slower but deeper checks on the things that matter most at the boundary, and enough production signal to catch what tests can't simulate.

This crash course gives you the framework to make those decisions deliberately.

---

## Vocabulary

**Test Pyramid** — A model for distributing test types: many fast unit tests at the base, fewer integration tests in the middle, few slow E2E tests at the top. The shape represents ratio, not absolute count.

**Unit Test** — A test that exercises a single function or class in isolation, with all external dependencies replaced by test doubles. Should run in milliseconds.

**Integration Test** — A test that exercises how two or more components work together — your service talking to a real database, or two modules interacting. Slower than unit tests, faster than E2E.

**Contract Test** — A test that verifies the interface between two services — not the internal logic, just the shape and behavior of the API. Critical in microservices.

**E2E Test** — A test that simulates a full user journey through the system, from UI to database and back. Closest to reality; most expensive to write and maintain.

**Load Test** — A test that sends volume — concurrent users, request rate, data size — to measure how a system performs under stress. Catches bottlenecks before production does.

**Smoke Test** — A minimal E2E check run after deployment to confirm the system is alive. "Can I log in? Can I submit a form?" Not comprehensive — just "is anything on fire?"

**Canary Test** — A production deployment strategy where you route a small percentage of traffic to a new version, watch the metrics, and roll back if something breaks.

**Testing in Production** — Deliberately exercising production systems with real or synthetic traffic to observe behavior at scale. Not reckless — structured.

**Test Coverage** — The percentage of source lines (or branches, or conditions) executed by your test suite. A useful signal; a dangerous target if treated as a goal in itself.

**Flaky Test** — A test that passes sometimes and fails sometimes without code changes. Often caused by timing dependencies, shared state, or network calls. Flaky tests erode trust faster than no tests.

**Test Double** — An umbrella term for any stand-in for a real dependency in a test:
- **Mock** — records calls and lets you assert what was invoked
- **Stub** — returns a hardcoded response, doesn't track calls
- **Fake** — a working but simplified implementation (in-memory database, fake message queue)

---

## DAY 1 — The Test Pyramid

### The Shape and Why It Matters

The test pyramid has three levels. From base to top:

1. **Unit tests** — fast, isolated, cheap to write, cheap to run
2. **Integration tests** — slower, touch real dependencies, medium cost
3. **E2E tests** — slow, expensive, closest to reality

The recommended ratio is **70 / 20 / 10**: 70% unit, 20% integration, 10% E2E. This isn't a law — it's a starting point. A CLI tool with no external dependencies might run 95% unit tests. A data pipeline with complex transformation logic might skew heavier toward integration. Use the ratio as a default and diverge with intention.

The pyramid shape exists because speed matters. If your unit tests take 30 seconds, you'll run them constantly. If your E2E tests take 20 minutes, you'll run them once before merging — and skip them under pressure.

### Unit Testing Best Practices

A unit test has one job: verify that a function does what it says it does, given a specific input. Nothing more.

**Write tests before the function when you can.** TDD isn't about coverage — it's about design. Writing the test first forces you to think about the interface before the implementation, which usually results in a cleaner function signature.

**One assertion per test, one concept per test.** A test named `test_process_payment` that checks validation, charges the card, and sends a receipt email is three tests pretending to be one. When it fails, you'll spend time figuring out which of the three things broke.

**Name tests like sentences.** `test_payment_fails_when_card_is_expired` is far more useful than `test_payment_4`. The test name is the first error message you'll read.

**Avoid testing implementation details.** If you rename a private method, no public behavior changed — but tests that reach into internals will break. Test the contract (what the function returns), not the mechanism (how it does it).

**Use test doubles deliberately.** Replace external dependencies — databases, queues, external APIs — with fakes or stubs. Don't mock things just because you can. If you're mocking five things in a single test, consider whether you're testing the right unit.

```python
# Good — tests behavior, not implementation
def test_cart_total_applies_discount():
    cart = Cart(items=[Item(price=100)], discount=0.1)
    assert cart.total() == 90.0

# Bad — tests internal state
def test_cart_discount_stored():
    cart = Cart(items=[], discount=0.1)
    assert cart._discount_rate == 0.1
```

### Integration Testing — Real Dependencies vs Mocks

Integration tests answer a different question than unit tests. You're not asking "does this function work?" — you're asking "does this function work when talking to the real database?"

The rule is: use real dependencies when you can manage them cheaply; use mocks when the real thing is too slow, too expensive, or too unreliable to run in CI.

**Real dependencies that are cheap to run in CI:**
- PostgreSQL or MySQL in a Docker container
- Redis in a Docker container
- A local message queue (RabbitMQ, or a local Kafka)
- A local filesystem

**Dependencies that usually get mocked:**
- Third-party payment APIs (Stripe, Braintree)
- External email or SMS services
- Partner APIs with rate limits or paid tiers

Use `docker-compose` to spin up real dependencies for integration tests. Treat them as ephemeral — create a fresh schema per test run, tear it down after. This keeps tests isolated without sacrificing realism.

⚠️ Mocking a database in an integration test is a red flag. If you're replacing the database with a mock just to make the test pass faster, you're no longer testing the integration. You're writing a slow unit test.

### The Testing Diamond — An Anti-Pattern

The testing diamond is what you get when integration tests become the majority of your suite. Instead of 70 / 20 / 10, you end up with 20 / 70 / 10.

This happens when:
- Unit tests are hard to write because the code has poor separation of concerns
- Integration tests become the default because they "feel more real"
- E2E tests are kept low out of fear of the maintenance burden

The problem is feedback speed. If most of your tests are integration tests, your CI pipeline is slow, your local test loop is slow, and developers stop running tests before committing. You get a suite that's thorough on paper and useless in practice.

The fix isn't always more unit tests — sometimes it's refactoring the code so the business logic is isolated from I/O, making it unit-testable.

---

## DAY 2 — Beyond the Pyramid

### Contract Tests — Pact and Consumer-Driven Contracts

In a microservices architecture, integration tests between services are expensive. You can't spin up all twelve services every time you run your test suite. Contract tests solve this.

A **consumer-driven contract** works like this:
1. The consumer (the service making API calls) defines what it expects from the provider — specific endpoints, request shapes, response shapes.
2. This expectation is recorded as a contract (a JSON or YAML file).
3. The provider runs tests against that contract independently, without the consumer being present.
4. If the provider breaks the contract — changes a field name, removes an endpoint, changes a response structure — the provider's tests fail before the change is deployed.

**Pact** is the most widely used tool for this. The consumer writes a Pact test that records the expected interaction. The contract file is published to a Pact Broker. The provider pulls the contract and runs a verification test against its own codebase.

```
Consumer test → generates contract → published to Pact Broker
Provider verification → pulls contract → verifies against real implementation
```

What contract tests do not replace: they don't test business logic, they don't test load, they don't test the full request chain. They test one thing — that the interface between two services stays compatible.

Use contract tests when:
- You have two or more services that communicate directly
- Teams own different services and deploy independently
- You want to catch breaking API changes before they reach staging

Skip contract tests when:
- Services are deployed together as a monolith
- The "consumer" is an external system you don't control (use integration tests with WireMock instead)

### E2E Tests — When They're Worth It, When They're Not

E2E tests simulate a real user moving through your system. They're the only tests that catch failures caused by the interaction of every layer — UI, API, database, background jobs — together.

They're also slow, brittle, and expensive to maintain.

Worth it:
- Critical user journeys that, if broken, cause direct revenue loss: checkout flow, login, account creation
- Regulatory requirements that mandate end-to-end verification
- Scenarios that require testing across multiple services that contract tests can't fully cover

Not worth it:
- Edge cases and error states — these belong in unit and integration tests
- Happy paths that are already covered by contract and integration tests
- Anything that can be tested at a lower level of the pyramid

The practical rule: keep your E2E suite to the **minimum number of journeys** you'd want a manual QA engineer to run before every release. If that number is 200, your E2E suite is too large.

Use tools like Playwright or Cypress for browser-based E2E. For API E2E, plain HTTP test scripts work fine. Run E2E tests in CI on the main branch and before production deployments — not on every pull request unless the suite runs in under five minutes.

### Testing in Production

Testing in production is not reckless. It's a recognition that staging environments, no matter how carefully maintained, are not production. Traffic patterns, data volumes, third-party behavior, and edge cases exist in production that you cannot replicate in staging.

Structured approaches:

**Canary deployments** — route 1–5% of traffic to the new version, monitor error rates and latency, expand the rollout if metrics hold, roll back immediately if they don't. The canary is a real test against real traffic.

**Feature flags** — deploy code dark, enable it for a small cohort (internal users, a single region, a beta group), observe behavior, expand gradually. Decouples deployment from release. Allows instant rollback without a redeploy.

**Synthetic monitoring** — run scripted user journeys against production on a schedule (every 1–5 minutes). These are smoke tests that run in production continuously, alerting you when a critical path breaks. Tools: Datadog Synthetics, Checkly, New Relic Synthetics.

**Chaos testing** — deliberately inject failures into production (or a production-like environment) to verify that your system degrades gracefully. Kill a pod. Throttle a network interface. Fail a dependency. If your system survives chaos testing, you have evidence that it handles real failures. See `Chaos-Engineering.md` for depth on this.

The key discipline with production testing: always have a rollback mechanism. Canaries work because you can roll back in seconds. Feature flags work because you can disable them in one click. Without a rollback, production testing becomes production gambling.

### Load Testing Strategy

Load testing answers questions your functional tests can't: how does this behave under 500 concurrent users? At what point does latency degrade? Where is the bottleneck?

Three types of load tests:

**Load test** — steady ramp-up to expected peak traffic. Validates that the system handles normal production volumes with acceptable latency and error rates.

**Stress test** — push beyond peak to find the breaking point. Useful for understanding headroom and planning for traffic spikes.

**Soak test** — run at moderate load for an extended period (hours to days). Catches memory leaks, connection pool exhaustion, and gradual degradation that only appear over time.

Run load tests:
- Before major releases that touch performance-critical paths
- After infrastructure changes (new database configuration, cache layer, connection pooling)
- Periodically in staging to establish baselines

Use **k6** for scripted load tests (see `k6.md`). Define your success criteria before running: "p99 latency under 200ms, error rate below 0.1% at 1,000 RPS." Without criteria, load test results are just numbers.

### Handling Flaky Tests

A flaky test is worse than no test. It trains engineers to ignore failures. When everything fails 10% of the time, a real failure disappears into the noise.

Common causes:
- **Timing dependencies** — `sleep(1)` instead of waiting for a condition
- **Shared state between tests** — test A leaves data that breaks test B
- **Non-deterministic data** — tests that depend on ordering of query results without an `ORDER BY`
- **External dependencies** — tests that call real APIs or read from real clocks
- **Race conditions** — concurrent tests that touch the same resource

When you find a flaky test:
1. Quarantine it immediately — move it to a separate suite that doesn't block CI
2. Investigate and fix the root cause — don't just retry
3. Re-enable it only when the flakiness is resolved

⚠️ Do not add automatic retries to mask flakiness. Retries increase pipeline time and hide real problems. Fix the cause.

Track flaky tests as engineering debt. A test suite where 5% of tests are flaky isn't 95% reliable — it's untrustworthy.

### Testing Infrastructure Code

Infrastructure code — Terraform modules, Kubernetes manifests, Helm charts — needs testing too. The consequences of an untested infrastructure change can be worse than an application bug: you might accidentally delete a database, expose a port, or break networking for an entire cluster.

**Terraform testing:**
- Use `terraform validate` and `terraform plan` as pre-commit checks. They don't deploy, but they catch syntax errors and obvious misconfigurations.
- Use **Terratest** (Go-based) to write integration tests that apply real Terraform, make assertions against the provisioned resources, and tear them down.
- Use **tfsec** or **Checkov** to scan for security misconfigurations as part of CI.

**Kubernetes and Helm testing:**
- Use `helm lint` and `helm template` to validate chart rendering before deployment.
- Use **Conftest** with OPA policies to enforce standards: all containers must have resource limits, no privileged containers, all images must come from approved registries.
- Use **Kubeval** or **kubeconform** to validate manifest schemas against the Kubernetes API spec.

The goal isn't 80% coverage on your Terraform files. The goal is catching the most dangerous failure modes: resource deletion, permission escalation, exposed credentials, invalid configurations.

### CI/CD Test Pipeline Design

A well-designed CI pipeline runs the fastest, most targeted tests first and uses the results to decide whether to proceed.

A practical pipeline structure:

```
Stage 1 — Pre-commit (local, <30s)
  - Linting (ESLint, ruff, golangci-lint)
  - Formatting (Prettier, black, gofmt)
  - Secret scanning (detect-secrets, trufflehog)

Stage 2 — Unit tests (CI, <5 min)
  - Full unit test suite
  - Code coverage report
  - Fail fast: if unit tests fail, stop here

Stage 3 — Integration tests (CI, <15 min)
  - Spin up Docker services (database, cache, queue)
  - Run integration test suite
  - Tear down services

Stage 4 — Contract verification (CI, <5 min)
  - Pull contracts from Pact Broker
  - Run provider verification tests

Stage 5 — Build and publish (CI, <10 min)
  - Build container image
  - Scan image for vulnerabilities (Trivy, Snyk)
  - Push to registry if all tests pass

Stage 6 — E2E tests (staging deployment, <20 min)
  - Deploy to staging
  - Run smoke tests
  - Run critical path E2E tests

Stage 7 — Production deployment
  - Deploy canary (1–5% traffic)
  - Monitor for 10–15 minutes
  - Expand rollout if metrics hold
```

Stages 1–5 run on every pull request. Stage 6 runs on merge to main. Stage 7 is triggered manually or automatically based on your release cadence.

See `GitHub-Actions.md` for implementation details on pipeline configuration.

---

## Worked Example — Payment Microservice Test Strategy

You're designing the test strategy for a payment service that:
- Accepts payment requests from an order service
- Charges cards via Stripe
- Records transactions in PostgreSQL
- Publishes a `payment.completed` event to Kafka
- Exposes a REST API consumed by the order service

Here's how you distribute tests across the pyramid:

**Unit tests (70%)**
- Payment amount calculation and currency conversion logic
- Card validation rules (expiry, Luhn check, supported card types)
- Event message serialization and deserialization
- Error classification (retryable vs non-retryable failures)
- Retry backoff logic
- All of these test pure business logic with no external dependencies

**Integration tests (20%)**
- Payment record is written correctly to PostgreSQL (real database, Docker)
- Kafka producer publishes the expected event structure (real Kafka, Docker)
- Database constraints are enforced (duplicate transaction ID rejected)
- Transaction rollback on partial failure

**Contract tests**
- Consumer contract: order service defines what it expects from your REST API — endpoint paths, request body shape, response fields, error codes
- Provider verification: your service verifies it satisfies the order service's contract before any deploy

**What you do not unit or integration test:**
- Stripe API behavior — that's Stripe's problem. You test that you call Stripe with the right arguments and handle the responses correctly (using a Stripe stub or Stripe's own test mode in integration tests).

**E2E tests (10%)**
- Full checkout flow: order service submits payment → your service charges Stripe test card → event published → order service receives confirmation
- Payment failure flow: declined card → error response → no event published
- Idempotency: duplicate payment request returns the same result without double-charging

**Testing in production**
- Synthetic monitor: every 2 minutes, submit a test payment using a Stripe test card in production. Alert if it fails.
- Canary: all deploys route 5% of traffic for 10 minutes before full rollout. Automated rollback if error rate exceeds 0.5%.
- Feature flags: new payment methods (Apple Pay, SEPA) gated behind flags, enabled per region.

**Load testing**
- Before each major release: 500 concurrent payment requests, p99 < 800ms, error rate < 0.1%.
- Monthly soak test at 200 RPS for 4 hours to catch connection pool exhaustion.

---

## Pitfalls

**Chasing coverage numbers.** A codebase with 95% coverage and meaningless assertions is less trustworthy than one with 70% coverage and tests that actually verify behavior. Coverage tells you what code was executed. It says nothing about what was verified.

**Testing the framework, not your code.** If you're testing that Django returns a 200 for a standard view, or that SQLAlchemy can connect to a database, you're testing other people's code. Test your business logic — the behavior that makes your system unique.

**Mocking too much in integration tests.** If an integration test mocks the database, it's not an integration test. You're just writing a slow unit test with extra steps.

**One environment for all tests.** Running unit tests, integration tests, and E2E tests in the same CI step — with no parallelism — means you wait for everything even when only fast tests are needed. Separate your stages.

**Ignoring flaky tests.** Flaky tests are treated as a normal part of the pipeline in many teams. They're not. Each flaky test is a confidence debt that compounds.

**No rollback plan for production testing.** Canary deployments and feature flags only work if you can roll back faster than an incident escalates. If your rollback takes 30 minutes, your 5-minute canary window means nothing.

**Writing E2E tests for edge cases.** Edge cases belong at the unit level. An E2E test for "what happens if the user's name contains an apostrophe" is expensive to write, fragile to maintain, and catches a problem that a unit test would catch in milliseconds.

**Not running load tests until pre-launch.** By the time you're a week from launch and discover your service falls over at 200 RPS, you have no time to fix the architecture. Load tests should run regularly in your development cycle, not as a pre-launch ritual.

---

## Quick Reference

### Test Pyramid Ratios

| Level | Target Ratio | Speed | Cost | What It Tests |
|---|---|---|---|---|
| Unit | 70% | <100ms per test | Low | Business logic, pure functions |
| Integration | 20% | 1–10s per test | Medium | Component interactions, DB, queues |
| E2E | 10% | 10–60s per test | High | Full user journeys, cross-service flows |

### Strategy Decision Matrix

| Question | Where to Test |
|---|---|
| Does this calculation produce the right result? | Unit |
| Does this data get written to the database correctly? | Integration |
| Does this API return the right shape? | Contract |
| Does the full checkout flow work? | E2E |
| Does the system hold up under load? | Load test |
| Is production healthy after deploy? | Synthetic monitor + canary |
| Does the system recover from a dependency failure? | Chaos test |

### CI Pipeline Template

```yaml
# Simplified structure — see GitHub-Actions.md for full implementation
stages:
  - lint          # <1 min — blocks everything if it fails
  - unit          # <5 min — run in parallel by package
  - integration   # <15 min — Docker services, isolated schema per run
  - contract      # <5 min — Pact broker verification
  - build         # <10 min — container image, vulnerability scan
  - e2e           # <20 min — staging only, on merge to main
  - deploy        # canary first, full rollout after metrics check
```

---

## Next Steps

- `Chaos-Engineering.md` — how to deliberately break your system to build confidence in its resilience
- `SRE-Process.md` — error budgets, SLOs, and how testing strategy connects to reliability targets
- `k6.md` — load testing scripts, ramp patterns, and threshold configuration
- `GitHub-Actions.md` — CI pipeline implementation: parallel jobs, test caching, deployment gates

---

## The Mantra

**Test at the lowest level that gives you confidence. Test at higher levels only what lower levels can't reach. Test in production what no environment can replicate.**

The right testing strategy is not about coverage — it's about trust. You want to deploy on a Friday afternoon and not lose sleep. That feeling comes from tests that run fast, break clearly, and cover the paths that actually matter.
