# AI-Facing Conventions Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write the documentation layer future AI work in this repo reads from — laws in
`CLAUDE.md`, task playbooks in `docs/conventions/`, a ranked backlog, and a resynced
architecture reference — so AI-written code stops improvising conventions the repo already has.

**Architecture:** Every deliverable is prose, not code. There is no compiler, so "correctness"
means every factual claim is traceable to a real `file:line` in this repo, re-verified at write
time. Each task below cites the exact source data to draw from (a domain-extract file already
produced by a prior repo audit) rather than re-deriving conventions from memory — the whole
reason this work exists is that memory-derived documentation is what's currently stale.

**Tech Stack:** N/A (Markdown only). No code, config, or dependency changes in this plan.

**Spec:** `docs/superpowers/specs/2026-09-15-ai-conventions-documentation-design.md` — this plan
implements that spec's §4-§8. Read the spec before executing any task; it explains the *why*
behind the shape each task below only states as *what*.

## Global Constraints

- **English**, no pt-BR mirror — except PT-BR product-copy strings quoted verbatim where the
  source material has them (spec §3).
- **No code changes.** Every task in this plan touches only files under `docs/`, `CLAUDE.md`, and
  `general-documentations/`. If a task's source data implies a code or config fix, that fix goes
  into `priorities.md` (Task 13) as a backlog item — never applied directly.
  `application-no-prisma-imports` being a dead dependency-cruiser rule is a documented gap, not
  something this plan fixes.
  claim about "what already exists" is re-checked at write time by opening or grepping the cited
  file — never carried forward from the source data without a fresh check. Note in-line in the
  file if something in the source data could not be re-confirmed.
- **Point, don't copy.** Cite `file:line` for verifiable claims instead of pasting code. Quantify
  majority patterns ("17 of 25 use-cases...") instead of asserting them as absolutes.
- **Mirror-file pointers over prose rules** wherever the source data names one.
- **Traps section is mandatory** in every playbook (Task 3-12) and must include, verbatim in
  substance, the specific corrected/refuted findings the source data flags as "looks right but
  isn't" — these are measured mistakes, not hypothetical ones.

## Source data (read-only inputs for every task below)

All nine files are already on disk at
`C:\Users\devma\AppData\Local\Temp\claude\c--Users-devma-Claude-Projects-zelo\cc8cecd9-0ed7-464d-bd46-8e49e04a34c8\scratchpad\domain-extracts\`
(session scratchpad — copy any content you need into the actual doc; don't reference this path
from inside a shipped doc). Each file has five sections: CONFIRMED rules (names only — cross-ref
into "All original audit rules" for full text), CORRECTED rules (original + the verifier's fix +
evidence), REFUTED (exclude these entirely), All original audit rules (rule/rationale/evidence
/mirrorFile/confidence — the full detail), Missed rules (verifier additions), Divergences +
Missed divergences (backlog material for Task 13), AI anti-patterns.

| File | Feeds task(s) |
|---|---|
| `backend-modules.txt` | 3 (backend-modules.md), 2 (CLAUDE.md §import extensions) |
| `backend-validation-errors.txt` | 4 (backend-http.md) |
| `frontend-architecture.txt` | 5 (frontend-architecture.md) |
| `react-performance.txt` | 6 (react-performance.md) |
| `frontend-ui-forms.txt` | 7 (forms-and-ui.md) |
| `testing.txt` | 9 (testing.md) |
| `security-privacy.txt` | 10 (security-privacy.md), 2 (CLAUDE.md §security law) |
| `monorepo-tooling.txt` | 11 (monorepo-tooling.md) |
| `divergences-terminology.txt` | 12 (product-invariants.md terminology section), 13 (priorities.md) |

Two playbooks (`realtime-and-streaming.md`, `product-invariants.md`) came from the completeness
critic's `missingCoverage`, not a dedicated domain audit — Tasks 8 and 12 say exactly what to
verify fresh instead of a source file.

The ranked backlog and cross-domain contradictions are in
`...\scratchpad\_parsed.json` (top-level `critique.rankedPriorities`,
`critique.contradictions`, `critique.missingCoverage`, `critique.stillUnverified`) — read via
`node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('_parsed.json','utf8')).critique, null, 2))"`
from that directory. Task 13 uses this directly.

---

### Task 1: `docs/conventions/README.md` — the map

**Files:**
- Create: `docs/conventions/README.md`

**Interfaces:**
- Consumes: the final filenames of Tasks 3-12 (fixed already — see the table in spec §4).
- Produces: nothing structural; this is the entry point `CLAUDE.md` (Task 2) links to.

- [ ] **Step 1: Write the file**

Content, in order:
1. One paragraph: what this directory is (task playbooks — recipe + mirror file + traps, not
   principles) and how it differs from `CLAUDE.md` (always-loaded laws) and
   `general-documentations/architecture-reference.md` (what exists and why).
2. A table: task shape → which playbook to open. One row per file from Tasks 3-12, e.g.:

   | If you're... | Read |
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

3. A pointer to `priorities.md` — "ranked backlog of what's broken or missing, derived from this
   same audit plus `docs/superpowers/specs/technical-debt.md`."
4. The upkeep rule, stated once here in full (CLAUDE.md will state it in one line and link back):
   "A new convention established in a PR lands in the relevant playbook in that same PR — not as
   a follow-up. If no existing playbook fits, that's a signal to add one, not to skip
   documenting it."
5. Note the five companion skills in `.github/skills/` (`zelo-backend-endpoint`,
   `zelo-frontend-flow`, `zelo-form`, `zelo-admin-table`, `zelo-verify-before-reporting`) and how
   they relate to the playbooks: skills are thin recipes + mirror-file pointers for the four most
   common task shapes; the playbook is where the *why* and the full rule set live. A skill should
   never duplicate a playbook's rule text — if you're editing one and notice drift, fix the
   playbook and have the skill point at it.

- [ ] **Step 2: Verify every filename in the table matches an actual file that exists after Tasks
  3-12 run** (or, if run before them, matches the exact filename that task will create — check
  spelling against the table in spec §4 word for word).

- [ ] **Step 3: Commit**

```bash
git add docs/conventions/README.md
git commit -m "docs: add docs/conventions map and upkeep rule"
```

---

### Task 2: `CLAUDE.md` rewrite

**Files:**
- Modify: `CLAUDE.md` (currently ~35 lines, forms-only — read it first, the forms section gets
  folded in, not deleted outright: see Step 1c)

**Interfaces:**
- Consumes: `backend-modules.txt` (import-extension rule), `security-privacy.txt` (the
  `dangerouslySetInnerHTML`/TD-001 finding — grep for it in the CONFIRMED or All-rules section),
  the dependency-cruiser rule text at `apps/api/.dependency-cruiser.cjs` and
  `apps/web/.dependency-cruiser.cjs` (read directly, don't rely on the extract for this one).
- Produces: the entry point every future AI session reads. Must stay under ~6 KB.

- [ ] **Step 1: Read current state before writing**

```bash
cat CLAUDE.md
cat apps/api/.dependency-cruiser.cjs
cat apps/web/.dependency-cruiser.cjs
```
Confirm the forms section's current wording (Task 7 folds its content into
`forms-and-ui.md`; `CLAUDE.md` keeps only a one-line pointer to it plus the `mode: "onBlur"`
one-liner if that's the single most load-bearing fact — judge by what's actually in the current
file).

- [ ] **Step 2: Write the new file, this exact section order**

1. **Header** — one line: "Project-wide conventions for whoever (human or AI) works in this
   repo. This file is the index — laws that apply everywhere live below; everything else is in
   `docs/conventions/` (see `docs/conventions/README.md` for the map)."
2. **Reading map** — a condensed version of Task 1's table (link to the full one, don't
   duplicate all ten rows — 4-5 of the most common here is enough).
3. **Boundaries that break the build** — the four dependency-cruiser rules from both `.cjs`
   files, stated as prohibitions (e.g. "`application/` (ports + use-cases) never imports
   `infrastructure/` or `@prisma/client` — enforced by `apps/api/.dependency-cruiser.cjs`").
   Immediately after, one sentence flagging that `application-no-prisma-imports` is currently
   inert (see `priorities.md` #2) — "a green `lint:boundaries` does not prove this one."
4. **Import extensions, by layer** — pull the corrected rule from `backend-modules.txt`
   (relative imports end `.ts`, `@/`-aliased end `.js`; infrastructure adapters use the
   self-alias for their own module's port, use-cases/controllers use relative paths within their
   module) — this is a CORRECTED rule in the source data (contradiction #1 in the design spec),
   use the corrected wording, not the original.
5. **Product laws** — `riskSignal` never crosses the network; scoring stays on-device; human
   handoff/CVV 188 renders with no network; k-anonymity is a per-sector visibility decision
   (cite the corrected wording from `security-privacy.txt`, contradiction #8 in the spec — not
   "never return a sub-threshold sector's numbers in any field"); PT-BR copy in specs is
   normative; design tokens only, no raw hex.
6. **Security rules that are convention-only today** — no `dangerouslySetInnerHTML` anywhere,
   with the TD-001 rationale in one sentence (manager/hospital-admin/SuperAdmin/peer-partner
   tokens all sit in `sessionStorage` behind `Authorization: Bearer` — one raw-HTML render is
   full session exfiltration). State plainly that nothing enforces this yet (see `priorities.md`
   #10).
7. **What this repo deliberately does not do** — zero `createContext`, no `class-validator`, no
   `ValidationPipe`, no framework DI on the frontend, no mocking library for port doubles (a
   hand-written `class FakeX implements X` is the convention — pull the exact wording from the
   contradiction #5 resolution in `backend-modules.txt`/testing data, since a blanket "no
   mocking" statement is wrong per that correction).
8. **Forms** — one paragraph replacing the current section: the RHF+zod rule stays (it's the
   one convention this file already got right, confirmed by baseline measurement — don't touch
   its content, only its position), then "full detail and the newer gaps (204-response-shape,
   Prisma import path, SettingsRow reuse, server-conflict-error banner pattern) are in
   `docs/conventions/forms-and-ui.md`; also see the `zelo-form` skill."
9. **Upkeep rule** — one line: "A new convention established in a PR lands in its playbook in
   that PR — see `docs/conventions/README.md`."

- [ ] **Step 2: Verify the file is under ~6 KB**

```bash
wc -c CLAUDE.md
```
If over ~6500 bytes, cut prose, not content — every section should be scannable in under 10
seconds; move detail to the playbook it summarizes.

- [ ] **Step 3: Re-verify every dependency-cruiser rule statement against the two `.cjs` files
  directly** (not against the audit extract) — these are the two smallest, highest-consequence
  files in this task and re-reading them costs nothing.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: rewrite CLAUDE.md as an index of laws + reading map"
```

---

### Task 3: `docs/conventions/backend-modules.md`

**Files:**
- Create: `docs/conventions/backend-modules.md`

**Interfaces:**
- Consumes: `backend-modules.txt` (CONFIRMED + CORRECTED rules only; skip REFUTED).
- Produces: the mirror-file pointers this file names are referenced by the `zelo-backend-endpoint`
  skill — keep filenames/paths byte-identical to what that skill already cites
  (`.github/skills/zelo-backend-endpoint/SKILL.md`), so re-read that skill file first.

- [ ] **Step 1: Read the skill file this playbook backs**

```bash
cat .github/skills/zelo-backend-endpoint/SKILL.md
```

- [ ] **Step 2: Write the file using the shape from spec §6**

1. One-paragraph overview: module skeleton (`application/{ports,use-cases}` vs
   `infrastructure/{controllers,guards,persistence}`), Symbol DI tokens, why it's shaped this way
   (Dependency Inversion boundary the dependency-cruiser rules enforce).
2. **The recipe** — numbered steps in dependency order (port → token → use-case → repository →
   controller → module wiring → test), each with its mirror file. Pull from the CONFIRMED rules
   in `backend-modules.txt` — every rule there has a `mirrorFile` field; use it verbatim.
3. **Naming, exactly** — the `<verb>-<noun>.use-case.ts` / `<Verb><Noun>UseCase` convention, the
   `SomethingError extends Error` placement rule (application/, never an `HttpException`), the
   `@Inject()`-on-every-param rule — each with its confirmed evidence quantification (e.g. "38/38
   `*.use-case.ts` files...").
4. **How to verify** — `pnpm --filter @zelo/api lint:boundaries` and what it does and does not
   catch (does not catch the `generated/prisma/` import gap — cross-reference `priorities.md`
   #2).
5. **Traps** — from `backend-modules.txt`'s CORRECTED section: the self-alias-for-own-module's-
   port vs. relative-for-use-cases/controllers distinction (contradiction #1 in the design spec —
   use the corrected wording exactly, this was originally stated backwards), the
   `process.env`-in-module-body exception for provider selection (contradiction #2 — this is
   CORRECT, not a violation, despite reading like one), the mocking-library nuance (spy vs. fake
   vs. `vi.mock`, contradiction #5).

- [ ] **Step 3: Re-verify three of the highest-stakes cited facts directly against the repo**
  (don't trust the extract for these three specifically, since they were flagged as
  originally-wrong-then-corrected): the self-alias import direction, the `process.env` exception,
  and the DI token naming pattern. One grep each:

```bash
grep -rn "from \"@/modules" apps/api/src/modules/sector/infrastructure/persistence/ | head -5
grep -n "process.env" apps/api/src/modules/manager/manager.module.ts apps/api/src/modules/chat/chat.module.ts
grep -rn "= Symbol(\"" apps/api/src/modules --include=*.port.ts | head -5
```

- [ ] **Step 4: Commit**

```bash
git add docs/conventions/backend-modules.md
git commit -m "docs: add backend-modules.md playbook"
```

---

### Task 4: `docs/conventions/backend-http.md`

**Files:**
- Create: `docs/conventions/backend-http.md`

**Interfaces:**
- Consumes: `backend-validation-errors.txt` (CONFIRMED + CORRECTED).

- [ ] **Step 1: Write the file**

1. Overview: no global `ValidationPipe`, no `class-validator` — zod-in-controller is the only
   validation layer (quantify: "21/21 `@Body()` params are `@Body() body: unknown`").
2. **The recipe**: schema declared at top of controller file → `safeParse` → `BadRequestException
   (parsed.error.flatten())`.
3. **Cross-tenant response semantics** (this is the contradiction #6 resolution — get this exact,
   it's security-relevant): path-param mismatch → bare 404; body-supplied foreign id → 400 with a
   message; 403 reserved for the role check itself. Cite `manager-admin.controller.ts` line
   numbers from the source data's evidence field, then re-verify:

```bash
grep -n "NotFoundException\|BadRequestException\|ForbiddenException" apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts | head -20
```

4. **Rate limiting**: `@nestjs/throttler` v6's nested `@Throttle({ default: { limit, ttl } })`
   shape (contradiction #7 — the flat v5 shape silently applies nothing). Cite the two real call
   sites from the source data and re-verify:

```bash
grep -n "@Throttle" apps/api/src/modules/manager/infrastructure/manager.controller.ts apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts
```

5. **How to verify**: there is no automated check for any of this section — say so plainly,
   rather than implying `lint`/`lint:boundaries` covers it.
6. **Traps**: the `application-no-prisma-imports` dead-rule gap (pointer to `priorities.md` #2,
   don't re-explain it in full here).

- [ ] **Step 2: Commit**

```bash
git add docs/conventions/backend-http.md
git commit -m "docs: add backend-http.md playbook"
```

---

### Task 5: `docs/conventions/frontend-architecture.md`

**Files:**
- Create: `docs/conventions/frontend-architecture.md`

**Interfaces:**
- Consumes: `frontend-architecture.txt` (CONFIRMED + CORRECTED).
- Produces: mirror-file pointers the `zelo-frontend-flow` skill already cites — re-read that
  skill file first, same as Task 3.

- [ ] **Step 1: Read the skill file this playbook backs**

```bash
cat .github/skills/zelo-frontend-flow/SKILL.md
```

- [ ] **Step 2: Write the file**

1. Overview: ports/use-cases/infrastructure/stores/presentation layering, `container.ts` as
   hand-wired constructor injection (no framework DI — quote the file's own line count/shape).
2. **State split**: Zustand+persist for device-local flags read via `.getState()` in loaders;
   TanStack Query for anything networked. The rule that a use-case never reaches into a store
   itself — the calling hook reads the store and passes plain values in.
3. **Zustand selector discipline** — state the rule, but flag the CORRECTED confidence level
   (contradiction #9 / stillUnverified #6 in the design spec): "measured as ~88 selector call
   sites with no whole-store-subscription exception found by a single-line grep — treat as the
   working convention, not as a guarantee; a selector split across lines wouldn't have been
   caught by that check."
4. **Hook count correction** — use the corrected 36/50-of-38 figure (contradiction #9), not "48
   of 50" — and name the 12 legitimate non-container hooks so they aren't miscounted as
   violations on a future re-audit (`useOnline`, `useDebouncedSearch`, `useHotkey`,
   `useTypewriter`, `useDocumentTitle`, `useStickToBottom`, `useInlineConfirm`,
   `useInstallPrompt`, `useHasCamera`, `useApplyAppearancePrefs`, `useManagerSessionExpiry`,
   `useLinkInstitutionFlow`).
5. **Route guards**: loaders reading session stores via `.getState()`, the `routes.ts` constants
   file, the three-lookup-table trap already documented in the `zelo-frontend-flow` skill — link
   to it rather than re-stating (avoid the duplication the design spec's §6 warns against).
6. **Page shape**: single `.tsx` vs. folder-with-hooks/columns/modals — `ManagerAdminManagersPage`
   as the folder reference.
7. **Traps**: the third contradiction (`process.env` is fine in module bodies) doesn't apply
   here — skip it; this file's traps are frontend-specific: the untested-admin-CRUD-use-case gap
   (contradiction #4 corrected: use-cases ARE unit-tested by convention, only Prisma repos/thin
   HTTP adapters are exempt — 18 web use-cases currently violate this, note as a
   `priorities.md`-adjacent gap, not something to silently accept).

- [ ] **Step 3: Commit**

```bash
git add docs/conventions/frontend-architecture.md
git commit -m "docs: add frontend-architecture.md playbook"
```

---

### Task 6: `docs/conventions/react-performance.md`

**Files:**
- Create: `docs/conventions/react-performance.md`

**Interfaces:**
- Consumes: `react-performance.txt` (CONFIRMED + CORRECTED). Cross-reference `priorities.md`
  (Task 13) items #5, #6, #14 — this file explains the *why*, `priorities.md` tracks the *fix*.

- [ ] **Step 1: Write the file**

1. Overview: React 19.2, no React Compiler configured, `eslint-plugin-react-hooks` absent
   (state plainly — this is the single largest lint gap in the repo).
2. **The `exhaustive-deps` caveat** — mark `stillUnverified` #1 explicitly: "a hand audit of 56
   effects found no missing-dependency bug — this is NOT a substitute for running the lint rule
   and should not be cited as a reason to defer adding it (see `priorities.md` #6)."
3. **Memoization**: current usage counts (8 files `memo()`, 8 `useMemo`, 7 `useCallback`) — state
   as a snapshot, not a target; don't prescribe "add more memoization" as a rule, since the
   measured baseline shows the repo doesn't need blanket memoization.
4. **The `QueryClient` defaults gap** — this was the react-performance audit's own biggest miss
   per the critique (`priorities.md` #5): `app/query-client.ts` has no `staleTime`/
   `refetchOnWindowFocus` override, meaning every alt-tab refires every visible query. Explain
   the cascade (re-render → `useMemo(() => data ?? [])` chain busts → `useDataTableSelection`
   re-derives) so a reader understands why this is the highest-leverage single fix, not just a
   line item.
5. **Code splitting**: no `lazy()`/`Suspense` anywhere, honest framing per `priorities.md` #14 —
   library-level splitting is real (jspdf/html2canvas/index.es genuinely separate chunks); what's
   missing is route-level splitting for the 20-of-34 manager/admin/peer-only routes. Note the
   `routeChildren` export constraint from `router.test.tsx` that any future split must preserve.
6. **Traps**: none carried from CORRECTED for this domain if empty — check
   `react-performance.txt`'s CORRECTED section; if it has entries, include them, otherwise state
   "no corrections were needed for this domain's confirmed rules" rather than fabricating a traps
   section.

- [ ] **Step 2: Commit**

```bash
git add docs/conventions/react-performance.md
git commit -m "docs: add react-performance.md playbook"
```

---

### Task 7: `docs/conventions/forms-and-ui.md`

**Files:**
- Create: `docs/conventions/forms-and-ui.md`

**Interfaces:**
- Consumes: `frontend-ui-forms.txt` (CONFIRMED + CORRECTED).
- Produces: mirror-file pointers the `zelo-form` and `zelo-admin-table` skills already cite —
  read both first.

- [ ] **Step 1: Read the two skill files this playbook backs**

```bash
cat .github/skills/zelo-form/SKILL.md
cat .github/skills/zelo-admin-table/SKILL.md
```

- [ ] **Step 2: Write the file**

1. **Forms** — the full RHF+zod convention (this is what today's `CLAUDE.md` has; move it here
   verbatim as the base, then layer in the gaps the baseline measurement found and the skill
   already encodes: 204-no-body PATCH responses, the Prisma-import-path trap, `SettingsRow`
   reuse, the server-conflict-error banner pattern vs. `form.setError`). Don't restate what the
   skill already says almost word for word — link to `zelo-form` for the measured traps, keep
   this file as the fuller rationale + the parts the skill doesn't cover (e.g. why `onBlur`, the
   `key`-per-branch rule for mixed controlled/uncontrolled inputs).
2. **Accessibility gap, stated honestly** (from the source data, not softened): quantify exactly
   which forms are missing `aria-invalid`/`aria-describedby` (both forgot-password pages, 3 of 4
   `AdminInstitutions` create fields, `ManagerFormModal`'s name field, `ManagerAdminPeersPage`'s
   name/specialty, both login pages' password field) — cross-reference `priorities.md` #11, don't
   duplicate the full writeup, just the pointer + the one sentence stating this is a regression
   introduced BY the RHF migration, not a leftover.
3. **Shared UI primitives** — the `presentation/ui/` inventory, ref-as-plain-prop under React 19
   (no `forwardRef`), variant patterns.
4. **`DataTable`** — the full API: `DataTableShell`, `DataTableToolbar`, `DataTableEmpty`,
   `DataTableError`, `DataTableMobileCard`, `useDataTableSelection`, `useBulkDelete`,
   `useBulkStatusUpdate`. This is the section `zelo-admin-table` points back to for detail — make
   it the authoritative one.
5. **Design tokens** — Tailwind v4 token definition, dark-theme handling, no-raw-hex rule.
6. **Traps** — from CORRECTED: any wording that changed between the original audit and the
   verifier pass. If none exist in this domain's CORRECTED section, say so rather than omit the
   heading silently (keeps the doc's shape predictable across all ten playbooks).

- [ ] **Step 3: Commit**

```bash
git add docs/conventions/forms-and-ui.md
git commit -m "docs: add forms-and-ui.md playbook"
```

---

### Task 8: `docs/conventions/realtime-and-streaming.md`

**Files:**
- Create: `docs/conventions/realtime-and-streaming.md`

**Interfaces:**
- Consumes: no pre-extracted domain file — this came from `critique.missingCoverage` in
  `_parsed.json`, items about the peer-chat gateway and the chat NDJSON contract. Read those two
  `missingCoverage` entries first (`node -e "..."` per the Source Data section above), then
  verify fresh against the code — this task is closer to a small original investigation than the
  others, which had a domain audit already done.

- [ ] **Step 1: Read the two relevant `missingCoverage` items and the files they name**

```bash
cat apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.ts
cat apps/web/src/presentation/hooks/usePeerRequest.ts apps/web/src/presentation/hooks/usePeerPartnerConnection.ts 2>/dev/null
cat apps/api/src/modules/chat/infrastructure/chat.controller.ts
cat apps/web/src/ports/chat-gateway.port.ts apps/web/src/infrastructure/http/http-chat-gateway.adapter.ts
```

- [ ] **Step 2: Write the file**

1. **Peer-chat event vocabulary** — list the 11 event names as found in the gateway/hook files
   (grep for the literal strings), flag the one inconsistency the missingCoverage item names
   (kebab-case `request-peer` vs. snake_case for the rest) as a known wart, not something to
   silently normalize in this doc — that's a code change, belongs in `priorities.md` if not
   already there (check Task 13's ranked list — item #8 covers the gateway's missing validation;
   add a naming-consistency line to that same item rather than creating a new one).
2. **The state machine** — pending-vs-active `PeerMatchRegistry`, the 30s timeout/candidate
   failover, `handleDisconnect`'s four distinct paths (quote why each exists from its own inline
   comment, per the missingCoverage note that each carries a comment explaining a real bug it
   fixed — re-read those comments directly, don't paraphrase from memory).
3. **No port/use-case/container entry** — state plainly that `PeerChatSocketClient` is the one
   transport in the frontend with none of the usual wrapping, and that this is a gap (link
   `priorities.md` #8), not a pattern to replicate for a next real-time feature.
4. **Chat NDJSON contract** — `ChatToken`'s home in `@zelo/domain` vs. the error-code union that
   is NOT shared (bare literals in the controller, hand-mirrored TS union on the frontend). Flag
   the one raw `JSON.parse(...) as ChatStreamEvent` cast as the sole unvalidated response body in
   the app.
5. **If you're adding a new real-time feature**: a short recipe — share the event-name constants
   in `@zelo/domain` rather than hand-mirroring strings across files (this is prescriptive,
   stated as the going-forward rule even though the existing peer-chat code doesn't follow it
   yet — say so explicitly: "the existing implementation predates this rule; match it going
   forward, don't retrofit the existing files as part of an unrelated change").

- [ ] **Step 3: Commit**

```bash
git add docs/conventions/realtime-and-streaming.md
git commit -m "docs: add realtime-and-streaming.md playbook"
```

---

### Task 9: `docs/conventions/product-invariants.md`

**Files:**
- Create: `docs/conventions/product-invariants.md`

**Interfaces:**
- Consumes: `security-privacy.txt` (k-anonymity section, CORRECTED per contradiction #8) +
  `divergences-terminology.txt` (crisis-reachability is referenced there) +
  `_parsed.json`'s `critique.missingCoverage` entries for the tone guard, the crisis-route
  triple, and the `NotificationType` five-way contract.

- [ ] **Step 1: Read the source files each invariant lives in**

```bash
cat apps/web/src/presentation/lib/crisis-line.ts
find apps/web/src -iname "*crisis-call-reachability*"
cat apps/api/src/modules/chat/application/tone/guard-tone.ts apps/api/src/modules/chat/application/tone/tone-tells.ts 2>/dev/null
cat apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts
grep -rn "NotificationType" apps/api/prisma/schema.prisma apps/web/src/ports/manager-notifications.port.ts
```

- [ ] **Step 2: Write the file**

1. **Crisis reachability** — state the invariant in the same words the test docblock already
   uses (read it, don't paraphrase into something weaker): every screen where someone is reaching
   for a person needs the CVV line one tap from a dialer. Name the `CRISIS_SCREENS` list (or
   equivalent) a new such screen must be added to, and cite the actual test file as the live
   enforcement mechanism — flag plainly that this is the ONLY place the invariant is currently
   enforced, so a new screen missing from that file fails silently otherwise.
2. **K-anonymity** — the CORRECTED wording from contradiction #8: suppression is a per-SECTOR
   decision made once against the reference week; every aggregate reads from the resulting
   `visibleSectorIds` set; a trend point showing `checkIns < 5` for an already-visible sector is
   correct, not a leak. State the wrong version explicitly as a wrong version ("do NOT re-apply
   the threshold per datapoint — this looks like the safer interpretation and is not; it would
   make the dashboard unreadable") since this is exactly the kind of correction an AI would
   plausibly "fix" its way into.
3. **Tone guard** — one paragraph: the regenerate-on-cliche loop, `OPENING_CAP`, `ToneRule`
   union, enforce-vs-report opening modes. State the one behavioral rule that matters for anyone
   touching it: `onTell` logs a rule name, never message content.
4. **`NotificationType` five-way contract** — list the five places that must move together (the
   Prisma enum, the TS union in the port with its own comment admitting it's hand-kept-in-step,
   the `MANAGER_NOTIFICATION_TYPES` const array, the label map/switch in
   `manager-notification-copy.ts`, the `GOOD_NEWS_TYPES` set). State this as "adding a
   notification type means five coordinated edits plus a migration — do all five in the same
   change" rather than implying any tooling currently catches a missed one (it doesn't).
5. **`riskSignal`/on-device scoring** — one paragraph restating the two laws already in
   `CLAUDE.md` with the file-level enforcement point named (where the submit pipeline strips it),
   since this file is where someone touching the assessment/scoring pipeline will actually look
   for the mechanism, not just the rule.

- [ ] **Step 3: Commit**

```bash
git add docs/conventions/product-invariants.md
git commit -m "docs: add product-invariants.md playbook"
```

---

### Task 10: `docs/conventions/testing.md`

**Files:**
- Create: `docs/conventions/testing.md`

**Interfaces:**
- Consumes: `testing.txt` (CONFIRMED + CORRECTED).

- [ ] **Step 1: Write the file**

1. **The exemption, stated precisely** — this is contradiction #4's corrected form: Prisma
   repositories and thin HTTP adapters are exempt from unit tests by convention; use-cases are
   NOT exempt, however thin (29/47 web use-cases currently have tests — the 18 that don't are a
   gap, not a second exemption class). Cite `architecture-reference.md:511-513` and `:263`
   directly (these line numbers may have shifted after Task 14's resync — re-grep instead of
   trusting the audit's cited numbers).
2. **Port doubles vs. spies vs. mocks** — contradiction #5's three-way resolution: hand-written
   `class FakeX implements X` for port doubles (110/122 Fake classes), `vi.fn()` legitimate only
   as a spy for call assertions on a non-port collaborator (7 files), `vi.mock` reserved for
   third-party SDKs (3 files: `groq-sdk` x2, `resend`). Name the 5 known-acceptable existing
   exceptions (cast-to-port instead of implementing it) as "don't treat as a bug, but prefer the
   class form for anything new."
3. **`describe` naming** — pull the corrected version from `stillUnverified` #4, not the original
   "exactly as spelled" claim (camelCase for functions, SCREAMING_SNAKE for constants, trailing
   scope clauses allowed, lowercase prose OK for topic files).
4. **CI gates** — what `.github/workflows/api.yml` and `web.yml` actually run, and explicitly
   what they do NOT gate (formatter, `apps/api`/`packages/domain` test-file typecheck exclusion —
   cross-reference `priorities.md` #20).
5. **Traps**: the `restoreMocks` gap (`priorities.md` #3) — one sentence + pointer, not a
   re-explanation.

- [ ] **Step 2: Commit**

```bash
git add docs/conventions/testing.md
git commit -m "docs: add testing.md playbook"
```

---

### Task 11: `docs/conventions/security-privacy.md`

**Files:**
- Create: `docs/conventions/security-privacy.md`

**Interfaces:**
- Consumes: `security-privacy.txt` (CONFIRMED + CORRECTED).

- [ ] **Step 1: Write the file**

1. **Auth model per role** — manager/admin/peer-partner session handling, scrypt hashing,
   timing-safe comparison; state which roles have revocable sessions and which don't (SuperAdmin
   does NOT — `priorities.md` #7 — say so plainly here since it's the kind of asymmetry an AI
   copying "the manager guard" onto a new role would miss).
2. **The cross-tenant response semantics** — same content as `backend-http.md`'s version; link
   rather than duplicate (this repo's own convention against copy-paste applies to its own docs
   too).
3. **Institution scoping** — how manager queries are constrained; name the one exception this
   audit found in the design-spec's own §2 (the `findActiveByInstitution` trap on the unguarded
   public sector endpoint) as the canonical example of the general rule "never widen a select
   used by an unauthenticated controller to include a credential-shaped field."
4. **XSS surface** — the `dangerouslySetInnerHTML` prohibition (same content as `CLAUDE.md`'s
   security law; this file gives the fuller TD-001 rationale CLAUDE.md only summarizes).
5. **Transport hardening** — CORS allowlist, `ThrottlerGuard`, absence of `helmet` (state as a
   known gap, `priorities.md` #10, not an oversight to silently work around).
6. **What never gets logged** — PII, tokens, message content, assessment answers; cite the
   `onTell`-logs-rule-name-not-content pattern from `product-invariants.md` as the model to copy
   for any new logging.

- [ ] **Step 2: Commit**

```bash
git add docs/conventions/security-privacy.md
git commit -m "docs: add security-privacy.md playbook"
```

---

### Task 12: `docs/conventions/monorepo-tooling.md`

**Files:**
- Create: `docs/conventions/monorepo-tooling.md`

**Interfaces:**
- Consumes: `monorepo-tooling.txt` (CONFIRMED + CORRECTED).

- [ ] **Step 1: Write the file**

1. **Workspace + Turborepo**: `turbo.json` task graph, `dependsOn`/`outputs`/env passthrough,
   `workspace:*` convention.
2. **`packages/domain` vs `packages/config`**: what qualifies to live in each.
3. **Two build strategies**: api uses `tsc` + `tsc-alias`, web uses `tsc --noEmit` + `vite build`
   — state why they differ (native ESM output vs. bundler) rather than presenting it as an
   inconsistency to fix.
4. **CI split**: `api.yml` vs `web.yml`, path filters, what deploys where.
5. **Prisma**: schema location, the dev/prod env split (`.env` vs `.env.production.local`),
   **flag the #1 priorities.md item here prominently** — the missing `DATABASE_URL` in
   `.env.production.local` and the README instruction that no longer matches reality. This file
   is where someone doing a re-seed will actually look; the warning needs to be here, not just
   buried in the backlog.
6. **Deploy topology**: Fly.io (api) + Vercel (web) + Neon (db) + GitHub Pages retirement — cite
   `priorities.md` #13's dead `VITE_BASE_PATH` plumbing note.

- [ ] **Step 2: Commit**

```bash
git add docs/conventions/monorepo-tooling.md
git commit -m "docs: add monorepo-tooling.md playbook"
```

---

### Task 13: `docs/conventions/priorities.md`

**Files:**
- Create: `docs/conventions/priorities.md`

**Interfaces:**
- Consumes: `_parsed.json`'s `critique.rankedPriorities` (26 items, already ranked) +
  `docs/superpowers/specs/technical-debt.md` (TD-001 and TD-003 — TD-002 is resolved, exclude
  it).

- [ ] **Step 1: Re-derive TD-001's current status before writing anything**

The ranked list's item ordering assumed TD-001 ("Accepted, deferred", July) might be stale. Check:

```bash
git log --oneline --all -- "docs/superpowers/specs/2026-09-14-httponly-cookie-session-migration-design.md"
find docs/superpowers/plans -iname "*httponly*" -o -iname "*cookie*"
grep -rn "sessionStorage" apps/web/src/stores/manager-session.store.ts
```
If the cookie migration has landed in code (not just spec/plan), TD-001 in
`technical-debt.md` needs its own status update as a side-effect of this task — note that as a
separate small edit in Step 3, not silently skipped. If it's still spec-only, `priorities.md`'s
item referencing it should say "the July 'deferred' status is worth re-confirming — a September
spec and plan exist for this migration; check whether they've shipped before treating this as
still-open" rather than asserting either state as fact.

- [ ] **Step 2: Write the file**

1. One-paragraph framing: this file is *what to do next*; `technical-debt.md` remains *why we
   accepted this and when to revisit* — link both directions.
2. All 26 items from `rankedPriorities`, in rank order, each with: title, why (repo-specific,
   from the `why` field), effort, kind, and — new in this file, not in the raw critique output —
   a **files** line naming the exact paths involved (pull from each item's `why`/description
   text, which already names most of them; add any missing from the domain-extract extras).
3. For items #9, #14, #23 (the three the design spec calls out as needing honest, non-inflated
   placement — sector-QR gap, code-splitting, hospital/institution drift) keep the fuller
   framing from spec §7 rather than compressing to one line; these are the three most likely to
   be second-guessed later, so the reasoning needs to survive in the artifact itself.
4. A short "already fixed" footer only if Step 1 found the cookie migration has actually shipped
   — noting which item that resolves and why in one sentence, not a rewrite of the item.

- [ ] **Step 3: If Step 1 found TD-001 stale, update `docs/superpowers/specs/technical-debt.md`'s
  TD-001 status line** (`Accepted, deferred` → whatever Step 1 established), same pattern as
  TD-002's own "Resolved"/"Update" entries already in that file — follow that file's existing
  style, don't restructure it.

- [ ] **Step 4: Commit**

```bash
git add docs/conventions/priorities.md docs/superpowers/specs/technical-debt.md
git commit -m "docs: add priorities.md ranked backlog"
```

---

### Task 14: `general-documentations/architecture-reference.md` resync

**Files:**
- Modify: `general-documentations/architecture-reference.md` (in place — this is a large
  existing file, ~500+ lines across 13 sections; read it in full before editing).
- Modify: `general-documentations/architecture-reference.pt-BR.md` (banner only — see Step 3).

**Interfaces:**
- Consumes: nothing pre-extracted — this task is a fresh section-by-section diff against the
  live repo. The known-stale points (from the design spec + the ranked priorities #13) are the
  starting checklist, not the full scope — read every section, not just these.

- [ ] **Step 1: Read the current file in full**

```bash
cat general-documentations/architecture-reference.md
```

- [ ] **Step 2: Section-by-section fact check.** For each of the 13 sections, re-verify every
  concrete claim (file path, line count, "X of Y" quantification, tech name) against the repo.
  Known issues to fix, confirmed by prior review — treat this list as a floor, not a ceiling:

  - README's own tech-stack table (referenced in §1) still says GitHub Pages + Neon; the
    Deployment section (§9) already correctly says Vercel + Prisma Postgres — reconcile toward
    what's actually deployed today, re-verify against `vercel.json`/`fly.toml`/CI workflow
    deploy steps rather than trusting either existing claim.
  - §5 (Frontend architecture) describes `app/container.ts` as one file — it's a 12-file
    directory (`app/container/`) now; re-verify with `ls apps/web/src/app/container/`.
  - §5 cites `react-router` v6 — `apps/web/package.json` pins `^8.3.1`; re-check every
    version number in the doc against the real `package.json` files, not just this one.
  - Remove the dead `VITE_BASE_PATH` plumbing reference if the doc still describes the GitHub
    Pages build path as live (cross-reference `priorities.md` #13/#25 for the retirement
    context — vite.config.ts, apps/web/package.json's `build:native` script).
  - Cross-check every `docs/superpowers/specs/` filename the reference links to still exists at
    that path (`find docs/superpowers/specs -maxdepth 1 -iname "*.md"` and diff against the
    doc's citations).
  - Update the "Last synced" date and the merged-PR pointer at the top to today's date and the
    most recent merge on `develop` (`git log origin/develop -1 --oneline`).

- [ ] **Step 3: pt-BR mirror** — per spec §3, do not retranslate. Add a two-line banner at the
  top of `architecture-reference.pt-BR.md`: this file is not kept in sync; the English version is
  normative as of [today's date]; read that one for anything current.

- [ ] **Step 4: Commit**

```bash
git add general-documentations/architecture-reference.md general-documentations/architecture-reference.pt-BR.md
git commit -m "docs: resync architecture-reference.md against current repo state"
```

---

### Task 15: Historical banners on retired documents

**Files:**
- Modify: `docs/superpowers/specs/AGENTS.md` (top of file, ~5 lines)
- Modify: `docs/superpowers/specs/README.md` (top of file, ~5 lines)
- Modify: `PRE-COMMIT-TEST-CHECKLIST.md` (top of file, ~5 lines)

**Interfaces:**
- Consumes: nothing new — this is a small, mechanical task, last on purpose so the banner text
  can link to the finished `docs/conventions/README.md` and `CLAUDE.md` from Tasks 1-2.

- [ ] **Step 1: Add this banner block to the top of each of the three files** (adjust the second
  line per-file to name what actually superseded it):

For `docs/superpowers/specs/AGENTS.md`:
```markdown
> **Historical.** This is the July 2026 build plan for the Sereno UI direction — every screen it
> describes has since shipped. Kept for history, not as current instruction. For how to build a
> new feature in this repo today, start at `CLAUDE.md` and `docs/conventions/README.md`.

---

```
(insert directly after the existing `# Zelo — "Sereno" UI Build Plan (Direction 1A)` title line,
before the `> **Purpose.**` blockquote that already exists)

For `docs/superpowers/specs/README.md`: same banner, second line changed to reference this file
being the index for the July UI spec specifically, not specs in general — `docs/superpowers/specs/`
as a whole stays live (new dated specs still land there per the brainstorming skill's convention);
only this file's "start here" framing is retired.

For `PRE-COMMIT-TEST-CHECKLIST.md`:
```markdown
> **Historical.** Scoped to one working tree as of 2026-08-17 (dark theme + design tokens, chat
> streaming resilience, the composer rewrite). Not a general pre-commit checklist. For the actual
> gates a change needs to pass, see `docs/conventions/testing.md` and each app's `package.json`
> scripts (`lint`, `lint:boundaries`, `test`, `build`).

---

```

- [ ] **Step 2: Verify each file still reads sensibly below the banner** — a stray banner
  inserted mid-sentence or before a title that now reads oddly is worse than no banner; check
  each file's first 15 lines after editing.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/AGENTS.md docs/superpowers/specs/README.md PRE-COMMIT-TEST-CHECKLIST.md
git commit -m "docs: mark retired planning docs as historical, point to docs/conventions"
```

---

## Plan-level self-review notes

- **Task ordering for execution:** Tasks 3-12 (the ten playbooks) are mutually independent and
  can run in parallel. Task 1 (README map) and Task 2 (CLAUDE.md) reference the playbooks'
  filenames only — those are fixed by this plan already, so Tasks 1-2 don't need to wait for
  3-12 to finish, only to have started (same reasoning applies in reverse: 3-12 don't depend on
  1-2). Task 13 (priorities.md) is independent of all of them. Task 14 (architecture-reference
  resync) and Task 15 (banners) are independent of everything and of each other. In short: **all
  15 tasks are parallelizable** — there is no real dependency chain here, only a shared set of
  read-only source files.
- **Every task's `git add` is scoped to only the files that task creates/modifies** — safe to run
  concurrently on the same branch without stepping on each other, since no two tasks touch the
  same file (Task 13's edit to `technical-debt.md` is the one cross-cutting exception — flagged
  conditionally in that task, and touches a file no other task writes to).
- **Spec coverage check**: every deliverable in spec §4's file tree has a task (Tasks 1-2, 3-12,
  13, 14; the five skills from spec §4 already shipped in PR #41 before this plan existed). No
  gaps found.
