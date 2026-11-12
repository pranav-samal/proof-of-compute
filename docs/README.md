# /docs — Specification, Work Plan & Patent Text

This folder is the single source of truth for all shared definitions.
Every other folder builds against the names defined here.

## What goes here

| File | Purpose |
|---|---|
| `SPEC.md` | **Primary reference.** All contract function signatures, events, API endpoints, field names, job states, and verification tiers. Any change must be agreed by the whole team and merged by PR. |
| `WORK_PLAN.md` | MVP task breakdown by team member, dependency order, and done criteria. |
| `PATENT.md` | Patent draft / technical disclosure text, kept in sync with what is actually built. |
| `diagrams/` | Architecture diagrams, flow charts, state machine diagrams. |

## Rules

- Do not define names anywhere else first. Add to `SPEC.md`, then implement.
- Changes to `SPEC.md` require a PR approved by all members.
- Member 1 owns the final contract ABI; `SPEC.md` must reflect it.
