# Engineering Leadership — A 2-Day Crash Course

The essential tech lead and engineering manager skills: running teams, holding 1:1s, hiring, performance reviews, and making the shift from "my code" to "my team's output."

---

## Part 0 — Why This Matters

Leadership is a skill you learn. It is not a personality trait, a reward for being the best coder, or something that arrives with a new title. The engineers who become great leads learned it deliberately — through feedback, mistakes, and intentional practice.

Here is the uncomfortable truth: bad engineering managers are the single biggest reason good engineers quit. Not compensation. Not tech stack. The manager. Research on voluntary attrition consistently points here. When you step into a lead role, you inherit that responsibility directly.

The good news is that the skills are learnable and the feedback loop is faster than you think. A team that trusts its lead ships faster, escalates problems sooner, and recovers from failure better. Your leverage is real.

This crash course is not about becoming a perfect leader. It is about avoiding the most common damage and building the habits that compound over time.

---

## Vocabulary

**Tech Lead (TL)** — An individual contributor who guides the technical direction of a team. Still writes code, but owns architectural decisions, reviews, and technical mentorship. Usually not a people manager.

**Engineering Manager (EM)** — A people manager responsible for the growth, performance, and well-being of a team. Sets direction in partnership with product. Often does not write production code day-to-day.

**Skip-Level** — A meeting between a manager's manager and the manager's direct reports. Used to surface systemic issues and build relationship layers.

**1:1** — A recurring private meeting between a manager (or lead) and one direct report. The single most important management tool you have.

**Performance Review** — A formal, structured assessment of an employee's work, growth, and impact over a defined period. Feeds compensation and promotion decisions.

**PIP (Performance Improvement Plan)** — A formal document outlining specific expectations and timelines for an underperforming employee. Not a firing formality — when used well, it is a last-resort tool to give someone a real chance to course-correct.

**Hiring Pipeline** — The end-to-end sequence from sourcing candidates through offer acceptance: sourcing, screen, technical assessment, interviews, debrief, offer.

**Team Topology** — How teams are structured relative to each other and the systems they own. Shapes communication patterns, cognitive load, and delivery speed.

**Delegation** — Assigning ownership of work, decisions, or outcomes to someone else, with appropriate context and support. Not dumping tasks.

**Psychological Safety** — The team belief that it is safe to speak up, ask questions, admit mistakes, or challenge ideas without fear of humiliation or punishment. The highest-leverage variable in team performance.

---

## DAY 1

### Tech Lead vs Engineering Manager — What Each Actually Does

Many engineers assume TL and EM are interchangeable. They are not.

The **Tech Lead** sits inside the work. You make technical calls, break down ambiguity in requirements, define the architecture, catch scope creep early, and help the team get unstuck. You still write code — probably 30–50% of your time. Your authority is technical credibility, not org chart position.

The **Engineering Manager** sits outside the work looking at the people doing it. You hold 1:1s, run performance cycles, handle compensation conversations, resolve interpersonal conflict, manage headcount, and represent the team to the rest of the organization. You are accountable for outcomes you do not directly produce.

Some organizations combine these roles. That is hard. When you wear both hats, you will consistently drop one. Know which hat is on and when.

If you are transitioning from IC to TL, the first thing to accept is that your output is no longer measured in pull requests. It is measured in the team's velocity, quality, and morale. Protect that mental shift — it is harder than it sounds.

---

### Running Effective 1:1s

The 1:1 is your most important recurring investment. Done badly, it is fifteen minutes of status updates that could have been a Slack message. Done well, it builds trust, surfaces problems early, and gives you signal you cannot get any other way.

**Cadence:** Weekly for direct reports, especially in the first six months of a working relationship. Biweekly for stable, senior engineers who prefer more autonomy. Never monthly — you lose too much resolution.

**Who owns the agenda:** Your report does. You are there to listen, coach, and unblock — not to download information. If they show up with nothing, that is itself signal.

**The template:**

```
1. What's on your mind? (open — let them lead)
2. What are you working on, and is anything blocking you?
3. How are you feeling about the team / project / company right now?
4. Is there anything I could do differently to support you better?
5. Anything you want my input on?
```

You will not get through all five every week. That is fine. The goal is a real conversation, not a checklist.

**Topics that belong in 1:1s:**
- Career goals and growth
- Frustrations — technical or interpersonal
- Feedback going both directions
- Workload and sustainability
- Concerns about team dynamics

**Topics that do not belong in 1:1s:**
- Status updates that should be in a ticket
- Things that require the whole team to hear
- Sensitive news being delivered before the team is told

Take notes. Not verbatim transcription — just key themes, things you promised to follow up on, and what they said they cared about. You will reference these during performance reviews and when advocating for their promotion.

---

### Giving Feedback — The SBI Model

Most feedback fails because it is vague, delayed, or loaded with judgment. The SBI model (Situation — Behavior — Impact) gives you a reliable structure.

**Situation:** Describe the specific context. When and where did this happen?

**Behavior:** Describe the observable action. What did you actually see or hear? Not what you inferred about intent.

**Impact:** Describe the effect on you, the team, or the work. Why does it matter?

**Example — weak feedback:**
"You've been coming across as difficult in meetings lately."

**Example — SBI feedback:**
"In the design review on Tuesday, when the product manager raised a concern about the timeline, you interrupted them three times before they finished. The rest of the room went quiet after that, and we didn't hear from two engineers for the remainder of the meeting."

Notice what changed. The second version is factual, specific, and connected to a real outcome. The person receiving it can do something with it.

A few principles:
- Deliver feedback as close to the event as possible. A week later, the details blur and it feels like you were keeping score.
- Positive feedback follows SBI too. "Good job" is forgettable. "In the incident on Thursday, you stayed calm when three services were down simultaneously, kept the channel structured, and gave clear updates every fifteen minutes — that kept the rest of the team from spiraling" is something they will remember.
- Feedback is a gift, but only if delivered with care. The goal is the person's growth, not your relief at having said something.

---

### Delegation — What to Keep, What to Hand Off, How to Let Go

Delegation is where most new leads struggle. The temptation is to keep the interesting work — the architecture decision, the tricky refactor — and hand off the boring parts. That is backwards.

**What to delegate:**
- Work that someone else can do at 70% of your quality and will grow from
- Decisions that are reversible and within someone's domain
- Anything where holding on creates a bottleneck

**What to keep:**
- Decisions with major irreversible consequences
- Conversations that require your authority or relationship
- Work where you are the only person who can do it right now (and you should be training someone so that changes)

**How to let go:**
1. Be explicit about the outcome you need, not the method
2. Agree on checkpoints so you are not surprised
3. Resist the urge to take it back when it is going differently than you would have done it
4. Let them make small mistakes — that is how they grow
5. Give credit publicly when they succeed

⚠️ The most common delegation failure is "delegate and disappear." Handing something off without context, then being disappointed with the result. Delegation is not abdication. Stay available.

---

### Building Psychological Safety

Google's Project Aristotle found that psychological safety was the single strongest predictor of high-performing teams — stronger than individual talent, process, or tools.

Psychological safety is not "everyone is nice to each other." It is the belief that you can say something risky — admit you do not know something, push back on a bad idea, flag a mistake — without being punished or embarrassed.

How you build it:

**Model vulnerability first.** When you say "I was wrong about that estimate" or "I don't know — let me find out," you give everyone else permission to do the same.

**React to mistakes without blame.** When someone breaks production, your first question should be "what happened?" not "who did this?" Blameless postmortems are not just a ritual — they signal what is safe to say.

**Make disagreement visible and normal.** Thank people for pushing back. "That's a good challenge — let me think about that" goes a long way. If you reward agreement and punish dissent, you will stop getting honest input within six months.

**Notice who is not speaking.** In meetings, some people default to silence when they disagree rather than risk conflict. Draw them out directly — "Priya, you've worked on this before — what's your read?" — and make sure the room responds to their input with respect.

Psychological safety compounds slowly and degrades fast. One public shaming can undo months of trust-building.

---

## DAY 2

### Hiring — Sourcing, Interviewing, Calibration, Selling the Role

Hiring is one of the highest-leverage things you do. A great hire multiplies the team. A poor hire — especially at senior level — can take years to recover from.

**Sourcing:** Do not rely only on inbound applications. Reach out to people directly. Ask your team for referrals — they know good engineers and they tend to refer people they would want to work with. Look at conference talks, open-source contributors, and people who have engaged thoughtfully with your content or industry.

**The interview process** should test for the things that actually matter on the job. Most interview loops fail by testing puzzle-solving ability that has no relationship to daily work. Before you run a loop, ask: "What does success look like in this role at six months?" Then build your questions around that.

A reasonable loop for a mid-level engineer:
- Recruiter screen (culture fit, logistics, compensation alignment)
- Technical screen (relevant problem, not brainteasers)
- System design or architecture discussion (for senior+)
- Behavioral interview (past behavior predicts future behavior)
- Bar raiser or cross-team calibration call

**Calibration:** After interviews, debrief as a panel before anyone else's opinion contaminates the room. Each interviewer gives a hire/no-hire signal and the key evidence for it. Then discuss. "Strong hire" from one person and "no hire" from another is important signal — do not average it into a lukewarm hire.

**Selling the role:** Candidates are interviewing you too. Be honest about the challenges — technical debt, team dynamics, the pace of the company. Engineers who arrive with false expectations churn faster. Talk about the work they would actually do in the first quarter, the team they would join, and the problems they would own.

---

### Performance Reviews — Writing, Delivering, Handling Underperformers

**Writing reviews:**
Base them on evidence you collected throughout the year — your 1:1 notes, project outcomes, peer feedback, and your own observations. Do not rely on memory.

Structure each review around:
- What was accomplished (specific examples)
- How they worked (collaboration, communication, judgment)
- Where they grew
- Where the gaps are
- What the next level looks like and whether they are on track

Avoid vague praise ("great team player") and vague criticism ("could communicate better"). Both are useless without specifics.

**Delivering reviews:**
Do not surprise people. Anything major in a review should already have been said in a 1:1. The review is a formal record of an ongoing conversation, not a revelation.

Be direct. If someone is not meeting expectations, say so clearly. Softening it to the point where they leave thinking things are fine is a disservice to them.

**Handling underperformers:**
The instinct is to avoid the conversation. That is the worst thing you can do — for them, for the team, and for you.

Start early. As soon as you see a pattern, name it in a 1:1. "I've noticed X three times in the last month. I want to understand what's going on and figure out how to help."

If the pattern continues after direct coaching, escalate to a documented plan. A PIP is not punitive if done correctly — it sets specific expectations, a timeline, and the support you will provide. Some people turn it around. Those who do not have a clear, documented path to exit.

⚠️ Keeping someone in a role they are failing in is not kind. It harms the team, erodes trust in your judgment as a lead, and delays the person from finding a role where they can succeed.

---

### Team Design — Topologies and Right-Sizing

How you structure a team affects what it can ship and how fast it can move. Team Topologies (the framework by Skelton and Pais) gives you useful vocabulary:

**Stream-aligned teams** own a slice of the product end-to-end. They have the skills to build, test, deploy, and operate their slice with minimal dependency on others. This is the default goal.

**Platform teams** build internal tooling and services that reduce the cognitive load of stream-aligned teams. They exist to accelerate others, not to gate them.

**Enabling teams** are small, temporary, specialist groups that help stream-aligned teams acquire new capabilities — then step back.

**Complicated subsystem teams** own components so specialized (signal processing, ML pipelines, cryptography) that a cross-functional team cannot maintain them effectively.

**Right-sizing:** The research on optimal team size clusters around 5–8 people. Below 4, you lose resilience — one person sick and the team stalls. Above 10, communication overhead compounds and accountability diffuses. If a team is larger, ask what it can be split into.

---

### Managing Up — Keeping Your Manager Informed

Your manager cannot advocate for your team if they do not know what is happening. Managing up is not political maneuvering — it is information hygiene.

**What to share proactively:**
- Risks to commitments before they become misses
- Team health issues (burnout, morale, interpersonal conflict) that might affect delivery
- Wins — especially ones that touch other teams or leadership priorities
- Asks: headcount, tooling, runway to address tech debt

**What not to do:**
- Escalate every problem before trying to solve it yourself
- Shield your manager from bad news so long that they are blindsided
- Go around your manager to their manager without telling them first (skip-levels have their place, but transparency matters)

The framing that works: "Here's what I'm seeing, here's what I'm doing about it, here's what I need from you." That is the whole thing.

---

### The First 90 Days as a New Lead

The biggest mistake new leads make is trying to change everything in week one. You have not earned that yet.

**Weeks 1–2 — Listen and observe**
Hold 1:1s with everyone on the team. Your only goal is to understand: what is working, what is not, what they are proud of, what frustrates them. Do not propose solutions yet.

**Weeks 3–4 — Understand the systems**
Map the architecture. Understand the deployment process, the oncall rotation, the incident history, and the places where technical debt is actively causing pain. Read old postmortems.

**Weeks 5–8 — Build trust through small wins**
Remove one real blocker. Fix one process that frustrates people. Ship something, even small. Trust is built through action, not promises.

**Weeks 9–12 — Articulate a direction**
Now you have enough context to say something coherent about where the team should go. Share it. Get pushback. Revise it. This is the beginning of your team's shared direction — not a solo announcement.

---

### Common Leadership Anti-Patterns

**The Brilliant Friend** — You solve every problem yourself instead of developing the people around you. Your team never grows. You become a bottleneck.

**The Absentee Lead** — You are too busy to hold 1:1s, give feedback, or clear blockers. The team interprets silence as indifference or chaos. Trust erodes.

**The Hero Engineer** — You keep pulling urgent coding tasks onto your plate because you can do them fastest. You model that individual contribution is what matters, and you crowd out the work that only you can do.

**The Consensus Trap** — You delay every decision waiting for universal agreement. Some decisions need input; others just need to be made. Learn which is which.

**The Feedback Hoarder** — You wait for the performance review to share critical feedback. The person has been failing in silence for months without knowing it. Reviews become surprises.

**The Overprotector** — You absorb all external pressure and shield the team so completely that they have no context about business reality. They make decisions without the information they need and feel managed, not trusted.

---

## Worked Example — Your First 90 Days as a New Tech Lead

You have just been told you are taking over as tech lead for a backend platform team of six engineers. Here is a week-by-week plan.

**Week 1:** Schedule 30-minute 1:1s with each engineer. Ask: what's going well, what's blocking you, what would you change if you could change one thing? Take notes. Do not promise anything yet.

**Week 2:** Meet your key stakeholders — PM, design lead, adjacent team leads. Understand their mental model of your team's responsibilities. Note where expectations differ from what the team thinks they own.

**Week 3:** Read the last three postmortems. Look at the ticket backlog and estimate the ratio of feature work to maintenance to tech debt. Map the deployment pipeline end-to-end. Find where things are slow or manual.

**Week 4:** Pick the single most painful operational issue — the one that came up in multiple 1:1s. Write a short doc proposing a fix. Share it with the team and ask for their input before committing to it.

**Week 5–6:** Execute that fix. Get it shipped. Acknowledge it publicly in the team channel. "We've been manually running this migration script every deploy for eight months. Priya automated it this week — no more 3am surprises."

**Week 7–8:** Establish a consistent 1:1 cadence with everyone. Make sure each person has a clear project or skill they are developing. Identify the one engineer who seems disengaged or frustrated and invest extra time there.

**Week 9–10:** Write a rough team charter — what this team owns, what it does not own, how it makes decisions, what its engineering standards are. Share it as a draft. Expect and welcome changes.

**Week 11–12:** Hold a retrospective on the last quarter. Ask: what should we start, stop, and continue? Use the output to shape your Q2 plan. Share your draft plan with the team and your manager in the same week.

By week 12, you are not done — you are just no longer new. The habits you built in these 90 days will compound over the next three years.

---

## Pitfalls

**Promoting the best IC to TL without support.** The skills that made someone an excellent engineer do not automatically transfer to leadership. Give new leads a mentor, explicit frameworks, and room to make mistakes without catastrophic consequences.

**Skipping the 1:1 when things are busy.** This is exactly when you should not skip it. Canceling 1:1s when pressure is high signals that people are not the priority. You will find out about morale problems at the worst possible time.

**Treating feedback as an annual event.** Feedback should be continuous. If the only time someone hears how they are doing is in their performance review, you have failed them.

**Hiring for speed over fit.** An empty seat feels painful. A wrong hire is more painful. Take the extra week.

**Ignoring technical debt until it is a crisis.** The best leads create a sustainable ratio — roughly 20% of sprint capacity — to address debt continuously. This is harder to defend than it sounds and worth every argument.

**Measuring activity instead of outcomes.** Story points completed, lines of code written, tickets closed — these are proxies. What matters is: did the team ship something valuable, did it hold up in production, and does the team still have energy to do it again next week?

---

## Quick Reference

### 1:1 Template

```
Frequency: Weekly (or biweekly for senior/stable relationships)
Owner: The report, not the manager

Questions to rotate through:
- What's on your mind?
- What are you working on, and is anything blocking you?
- How are you feeling about the team / project / company?
- What could I do differently to support you better?
- What's something you want to get better at?
- Is there anything you're worried about that you haven't said yet?
```

### Feedback Framework (SBI)

```
Situation:  "In the design review on Tuesday..."
Behavior:   "...you interrupted the PM three times before they finished..."
Impact:     "...and two engineers stopped contributing for the rest of the meeting."

Follow with: "What was going on for you in that moment?"
```

### Hiring Checklist

```
[ ] Job description reflects the actual role, not a wish list
[ ] Interview questions map to real job requirements
[ ] Panel includes diverse perspectives
[ ] Each interviewer has a clear focus area (avoid overlap)
[ ] Debrief happens before scores are shared
[ ] Offer includes honest description of challenges
[ ] Candidate has chance to meet future teammates
```

### 90-Day Plan

```
Weeks 1–2:  Listen. 1:1s with everyone. No promises.
Weeks 3–4:  Understand the systems. Read postmortems.
Weeks 5–8:  Remove one real blocker. Build trust through action.
Weeks 9–12: Articulate a direction. Share it. Revise it.
```

---

## Next Steps

- `Engineering-Career-Path.md` — IC tracks, staff and principal levels, when to go into management
- `Career-Transitions.md` — Making the move from IC to lead to manager, and sometimes back again
- `Mentorship.md` — Building mentorship relationships as giver and receiver

---

## Recommended learning resources

**YouTube channels & playlists:**
- [LeadDev — Engineering Leadership Talks](https://www.youtube.com/results?search_query=leaddev+engineering+leadership) — conference talks on managing teams, running architecture reviews, and influencing without authority
- [Rahul Pandey and Taro — Tech Leadership](https://www.youtube.com/@RahulPandeyrkp) — 1:1s, performance conversations, managing up, and the transition from IC to lead
- [Lenny Rachitsky — Product and Engineering Leadership](https://www.youtube.com/@LennyRachitsky) — how engineering and product leadership intersect, with interviews from top engineering leaders
- [Healthy Software Developer — Leadership](https://www.youtube.com/@HealthyDev) — sustainable leadership practices, team dynamics, and avoiding common management pitfalls
- [ThePrimeagen — Technical Leadership](https://www.youtube.com/@ThePrimeagen) — the technical side of leadership: code review culture, architecture decisions, and mentoring

**Official docs & blogs:**
- [leaddev.com Blog](https://leaddev.com/) — articles on engineering management, technical leadership, and scaling teams
- [pragmaticengineer.com (Gergely Orosz)](https://blog.pragmaticengineer.com/) — engineering management insights, hiring, and what distinguishes good engineering organisations

---

**The mantra:** Your job is no longer to be the best engineer on the team. Your job is to make the team better than it would be without you — and then make yourself unnecessary.
