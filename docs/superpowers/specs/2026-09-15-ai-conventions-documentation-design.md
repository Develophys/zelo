# AI-facing conventions documentation — design

**Date:** 2026-09-15
**Status:** Design, awaiting approval
**Problem owner:** inconsistent AI-written code across this repo

---

## 1. The problem, stated precisely

AI agents produce inconsistent implementations in this repo. The cause is not missing
documentation — this repo has a great deal of it. The cause is that the documentation an
agent actually loads is thin, and the documentation that is thorough is either stale or
invisible.

| File | What an agent does with it | Real state |
|---|---|---|
| `CLAUDE.md` | Loaded into every session, always | 2 KB, covers forms only. Nothing on layering, naming, Nest, performance, security |
| `general-documentations/architecture-reference.md` | Never opened — nothing points to it | Comprehensive, but stamped `Last synced: 2026-08-02`, ~472 commits behind |
| `docs/superpowers/specs/AGENTS.md` | Opened by name convention, read as instruction | A July build plan. Says React 18, `tailwind.config.ts`, Google Fonts CDN, screens as unbuilt that shipped weeks ago |
| `PRE-COMMIT-TEST-CHECKLIST.md` | Read as a general checklist | Scoped to one working tree from 2026-08-17 |
| `docs/superpowers/specs/technical-debt.md` | Never opened | Contains at least one live security rule (TD-001's "no `dangerouslySetInnerHTML` on manager routes") that no agent will ever see |

An agent starting fresh reads 2 KB about forms, then improvises. When it does consult a doc,
the doc tells it to build against a stack that no longer exists.

## 2. Method — how the conventions were established

Nineteen subagents audited the repo read-only across nine domains. Each domain ran twice: an
extraction pass, then an adversarial pass that re-opened the cited files and tried to refute
every rule. A completeness critic then ran across the whole map.

Outcome: 197 candidate rules → **107 confirmed, 92 corrected, 11 refuted**, plus 56 rules the
first pass missed. Nine cross-domain contradictions were resolved against the code.

**This ratio is the justification for the whole exercise.** Fewer than 55% of plausible-sounding
conventions survived contact with the code unchanged. Writing these docs from memory — the
default approach — would have produced a document with the same defect as the one it replaces,
only with a fresher date on it.

Raw findings are distilled into a companion document (§4); the evidence for each rule is
preserved there rather than in this design.

### Two corrections worth naming here

They illustrate what the adversarial pass is for:

1. **The sector-manager QR fix, as first prescribed, was a security hole.** The extraction pass
   said to widen `findActiveByInstitution`'s select to include `inviteCode`. That method is the
   entire body of `institution.controller.ts:48`, on a controller with no `@UseGuards` anywhere
   in the file. Following it would publish every sector's invite credential to anyone holding an
   institution cuid — which the public by-code endpoint hands out. The correct shape is a new
   repository method, never a widened shared select.

2. **The `hospital` → `institution` drift was diagnosed backwards.** The first pass counted
   occurrences, concluded roughly 30:2 in favour of "hospital", and recommended standardising on
   it. The rule is actually a distinction, not a count: the **organisation** is an `institution`;
   the **role** is a `hospital admin`. `HOSPITAL_ADMIN` and the `HospitalAdmin*` identifier family
   are correct and must not be "fixed". What is genuinely wrong is `AdminInstitutionsPage`, whose
   heading says "instituição" while its own form label three lines below says "Nome do hospital".

## 3. Decisions taken

Agreed before drafting:

| Question | Decision |
|---|---|
| Where rules live | `CLAUDE.md` as index + laws; `docs/conventions/*.md` as playbooks |
| Scope | Documentation only. No code changes. Enforcement gaps are recorded as backlog items, not applied |
| Stale docs | Resync `architecture-reference.md`; mark `AGENTS.md`, `specs/README.md`, `PRE-COMMIT-TEST-CHECKLIST.md` as historical |
| Language | English, no pt-BR mirror. Exception: PT-BR product copy rules quote their strings verbatim |
| Slicing | Laws (always loaded) + playbooks (per task) + reference (what exists) |
| Backlog | A ranked `priorities.md`, with items derived from `technical-debt.md` rather than merely linking to it |

## 4. Deliverables

```
CLAUDE.md                                         rewritten — index + laws
docs/conventions/
  README.md                                       map: task -> playbook; how to keep this current
  priorities.md                                   ranked backlog (§7)
  backend-modules.md                              Nest module shape, ports, DI, import extensions
  backend-http.md                                 zod validation, error-to-status mapping, throttling
  frontend-architecture.md                        container, state split, hooks, routing guards
  react-performance.md                            re-render, memoization, effects, code splitting
  forms-and-ui.md                                 react-hook-form + zod, primitives, DataTable, a11y
  realtime-and-streaming.md                       peer-chat gateway, chat NDJSON contract
  product-invariants.md                           crisis reachability, k-anonymity, tone guard, notifications
  testing.md                                      vitest, port fakes, what is exempt, CI gates
  security-privacy.md                             auth, tenant scoping, XSS surface, secrets
  monorepo-tooling.md                             turbo, packages, CI, prisma, deploy
docs/superpowers/specs/
  2026-09-15-ai-conventions-audit-findings.md     distilled audit evidence (mirrors the existing
                                                  2026-09-07-chat-tone-guard-findings.md convention)
general-documentations/architecture-reference.md  resynced against today's code
general-documentations/architecture-reference.pt-BR.md   staleness banner only; not retranslated
docs/superpowers/specs/AGENTS.md                  historical banner
docs/superpowers/specs/README.md                  historical banner
PRE-COMMIT-TEST-CHECKLIST.md                      historical banner
```

`realtime-and-streaming.md` and `product-invariants.md` were not in the original plan. The
completeness critic found that the peer-chat subsystem, the chat NDJSON contract, the tone
guard, the crisis-reachability invariant and the `NotificationType` five-way contract had **no
convention coverage at all** — and these are the product's core interactions, not its edges.
The crisis invariant in particular ("every screen where someone is reaching for a person must
put the CVV line one tap from a dialer") exists today only inside a test file's docblock.

## 5. `CLAUDE.md` — the laws

Target 4–6 KB. It is loaded in full on every turn, so it carries only what cannot be inferred
from reading the code, plus the map to everything else.

1. **Reading map.** Task shape → which playbook to open first. This is the single highest-value
   addition; it is what does not exist today.
2. **Boundaries that break the build.** The four dependency-cruiser rules, stated as
   prohibitions. With a note that one of them (`application-no-prisma-imports`) is currently
   inert — see `priorities.md` #2 — so an agent does not read a green `lint:boundaries` as proof.
3. **Import extensions, stated by layer.** Relative imports end `.ts`; `@/`-aliased imports end
   `.js`. Infrastructure adapters reach their own module's port through the self-alias; use-cases
   and controllers use relative paths within their module. The reverse combination produces a
   `dist` that crashes at boot, and the naive "alias means cross-module" heuristic is false in
   both directions.
4. **Product laws.** `riskSignal` never crosses the network; scoring stays on-device; human
   handoff and CVV 188 must render with no network; k-anonymity is a per-sector visibility
   decision, never a per-datapoint filter; PT-BR copy in specs is normative; design tokens only.
5. **Security rules that are currently convention-only.** No `dangerouslySetInnerHTML` anywhere,
   with TD-001's reason attached: manager, hospital-admin, SuperAdmin and peer-partner tokens all
   sit in `sessionStorage` behind `Authorization: Bearer`, so one raw-HTML render is full session
   exfiltration. Nothing enforces this today.
6. **What this repo deliberately does not do.** No React Context (zero `createContext` in the
   repo), no `class-validator`, no `ValidationPipe`, no framework DI on the frontend, no mocking
   library for port doubles. These are ecosystem defaults an agent will reach for unprompted.
7. **The upkeep rule.** A new convention established in a PR lands in its playbook *in that PR*.

## 6. Playbook shape

Every playbook has the same four parts, in this order:

1. **The recipe** — numbered steps in dependency order.
2. **Mirror file** — the one existing file to copy. This is the highest-leverage line in each
   document: an agent that knows which file to mirror produces consistent code; one that does not
   improvises. Mirror files are named per rule, not per document.
3. **How to verify** — the command that proves it, and what a green result does and does not cover.
4. **Traps** — mistakes already made in this repo, with the file that shows the correct form.

The "traps" sections are populated from the audit's refutations and corrections, not invented.
Six that must survive into the docs verbatim, because each is a plausible mistake that lints and
type-checks clean:

- `@nestjs/throttler` v6 needs the nested `@Throttle({ default: { limit, ttl } })`. The flat v5
  form parses, type-checks, and silently rate-limits nothing — on the two unauthenticated routes
  that accept a bare email.
- Cross-tenant responses are deliberately inconsistent and must stay so: a foreign id in the
  **path param** is a bare 404 (so the response cannot confirm the id exists); a foreign id in the
  **request body** is a 400 with a message (the caller already knows what they sent); 403 is
  reserved for the role check itself.
- `process.env` read directly in a module body is correct for provider selection, not a
  violation. Routing it through `ConfigService` instantiates both adapters and crashes boot on
  every mock-mode run — i.e. all of local dev and the whole test suite.
- Port doubles are hand-written `class FakeX implements X`; `vi.fn()` is legitimate as a spy for
  call assertions on non-port collaborators; `vi.mock` is reserved for third-party SDKs. A blanket
  "no mocking library" rule would delete working spies.
- Use-cases get a unit test against fakes however thin. The untested-by-convention exemption
  covers Prisma repositories and thin HTTP adapters only — never use-cases.
- k-anonymity suppresses a **sector**, once, from its reference-week count. Every aggregate then
  reads from the resulting `visibleSectorIds`. A trend point with `checkIns < 5` is correct, not a
  leak; re-applying the threshold per datapoint would "fix" the dashboard into unreadable gaps.

## 7. `priorities.md`

A single ranked backlog, deduplicated across all nine domains, 26 items. Each entry: what, why it
matters *in this repo*, effort, kind, affected files, and origin (`TD-00X`, audit domain, or
user-flagged).

Division of labour with the existing debt log: `technical-debt.md` remains the record of *why we
accepted this and when to revisit*; `priorities.md` is the record of *what to do next*. The
backlog links to the debt log; the debt log does not need to know about the backlog. `TD-002` is
resolved and stays out. `TD-001` needs its status re-derived — a September spec and plan exist for
the cookie migration, so its July "Accepted, deferred" is likely no longer accurate.

Ranking is by (impact on correctness or on a user) × (cost of leaving it) ÷ effort. The two
maintainer-flagged items are placed honestly rather than given automatic top billing:

- **Route-level code splitting** lands at #14. The honest framing: the app works, and library-level
  splitting is already real and effective (jspdf 390 KB, html2canvas 202 KB and index.es 159 KB are
  genuinely separate chunks, so a flat "no code splitting" claim would be wrong). What remains is
  that a doctor on a phone downloads the entire manager panel, all four admin tables and the chart
  lib to reach `/home` — 20 of 34 route components are manager/admin/peer-only, in a 752 KB main
  chunk. It is also a written violation of `2026-07-07-pwa-architecture.md:89`. Any split must
  preserve the `routeChildren` export that `router.test.tsx` imports, or the test router drifts
  from what ships.
- **`hospital` → `institution`** lands at #23, split into four classes of very different cost. Only
  the cheap two are proposed now: write the role-vs-organisation rule down, and fix
  `AdminInstitutionsPage`'s internal contradiction. The wire-field rename needs a coordinated
  api+web deploy; the `ManagerRole` enum rename needs a hand-written `ALTER TYPE ... RENAME VALUE`
  (`prisma migrate dev` generates a drop-and-recreate against a NOT NULL column) and logs out every
  live manager.
- **The sector-manager QR gap** lands at #9, with its four blockers recorded: it needs a new
  repository method rather than a widened select; `DataTable` has no read-only mode (selection,
  rowActions and toolbar are all required props); `ManagerAdminSectorsPage` unconditionally calls
  the admin-only `useAdminManagers`; and no seeded sector has an `inviteCode`, so the feature is
  undemoable locally. There is also no per-sector ownership primitive anywhere in the API — zero
  comparisons of `sector.managerId` against the authenticated manager exist — so whoever builds
  this will improvise the check inline unless the playbook says where it belongs.

The top of the list is not documentation work. Ranked #1–#3: a `DATABASE_URL` missing from
`.env.production.local` that points the destructive seed script at the local database while
`prisma migrate deploy` hits production (with the one wrong instruction sitting in the README an
operator opens to do exactly that); a dependency-cruiser rule that cannot fire; and 24 of 54 test
files installing `vi.spyOn` without restoring it. These are recorded, not fixed, per §3.

## 8. Anti-drift

The current failure is drift, so the docs must be built to resist it:

- **Point, don't copy.** Every verifiable claim cites `file:line` instead of reproducing code. A
  stale link is visible; a stale copied snippet is not.
- **Quantify majority patterns.** "17 of 25 use-cases take a single input object" ages into useful
  information. "Use-cases take an input object" ages into a lie.
- **Mark confidence.** Claims the audit could not establish are labelled as such rather than
  smoothed into assertions — notably "the codebase would nearly pass `exhaustive-deps` today",
  which is a hand audit of 56 effects, not a measurement. The docs will say so, so it cannot be
  quoted as a reason to defer the lint rule.
- **One upkeep rule, in `CLAUDE.md`,** naming the destination file.

## 9. Out of scope

No code, config, dependency or lint changes. No new pt-BR translation. No rewrite of the 40+
historical per-feature specs — they are the record of *why* and stay as they are. No fixes to the
defects in §7; they are recorded for the maintainer to schedule.

## 10. Verification

Every rule that ships carries `file:line` evidence, re-checked at write time rather than inherited
from the audit. Where the repo contradicts itself, the docs state the majority pattern as the rule
and record the minority as a divergence — no smoothing. Claims of absence ("this repo has no X")
are re-verified by search before they ship, because a false absence claim makes an agent rebuild
something that already exists.
