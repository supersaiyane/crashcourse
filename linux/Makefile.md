# Makefile — A 2-Day Crash Course

Make is a task runner disguised as a build tool — the universal "how to run this project" interface that works everywhere, zero dependencies.

---

## Part 0 — Why Makefiles Exist

Every project eventually needs answers to the same questions: how do I build this? How do I run the tests? How do I deploy? Those answers live in READMEs, wikis, Confluence pages, Slack threads — scattered, stale, and wrong.

A Makefile collapses all of that into one file at the project root. You run `make build`, `make test`, `make deploy`. Everyone on the team, every CI runner, every new engineer on day one — they all speak the same language.

Make ships with every Unix-like system. macOS has it. Every Linux distro has it. You need nothing else. No Node, no Python, no Homebrew formula to install first. That zero-dependency property is why Makefiles outlive every "better" alternative. They are boring in the best way.

You do not need to use Make as a build system. Most projects use it purely as a task runner. That is fine. That is the correct use.

---

## Vocabulary

Before you write a single line, anchor these eight terms. Everything else is a variation on them.

**Target** — The name of the thing you want to make. It can be a file (`main.o`, `app`) or a label for a task (`build`, `test`). You run it with `make <target>`.

**Prerequisite** — Things that must exist or be up-to-date before the target runs. Listed after the colon on the target line. Make checks their timestamps to decide whether to re-run.

**Recipe** — The shell commands that create the target. Must be indented with a real tab character — not spaces. This trips up everyone once.

**Variable** — A named value. `APP_NAME := myapp`. Expand it with `$(APP_NAME)`. Two assignment flavors matter: `:=` evaluates immediately, `=` evaluates lazily at use time. Prefer `:=` for clarity.

**Phony Target** — A target that is not a file. `.PHONY: build test clean` tells Make "do not look for a file named build, just run the recipe every time." Without `.PHONY`, if a file named `build` exists in the directory, Make silently skips the recipe.

**Pattern Rule** — A rule that matches multiple targets by shape. `%.o: %.c` means "to build any `.o` file, compile the corresponding `.c` file." The `%` is a wildcard that captures the stem.

**Automatic Variable** — Special variables Make sets for you inside a recipe:
- `$@` — the target name
- `$<` — the first prerequisite
- `$^` — all prerequisites, space-separated

**Include** — Pulls another Makefile into the current one. `include common.mk`. Useful for splitting large projects across directories without duplicating variables.

**Shell Function** — `$(shell <cmd>)` runs a shell command and substitutes its output inline. `GIT_SHA := $(shell git rev-parse --short HEAD)`. Use it sparingly — it runs at parse time, not recipe time.

---

## DAY 1 — Your First Real Makefile

### The Anatomy

```makefile
target: prerequisite1 prerequisite2
	recipe line 1
	recipe line 2
```

That tab before the recipe is mandatory. Configure your editor to show whitespace. Do it now, before you lose an hour to "why isn't this working."

### A Minimal Working Makefile

```makefile
.PHONY: build test lint clean

build:
	go build ./...

test:
	go test ./...

lint:
	golangci-lint run

clean:
	rm -rf bin/
```

Run `make build`. Make executes `go build ./...`. That is the whole loop.

### Variables

Hard-coding values is how Makefiles become unmaintainable. Pull everything that changes into variables at the top.

```makefile
APP_NAME   := myapp
BUILD_DIR  := bin
GO_FLAGS   := -ldflags="-s -w"
IMAGE_NAME := myorg/$(APP_NAME)
IMAGE_TAG  := $(shell git rev-parse --short HEAD)

.PHONY: build docker-build

build:
	go build $(GO_FLAGS) -o $(BUILD_DIR)/$(APP_NAME) ./cmd/$(APP_NAME)

docker-build:
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) .
```

Now changing the app name, the image org, or the Go linker flags is a one-line edit at the top.

### .PHONY — Always Declare It

If you have a target that does not produce a file, declare it phony. Always. The cost is one line. The benefit is that Make never silently skips your recipe because some file with the same name appeared in the directory.

```makefile
.PHONY: build test lint clean docker-build deploy help
```

Put this near the top of your Makefile. Add to it whenever you add a non-file target.

### Common Targets Every Project Should Have

These are the targets your teammates expect to find. Stick to these names and anyone can onboard in minutes.

```makefile
.PHONY: build test lint fmt clean docker-build docker-push deploy help

## build: compile the application
build:
	go build $(GO_FLAGS) -o $(BUILD_DIR)/$(APP_NAME) ./cmd/$(APP_NAME)

## test: run unit tests with race detector
test:
	go test -race -cover ./...

## lint: run linter
lint:
	golangci-lint run ./...

## fmt: format source code
fmt:
	gofmt -w . && goimports -w .

## clean: remove build artifacts
clean:
	rm -rf $(BUILD_DIR)

## docker-build: build Docker image
docker-build:
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) .

## docker-push: push image to registry
docker-push: docker-build
	docker push $(IMAGE_NAME):$(IMAGE_TAG)

## deploy: apply manifests to current kubectl context
deploy:
	kubectl apply -f k8s/
```

### The Help Target

This is the single most useful thing you can add to a Makefile. It prints every target with its description — self-documenting, always accurate.

```makefile
## help: show this help message
help:
	@grep -E '^## ' Makefile | sed 's/## //' | column -t -s ':'
```

The convention: prefix every target's comment with `## `. The help recipe greps those lines, strips the marker, and formats them as a table. Run `make help` and see every command the project understands.

Make `help` the default target — the one that runs when someone types `make` with no arguments — by putting it first in the file, or by setting it explicitly:

```makefile
.DEFAULT_GOAL := help
```

---

## DAY 2 — Going Deeper

### Pattern Rules

Pattern rules let you define one rule that applies to many files.

```makefile
$(BUILD_DIR)/%.o: src/%.c
	mkdir -p $(BUILD_DIR)
	cc -c $< -o $@
```

- `%` matches the stem — the part that varies between files.
- `$<` is the source file (`src/foo.c`).
- `$@` is the target (`bin/foo.o`).

For most task-runner Makefiles you will never write pattern rules. But you will read them in other people's Makefiles, so knowing what `$@` and `$<` mean is non-negotiable.

### Conditionals

Make has conditionals. They run at parse time, not recipe time — that distinction matters.

```makefile
ENV ?= development

ifeq ($(ENV), production)
  GO_FLAGS := -ldflags="-s -w" -trimpath
else
  GO_FLAGS := -race
endif
```

The `?=` operator sets a variable only if it is not already set, making it overridable from the command line:

```
make build ENV=production
```

Override any variable at the command line the same way:

```
make docker-build IMAGE_TAG=v1.2.3
```

### Includes for Multi-Directory Projects

When a monorepo contains multiple services, put shared variables in `common.mk` at the root and `include` it from each service's Makefile.

`common.mk` at repo root:
```makefile
REGISTRY   := gcr.io/myproject
GIT_SHA    := $(shell git rev-parse --short HEAD)
BUILD_DATE := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
```

`services/api/Makefile`:
```makefile
include ../../common.mk

APP_NAME   := api
IMAGE_NAME := $(REGISTRY)/$(APP_NAME)

.PHONY: build docker-build

build:
	go build -o bin/$(APP_NAME) ./cmd/$(APP_NAME)

docker-build:
	docker build --build-arg GIT_SHA=$(GIT_SHA) -t $(IMAGE_NAME):$(GIT_SHA) .
```

Each service is self-contained. Shared variables live once.

### Self-Documenting Help — The Full Pattern

The minimal help target above works. Here is the version that scales to larger Makefiles and handles included files:

```makefile
.PHONY: help
help: ## show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} \
	  /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
```

This version uses `awk`, colors the target names cyan, and handles included Makefiles via `$(MAKEFILE_LIST)`. Comment your targets with `## description` and they appear automatically — zero maintenance overhead.

### Docker and Kubernetes Patterns

Two rules govern every real Docker/K8s Makefile.

**Tag with the git SHA, not `latest`.** `latest` makes rollbacks guesswork.

```makefile
GIT_SHA   := $(shell git rev-parse --short HEAD)
IMAGE_TAG ?= $(GIT_SHA)
```

**Make `k8s-rollout` depend on `k8s-apply`.** Prerequisites enforce order without scripts.

```makefile
KUBE_CONTEXT ?= staging
NAMESPACE    ?= default

.PHONY: k8s-apply k8s-rollout

k8s-apply:
	kubectl --context=$(KUBE_CONTEXT) apply -f k8s/ -n $(NAMESPACE)

k8s-rollout: k8s-apply
	kubectl --context=$(KUBE_CONTEXT) rollout status \
	  deployment/$(APP_NAME) -n $(NAMESPACE)
```

The worked example at the end of this file shows the full combined pattern.

### CI/CD Integration

Makefiles and CI pipelines compose naturally. Your CI YAML calls `make` targets — not raw commands. The pipeline and local dev use the exact same commands. Changing a build step means editing the Makefile, not hunting through YAML. Any engineer can reproduce any CI step locally.

GitHub Actions — one job looks like this:

```yaml
steps:
  - uses: actions/checkout@v4
  - run: make test
  - run: make lint
  - run: make docker-push
    env:
      IMAGE_TAG: ${{ github.sha }}
```

GitLab CI follows the same pattern: each stage calls a single `make` target. The CI file is a thin wrapper. All the logic lives in the Makefile.

### Make vs Just vs Task

You will encounter alternatives. Here is the honest comparison.

**Make** — ships everywhere, zero install, widely understood, tabs-not-spaces gotcha, syntax from 1976. It works. That is the point.

**Just** (`casey/just`) — modern Make-alike, no tabs requirement, cleaner syntax, recipe variables work intuitively. Requires install. Great for developer ergonomics on teams that control their machines.

**Task** (`go-task/task`) — YAML-based, cross-platform including Windows native, good for teams with mixed OS. Requires Go or a binary install.

When to use what:
- Library or service someone else will clone and run — use Make. Zero friction.
- Your own dev machine, team that can install tools — Just is genuinely nicer.
- Windows-first or cross-platform CLI tooling — Task.
- Greenfield project with full control — pick one, document it, commit.

The patterns you learn for Make transfer directly to Just and Task. The concepts are identical.

---

## Worked Example — Makefile for a Go Microservice

A production-ready Makefile for a Go service. Every line has a reason.

```makefile
APP_NAME   := api
BUILD_DIR  := bin
CMD_DIR    := ./cmd/$(APP_NAME)
IMAGE_NAME := gcr.io/myproject/$(APP_NAME)
GIT_SHA    := $(shell git rev-parse --short HEAD)
BUILD_DATE := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
IMAGE_TAG  ?= $(GIT_SHA)
NAMESPACE  ?= default
KUBE_CTX   ?= staging
LDFLAGS    := -ldflags "-X main.version=$(GIT_SHA) -X main.buildDate=$(BUILD_DATE) -s -w"

.DEFAULT_GOAL := help
.PHONY: build run test lint fmt tidy clean docker-build docker-push k8s-apply k8s-rollout k8s-status help

## build: compile binary to bin/
build:
	@mkdir -p $(BUILD_DIR)
	go build $(LDFLAGS) -o $(BUILD_DIR)/$(APP_NAME) $(CMD_DIR)

## run: run locally without compiling to disk
run:
	go run $(CMD_DIR)

## test: run unit tests with race detector and coverage
test:
	go test -race -coverprofile=coverage.out ./...
	go tool cover -func=coverage.out

## lint: run golangci-lint
lint:
	golangci-lint run ./...

## fmt: gofmt + goimports
fmt:
	gofmt -w . && goimports -w .

## tidy: tidy and verify go modules
tidy:
	go mod tidy && go mod verify

## clean: remove build artifacts
clean:
	rm -rf $(BUILD_DIR) coverage.out

## docker-build: build image tagged with git SHA
docker-build:
	docker build \
	  --build-arg GIT_SHA=$(GIT_SHA) \
	  --build-arg BUILD_DATE=$(BUILD_DATE) \
	  -t $(IMAGE_NAME):$(IMAGE_TAG) \
	  -t $(IMAGE_NAME):latest .

## docker-push: push image to registry
docker-push: docker-build
	docker push $(IMAGE_NAME):$(IMAGE_TAG)
	docker push $(IMAGE_NAME):latest

## k8s-apply: apply manifests to current kubectl context
k8s-apply:
	kubectl --context=$(KUBE_CTX) apply -f k8s/ -n $(NAMESPACE)

## k8s-rollout: wait for rollout to complete
k8s-rollout: k8s-apply
	kubectl --context=$(KUBE_CTX) rollout status deployment/$(APP_NAME) -n $(NAMESPACE)

## k8s-status: show pod status
k8s-status:
	kubectl --context=$(KUBE_CTX) get pods -n $(NAMESPACE) -l app=$(APP_NAME)

## help: show this help
help:
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} \
	  /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
```

Run `make help` and get a formatted table of every target. Run `make build IMAGE_TAG=v2.0.0` to override the tag. The CI pipeline calls `make test lint docker-push` — identical to what you run locally.

## Pitfalls

⚠️ **Tabs, not spaces.** Make requires a literal tab character to indent recipes. Spaces cause `Makefile:5: *** missing separator. Stop.` — one of the most confusing errors a beginner hits. Set your editor to show whitespace. Set it to never substitute tabs with spaces in `.mk` and `Makefile` files.

**Each recipe line runs in its own subshell.** `cd` in one line does not affect the next. If you need to `cd` and then run a command, do it on one line: `cd subdir && go build ./...`. Or use the `.ONESHELL:` directive to change this behavior for the whole file.

**Variables expand differently.** `:=` expands the right side immediately when the Makefile is parsed. `=` expands it every time the variable is used. This matters when the value depends on side effects like `$(shell ...)`. Prefer `:=` to avoid surprises.

**`make` skips up-to-date file targets.** For file targets, Make compares timestamps. If `src/main.go` has not changed since `bin/app` was built, `make build` does nothing. Declare `.PHONY` for any target that is not literally a file you produce.

**`@` suppresses echo.** By default, Make prints each recipe line before running it. Prefix a line with `@` to suppress the echo. `@echo "Building..."` prints the message but not the `echo` command itself.

**`-` ignores errors.** A recipe line prefixed with `-` continues even if the command fails. `-rm -rf $(BUILD_DIR)` does not abort if `bin/` does not exist. Useful for cleanup targets.

**Use `$(MAKE)` for recursive calls.** If one target calls another Makefile, use `$(MAKE)` — not `make` — so the sub-make inherits the same Make binary, flags, and job count.

---

## Quick Reference

| Syntax | Meaning |
|---|---|
| `target: prereq` | target depends on prereq |
| `[TAB] recipe` | tab-indented recipe command |
| `VAR := value` | immediate assignment |
| `VAR ?= value` | assign only if unset |
| `$(VAR)` | expand variable |
| `$@` | current target name |
| `$<` | first prerequisite |
| `$^` | all prerequisites |
| `%.o: %.c` | pattern rule |
| `.PHONY: t` | t is not a file target |
| `@cmd` | run cmd, suppress echo |
| `-cmd` | run cmd, ignore failure |
| `include file.mk` | include another Makefile |
| `$(shell cmd)` | substitute shell output inline |
| `$(MAKE)` | recursive make call |
| `make VAR=val target` | override variable on command line |
| `.DEFAULT_GOAL := t` | default target when none specified |
| `ifeq / else / endif` | conditional at parse time |

---

## Next Steps

- `Bash.md` — recipes are shell; knowing Bash makes them readable and writable
- `Docker.md` — most Makefile targets in production wrap Docker commands
- `Go-for-Ops.md` — the worked example above is Go; understand what it is building
- `Git.md` — `GIT_SHA := $(shell git rev-parse --short HEAD)` appears in every real Makefile

---

## Recommended learning resources

**YouTube channels & playlists:**
- [LearnLinuxTV — Makefile Tutorial](https://www.youtube.com/@LearnLinuxTV) — structured walkthrough of targets, variables, and phony rules for beginners
- [Fireship — Makefile in 100 Seconds](https://www.youtube.com/@Fireship) — rapid overview of what Make does and why projects still use it
- [ThePrimeagen — Build Systems and Makefiles](https://www.youtube.com/@ThePrimeagen) — practical take on Makefiles in modern development workflows
- [tutoriaLinux — Makefiles for DevOps](https://www.youtube.com/@tutoriaLinux) — ops-focused examples wrapping Docker, Kubernetes, and CI commands in Make targets

**Official docs & blogs:**
- [GNU Make Manual](https://www.gnu.org/software/make/manual/make.html) — the authoritative reference for rules, variables, functions, and pattern matching
- [Clark Grubb — Makefile Style Guide](https://clarkgrubb.com/makefile-style-guide) — practical conventions for writing clean, maintainable Makefiles
- [Julia Evans — Makefiles explained](https://jvns.ca/) — short, clear posts that demystify how Make actually works under the hood

---

## The Mantra

> One file. Zero dependencies. Every command the project needs — discoverable, reproducible, and runnable the same way on your laptop and in CI. That is the Makefile promise. Keep it simple and keep it honest.
