# Zelo — AI agent instructions

Project-wide conventions for whoever (human or AI) works in this repo. This file is the
index — laws that apply everywhere live below; everything else is in `docs/conventions/`
(see `docs/conventions/README.md` for the map).

## Reading map

| If you're… | Read |
|---|---|
| Adding a new NestJS endpoint/module | `docs/conventions/backend-modules.md` |
| Adding/editing a form | `docs/conventions/forms-and-ui.md` (+ `zelo-form` skill) |
| Wiring a new frontend screen | `docs/conventions/frontend-architecture.md` |
| Auth, tenant-scoping, anything that leaves the device | `docs/conventions/security-privacy.md` |
| Crisis flow, k-anonymity, tone guard, notifications | `docs/conventions/product-invariants.md` |

Full table (all ten playbooks): `docs/conventions/README.md`.

## Boundaries that break the build

- `application/` (ports + use-cases, `apps/api`) never imports `infrastructure/` or
  `@prisma/client` — enforced by `apps/api/.dependency-cruiser.cjs`.
- `use-cases/` (`apps/web`) never imports `react` or `infrastructure/` — enforced by
  `apps/web/.dependency-cruiser.cjs`.
- `packages/domain`'s `src/` never imports from `apps/*`, or from `react`/`@nestjs`/`@prisma`
  — enforced by `packages/domain/.dependency-cruiser.cjs`, wired into both apps' CI via
  `lint:boundaries --filter=@zelo/api...`/`--filter=@zelo/web...` (the trailing `...` pulls in
  the `@zelo/domain` workspace dependency), so this one genuinely breaks the build.

`application-no-prisma-imports` covers both the generated client (`generated/prisma`, which is
what repositories actually import) and `node_modules/@prisma/client`. It was inert until
recently — it blocked only the `node_modules` path nothing imports — so treat any older note
claiming a green `lint:boundaries` proves nothing here as out of date
(`docs/conventions/priorities.md` #2).

## Import extensions, by layer

Relative import specifiers end `.ts`; `@/`-aliased specifiers end `.js` (tsc rewrites a
relative `.ts` specifier to `.js` at emit; `tsc-alias` path-maps an alias but doesn't touch
its extension). Which form to use is decided by **layer, not module**: an infrastructure
adapter/repository reaches its own module's port through the self-alias
(`@/modules/<self>/application/ports/x.port.js`); a use-case, service, or controller reaches
its own module's files relatively (`../ports/x.port.ts`). `@/` is not reserved for crossing a
module boundary — plenty of `@/modules/...` imports point back into the importer's own
module, and plenty of cross-module imports are relative. Get the extension backwards and
`tsc`/`vitest` stay green: `tsc-alias` path-maps an aliased specifier without touching its
extension, so an alias written with `.ts` emits a `dist` import to a file that doesn't exist —
nothing catches it before boot.

## Product laws

- `riskSignal` (derived from a PHQ-9 item-9 answer) never crosses the network; assessment
  scoring happens on-device.
- Human handoff / the CVV `188` line renders with no network dependency, on every crisis
  screen and on Peers.
- K-anonymity (`K_ANONYMITY_THRESHOLD = 5`) is a **per-sector visibility decision**, made once
  against a single reference week — the newest week where at least one sector clears the
  threshold, not simply the calendar-newest week (which would blank the dashboard every
  Monday) — never a per-datapoint filter re-applied to every field that goes out. Re-checking
  per datapoint doesn't add privacy and breaks trend charts.
- PT-BR copy in `docs/superpowers/specs/screens/*.md` is normative — use the exact strings,
  don't paraphrase.
- Design tokens only in `apps/web` — `--color-*` tokens through Tailwind utilities, no raw
  hex/rgb.

## Security rules that are convention-only today

Never `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `document.write`, `eval()`,
`new Function`, or a `javascript:` href anywhere in `apps/web`. Reason (TD-001): manager,
hospital-admin, SuperAdmin, and peer-partner session tokens all sit in `sessionStorage`
behind `Authorization: Bearer` — one raw-HTML render is full session exfiltration. Nothing
enforces this yet — no `react/no-danger` lint rule, no CI grep
(`docs/conventions/priorities.md` #10).

## What this repo deliberately does not do

Zero `createContext` anywhere in `apps/web`/`packages`. No `class-validator`, no
`ValidationPipe` on the API — controllers hand-parse bodies with zod instead. No framework DI
on the frontend. No mocking library standing in for a **port double** — a hand-written
`class FakeX implements X` is the convention. That's not a blanket ban on test-doubling
tools: `vi.mock()` is legitimate for a third-party SDK adapter boundary, and `vi.fn()` is
legitimate as a spy on a non-port collaborator.

## Forms (apps/web)

Forms use **react-hook-form** + **zod**:
`useForm({ resolver: zodResolver(schema), mode: "onBlur" })` — errors show once a field is
left, not on every keystroke. Full detail — the shared-UI/DataTable API and the design-token
system — is in `docs/conventions/forms-and-ui.md`. The newer gaps (204-response-shape, the
Prisma import-path trap, `SettingsRow` reuse, the server-conflict-error banner pattern) are
covered by the `zelo-form` skill (`.github/skills/zelo-form/SKILL.md`), not repeated in that
playbook.

## Upkeep

A new convention established in a PR lands in its playbook in that PR — see
`docs/conventions/README.md`.
