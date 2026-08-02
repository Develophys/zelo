# Routing & State

How screens connect, what new routes exist, and the minimal state added. Router is
`react-router` v6 data router (`createBrowserRouter` in `src/app/router.tsx`). State is Zustand
(see existing `src/stores/ui.store.ts`) + local component state. **No new global data store for
assessment answers** — the answer array lives in the assessment page component and is handed to
the existing use-cases on submit.

---

## 1. Route table (replace the `children` array in `router.tsx`)

| Path | Component | Notes |
|---|---|---|
| `/` | `SplashPage` | First-run entry; redirects to `/home` if consent already given |
| `/privacy` | `PrivacyPage` | Onboarding step 2 |
| `/consent` | `ConsentPage` | Writes consent, then → `/home` |
| `/home` | `HomePage` | Authenticated hub (replaces current index scaffold) |
| `/assessment` | `AssessmentSelectPage` | Scale picker |
| `/assessment/phq9` | `Phq9AssessmentPage` | One-question-per-screen flow |
| `/assessment/gad7` | `Gad7AssessmentPage` | Same pattern |
| `/assessment/result` | `AssessmentResultPage` | Reads result from router `state` (see §3) |
| `/crisis` | `CrisisOfferPage` | Reachable from result & chat |
| `/crisis/connect` | `CrisisAcceptPage` | Ephemeral-token connect flow |
| `/crisis/line` | `CrisisDeclinePage` | CVV 188 |
| `/chat` | `ChatPage` | Existing; restyled |
| `/peers` | `PeersPage` | Anonymous peer list |
| `/manager/login` | `ManagerLoginPage` | Individual manager-account gate for the manager dashboard (see §5) |
| `/manager` | `ManagerDashboardPage` | Aggregated, k-anonymized; gated by `/manager/login`'s session (see §5) |
| `/manager/history` | `ManagerInsightHistoryPage` | Past AI-generated analyses, newest first; each downloadable as PDF or plain text (see `2026-07-12-manager-insight-history-design.md`) |
| `/you` | `YouPage` | Consent status + revoke; institution-link status + entry point (see below); added after the original 13 (see `screens/15-you.md`) |
| `/you/link` | `LinkInstitutionPage` | Optional invite-code → department linking flow, gated by consent like `/you`/`/home`; added by `2026-08-02-multi-institution-data-partitioning-design.md` (see `screens/16-link-institution.md`) |

> Keep the current data-router shape (`id: "root"`, `Component: () => <Outlet/>`). Add a
> loader on `/` that checks the consent store and `redirect("/home")` if already consented.

### Nav graph (happy path)
```
Splash → Privacy → Consent → Home
Home → Assessment(select) → PHQ-9(q1..q9) → Result
Result → Chat            (default next step)
Result → Crisis          (only when riskSignal, or user taps)
Chat → Crisis            (persistent "falar com uma pessoa real")
Crisis → Crisis/connect  (accept)  → Chat (secure)
Crisis → Crisis/line     (decline) → Home
Home → Chat | Peers | Manager | Você
Home → Você/Link      (banner CTA, shown only while no institution is linked)
Você → Splash        (after "Sim, revogar")
Você → Você/Link      (entry point, shown only while no institution is linked)
Você/Link → Você      (after linking, or via back button before completing)
Manager → Manager/login (if no valid session) → Manager (on correct name+password)
```

---

## 2. Consent store — `src/stores/consent.store.ts` (new)

Mirror the style of `ui.store.ts`. Persist to `localStorage` so warm starts skip onboarding.

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ConsentState {
  hasConsented: boolean;
  consentedAt: string | null;
  grant: () => void;
  revoke: () => void;
}

export const useConsentStore = create<ConsentState>()(
  persist(
    (set) => ({
      hasConsented: false,
      consentedAt: null,
      grant: () => set({ hasConsented: true, consentedAt: new Date().toISOString() }),
      revoke: () => set({ hasConsented: false, consentedAt: null }),
    }),
    { name: "zelo.consent" },
  ),
);
```
- **Do not** store anything identifying here. Consent is a boolean + timestamp only.
- `revoke()` is surfaced on `/you` (`YouPage`, added after the original 13 — see
  `screens/15-you.md`), the screen `BottomNav`'s "Você" tab links to.

---

## 3. Passing the assessment result forward

The result screen must NOT recompute or refetch. Pass the computed result via router navigation
state when leaving the question flow:

```ts
// at end of PHQ-9 flow, after ScoreAssessmentUseCase via useSubmitAssessment:
navigate("/assessment/result", {
  state: {
    scaleType: "PHQ-9",
    totalScore,     // number
    max: 27,
    riskSignal,     // boolean — for UI branching ONLY, never sent to backend
  },
});
```
`AssessmentResultPage` reads `useLocation().state`. If `state` is null (deep link / refresh),
redirect to `/assessment`.

> `riskSignal` in router state is fine — it never crosses the network. The **submit** payload is
> produced by `SubmitAssessmentUseCase`, which already excludes it.

---

## 4. Navigation helper (optional but recommended)

Add a tiny typed helper so screens don't sprinkle string paths:

```ts
// src/presentation/lib/routes.ts
export const routes = {
  splash: "/", privacy: "/privacy", consent: "/consent", home: "/home",
  assessment: "/assessment", phq9: "/assessment/phq9", gad7: "/assessment/gad7",
  result: "/assessment/result", crisis: "/crisis", crisisConnect: "/crisis/connect",
  crisisLine: "/crisis/line", chat: "/chat", peers: "/peers", manager: "/manager",
  managerLogin: "/manager/login", managerHistory: "/manager/history", you: "/you",
  linkInstitution: "/you/link",
} as const;
```

---

## 5. Authentication: two different models, on purpose

Zelo has **two completely separate notions of "logged in," never one shared login system.**
This is a deliberate design choice, not an oversight — the two audiences have opposite
requirements.

### Doctors (common users): no login, ever

A doctor never creates an account, never enters a password, never proves who they are to this
app. The only gate is **consent** — `useConsentStore` (§2 above), a boolean + timestamp in
`localStorage`. There is no server-side session, no identity token, nothing that could later be
used to tie a person to their check-ins. This isn't a missing feature; it's the product's core
privacy promise (Golden rule #6 in `AGENTS.md`: "Anonymity is visible, not just real"). A future
"real" version of `PeersPage` would need *some* identity concept for peer matching — that design
exists (`identity-and-aggregation.md`) but is deliberately unbuilt, pending a product decision
about how much of the demo can stay mocked.

### Managers: a real, server-enforced login

`ManagerDashboardPage` shows aggregated trends *about* doctors — a fundamentally different kind
of surface, so it gets a fundamentally different gate: a real login that the backend actually
enforces, not just a client-side redirect a curious user could bypass by editing localStorage.

- **`ManagerLoginPage`** (`/manager/login`) collects individual manager credentials — name and
  password, one account per manager, not a single shared institutional code (see
  `2026-08-01-manager-individual-accounts-design.md` for the original design) — and calls
  `POST /manager/login` with `{ name, password }`. Every `Manager` row now also carries an
  `institutionId`, and the signed session token embeds it alongside `id`/`name`: real
  multi-institution partitioning, not just individual accounts within one institution, per
  `2026-08-02-multi-institution-data-partitioning-design.md` — a manager from one hospital can
  never see another hospital's signals or insight history.
- The backend looks up the `Manager` row by `name` and verifies `password` against its stored
  scrypt hash via `ManagerPasswordService`, always performing the real hash-and-compare even
  when `name` doesn't match any account — this prevents a timing side-channel that could
  otherwise reveal whether a given name has an account. Either an unknown name or a wrong
  password throws the same `InvalidManagerCredentialsError` → `401`. On success the backend
  issues an **HMAC-SHA256-signed opaque token** (8-hour expiry) carrying the authenticated
  manager's `id`/`name` in its JSON payload — not a JWT library, just `node:crypto`
  (`manager-token.service.ts`).
- The frontend stores `{ token, expiresAt }` in **`sessionStorage`** (`useManagerSessionStore`,
  `apps/web/src/stores/manager-session.store.ts`) — deliberately not `localStorage`: a manager
  session is meant to end when the tab/browser closes, unlike a doctor's consent which should
  persist.
- The `/manager` route carries a `loader` (same idiom as the `/` splash route's consent check
  above) that redirects to `/manager/login` if `useManagerSessionStore.getState().isValid()` is
  false — checked both before the page ever renders (the loader) and again if a call to
  `GET /manager/signals` comes back `401` mid-session (token expired while the tab was open).
- Every request to `GET /manager/signals` carries the token as a `Bearer` header and is
  rejected server-side by `ManagerAuthGuard` if it's missing, malformed, expired, or doesn't
  verify — the redirect on the frontend is a UX convenience, **not** the actual security
  boundary. The boundary is server-side, always.

### Why the asymmetry is correct, not inconsistent

A doctor's anonymity is the thing being protected — adding a login would work *against* the
product's purpose. A manager viewing aggregate data about doctors is the opposite case: here,
keeping an unauthorized party *out* is the whole point. This holds regardless of whether the
data behind the gate is simulated or real: the manager dashboard structurally cannot read a
doctor's individual assessment anyway (`Assessment.ciphertext` is end-to-end encrypted; the
server never holds a key that can decrypt it — see
`2026-07-11-manager-login-simulated-dashboard-design.md` §1). What changed since that spec was
written: the dashboard's *aggregate* numbers are no longer 100% synthetic seed data for every
institution — `2026-08-02-multi-institution-data-partitioning-design.md` added a real,
k-anonymous, deduplicated signal pipeline (`POST /signals/checkin`, fired by a médico's device
after an optional institution link) that feeds real `Signal` counters alongside the still-seeded
demo institution's fabricated ones. The login's job is unchanged either way: gate *who* can see
the aggregate, real or simulated.

---

## Acceptance criteria
- Cold start (no `zelo.consent`) lands on Splash; completing consent routes to Home and sets the
  store; reload now lands on Home directly.
- `/assessment/result` with no navigation state redirects to `/assessment` (no crash).
- Back button behaves: within PHQ-9 it steps to the previous question; at q1 it returns to the
  selector.
- No route change ever posts `riskSignal` to the API (verify in network tab).
- Revoking consent on `/you` clears `zelo.consent` in `localStorage` and lands the doctor back
  on Splash as a cold start (verified via reload, not just React state — see `screens/15-you.md`).
- `/you/link` redirects to `/privacy` the same way `/you`/`/home` do when consent hasn't been
  given; linking never blocks self-assessment or chat for a doctor who skips or backs out of it.
