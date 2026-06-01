# Incident Response — A 2-Day Crash Course

> **In one sentence:** Incident response is the disciplined way teams handle production outages —
> roles, communication, and a repeatable process so that when things break (and they will), you
> restore service fast, stay calm, and learn from it instead of flailing.

> Deep-dive companion to `SRE-Process.md` (which covers SLOs, error budgets, and the broader SRE
> picture). This zooms into the live-incident craft.

---

## Part 0 — Why a *process* beats heroics

Without a process, an outage looks like this: alerts fire, three engineers all dive into the same
database, nobody tells customers, two people make conflicting changes, the CEO is messaging the
on-call directly, and an hour later nobody can say what was tried. The outage is worse and longer
*because of the chaos*, not just the bug.

Incident response replaces heroics with structure. The core insight: **during an incident,
coordination is as important as technical skill.** A clear process means one person coordinates,
responders aren't tripping over each other, stakeholders get updates without interrupting the
fixers, and every action is recorded. This consistently resolves incidents faster and reduces the
stress that leads to mistakes (like the panicked `rm -rf` or the un-reviewed prod change).

**The mental model — separate the work into lanes:**
- **Someone coordinates** (the Incident Commander) — decides, delegates, never gets heads-down.
- **Someone fixes** (Ops/responders) — does the hands-on technical work.
- **Someone communicates** (Comms lead) — updates stakeholders and customers.
Keeping these lanes separate is the single biggest improvement over "everyone piles on." Even in a
tiny team where one person wears two hats, *knowing which hat you're wearing* changes how you act.

---

## Part 1 — The vocabulary

| Term | Meaning |
|------|---------|
| **Incident** | An unplanned disruption/degradation that needs an urgent response |
| **Severity (SEV)** | How bad it is (SEV1 = critical/total outage … SEV4 = minor) |
| **Incident Commander (IC)** | The single person coordinating the response (not necessarily fixing) |
| **Ops / Responders** | The people doing the hands-on technical mitigation |
| **Comms lead** | Owns stakeholder/customer communication |
| **Scribe** | Records the timeline of actions and decisions |
| **MTTR / MTTD** | Mean time to restore / to detect |
| **Mitigation** | Stopping the bleeding (restore service), distinct from root-cause fix |

**Severity drives everything** — how many people you pull in, how often you update, whether you
wake people up. A rough scale:
- **SEV1** — major outage / data loss / security breach. All hands, exec-visible, frequent updates.
- **SEV2** — significant degradation, key feature down for many users. Dedicated response.
- **SEV3** — limited impact, workaround exists. Handle in hours.
- **SEV4** — minor, low urgency.
Agree on your scale *before* incidents so there's no debate at 3am.

---

## DAY 1 — Run an incident

### 1. The lifecycle (the spine of every incident)
```
DETECT  ->  TRIAGE  ->  RESPOND  ->  MITIGATE  ->  RESOLVE  ->  LEARN
(alert/   (how bad?   (assemble    (stop the    (full       (postmortem —
 report)   declare,    the team,    bleeding,    service     see Postmortems-RCA.md)
           assign IC)  investigate) restore)     restored)
```
Two things beginners get wrong here:
- **Declare early.** It's cheap to declare an incident and stand it down; it's expensive to
  realize 40 minutes in that you should have. When in doubt, declare.
- **Mitigate before you diagnose.** Your first job is to *stop customer pain*, not to understand
  the root cause. Roll back the deploy, fail over, scale up, disable the feature — restore
  service first, investigate root cause later (in the postmortem). Confusing "fix" with "mitigate"
  prolongs outages.

### 2. Declaring and the first five minutes
When an alert or report suggests a real problem:
```text
1. Declare the incident (open the incident channel/bridge, set a SEV).
2. Assign an Incident Commander — the FIRST responder takes IC until handed off.
3. IC states: "I'm IC for <incident>. Current impact: <what/who>. We're investigating."
4. Open a dedicated channel (e.g. #inc-2026-05-30-checkout) — ALL incident chatter goes here.
5. Start a timeline (scribe, or IC pins messages) — note every action with a timestamp.
```
A single source of truth (one channel) and a named IC stops the chaos immediately.

### 3. The Incident Commander's job (this is a coordination role, not a hero role)
The IC does NOT get heads-down debugging. The IC:
- Maintains the **big picture**: what's the impact, what's been tried, what's next.
- **Delegates** clearly: "Priya, check the database; Sam, look at the last deploy. Report back in
  5 minutes." Tasks have an owner and a check-in time.
- **Makes decisions**: "We're rolling back. Do it now." Someone must decide; the IC breaks ties.
- **Controls who's involved**: pulls in more help or sends people away. Prevents the "20 people
  in the bridge talking over each other" failure.
- **Keeps comms flowing** (or delegates to a Comms lead): regular updates so nobody has to ask.
If you're IC, the discipline is: **stay out of the weeds.** The moment you're deep in a terminal,
nobody's flying the plane.

### 4. Communication during the incident
- Post **regular updates** on a fixed cadence (e.g. every 15–30 min for SEV1) even if the update
  is "still investigating, next update in 20 min." Silence breeds panic and side-channel pings.
- Separate **internal** (technical detail, in the incident channel) from **external/status-page**
  (impact + ETA, no jargon, no blame).
- Shield the responders: stakeholders ask the Comms lead, not the engineer mid-fix.
A good update template: *what's affected, what we're doing, what's the impact, when's the next
update.*

**By end of Day 1 you can:** recognize and declare an incident, take or assign the IC role,
coordinate via a single channel, mitigate before diagnosing, and keep stakeholders informed.
That's the core of competent incident response.

---

## DAY 2 — Make it real

### 1. On-call that doesn't burn people out
Incident response depends on someone being reachable. Healthy on-call:
- **A clear rotation and primary/secondary.** Secondary covers if primary misses a page.
- **Sane alerting** — page only on *actionable, user-impacting* symptoms (see `Prometheus.md` and
  `Alertmanager.md`). Every page should be worth waking someone for; non-urgent things go to a
  ticket, not a page. Alert fatigue is the #1 destroyer of on-call effectiveness.
- **Runbooks linked from alerts** so the on-call has a starting point at 3am (see the runbook
  template in this folder).
- **Follow-the-sun** across time zones if you can, so nobody is permanently on night shift.
- **Comp/time off** for heavy on-call weeks. On-call is labor; treat it as such.

### 2. Mitigation playbook (the moves that stop the bleeding)
Before root-causing, reach for the fast reversals:
- **Roll back** the most recent deploy (most outages follow a change — `git revert`, redeploy the
  last good image; see `ArgoCD.md`/`Kubernetes.md`).
- **Fail over** to a healthy replica/region.
- **Scale up/out** if it's saturation.
- **Disable the offending feature** (feature flag) or shed load (rate-limit).
- **Roll back a config/secret change.**
"What changed recently?" is the highest-yield first question — most incidents trace to a recent
deploy, config change, or traffic shift.

### 3. Severity, escalation, and when to wake people
- Map each SEV to a response: who's pulled in, update cadence, whether to wake leadership.
- **Escalate without ego.** Pulling in a senior engineer or another team early is a sign of good
  judgment, not failure. A 20-minute escalation beats a 2-hour solo struggle.
- Define **escalation paths** in advance (who owns each system, how to reach them) so you're not
  hunting for contacts mid-incident.

### 4. Handoffs (incidents outlast a shift)
For long incidents, hand off the IC role explicitly:
```text
"Handing off IC to <name>. Current state: <impact>. Tried: <list>. Current theory: <x>.
 Next steps: <y>. Open questions: <z>." -> new IC confirms: "I have IC."
```
A clean handoff with the timeline intact prevents the new responder from re-treading old ground.

### 5. Resolve, then *learn* (the part that pays off)
- **Resolve** = service is fully restored and verified (watch the metrics recover; confirm with
  synthetic checks), not just "the error stopped for a minute."
- **Stand down** the incident formally; thank responders.
- **Schedule the postmortem** for every significant incident — **blameless** (see
  `Postmortems-RCA.md`). The goal is to fix the *system and process* that allowed the incident,
  not to find a person to blame. Teams that skip this relive the same outage.

### 6. Practice before the real thing
- **Game days / chaos drills** — deliberately break things in a controlled way to rehearse the
  process and find gaps in runbooks and alerting.
- **Wheel-of-misfortune** — role-play past incidents so new on-call engineers practice being IC.
The first time you run the process should not be during a real SEV1.

---

## Worked example — checkout is throwing 500s
```text
14:02  Alert: checkout 5xx rate > 5% (Alertmanager -> PagerDuty). On-call acks.
14:03  Declares SEV2. Opens #inc-checkout-500s. "I'm IC. Impact: ~30% of checkouts failing."
14:04  IC delegates: "Sam: what deployed recently? Priya: DB + downstream health. 5-min check-in."
14:06  Sam: "checkout v2.4 deployed at 13:58 — right before the spike." Strong signal.
14:07  IC decision: "Mitigate first — roll back to v2.3 now." (kubectl rollout undo / Argo sync)
14:10  Error rate dropping. IC posts status update: "Rolling back; recovery in progress."
14:14  5xx back to baseline; synthetic checkout passes. IC: "Service restored, monitoring."
14:25  Stable. IC stands down the incident, thanks the team, schedules a blameless postmortem.
       Root cause (a bad migration in v2.4) is investigated LATER — mitigation came first.
```

---

## Common pitfalls
- **No IC / everyone fixing.** Chaos, duplicated work, conflicting changes. Name an IC immediately.
- **Diagnosing before mitigating.** Customers keep hurting while you chase root cause. Stop the
  bleeding first (often: roll back).
- **Declaring too late.** Ego or optimism delays the response. Declare early; standing down is
  cheap.
- **Communication black holes.** Silence makes stakeholders panic and ping responders. Update on a
  fixed cadence, even with "no news yet."
- **The IC going heads-down.** Then nobody coordinates. IC stays at the 10,000-foot view.
- **Hero culture / blame.** Relying on one person and blaming individuals afterward destroys teams
  and hides systemic causes. Build process; keep postmortems blameless.
- **Skipping the postmortem.** Guarantees the incident recurs. The learning is where the ROI is.
- **Alert fatigue.** Too many noisy pages mean real ones get ignored. Tune alerting to actionable
  symptoms.

---

## Quick reference
```text
SEVERITY (agree in advance)
  SEV1 total outage/data loss/security  -> all hands, exec-visible, updates q15m
  SEV2 major degradation                -> dedicated response, updates q30m
  SEV3 limited, workaround exists        -> handle in hours
  SEV4 minor                             -> low urgency

ROLES
  Incident Commander  coordinate, delegate, decide (NOT heads-down)
  Ops / Responders    hands-on mitigation
  Comms lead          stakeholder + status-page updates
  Scribe              timeline of actions/decisions

LIFECYCLE
  Detect -> Triage(declare+SEV+IC) -> Respond -> MITIGATE -> Resolve -> Learn(postmortem)

FIRST 5 MINUTES
  1. Declare + set SEV   2. Assign IC   3. One channel   4. State impact   5. Start timeline

MITIGATION FIRST (stop the bleeding)
  roll back deploy · fail over · scale up · feature-flag off · revert config
  highest-yield question: "WHAT CHANGED recently?"

COMMS UPDATE TEMPLATE
  Affected: __  | Doing: __  | Impact: __  | Next update: __

GOLDEN RULES
  declare early · mitigate before diagnose · one IC, stays high-level ·
  escalate without ego · resolve = verified recovery · always do a blameless postmortem
```

---

## Next steps after Day 2
- **`Postmortems-RCA.md`** — turn each incident into durable learning (blamelessly).
- **`Runbook-template.md`** — write the runbooks your alerts link to.
- Tooling: incident management (PagerDuty/Opsgenie/incident.io), status pages, and ChatOps bots
  that open channels and track timelines automatically.
- Track **MTTR/MTTD** over time and run **game days** to keep the process sharp.

## Recommended learning resources

**YouTube channels & playlists:**
- [Google SRE — Incident Management](https://www.youtube.com/results?search_query=google+SRE+incident+management) — Google's approach to incident command, communication, and post-incident learning
- [PagerDuty — Incident Response](https://www.youtube.com/@PagerDuty) — on-call workflows, escalation patterns, and incident commander training
- [USENIX SREcon — Incident Response Talks](https://www.youtube.com/results?search_query=usenix+srecon+incident+response) — war stories and frameworks from SRE practitioners
- [DevOps Enterprise Summit — Resilience](https://www.youtube.com/results?search_query=devops+enterprise+summit+incident) — organisational incident response at scale
- [Gremlin — Game Days and Drills](https://www.youtube.com/@GremlinInc) — practising incident response through controlled failure injection

**Official docs & blogs:**
- [learning.pagerduty.com — Incident Response Guide](https://response.pagerduty.com/) — the full open-source incident response process: roles, communication, and post-incident
- [sre.google — Managing Incidents](https://sre.google/sre-book/managing-incidents/) — Google's incident management chapter from the SRE Book

---

**The mantra:** declare early, name one Incident Commander who coordinates (not fixes), mitigate
before you diagnose (what changed?), communicate on a cadence, restore-and-verify, then learn
blamelessly. Structure beats heroics every time.
