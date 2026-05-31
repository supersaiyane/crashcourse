# Design Principles — A 2-Day Crash Course

SOLID, DRY, KISS, YAGNI — the principles that separate code that survives production from code that becomes legacy in 6 months.

---

## Part 0 — Why Principles?

Patterns are solutions. Principles are the reasoning behind when and whether to apply them.

You can memorize the Factory pattern, the Observer pattern, the Decorator pattern. But if you don't understand *why* those patterns exist, you'll reach for them at the wrong time — over-engineering a two-file script or under-engineering a system that will need to scale across teams.

Principles give you the judgment. They answer:
- Why is this code hard to change?
- Why does adding a feature here always break something over there?
- Why does this codebase feel like it's fighting you?

The answer is almost always a violated principle. Not a missing pattern — a missing principle.

Spend two days here. The rest of your design education will make more sense.

---

## Vocabulary

Before the deep dive, align on definitions. These terms show up everywhere.

| Term | One-line definition |
|---|---|
| **SOLID** | Five object-oriented design principles (see Day 1) |
| **DRY** | Don't Repeat Yourself — every piece of knowledge should have one authoritative source |
| **KISS** | Keep It Simple, Stupid — prefer the simplest solution that works |
| **YAGNI** | You Aren't Gonna Need It — don't build what you don't currently need |
| **Separation of Concerns** | Each module should own one concern and not bleed into others |
| **Composition over Inheritance** | Build complex behavior by combining small pieces, not extending class hierarchies |
| **Law of Demeter** | A module should only talk to its immediate collaborators — not reach through them |
| **Principle of Least Surprise** | Code should behave the way a reader would expect it to |

---

## DAY 1 — SOLID Deep Dive

SOLID is an acronym coined by Robert Martin. Each letter is a principle. Together they describe what well-structured object-oriented (and, increasingly, functional and service-oriented) code looks like.

---

### S — Single Responsibility Principle

**One class, one reason to change.**

If a class has two responsibilities, it has two reasons to change. When one reason triggers a change, you risk accidentally breaking the other responsibility.

**Bad:**

```python
class UserService:
    def create_user(self, username, email):
        # validate
        if "@" not in email:
            raise ValueError("Invalid email")
        # persist
        db.execute("INSERT INTO users ...", username, email)
        # notify
        smtp.send(email, "Welcome to the platform")
```

This class owns validation, persistence, *and* notification. A change to how emails are sent touches the same class that handles database logic.

**Good:**

```python
class UserValidator:
    def validate(self, username, email):
        if "@" not in email:
            raise ValueError("Invalid email")

class UserRepository:
    def save(self, username, email):
        db.execute("INSERT INTO users ...", username, email)

class WelcomeMailer:
    def send(self, email):
        smtp.send(email, "Welcome to the platform")

class UserService:
    def __init__(self, validator, repo, mailer):
        self.validator = validator
        self.repo = repo
        self.mailer = mailer

    def create_user(self, username, email):
        self.validator.validate(username, email)
        self.repo.save(username, email)
        self.mailer.send(email)
```

Now each class changes for exactly one reason. You can swap the mailer without touching the repository.

---

### O — Open/Closed Principle

**Open for extension, closed for modification.**

When new requirements come in, you should be able to add behavior without editing existing, tested code. Editing existing code means re-testing it and risking regression.

**Bad:**

```python
class ReportExporter:
    def export(self, report, format):
        if format == "pdf":
            # ... pdf logic
        elif format == "csv":
            # ... csv logic
        elif format == "excel":
            # ... excel logic — added later, touching existing code
```

Every new format means editing this method. Every edit is a regression risk.

**Good:**

```python
class ReportExporter:
    def export(self, report, formatter):
        return formatter.format(report)

class PdfFormatter:
    def format(self, report): ...

class CsvFormatter:
    def format(self, report): ...

class ExcelFormatter:
    def format(self, report): ...
```

Adding a new format means writing a new class — no existing code touched.

---

### L — Liskov Substitution Principle

**Subtypes must be substitutable for their base types.**

If your code works with a `Bird`, it should work with a `Penguin` if `Penguin` extends `Bird` — without knowing it's a penguin. If subclasses break the contract of the parent, you have a violated LSP.

**Bad:**

```python
class Bird:
    def fly(self):
        return "flying"

class Penguin(Bird):
    def fly(self):
        raise NotImplementedError("Penguins can't fly")

def make_it_fly(bird: Bird):
    print(bird.fly())  # ⚠️ blows up if bird is a Penguin
```

**Good:**

```python
class Bird:
    def move(self): ...

class FlyingBird(Bird):
    def fly(self): ...

class Penguin(Bird):
    def swim(self): ...

class Eagle(FlyingBird):
    def fly(self):
        return "soaring"
```

Now the hierarchy reflects reality. Code that takes a `FlyingBird` knows it can fly. Code that takes a `Bird` makes no such assumption.

LSP violations often surface as `isinstance` checks or `if type(x) == ...` guards inside functions that are supposed to work generically.

---

### I — Interface Segregation Principle

**Clients should not be forced to depend on interfaces they don't use.**

Fat interfaces create unnecessary coupling. If you implement an interface, you're coupled to everything in it — even the parts you don't care about.

**Bad:**

```python
class WorkerInterface:
    def work(self): ...
    def eat(self): ...
    def sleep(self): ...

class Robot(WorkerInterface):
    def work(self): ...
    def eat(self): raise NotImplementedError  # robots don't eat
    def sleep(self): raise NotImplementedError  # robots don't sleep
```

**Good:**

```python
class Workable:
    def work(self): ...

class Feedable:
    def eat(self): ...

class Restable:
    def sleep(self): ...

class Human(Workable, Feedable, Restable): ...
class Robot(Workable): ...
```

Smaller interfaces are easier to implement, easier to mock in tests, and easier to evolve independently.

---

### D — Dependency Inversion Principle

**High-level modules should not depend on low-level modules. Both should depend on abstractions.**

When a high-level policy class directly instantiates a low-level detail class, changing the detail forces you to touch the policy. Invert the dependency — inject it.

**Bad:**

```python
class OrderService:
    def __init__(self):
        self.db = MySQLDatabase()  # hardwired to MySQL

    def place_order(self, order):
        self.db.save(order)
```

**Good:**

```python
class DatabasePort:
    def save(self, order): ...

class MySQLDatabase(DatabasePort):
    def save(self, order): ...

class InMemoryDatabase(DatabasePort):  # great for tests
    def save(self, order): ...

class OrderService:
    def __init__(self, db: DatabasePort):
        self.db = db

    def place_order(self, order):
        self.db.save(order)
```

`OrderService` no longer knows or cares whether it's talking to MySQL, Postgres, or an in-memory stub. Tests become trivial. Swapping databases becomes a config change.

---

## DAY 2 — Beyond SOLID

SOLID is the foundation. These principles complete the picture.

---

### DRY — But Don't Over-DRY

Don't Repeat Yourself means every piece of *knowledge* has one canonical home. It does not mean "never write similar-looking code twice."

The test for DRY is: if this rule changes, how many places do I need to update? If the answer is more than one, you have a DRY violation.

**The over-DRY trap:**

Two functions happen to share three lines of code today. You extract them into a shared helper. Six months later, one function needs to change and the other doesn't. Now your "shared" abstraction is a constraint — you have to either split it (reversing your earlier work) or add conditional logic that makes it worse than the duplication was.

The rule of three is a useful heuristic: tolerate duplication once, consider abstracting on the third occurrence — and only when the duplication represents the same *concept*, not just similar-looking code.

---

### KISS — Keep It Simple

The simplest solution that correctly solves the problem is almost always the right solution.

Complexity is a cost. Every abstraction, every indirection, every configurable parameter is something the next engineer has to understand before they can change anything. You are not being paid to write clever code. You are being paid to write code that the next person can understand and extend without fear.

Ask yourself before every abstraction: what is this simplifying? If the answer is "it's more elegant" or "it could be useful someday," that's not a simplification — that's speculation.

---

### YAGNI — You Aren't Gonna Need It

Don't build features for requirements you don't have yet.

"We might need multi-tenancy later" is not a requirement. "We need multi-tenancy by Q3" is. The first is an invitation to over-engineer. The second is a requirement you can design toward.

YAGNI is not an argument against good architecture. It's an argument against speculative architecture. Build the right abstractions for the code you have today. When the new requirement arrives, refactor — don't pre-build.

---

### Composition over Inheritance

Inheritance couples you to a parent class's implementation. When that parent changes, all children change with it. Deep inheritance hierarchies become brittle quickly.

Composition gives you flexibility: you combine behaviors at runtime, you can swap components, and you don't inherit behavior you didn't ask for.

```python
# Inheritance — rigid
class FlyingSwimmingDuck(FlyingBird, SwimmingAnimal): ...

# Composition — flexible
class Duck:
    def __init__(self, flyer, swimmer):
        self.flyer = flyer
        self.swimmer = swimmer

    def move_air(self): return self.flyer.fly()
    def move_water(self): return self.swimmer.swim()
```

Use inheritance for true "is-a" relationships where the subtype genuinely extends and honors the parent's contract. Use composition when you want behavior, not identity.

---

### Separation of Concerns

Each module should own one concern. Concerns that bleed across modules create coupling — a change in one place ripples unexpectedly into another.

Classic separations: business logic vs. persistence, validation vs. transformation, policy vs. mechanism.

In web services this maps directly: your controller handles HTTP. Your service handles business logic. Your repository handles data access. None of these layers should know how the other is implemented.

In infrastructure code: your Terraform module provisions resources. Your Ansible role configures them. They don't overlap. The Terraform output feeds the Ansible inventory — clean handoff, no tangle.

---

### Applying Principles to Infrastructure Code

Infrastructure-as-code has the same problems — and the same solutions.

**Terraform:** each module provisions one resource group (SRP). Parameterize instead of forking — a new environment is a new `tfvars` file, not a copy-pasted module (OCP). If you're copy-pasting a security group block across environments, that's a DRY violation. Don't add variables for every conceivable option you don't need yet (YAGNI).

**Ansible:** each role does one thing — install nginx, configure TLS, manage users (SRP). Roles configure software; Terraform provisions the machine — don't let them cross (SoC). Use role variables with sensible defaults instead of hardcoding the same value in ten task files (DRY).

---

### Principles in Code Review

When you review code, you're enforcing principles even if you don't name them. Learn to name them — it makes feedback clearer and less personal.

What to look for:

| Smell | Likely violation |
|---|---|
| Function does X, Y, and Z | SRP |
| Adding a feature required editing an existing class | OCP |
| Subclass raises `NotImplementedError` for parent methods | LSP |
| Interface has 12 methods but this class only uses 2 | ISP |
| Class instantiates its own dependencies with `new`/`()` | DIP |
| Same logic in three places | DRY |
| 200-line function doing "just one thing" | KISS |
| "Pluggable strategy" for a use case with one implementation | YAGNI |
| Service directly accessing another service's database table | Separation of Concerns |
| Deep inheritance tree (4+ levels) | Prefer Composition |

When you leave a review comment, cite the principle. "This violates SRP — this class now has two reasons to change: the notification logic and the persistence logic. Consider extracting `UserNotifier`." That's actionable. "This is messy" is not.

---

### Principles in Interviews

Interviews test whether you apply these under pressure. Separate concerns. Depend on abstractions. Don't over-engineer a two-channel system into a plugin framework.

Name principles as you use them. "I'm injecting the transport so the business logic doesn't know whether it's SMS or email — that's DIP." Candidates who say *why* stand out from candidates who only say *what*.

---

## Worked Example — Refactoring a Monolithic Deploy Script

You inherit this deploy script:

```python
class Deployer:
    def deploy(self, app, env):
        # build
        subprocess.run(["docker", "build", "-t", app, "."])
        # push
        subprocess.run(["docker", "push", f"registry/{app}"])
        # notify slack
        requests.post(SLACK_WEBHOOK, json={"text": f"Deploying {app} to {env}"})
        # update kubernetes
        subprocess.run(["kubectl", "set", "image", f"deployment/{app}", f"{app}=registry/{app}"])
        # notify slack again
        requests.post(SLACK_WEBHOOK, json={"text": f"Deployed {app} to {env}"})
        # write to audit log
        with open("audit.log", "a") as f:
            f.write(f"{datetime.now()} — deployed {app} to {env}\n")
```

**Violations:**
- SRP: build, push, notify, deploy, audit — five responsibilities in one method
- DRY: Slack notification duplicated
- DIP: hardwired to Docker, kubectl, Slack — no abstractions, no testability

**Refactored:**

```python
class ImageBuilder:
    def build(self, app): subprocess.run(["docker", "build", "-t", app, "."])

class ImagePusher:
    def push(self, app): subprocess.run(["docker", "push", f"registry/{app}"])

class KubernetesDeployer:
    def deploy(self, app):
        subprocess.run(["kubectl", "set", "image", f"deployment/{app}", f"{app}=registry/{app}"])

class SlackNotifier:
    def notify(self, message): requests.post(SLACK_WEBHOOK, json={"text": message})

class FileAuditLogger:
    def log(self, message):
        with open("audit.log", "a") as f: f.write(f"{datetime.now()} — {message}\n")

class DeployOrchestrator:
    def __init__(self, builder, pusher, deployer, notifier, logger):
        self.builder, self.pusher, self.deployer = builder, pusher, deployer
        self.notifier, self.logger = notifier, logger

    def deploy(self, app, env):
        self.notifier.notify(f"Deploying {app} to {env}")
        self.builder.build(app)
        self.pusher.push(app)
        self.deployer.deploy(app)
        self.notifier.notify(f"Deployed {app} to {env}")
        self.logger.log(f"deployed {app} to {env}")
```

Each class has one reason to change. Swap Docker for Podman — write a new `ImageBuilder`, nothing else changes. Swap Slack for PagerDuty — write a new `Notifier`. Testing is trivial: inject mocks for each collaborator.

---

## Pitfalls

**Premature abstraction** — the most common misapplication. You read OCP and start writing plugin systems for everything. You read DIP and create interfaces for classes that will never have a second implementation. Abstractions are indirections. Every indirection is a cost. Extract an abstraction when you feel the pain of not having it — not in anticipation of someday feeling that pain.

**DRY obsession** — chasing DRY at the level of syntax, not semantics. Two functions that look similar are not necessarily a DRY violation. If they represent different concepts that happen to share three lines today, extracting them couples two independent things. That coupling is invisible until one needs to change. Duplication is cheap. Wrong abstraction is expensive.

**Applying SOLID to everything** — SOLID was designed for object-oriented design. Don't torture functional code into SOLID shapes. A pure function that transforms data doesn't need SRP analysis. Know the domain of applicability.

---

## Quick Reference — Principle Decision Checklist

Before you finalize a design or submit a PR, run through this:

```
[ ] Does each class/function/module have one clear reason to change?     → SRP
[ ] Can I add behavior without editing existing code?                    → OCP
[ ] Can I substitute subtypes without breaking callers?                  → LSP
[ ] Are my interfaces minimal — no unused methods?                       → ISP
[ ] Do I inject dependencies rather than instantiate them?               → DIP
[ ] Is every piece of knowledge in exactly one place?                    → DRY
[ ] Is this the simplest solution that works?                            → KISS
[ ] Am I building this because I need it now?                            → YAGNI
[ ] Does each layer/module own exactly one concern?                      → SoC
[ ] Am I composing behavior rather than inheriting it?                   → Composition
[ ] Does my code do what a reader would expect it to do?                 → Least Surprise
```

If you answer no to any of these and you don't have a good reason, that's where to refactor.

---

## Next Steps

These principles are the foundation. Build on them:

- **`Design-Patterns.md`** — the recurring solutions that apply these principles in practice: Factory, Strategy, Observer, Decorator, and a dozen more
- **`Clean-Architecture.md`** — how to organize an entire codebase so the business rules never depend on frameworks, databases, or delivery mechanisms
- **`LLD.md`** — low-level design for interviews: class diagrams, sequence diagrams, and designing systems like parking lots, elevators, and chess under time pressure

---

## The Mantra

> Write code for the next engineer, not for the compiler.
> The compiler accepts anything. The next engineer has to understand it, change it, and trust it at 2 a.m. during an incident.
> Principles are how you make that possible.
