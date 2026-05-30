<p align="center">
  <img src="https://img.shields.io/badge/Crash_Courses-29-blue?style=for-the-badge" alt="Courses"/>
  <img src="https://img.shields.io/badge/Categories-9-green?style=for-the-badge" alt="Categories"/>
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License"/>
  <img src="https://img.shields.io/github/stars/supersaiyane/DevOps-Crash-Course?style=for-the-badge" alt="Stars"/>
  <img src="https://img.shields.io/github/forks/supersaiyane/DevOps-Crash-Course?style=for-the-badge" alt="Forks"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker"/>
  <img src="https://img.shields.io/badge/Kubernetes-326CE5?style=flat-square&logo=kubernetes&logoColor=white" alt="Kubernetes"/>
  <img src="https://img.shields.io/badge/Terraform-7B42BC?style=flat-square&logo=terraform&logoColor=white" alt="Terraform"/>
  <img src="https://img.shields.io/badge/AWS-232F3E?style=flat-square&logo=amazonwebservices&logoColor=white" alt="AWS"/>
  <img src="https://img.shields.io/badge/GCP-4285F4?style=flat-square&logo=googlecloud&logoColor=white" alt="GCP"/>
  <img src="https://img.shields.io/badge/Azure-0078D4?style=flat-square&logo=microsoftazure&logoColor=white" alt="Azure"/>
  <img src="https://img.shields.io/badge/Prometheus-E6522C?style=flat-square&logo=prometheus&logoColor=white" alt="Prometheus"/>
  <img src="https://img.shields.io/badge/Grafana-F46800?style=flat-square&logo=grafana&logoColor=white" alt="Grafana"/>
  <img src="https://img.shields.io/badge/Helm-0F1689?style=flat-square&logo=helm&logoColor=white" alt="Helm"/>
  <img src="https://img.shields.io/badge/Jenkins-D24939?style=flat-square&logo=jenkins&logoColor=white" alt="Jenkins"/>
  <img src="https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white" alt="GitHub Actions"/>
  <img src="https://img.shields.io/badge/GitLab_CI-FC6D26?style=flat-square&logo=gitlab&logoColor=white" alt="GitLab CI"/>
  <img src="https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black" alt="Linux"/>
  <img src="https://img.shields.io/badge/Bash-4EAA25?style=flat-square&logo=gnubash&logoColor=white" alt="Bash"/>
  <img src="https://img.shields.io/badge/Git-F05032?style=flat-square&logo=git&logoColor=white" alt="Git"/>
  <img src="https://img.shields.io/badge/OpenTelemetry-000000?style=flat-square&logo=opentelemetry&logoColor=white" alt="OpenTelemetry"/>
  <img src="https://img.shields.io/badge/Packer-02A8EF?style=flat-square&logo=packer&logoColor=white" alt="Packer"/>
  <img src="https://img.shields.io/badge/Pulumi-8A3391?style=flat-square&logo=pulumi&logoColor=white" alt="Pulumi"/>
  <img src="https://img.shields.io/badge/tmux-1BB91F?style=flat-square&logo=tmux&logoColor=white" alt="tmux"/>
</p>

<h1 align="center">DevOps / SRE / Cloud Crash Course</h1>

<p align="center">
  <strong>Zero to productive in 2 days per tool.</strong><br/>
  One file per technology. Concepts first, commands second.<br/>
  No fluff. No slides. Just what you need to get things done.
</p>

<p align="center">
  <a href="#index">Browse Topics</a> &bull;
  <a href="#learning-paths">Learning Paths</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

---

## Why this exists

Most "cheatsheets" are just command lists. Most tutorials waste hours on setup before teaching anything useful.

**This repo is different.** Every file follows the same proven arc:

```
Why it exists --> Mental model --> Vocabulary --> DAY 1 (get it working)
--> DAY 2 (make it real) --> Worked example --> Common pitfalls
--> Quick command reference --> Next steps --> "The Mantra" (one-liner)
```

Read it top-to-bottom to **learn**. Bookmark it and `Ctrl+F` to **reference**. Files cross-link each other so you can follow a path across an entire stack.

---

## Index

### Containers & Orchestration
| Topic | File | What you'll learn |
|-------|------|-------------------|
| Docker | [Docker.md](containers/Docker.md) | Images, containers, volumes, networking, Compose, multi-stage builds |
| Kubernetes | [Kubernetes.md](containers/Kubernetes.md) | Pods, Services, Deployments, ConfigMaps, RBAC, debugging |
| Helm | [Helm.md](containers/Helm.md) | Charts, values, templates, repositories, hooks |

### Infrastructure as Code
| Topic | File | What you'll learn |
|-------|------|-------------------|
| Terraform | [Terraform.md](iac/Terraform.md) | HCL, state, modules, workspaces, import, drift detection |
| Packer | [Packer.md](iac/Packer.md) | Templates, builders, provisioners, golden images |
| Pulumi | [Pulumi.md](iac/Pulumi.md) | IaC in real languages, stacks, state, vs Terraform |

### Cloud Providers
| Topic | File | What you'll learn |
|-------|------|-------------------|
| AWS | [AWS.md](cloud/AWS.md) | EC2, S3, IAM, VPC, Lambda, RDS, CloudFormation |
| Google Cloud | [GCP.md](cloud/GCP.md) | gcloud, GKE, Cloud Run, IAM, networking |
| Azure | [Azure.md](cloud/Azure.md) | az CLI, ARM, AKS, App Service, networking |

### Observability
| Topic | File | What you'll learn |
|-------|------|-------------------|
| Prometheus | [Prometheus.md](observability/Prometheus.md) | PromQL, targets, rules, alerting, federation |
| Grafana | [Grafana.md](observability/Grafana.md) | Dashboards, panels, variables, provisioning |
| Loki | [Loki.md](observability/Loki.md) | LogQL, labels, Promtail, log aggregation |
| OpenTelemetry | [OpenTelemetry.md](observability/OpenTelemetry.md) | Traces, metrics, logs, SDK, collector, instrumentation |
| Alertmanager | [Alertmanager.md](observability/Alertmanager.md) | Routing, grouping, silences, inhibition, receivers |

### CI/CD
| Topic | File | What you'll learn |
|-------|------|-------------------|
| GitHub Actions | [GitHub-Actions.md](cicd/GitHub-Actions.md) | Workflows, jobs, actions, secrets, matrix builds |
| GitLab CI/CD | [GitLab-CI.md](cicd/GitLab-CI.md) | Pipelines, stages, runners, artifacts, environments |
| Jenkins | [Jenkins.md](cicd/Jenkins.md) | Pipelines, Jenkinsfile, agents, shared libraries |

### Linux & Terminal
| Topic | File | What you'll learn |
|-------|------|-------------------|
| Linux | [Linux.md](linux/Linux.md) | Filesystem, processes, permissions, systemd, troubleshooting |
| Bash | [Bash.md](linux/Bash.md) | Scripting, variables, loops, functions, error handling |
| tmux | [tmux.md](linux/tmux.md) | Sessions, windows, panes, key bindings, scripting |

### Version Control
| Topic | File | What you'll learn |
|-------|------|-------------------|
| Git | [Git.md](vcs/Git.md) | Branching, merging, rebasing, stashing, workflows |

### Networking & CLI Tools
| Topic | File | What you'll learn |
|-------|------|-------------------|
| DNS / curl / dig | [DNS-curl-dig.md](networking/DNS-curl-dig.md) | DNS resolution, HTTP debugging, API testing |
| jq | [jq.md](networking/jq.md) | JSON parsing, filtering, transforming on the CLI |
| yq | [yq.md](networking/yq.md) | YAML parsing, editing, converting on the CLI |

### SRE Processes & Practices
| Topic | File | What you'll learn |
|-------|------|-------------------|
| Incident Response | [Incident-Response.md](processes/Incident-Response.md) | Roles, severity levels, communication, running a live incident |
| Postmortems & RCA | [Postmortems-RCA.md](processes/Postmortems-RCA.md) | Blameless culture, 5 Whys, action items, templates |
| Capacity Planning | [Capacity-Planning.md](processes/Capacity-Planning.md) | Utilization, headroom, forecasting, load testing |
| Runbooks | [Runbook-template.md](processes/Runbook-template.md) | Writing runbooks for 3 AM, reusable template |

---

## Learning Paths

Pick your track and follow the arrows:

**Starting from zero:**
> Linux --> Bash --> Git --> Docker --> Kubernetes --> Prometheus --> Incident Response

**Cloud & Infrastructure:**
> AWS _(or GCP/Azure)_ --> Terraform --> Packer --> GitHub Actions --> Helm

**Observability deep-dive:**
> Prometheus --> Grafana --> Loki --> OpenTelemetry --> Alertmanager --> Postmortems & RCA

**Day-to-day productivity:**
> tmux + jq + yq + DNS/curl/dig _(these pay for themselves on day one)_

---

## Contributing

Contributions are welcome! The format is designed to extend cleanly:

1. **One file per tool**, following the same arc (see any existing file as a template)
2. Place it in the right category directory
3. Add it to the index table above
4. Open a PR

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting.

### Wanted topics (PRs welcome!)
- [ ] Ansible
- [ ] Puppet
- [ ] ArgoCD
- [ ] Vim
- [ ] SRE Process (SLI/SLO/SLA, error budgets)
- [ ] Nginx / HAProxy
- [ ] Redis
- [ ] PostgreSQL ops
- [ ] Vault (secrets management)
- [ ] Istio / service mesh

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <strong>If this helped you, give it a star! It helps others find it too.</strong><br/>
  <sub>Built for engineers who'd rather read docs than watch a 4-hour tutorial.</sub>
</p>
