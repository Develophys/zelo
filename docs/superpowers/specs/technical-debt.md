# Technical debt log

Deliberate, scoped trade-offs taken to hit the hackathon timeline. Each entry
records the decision, why it's safe to defer, and what would make it worth
revisiting. Not a backlog of every shortcut — only debt with a real security,
correctness, or scalability edge.

---

## TD-001: Manager session token in `sessionStorage` + `Authorization: Bearer`, not an `HttpOnly` cookie

- **Date:** 2026-07-12
- **Area:** `apps/web/src/stores/manager-session.store.ts`,
  `apps/api/src/modules/manager/infrastructure/manager-auth.guard.ts`
- **Status:** Accepted, deferred

**Decision.** Manager auth stays as-is: an HMAC-signed opaque token
(`manager-token.service.ts`, 8h expiry, timing-safe verify) issued by
`POST /manager/login`, held client-side in `sessionStorage` (tab-scoped,
cleared on close), sent as `Authorization: Bearer <token>`.

**Risk being accepted.** If an XSS vector is ever introduced (e.g. a future
`dangerouslySetInnerHTML` on manager-facing pages), injected JS can read
`sessionStorage` and exfiltrate the token. React's default escaping closes
this today, but nothing enforces it stays that way.

**Why deferred instead of fixed.** The safer alternative (`HttpOnly; Secure;
SameSite` cookie, never touched by client JS) is not a drop-in swap here
because the frontend (Vercel) and API (Fly.io) are cross-origin
(`apps/api/src/main.ts`). Cross-site cookies require `SameSite=None`, which
removes the CSRF protection cookies are meant to provide — reintroducing a
risk on the other side unless a CSRF token is added too. It also turns the
router guard (`router.tsx:72`, currently a synchronous in-memory
`isValid()` check) into an async `GET /manager/me` round-trip on every
manager-route navigation. Full estimate: ~8 source files + ~9 test files
across `apps/web` and `apps/api` (controller, guard, CORS config, 3 HTTP
adapters, session store, login hook, router loader) — roughly 3-5 hours,
not a quick change.

**Compensating control taken instead.** No `dangerouslySetInnerHTML` (or
equivalent raw-HTML injection) on any manager route. This is the actual
attack vector that matters given the current design; keeping it closed is
cheap and removes most of the practical risk.

**Revisit when:** any of the following becomes true —
- A manager-facing screen needs to render user-supplied or third-party HTML.
- The manager surface handles data more sensitive than aggregate/anonymized
  signals (i.e. the blast radius of a stolen token grows).
- Post-hackathon hardening pass has time budget for the ~3-5h cookie
  migration described above.

## TD-002: Manager insight history is shared across all managers, not per-manager

- **Date:** 2026-07-12
- **Area:** `apps/api/src/modules/manager/application/use-cases/get-manager-insight-history.use-case.ts`,
  `apps/web/src/presentation/pages/ManagerInsightHistoryPage.tsx`
- **Status:** Resolved

**Original decision.** `GET /manager/insights/history` returns every saved `ManagerInsight`
row to any manager who authenticates — there was no per-manager scoping. At the time this was
accepted because manager auth was a single shared institutional code, not individual
accounts, so "revisit when individual manager logins are built" was the stated trigger.

**Resolution.** `2026-08-01-manager-individual-accounts-design.md` (this branch) replaced the
single shared `MANAGER_ACCESS_CODE` with individual named `Manager` accounts (name +
password, scrypt-hashed). That resolves the identity half of this entry's original
"revisit when" trigger — but the history-scoping behavior itself is **unchanged, on purpose**:
`GetManagerInsightHistoryUseCase` still returns every saved insight, unfiltered, to any
authenticated manager. `ManagerInsight` gained a nullable `createdByManagerName` field, but it
is **display-only attribution** ("Gerado por {name}" in `ManagerInsightHistoryPage`), not a
filter key — see the design spec §1 and §3 for why: this PoC still targets a single
institution, so every manager with a valid account represents the same institution, and every
saved insight is already anonymous, k-anonymized aggregate data. Sharing it isn't a privacy
issue, it's the correct behavior for "one institution's history, visible to everyone who
works there" — there is no second institution yet for scoping to protect against.

**Why this closes the entry instead of leaving it deferred.** The original trigger
("individual manager logins are built") has now happened, and the design spec explicitly
evaluated whether to add per-manager filtering at that point and declined to, as a deliberate
scope decision rather than a remaining gap — see
`2026-08-01-manager-individual-accounts-design.md`'s §3 ("Attribution: wired through insight
generation, not through history filtering") and §8 ("Out of scope"). If a second institution
is ever onboarded, insight-history scoping becomes a real requirement again — see that spec's
non-goal note for what that redesign would need (`institutionId` on `Manager`, filtering in
`GetManagerInsightHistoryUseCase`). That would be tracked as new, separate debt at that time,
not a reopening of this entry.
