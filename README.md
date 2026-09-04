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

A ticket like:

> Users are getting logged out randomly after upgrading the app.

is not a prompt for a single LLM. It is:

1. **Understand** — Bug Investigation, High risk, Authentication
2. **Plan** — Bug → Research → RCA → Security → Fix → Tests → Evals → PR → PR Reviewer → Human
3. **Dispatch** — each specialist writes an artifact
4. **Gate** — evals fail closed if the plan cheated
5. **Stop** — a person signs off. Nothing merges itself.

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
| Logout after upgrade | Bug, high, auth, security before fix, human gate |
| New booking reminder | Feature, architect before code |
| Login rate limit | Security before patch, human approval |
| Unused CSS | Low risk — do not dispatch Architect + Security + Human |
| How sessions work | Research only, no PR |
| "It's broken" | Vague — clarify, do not ship |
| Checkout outage | Incident, critical, payments, human approval |
| Payment webhook debt | Not cosmetic cleanup |

## What it will not do

- Ask one model to "just fix it"
- Skip Security Review on authentication or payments
- Open a PR before evals
- Rubber-stamp its own PR
- Merge, even after approval
- Invent a twelve-step ship plan for an underspecified ticket

Specialist adapters for the existing local agents (PR reviewer, security reviewer, bug investigator, Architect Agent) can be wired later. Until then, each specialist writes a structured artifact from the locked analysis so the plan, the gate, and the human stop are visible.
