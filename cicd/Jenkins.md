# Jenkins — A 2-Day Crash Course

> **In one sentence:** Jenkins is the original, self-hosted automation server for CI/CD — you run
> it yourself, define pipelines in a `Jenkinsfile`, and its huge plugin ecosystem lets it build,
> test, and deploy almost anything.

> Conceptually similar to GitHub Actions / GitLab CI (see those), but **you host and operate the
> server**. This leads with what that means and the Jenkins-specific model.

---

## Part 0 — Why Jenkins still matters, and how it differs

Jenkins predates the cloud-native CI tools and remains everywhere — especially in enterprises
(banks, telcos) with on-prem systems, strict network isolation, and complex legacy build needs.
Its trade-off versus GitHub Actions/GitLab CI:
- **You run the server** (a controller + agents) and maintain it — more operational burden, but
  total control and the ability to run anywhere (air-gapped networks, special hardware).
- **Plugins for everything** (~1800+). Almost any tool, cloud, or notifier has a Jenkins plugin.
  This power comes with maintenance and occasional plugin-compatibility pain.
- **Maximum flexibility.** Pipelines are backed by a Groovy-based DSL, so you can express very
  complex logic — at the cost of more verbosity than YAML tools.

**Architecture:** a **controller** (the brain: schedules jobs, serves the UI, stores config) and
one or more **agents/nodes** (workers that actually execute builds, often on separate machines or
ephemeral containers). The controller delegates work to agents so builds scale out and isolate.

**Mental model:** Jenkins is a programmable build butler you employ and house. You write its
instructions in a `Jenkinsfile` (stages of steps), it runs them on agents you provide, and
plugins teach it new tricks. Unlike the hosted tools, the upkeep is yours.

---

## Part 1 — The vocabulary

| Term | Meaning |
|------|---------|
| **Controller** | The main Jenkins server (UI, scheduling, config) |
| **Agent / Node** | A worker that runs build steps (separate machine/container) |
| **Job / Pipeline** | A configured unit of automation |
| **Jenkinsfile** | Pipeline-as-code committed to your repo |
| **Stage** | A named phase in a pipeline (Build, Test, Deploy) — shown in the UI |
| **Step** | A single action within a stage (`sh 'make'`) |
| **Executor** | A slot on an agent that runs one build at a time |
| **Plugin** | An add-on that extends Jenkins (Git, Docker, Slack, Kubernetes…) |

---

## DAY 1 — Get it working

### 1. The shift you must make: pipeline-as-code
Old Jenkins was configured by clicking through web forms ("freestyle jobs") — unversioned and
unreviewable. Modern Jenkins puts the pipeline in a **`Jenkinsfile`** committed to your repo, just
like the other tools. **Always use a Jenkinsfile.** There are two syntaxes; learn **Declarative**
(structured, the recommended one) over Scripted (raw Groovy).

### 2. Your first Declarative pipeline
`Jenkinsfile` at the repo root:
```groovy
pipeline {
    agent any                       // run on any available agent
    stages {
        stage('Build') {
            steps {
                sh 'npm ci'          // sh = run a shell command
                sh 'npm run build'
            }
        }
        stage('Test') {
            steps {
                sh 'npm test'
            }
        }
        stage('Deploy') {
            when { branch 'main' }   // only on main
            steps {
                sh './deploy.sh'
            }
        }
    }
    post {                           // runs after the stages, based on outcome
        success { echo 'Pipeline succeeded' }
        failure { echo 'Pipeline failed' }
        always  { junit 'reports/*.xml' }   // always collect test results
    }
}
```
Create a **Multibranch Pipeline** job pointing at your repo; Jenkins discovers the `Jenkinsfile`
and runs it on every branch/PR. The **Stage View** / Blue Ocean shows each stage as a box that
goes green or red.

### 3. Read the Declarative structure
```
pipeline {
  agent      -> WHERE it runs (any / a label / a docker image / kubernetes)
  environment-> env vars / credentials
  stages {
    stage('Name') {
      when    -> conditions to run this stage
      steps   -> the actual commands (sh, bat, plugin steps)
    }
  }
  post       -> success/failure/always cleanup & notifications
}
```
Key points: every pipeline needs an **`agent`**; **`stages`** contain **`stage`** blocks, each
with **`steps`**; **`post`** handles notifications/cleanup regardless of (or based on) outcome.

### 4. The `agent` directive — control where/how it runs
```groovy
agent any                                  // any executor
agent { label 'linux && docker' }          // an agent with these labels
agent { docker { image 'node:20' } }       // run the stage inside a container
agent { kubernetes { ... } }               // spin up an ephemeral pod per build (k8s plugin)
agent none                                 // define per-stage agents instead
```
Running stages inside Docker containers (or ephemeral Kubernetes pods) gives clean, reproducible
build environments — the modern way to avoid "works on this agent only."

**By end of Day 1 you can:** write a Declarative `Jenkinsfile` with stages/steps, choose an agent,
gate a deploy with `when`, and handle results in `post`. That's a real pipeline.

---

## DAY 2 — Make it real

### 1. Credentials (the secure way — never hardcode)
Store secrets in Jenkins **Manage Jenkins → Credentials**, then bind them into the pipeline so
they're masked in logs:
```groovy
environment {
    AWS_CREDS = credentials('aws-deploy')        // a username/password or key credential
    NPM_TOKEN = credentials('npm-token')
}
// or scope a secret to specific steps:
steps {
    withCredentials([string(credentialsId: 'slack-webhook', variable: 'HOOK')]) {
        sh 'curl -X POST "$HOOK" -d "deployed"'
    }
}
```
> For your plaintext-secrets habit: use the Jenkins **Credentials** store + the Credentials Binding
> plugin. Secrets are masked in console output and never live in the `Jenkinsfile`.

### 2. Parameters, environment, and conditionals
```groovy
pipeline {
  agent any
  parameters {
    choice(name: 'ENV', choices: ['staging', 'prod'], description: 'Target')
    booleanParam(name: 'SKIP_TESTS', defaultValue: false)
  }
  environment { APP = 'checkout' }
  stages {
    stage('Test') {
      when { expression { return !params.SKIP_TESTS } }
      steps { sh 'make test' }
    }
    stage('Deploy') {
      when { expression { params.ENV == 'prod' } }
      steps { sh "./deploy.sh ${params.ENV}" }
    }
  }
}
```
Parameters create a "Build with Parameters" form — useful for manual, targeted runs.

### 3. Parallel stages and matrices
```groovy
stage('Tests') {
    parallel {
        stage('unit')        { steps { sh 'make test-unit' } }
        stage('integration') { steps { sh 'make test-int' } }
        stage('lint')        { steps { sh 'make lint' } }
    }
}
```
The `matrix` directive runs a stage across combinations (OS × version), like the other tools.

### 4. Manual approval gates (for production)
```groovy
stage('Approve') {
    steps {
        input message: 'Deploy to production?', ok: 'Ship it', submitter: 'sre-leads'
    }
}
stage('Deploy prod') {
    steps { sh './deploy.sh prod' }
}
```
`input` pauses the pipeline for a human to approve — Jenkins's equivalent of GitHub
environments / GitLab `when: manual`. Restrict who can approve with `submitter`.

### 5. Build & push a container
```groovy
stage('Image') {
  agent { label 'docker' }
  steps {
    script {
      def img = docker.build("ghcr.io/org/app:${env.GIT_COMMIT}")
      docker.withRegistry('https://ghcr.io', 'ghcr-creds') { img.push() }
    }
  }
}
```
(`script { }` drops into full Groovy when the declarative steps aren't enough — use sparingly.)

### 6. Shared Libraries (DRY across many pipelines)
Enterprises with dozens of repos extract common pipeline logic into a **Shared Library** (a Git
repo of reusable Groovy steps), then call it:
```groovy
@Library('my-shared-lib') _
standardJavaPipeline(service: 'checkout', deployTo: 'prod')
```
This is how large orgs keep hundreds of `Jenkinsfile`s consistent — define the standard pipeline
once, call it everywhere.

### 7. Operating Jenkins (the part the hosted tools don't have)
Because you run it, you also maintain it: back up `$JENKINS_HOME` (it holds all config/jobs),
keep the controller and **plugins** updated (plugin drift causes breakage), run builds on
**agents** (never heavy builds on the controller), and consider **Configuration as Code (JCasC)**
to define Jenkins's own setup in YAML so the server itself is reproducible. Ephemeral
Kubernetes agents are the modern scaling pattern (a fresh pod per build, then gone).

---

## Worked example — multibranch pipeline with prod approval
```groovy
pipeline {
  agent { docker { image 'node:20' } }
  environment { REGISTRY = 'ghcr.io/org' }
  stages {
    stage('Install') { steps { sh 'npm ci' } }
    stage('Quality') {
      parallel {
        stage('test') { steps { sh 'npm test' } }
        stage('lint') { steps { sh 'npm run lint' } }
      }
    }
    stage('Image') {
      when { branch 'main' }
      steps { sh "docker build -t $REGISTRY/app:${env.GIT_COMMIT} . && docker push $REGISTRY/app:${env.GIT_COMMIT}" }
    }
    stage('Approve') {
      when { branch 'main' }
      steps { input message: 'Deploy to prod?', submitter: 'sre-leads' }
    }
    stage('Deploy') {
      when { branch 'main' }
      steps { sh './deploy.sh prod' }
    }
  }
  post { always { junit 'reports/*.xml' }; failure { echo 'notify Slack' } }
}
```

---

## Common pitfalls
- **Freestyle/click-configured jobs.** Unversioned, unreviewable, un-reproducible. Use a
  `Jenkinsfile` (Declarative) in the repo.
- **Running builds on the controller.** Overloads it and is a security risk. Run on agents;
  prefer ephemeral container/k8s agents.
- **Neglected plugin/controller updates.** Plugin incompatibilities and security CVEs pile up.
  Patch regularly; pin plugin versions.
- **Secrets in the Jenkinsfile or build logs.** Use the Credentials store + `credentials()` /
  `withCredentials`.
- **No backups of `$JENKINS_HOME`.** All your jobs/config live there; losing it is catastrophic.
  Back it up (or rebuild via JCasC).
- **Over-using `script { }` / Scripted syntax.** Keep pipelines Declarative for readability; drop
  to Groovy only when truly needed.
- **One giant agent for everything.** Use labels to route jobs to appropriate agents.

---

## Quick reference
```groovy
// Declarative skeleton
pipeline {
  agent { docker { image 'x:tag' } }     // any | { label 'l' } | { kubernetes {} } | none
  parameters { choice(name:'ENV', choices:['staging','prod']) }
  environment { CRED = credentials('id'); FOO = 'bar' }
  options { timeout(time: 30, unit: 'MINUTES'); disableConcurrentBuilds() }
  triggers { cron('H 2 * * *'); pollSCM('H/5 * * * *') }
  stages {
    stage('S') {
      when { branch 'main' }             // also: expression { } , allOf { } , anyOf { }
      steps { sh 'cmd'; echo 'msg' }
      parallel { stage('a'){steps{sh 'x'}} stage('b'){steps{sh 'y'}} }
    }
    stage('Gate') { steps { input message: 'OK?', submitter: 'leads' } }
  }
  post { success{}; failure{}; unstable{}; always{ junit 'r/*.xml' } }
}
```
```text
Common steps:  sh / bat / pwsh  ·  echo  ·  checkout scm  ·  junit  ·  archiveArtifacts
  stash/unstash  ·  withCredentials  ·  withEnv  ·  retry(n){}  ·  timeout(){}  ·  input
Env vars:  env.BUILD_NUMBER  env.GIT_COMMIT  env.BRANCH_NAME  env.WORKSPACE  env.JOB_NAME
Ops:  back up $JENKINS_HOME · update plugins · run on agents · JCasC for server config
```

---

## Next steps after Day 2
- **Configuration as Code (JCasC)** to define the Jenkins server itself in YAML.
- **Kubernetes plugin** for ephemeral per-build pods (scalable, clean agents).
- **Shared Libraries** to standardize pipelines across many repos.
- Evaluate whether a hosted tool (GitHub Actions / GitLab CI) removes the ops burden for your
  case — many teams migrate off Jenkins unless they need its on-prem flexibility.

**The mantra:** pipeline-as-code in a Declarative `Jenkinsfile` (stages → steps), run on agents
not the controller, secrets in the Credentials store, gate prod with `input`, and remember: you
own the server, so back it up and keep it patched.
