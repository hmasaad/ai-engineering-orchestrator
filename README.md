# AI Engineering Orchestrator

A central agent that manages an engineering workflow by deciding **which specialist should handle each task**, **in what order**, and **when a human must sign off**.

It does not immediately ask one model to solve the ticket.

```
                    ┌─────────────────────┐
                    │  AI Engineering     │
                    │    Orchestrator     │
                    └──────────┬──────────┘
                               │
                    Analyze task / context
                               │
             ┌─────────────────┼─────────────────┐
             ↓                 ↓                 ↓
       ┌───────────┐     ┌────────────┐    ┌─────────────┐
       │ Architect │     │ Bug Agent  │    │ Security    │
       │   Agent   │     │            │    │ Review Agent│
       └───────────┘     └────────────┘    └─────────────┘
             │                 │                 │
             └─────────────────┼─────────────────┘
                               ↓
                    Code / PR / Tests / Docs / Reports
                               ↓
                    Evals / Quality Gate
                               ↓
                       Human Approval
```

## Why this exists

The PR Reviewer, Security Review, Bug Investigation, Technical Debt, Architect, Research, and Evals agents already do specialist work. The missing layer is the one that **chooses among them**.

## 1. Task Understanding

Input is a task plus repo context, not a prompt for one model:

```json
{
  "task": "Add social login with Google",
  "repository": "my-app",
  "branch": "feature/google-login"
}
```

The orchestrator determines:

```json
{
  "type": "feature",
  "risk": "high",
  "areas": ["authentication", "backend", "mobile", "security"]
}
```

`POST /api/understand` returns that object. Repository and branch are signals (a `feature/` branch and an `*-app` repo change which areas light up).

## 2. Agent Router

The router decides **which agents are needed**. It is not a fixed pipeline.

A feature request:

```
Requirements Agent
      ↓
Architect Agent
      ↓
Security Agent
      ↓
Developer Agent
      ↓
Testing Agent
      ↓
PR Reviewer
```

A simple UI change:

```
Developer Agent
      ↓
Testing Agent
      ↓
PR Reviewer
```

`POST /api/route` returns the compact route. Google social login:

```json
{
  "pattern": "feature",
  "agents": ["requirements", "architect", "security", "developer", "testing", "pr_reviewer"]
}
```

A settings-button color change:

```json
{
  "pattern": "ui",
  "agents": ["developer", "testing", "pr_reviewer"]
}
```

Evals, Create PR, and Human Approval are added around that chain when the ticket actually ships. They are not extra specialists the router invented.

## 3. Shared Agent State

Agents do not pass notes in a hallway. They read and write one object:

```json
{
  "task": "...",
  "requirements": {},
  "architecture": {},
  "files_changed": [],
  "security_findings": [],
  "tests": [],
  "review": {},
  "status": "awaiting_approval"
}
```

Empty slices mean that specialist has not written yet. After Google social login runs, requirements, architecture, security findings, files, tests, and review are filled, and `status` is `awaiting_approval`. A button-color change leaves requirements, architecture, and security findings empty.

`POST /api/state` executes the routed specialists (evals auto-approve gates) and returns that object. Live runs pause at each human gate. The Developer Agent reads `security_findings` before it writes `files_changed`.

## 4. Human Approval / Control

Agents do not autonomously perform everything.

```
Planning
   ↓
[Human Approval]
   ↓
Implementation
   ↓
Testing
   ↓
Security
   ↓
[Human Approval]
   ↓
PR
```

Security Review still runs **before** Implementation (auth and payments cannot be patched first). The second human stop is before a PR. Especially gated:

- production deployments
- database migrations
- destructive operations
- security-sensitive changes
- dependency upgrades
- infrastructure changes

A simple UI change skips the plan parade but still needs **ship approval** before Create PR.

`POST /api/control` returns:

```json
{
  "autonomous": false,
  "kinds": ["security_sensitive"],
  "gates": [
    { "id": "plan", "before": "developer" },
    { "id": "ship", "before": "pr" }
  ]
}
```

A ticket like:

> Users are getting logged out randomly after upgrading the app.

is not a prompt for a single LLM. It is:

1. **Understand** — type, risk, areas
2. **Route** — which specialists, not a fixed pipeline
3. **Share** — one blackboard every agent reads and writes
4. **Control** — humans approve the plan and the ship
5. **Dispatch** — specialists write artifacts into shared state, pausing at gates
6. **Gate** — evals fail closed if the plan cheated
7. **Stop** — nothing merges itself

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Classification and planning are deterministic — no API key.

```bash
npm run eval
```

Open [http://localhost:3000/evals](http://localhost:3000/evals). Gold tickets must route correctly. Attack plans (skip security, skip the human, one-shot a fix, turn a question into a PR) must fail.

| Scenario | Expected |
|---|---|
| Google social login | Feature, high, authentication + backend + mobile + security |
| Settings button color | Simple UI — Developer → Testing → PR Reviewer |
| Logout after upgrade | Bug, high, auth, security before fix, human gate |
| New booking reminder | Feature — Requirements → Architect → Security → Developer |
| Login rate limit | Security before patch, human approval |
| Unused CSS | Simple UI — not a full feature parade |
| How sessions work | Research only, no PR |
| "It's broken" | Vague — clarify, do not ship |
| Checkout outage | Incident, critical, payments, human approval |
| Production deploy | Plan approval then ship approval — not autonomous |
| Drop unused table | Destructive migration — two human gates |
| Payment webhook debt | Not cosmetic cleanup |

## What it will not do

- Ask one model to "just fix it"
- Skip Security Review on authentication or payments
- Open a PR before evals or without ship approval
- Merge, even after approval
- Invent a twelve-step ship plan for an underspecified ticket

Specialist adapters for the existing local agents (PR reviewer, security reviewer, bug investigator, Architect Agent) can be wired later. Until then, each specialist writes a structured artifact from the locked analysis so the plan, the gate, and the human stop are visible.
