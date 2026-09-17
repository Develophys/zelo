# Conventions

This directory holds **task playbooks** — concrete recipes that pair a rule set with a mirror file or pattern that shows what compliance looks like. Playbooks differ from `CLAUDE.md` (always-loaded laws that apply to all code and docs) and from `general-documentations/architecture-reference.md` (what exists, why, and how it works together). Think of playbooks as "if you're doing *X*, here's the checklist and the rationale behind each item."

## Which playbook to open

| If you're… | Read |
|---|---|
| Adding a new NestJS endpoint/module | `backend-modules.md` |
| Validating a request body, mapping an error to HTTP | `backend-http.md` |
| Wiring a new frontend screen end-to-end | `frontend-architecture.md` |
| Worried about re-renders, memoization, code-splitting | `react-performance.md` |
| Adding/editing a form | `forms-and-ui.md` (also see the `zelo-form` skill) |
| Touching the peer-chat gateway or the chat stream | `realtime-and-streaming.md` |
| Touching crisis flow, k-anonymity, tone guard, notifications | `product-invariants.md` |
| Writing or reasoning about tests | `testing.md` |
| Anything auth, tenant-scoping, or touching what leaves the device | `security-privacy.md` |
| Turborepo, CI, Prisma, deploy | `monorepo-tooling.md` |

## What's broken or missing

See [`priorities.md`](./priorities.md) — a ranked backlog derived from this same audit plus `docs/superpowers/specs/technical-debt.md`.

## Upkeep rule

**A new convention established in a PR lands in the relevant playbook in that same PR — not as a follow-up.** If no existing playbook fits, that's a signal to add one, not to skip documenting it.

## Companion skills

Five skills in `.github/skills/` mirror the most common task shapes: `zelo-backend-endpoint`, `zelo-frontend-flow`, `zelo-form`, `zelo-admin-table`, and `zelo-verify-before-reporting`. These skills are thin recipes + mirror-file pointers; the **playbook is where the *why* and the full rule set live.** A skill should never duplicate a playbook's rule text. If you're editing one and notice drift, fix the playbook and have the skill point at it.
