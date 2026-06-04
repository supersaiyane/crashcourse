# Stage 4: Jenkins

**Goal:** Build the same pipeline in Jenkins using a declarative Jenkinsfile — and understand why Jenkins remains ubiquitous in enterprises despite newer alternatives.

**Prerequisites:** Stage 3 complete. Docker installed (to run Jenkins locally).

---

## 1. Theory (What & Why)

### Why Jenkins still matters

Jenkins is 15+ years old. The UI feels dated, plugin management is painful, and Groovy is harder to write than YAML. So why does it still power CI/CD at thousands of companies?

| Strength | Why it matters |
|----------|---------------|
| **Total control** | Self-hosted, no vendor lock-in, runs on-prem, cloud, or air-gapped |
| **Plugin ecosystem** | 1,800+ plugins for every tool and cloud provider |
| **Flexibility** | Scripted pipelines can do anything Groovy can do |
| **Enterprise adoption** | Already installed, teams trained, compliance approved |
| **Pipeline as code** | Jenkinsfile in the repo, versioned with the code |

Jenkins is the "Excel of CI/CD" — not the most elegant, but it is everywhere and it works.

### Declarative vs Scripted pipelines

**Declarative** (recommended — structured, opinionated, covers 90% of cases):

```groovy
pipeline {
    agent any
    stages {
        stage('Test') {
            steps { sh 'python -m pytest -v' }
        }
    }
}
```

**Scripted** (raw Groovy — maximum flexibility, harder to maintain):

```groovy
node {
    stage('Test') { sh 'python -m pytest -v' }
}
```

### Core concepts

| Concept | What it is | GitHub Actions equivalent |
|---------|-----------|--------------------------|
| **Jenkinsfile** | Pipeline definition (Groovy DSL) | Workflow YAML |
| **Agent** | Where the pipeline runs | Runner |
| **Stage** | A phase of the pipeline | Job |
| **Step** | A single command | Step |
| **Credentials** | Encrypted secrets in Jenkins | Secrets |
| **Shared Library** | Reusable pipeline code | Reusable workflows |
| **Blue Ocean** | Modern pipeline UI (plugin) | Actions tab |
| **Multibranch Pipeline** | Auto-discovers branches with Jenkinsfiles | Automatic on push/PR |

### Jenkins architecture

```text
Jenkins Controller (manages, schedules, serves UI)
    |
    +-- Agent 1 (Linux)   -- executes builds
    +-- Agent 2 (Docker)  -- executes builds
    +-- Agent 3 (macOS)   -- executes builds
```

The controller schedules and monitors. Agents execute. In production, the controller should never run builds.

---

## 2. Hands-On: PipelineAPI on Jenkins

### 2.1 Start Jenkins locally

```bash
docker run -d --name jenkins \
  -p 8080:8080 -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  jenkins/jenkins:lts

# Get the initial admin password
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Open `http://localhost:8080`, paste the password, install suggested plugins.

### 2.2 Review the Jenkinsfile

```groovy
pipeline {
    agent any

    stages {
        stage('Test') {
            steps {
                sh 'pip install -r api/requirements.txt'
                sh 'cd api && python -m pytest -v'
                sh 'cd api && ruff check .'
            }
        }
        stage('Build') {
            steps {
                sh 'docker build -t pipelineapi:${BUILD_NUMBER} ./api'
            }
        }
        stage('Scan') {
            steps {
                sh 'trivy image pipelineapi:${BUILD_NUMBER} --severity HIGH,CRITICAL'
            }
        }
    }

    post {
        always {
            cleanWs()    // cleanup workspace after every run
        }
    }
}
```

Compare with YAML-based systems:
- **Groovy, not YAML** — more verbose but supports complex logic
- **agent any** — runs on whatever agent is available
- **${BUILD_NUMBER}** — Jenkins built-in auto-incrementing variable
- **post { always }** — cleanup after every run, pass or fail
- **cleanWs()** — deletes workspace to prevent disk bloat

### 2.3 Create the pipeline job

1. Dashboard > New Item > **Pipeline**
2. Name: `pipelineapi`
3. Definition: **Pipeline script from SCM**
4. SCM: Git > Repository URL > Script Path: `PipelineAPI/Jenkinsfile`
5. Save > **Build Now**

### 2.4 Watch the pipeline

The stage view shows:

```text
[Test] --> [Build] --> [Scan]
  2m          1m         30s
```

Click any stage for detailed logs.

### 2.5 Install Blue Ocean

For modern pipeline visualisation:
- Manage Jenkins > Plugins > "Blue Ocean" > Install
- Access at `http://localhost:8080/blue`

### 2.6 Comparison snapshot

| Aspect | GitHub Actions | GitLab CI | Jenkins |
|--------|---------------|-----------|---------|
| **Setup time** | 0 min | 0 min | 30+ min |
| **Config format** | YAML | YAML | Groovy |
| **Agent mgmt** | Automatic | Automatic | Manual |
| **Plugin mgmt** | Per-action, pinned | Built-in | Global, version conflicts |
| **Secrets** | Per-repo encrypted | Per-project masked | Global credentials store |
| **UI** | Modern | Modern | Dated (unless Blue Ocean) |

---

## 3. Key patterns

### Credentials management

```groovy
stage('Push') {
    steps {
        withCredentials([usernamePassword(
            credentialsId: 'docker-hub',
            usernameVariable: 'DOCKER_USER',
            passwordVariable: 'DOCKER_PASS'
        )]) {
            sh 'docker login -u $DOCKER_USER -p $DOCKER_PASS'
            sh 'docker push pipelineapi:${BUILD_NUMBER}'
        }
    }
}
```

Credentials injected only within the `withCredentials` block. Masked in logs.

### Docker agent

Run the pipeline inside a container:

```groovy
pipeline {
    agent {
        docker {
            image 'python:3.11-slim'
            args '-v /var/run/docker.sock:/var/run/docker.sock'
        }
    }
}
```

Clean, reproducible environment — similar to GitLab CI `image:`.

### Shared libraries

For large organisations, extract common logic:

```groovy
@Library('my-shared-lib') _
pipeline {
    stages {
        stage('Test') {
            steps { pythonTest('api') }    // from shared lib
        }
    }
}
```

### Multibranch pipeline

Instead of one job per branch: New Item > Multibranch Pipeline > add branch source. Jenkins auto-discovers all branches with a Jenkinsfile.

---

## 4. Common mistakes

- **Running builds on the controller:** Security and stability risk. Install agents for execution.
- **Plugin version conflicts:** Updating one plugin can break others. Test in a staging Jenkins first.
- **No pipeline as code:** Configuring in the UI means config is not versioned or reviewable. Always use a Jenkinsfile.
- **Stale agents:** Agents accumulate disk usage and cached data. Clean regularly or use ephemeral Docker agents.
- **No backup:** Jenkins config lives in `JENKINS_HOME`. Back it up or use Configuration as Code (JCasC) plugin.

---

## Exercises

1. [Exercise 1 — Run the Jenkinsfile](exercises/01-run-jenkinsfile.md)
2. [Exercise 2 — Add credentials and notifications](exercises/02-credentials.md)

**Next stage:** [05-tekton](../05-tekton/README.md) — Kubernetes-native CI/CD.
