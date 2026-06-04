# Stage 4: Jenkins

**Goal:** Build the same pipeline in Jenkins using a declarative Jenkinsfile — and understand why Jenkins remains ubiquitous despite newer alternatives.

**Prerequisites:** Stage 3 complete. Jenkins installed (docker run jenkins/jenkins:lts).

---

## 1. Theory (What & Why)

### Why Jenkins still exists

Jenkins is 15+ years old and feels it. The UI is dated, plugin management is painful, and Groovy pipelines are harder to write than YAML. But Jenkins offers:
- **Total control** — self-hosted, no vendor lock-in, runs anywhere
- **Plugin ecosystem** — 1800+ plugins for every tool imaginable
- **Flexibility** — scripted pipelines can do anything Groovy can do
- **Enterprise adoption** — existing in thousands of companies, wont be replaced overnight

### Declarative vs Scripted

The Jenkinsfile uses **declarative** syntax — structured, opinionated, easier to read. Scripted pipelines use raw Groovy — more flexible but harder to maintain.

---

## 2. Hands-On

### 2.1 Start Jenkins

```bash
docker run -d -p 8080:8080 -p 50000:50000 --name jenkins jenkins/jenkins:lts
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

### 2.2 Create a pipeline job

New Item > Pipeline > point to the PipelineAPI Jenkinsfile.

### 2.3 Run and compare

The pipeline runs Test, Build, Scan — same logic, different syntax.

---

## Exercises

1. [Exercise 1 — Run the Jenkinsfile](exercises/01-run-jenkinsfile.md)
2. [Exercise 2 — Add credentials and notifications](exercises/02-credentials.md)

**Next stage:** [05-tekton](../05-tekton/README.md)
