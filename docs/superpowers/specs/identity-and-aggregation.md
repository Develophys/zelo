# Identity & Aggregation — design spec (not yet implemented)

**Status:** design-only, **partially superseded, twice over**. The full multi-user `User` model
+ magic-link auth designed below was never built. Instead, three narrower, incremental specs
shipped real pieces of this problem without ever building doctor-side identity:
`2026-07-11-manager-login-simulated-dashboard-design.md` (a single shared manager code gating
simulated aggregate data), `2026-08-01-manager-individual-accounts-design.md` (individual named
manager accounts, replacing the shared code), and
`2026-08-02-multi-institution-data-partitioning-design.md` (a real `Institution` model, real
per-institution manager scoping, and a real — if fully anonymous, no-login — signal pipeline
from médicos' devices). Each solved a real, narrower problem than this spec's full `User` model
without needing one. **What remains genuinely unbuilt, exactly as this spec left it:** any
doctor-side login/identity (`PeersPage` is still on its placeholder), and the full `User` model
below is still the design to pick back up if/when that's greenlit — nothing below was
invalidated, just not all of it was needed yet.

**Why this is separate from the data-implementation plan being written alongside it:** that
plan wires `HomePage`'s history chart to real (on-device) data with zero backend or auth
changes. `PeersPage` and `ManagerDashboardPage` are a different order of problem — both are
inherently multi-user, and today there is no `User` model, no auth, and no team/department
concept anywhere in `apps/api/prisma/schema.prisma`. Building either screen for real means
building identity first. This spec is that design; it is deliberately not scheduled yet,
pending the answer to the team's own open question to the challenge organizers (see
`general-documentations/reuniao_07_10.md`, item 8: what's acceptable to mock through the
25/07 final demo vs. what must be real).

---

## 1. Non-negotiables carried forward

Everything in `docs/superpowers/specs/AGENTS.md`'s Golden Rules still applies. Two matter most
here:

- **Anonymity is a product promise, not an implementation detail.** The current app never
  asks for a name, email, or any PII to submit an assessment or talk to the AI. Any identity
  layer added for Peers/Manager must not weaken that promise for the screens that don't need
  it — assessment submission and chat must keep working exactly as they do today, with zero
  identity requirement.
- **k-anonymity (k=5) must be enforced server-side, not client-side.** Today's
  `ManagerDashboardPage` filters `SEGMENTS.filter(s => s.n >= 5)` in the browser, over
  hardcoded data. That pattern is fine for a placeholder but would be a real privacy bug with
  live data: the server would have to *send* every segment (including `n < 5` ones) for the
  client to filter, meaning a below-threshold segment — and the small number of individuals in
  it — leaks over the network to anyone who opens devtools. The real aggregation endpoint must
  never emit a segment below threshold in the first place.

## 2. Minimal `User` model

The goal is the smallest identity surface that makes peer availability and team aggregation
possible, not a general-purpose account system.

```prisma
model User {
  id           String   @id @default(cuid())
  pseudonym    String   @unique   // e.g. "Colega · Clínica médica — #4F2A" — display-only, never a real name
  department   String             // free text at PoC stage: "Clínica médica", "UTI", "Pronto-socorro", etc.
  role         Role     @default(COLLABORATOR)
  createdAt    DateTime @default(now())

  @@map("users")
}

enum Role {
  COLLABORATOR
  MANAGER
}
```

Deliberately excluded: name, email, phone, any field that could re-identify someone outside
the app. `department` is the only grouping key `ManagerDashboardPage`'s aggregation needs.
`pseudonym` is what `PeersPage` already renders today (`"Colega · Clínica médica"`) — this
model just gives that string a real row to come from, generated server-side at signup, never
user-editable to a real name.

## 3. Auth: magic-link, org-email-gated, no password

Recommended over a password (one less credential to leak, one less "forgot password" flow to
build) and over full SSO (real integration work this PoC doesn't need yet):

1. User enters a work email at an institution-gated allowlist (e.g. `*@hospital-parceiro.org`,
   configured per deployment).
2. Backend emails a short-lived (15 min) signed link. No account exists yet — clicking the link
   creates the `User` row (if the email's local-part hash doesn't already map to one) and
   issues a session.
3. The email address itself is **never stored** — only `sha256(email)` for the "does this
   email already have an account" check, so even a database breach can't recover who's who.
   Department is asked once at first login (free-text or a fixed picklist, PoC's choice) and
   is the only thing that persists.
4. Session: a signed, httpOnly cookie (or a bearer token if the SPA needs cross-origin calls)
   scoped to `userId` only — no PII in the token payload.

This keeps the "anonymous by design" promise: the *institution* can gate who signs up (so
`ManagerDashboardPage` only aggregates real colleagues), but nothing in the data model ties a
`User` row back to a legal name.

## 4. `ManagerDashboardPage` aggregation endpoint

```
GET /api/manager/signals
```

Response shape (replaces the hardcoded `SEGMENTS` array and the two hardcoded KPI numbers):

```ts
interface ManagerSignalsResponse {
  overallBurnoutSignalRate: number; // 0-1, e.g. 0.41 for the current "41%"
  checkInsLast4Weeks: number;       // e.g. 111
  segments: { label: string; value: number; n: number }[]; // ONLY segments with n >= 5
}
```

Server-side query, sketched (Prisma-shaped, not final SQL):

```ts
// For each department: count(distinct users who submitted >=1 assessment in the window)
// as n, and (count(assessments with riskSignal-equivalent aggregate) / n) as value.
// Departments with n < 5 are dropped BEFORE the response is built — never serialized.
const rows = await prisma.$queryRaw<{ department: string; n: number; value: number }[]>`
  SELECT department, COUNT(DISTINCT user_id) AS n, ...
  FROM assessments JOIN users ON ...
  GROUP BY department
  HAVING COUNT(DISTINCT user_id) >= 5
`;
```

The exact aggregate `value` computation (e.g. "% of check-ins with `riskSignal = true`" vs.
"average score normalized to band") is a product decision the current placeholder doesn't
resolve either — flag it to whoever picks this plan up, don't invent an answer here.

This requires `Assessment` to carry a `userId` (nullable, since anonymous submission stays the
default — a user only gets attributed if they're logged in for the manager-visible aggregate
to include them):

```prisma
model Assessment {
  id         String   @id
  userId     String?  // NEW — nullable, only set for logged-in submissions
  scaleType  String
  capturedAt DateTime
  ciphertext String
  createdAt  DateTime @default(now())

  @@map("assessments")
}
```

`riskSignal` still never crosses the network as part of the assessment payload (unchanged,
Golden Rule #1) — the aggregation endpoint above computes its own server-side signal from
whatever the institution defines as a "concerning" submission, which is a separate,
institution-configured rule, not the client's on-device `riskSignal` flag re-purposed.

## 5. `PeersPage` matching endpoint

```
GET  /api/peers/available     → { id, pseudonym, department, status: "available" | "busy", respondsInMinutes? }[]
POST /api/peers/:id/connect   → { conversationId: string }   // hands off into the existing ChatPage/useChatConversation flow
```

`status`/`respondsInMinutes` need *some* presence signal — simplest PoC version is "logged in
within the last N minutes" rather than building real-time presence (websockets, heartbeats).
That's a scope call for whoever implements this, not resolved here.

`POST /connect` reuses the existing chat infrastructure (`useChatConversation`,
`sendChatMessageUseCase`) rather than building a second messaging system — the conversation
just has two human participants instead of one human and the AI. This is the biggest open
design question in this whole spec (routing a conversation to a human vs. the AI provider) and
deserves its own follow-up spec before anyone starts implementing it.

## 6. What this spec does NOT decide

- Whether `department` is free-text or a fixed picklist tied to the institution's real org
  chart.
- The exact `value` metric for the manager aggregate (see §4).
- Real-time presence for Peers vs. a simpler polling/last-seen approximation.
- Whether `MANAGER` role assignment happens via an admin allowlist, a manual DB flag, or a
  self-service flow — `ManagerDashboardPage`'s existing `// TODO(auth): gate behind manager
  role before production` comment is exactly the gap this would close, but the mechanism isn't
  chosen yet.

Each of these is a real product decision, not an engineering detail — resolve them with the
person who owns the PoC before writing the implementation plan for Peers or Manager.
