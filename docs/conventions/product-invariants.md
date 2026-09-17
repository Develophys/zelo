# Product invariants — crisis reachability, k-anonymity, tone guard, notification types, and on-device risk scoring

This is a mental-health product for doctors. The five rules below aren't style
preferences — each one protects either a person in crisis or the privacy of someone who
disclosed something at 3am. Two different kinds of source feed this file: the k-anonymity
section and the riskSignal/on-device-scoring section come from the security-privacy domain
audit (k-anonymity carries a **correction** — the original audit had the mechanism backwards,
see below). Crisis reachability, the tone guard, and the `NotificationType` contract have no
audit behind them at all — a completeness pass flagged them as missing coverage, and everything
in those three sections was re-derived by reading the code fresh. Treat every file:line citation
as the thing to re-check, not a summary to trust.

## 1. Crisis reachability

The invariant, in the exact words of the enforcement test's own docblock
(`apps/web/src/presentation/pages/crisis-call-reachability.test.tsx:11-12`):

> Every screen where someone is reaching for a person must put the line one tap from a dialer.

The same docblock explains why it's one cross-route sweep instead of per-page assertions:
"so a new such screen cannot ship with the number as plain text to memorise" (:12-13). It also
explains why `PeersPage` is on the list alongside the three crisis-flow pages, not just an
afterthought: "the other place a doctor goes looking for a human: a search that finds nobody at
03:40 leaves them exactly where the crisis screens do" (:15-17).

The list a new such screen must be added to is `CRISIS_SCREENS`
(`crisis-call-reachability.test.tsx:19-24`), currently four entries: `CrisisOfferPage`
(`/crisis`), `CrisisAcceptPage` (`/crisis/connect`), `CrisisDeclinePage` (`/crisis/line`), and
`PeersPage` (`/peers`). The test renders each one inside a `MemoryRouter` and asserts at least
one `role="link"` element has an `href` starting with `tel:`, and that the first such link is
exactly `tel:188` (:34-39).

**This is the only place the invariant is enforced.** There is no lint rule, no shared
component that every crisis-adjacent screen is forced to render, no CI grep — just this one
`describe.each` sweep. A new screen where someone is reaching for a person (a future
"escalate now" surface, say) that isn't added to `CRISIS_SCREENS` gets zero coverage and fails
silently: nothing else in the codebase will catch a missing dialable line.

The number itself isn't hardcoded per screen — it's sourced through
`apps/web/src/presentation/lib/crisis-line.ts`, which calls
`requestHumanHandoffUseCase.execute()` and reads `externalCrisisLine: { label: "CVV - Centro de
Valorização da Vida", phone: "188" }` (`apps/web/src/use-cases/request-human-handoff.usecase.ts:19`).
`getCrisisLine()` derives `telHref` as `` `tel:${externalCrisisLine.phone}` `` (`crisis-line.ts:18`)
and a short label by splitting the PT-BR label on `" - "` (`crisis-line.ts:12`), so the visible
call-to-action text across these screens reads "Ligar para o CVV" with the full name
("CVV - Centro de Valorização da Vida") available where a longer label fits. Don't hand-type
`tel:188` or the CVV name into a new screen — go through `getCrisisLine()` so the single source
of truth stays single.

## 2. K-anonymity

**Corrected rule** (the original audit stated this backwards): import `K_ANONYMITY_THRESHOLD`
(`apps/api/src/modules/manager/application/constants.ts:1`, value `5`) for every visibility
decision, never hardcode `5`. Suppression is a **per-sector** decision, made **once** against a
single reference week — not a per-datapoint filter re-applied to every number that goes out.

**The wrong version, stated explicitly because it's the one an AI would plausibly "fix" its way
into:** do NOT re-apply the k-anonymity threshold to every individual data point before it goes
into a response (e.g. "only include a `weeklyTrend` entry if `checkIns >= 5`", or "blank out any
field where the underlying count is under 5"). This looks like the safer, more conservative
interpretation — checking the threshold more often can't hurt, right? It's not safer, and it
breaks the feature: a trend chart for a sector that's been visible for months would have holes
torn out of it every time a slow week dipped under 5 check-ins, even though that sector's
identity and current numbers are already known to the manager viewing it. Re-checking per
datapoint doesn't add privacy (the sector's numbers are already on screen elsewhere on the
same response) — it just makes the dashboard unreadable.

**The actual mechanism** (`apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts`):

1. A single **reference week** is chosen by walking backward from the most recent week that has
   any rows, stopping at the newest week in which *at least one* sector's check-in count clears
   the threshold (`referenceWeek()`, :39-56). The comment at :83-93 explains why the literal
   newest week can't be used directly: a week still in progress is partial by definition, so
   anchoring to it would suppress every sector at once at the start of every week.
2. Against that one reference week, each sector is marked visible or not — once, for the whole
   response — building `visibleSectorIds` (:106-116).
3. Every aggregate in the response — `segments`, `overallConcerningRate`,
   `checkInsLast4Weeks`/`abandonedLast4Weeks`/`unsentChatDraftsLast4Weeks`, `followUpTotals`, and
   `weeklyTrend` — is computed by filtering rows down to `visibleSectorIds` first (`visibleRows`
   at :148) and never re-checks the threshold again per week or per field.
4. The response interface's own doc comment states the consequence directly (:16-21, quoted text
   at :19-20): "a visible sector contributes every week it has rows for, including weeks newer
   than this one that never cleared k on their own." **A `weeklyTrend` point showing `checkIns < 5` for an already-visible
   sector is correct behavior, not a leak** — the sector's identity was already established by
   step 2, and the trend line exists to show the sector's real trajectory, including its slow
   weeks.
5. `sectorCoverage.total` is deliberately `sectorIds.length` (the query scope), not
   `bySector.size` (:188-192) — using the count of sectors that *have rows* would itself leak
   whether a suppressed sector has any activity at all, which is exactly the information
   suppression exists to hide.

There is a second importer of `K_ANONYMITY_THRESHOLD` —
`apps/api/src/modules/signal-checkin/application/use-cases/record-signal-checkin.use-case.ts`
— but it's a different kind of check: an equality test (`=== K_ANONYMITY_THRESHOLD`) that fires
a `SECTOR_BECAME_VISIBLE` notification the moment a sector crosses the line, not a suppression
decision. Don't conflate the two call sites.

## 3. Tone guard

`apps/api/src/modules/chat/application/tone/guard-tone.ts` streams the LLM's reply through
`runAttempt`, which buffers tokens until the first sentence boundary (or `OPENING_CAP = 120`
characters, whichever comes first, :6,48-52) and checks that opening against
`matchOpeningTell()` (`tone-tells.ts`, a list of PT-BR cliché openers — "entendo que", "sinto
muito", "como uma IA", etc.). The first attempt runs in `"enforce"` mode: a matched cliché opener
aborts the stream and the reply is regenerated once with a nudge built from the rejected opening
(`context.buildNudge(rejectedOpening)`, `guardTone`:132-141). The retry runs in `"report"` mode:
if the opener is still a cliché the second time, the guard no longer rejects it — it only
reports it. `ToneRule` is a closed union of four members: `opening_cliche_regenerated`,
`opening_cliche_persisted`, `rhetorical_reframe` (a "not X, but Y" reframe caught mid-stream by
`classifyClosingTic`), and `trailing_question` (a closing question detected — not suppressed —
when `shouldAllowTrailingQuestion` says this conversation shouldn't end on one; like
`rhetorical_reframe`, this is report-only via `onTell`, `guard-tone.ts:101-103` — the question
itself is still yielded to the stream unconditionally right after, :105-106). If
`context.hasActiveRiskSignal` is true, the whole
guard is bypassed and the raw reply streams through unmodified (`guardTone`:117-120) — see
§5 below for why that branch is currently unreachable in production.

**The one behavioral rule that matters for anyone touching this file:** `onTell` takes only a
`rule: ToneRule` — a label from the four-member union above — never the sentence or message
content that triggered it. The single production caller logs exactly that:
`` this.logger.log(`tone_guard rule=${rule}`) `` at
`apps/api/src/modules/chat/application/use-cases/send-chat-message.use-case.ts:102`. Don't widen
`onTell`'s signature to pass the offending text "for debugging" — that would put a doctor's chat
content into the log stream, which is exactly what the logging convention this codebase already
holds (event names/ids/counts, never message content) forbids.

## 4. `NotificationType` five-way contract

Adding a notification type touches **five places that must move together, plus a Prisma
migration** — do all five in the same change:

1. **The Prisma enum** — `apps/api/prisma/schema.prisma:148-156`, `enum NotificationType` (7
   members today: `INVITE_ACCEPTED`, `INVITE_EXPIRED`, `INVITE_EMAIL_FAILED`,
   `ACCOUNT_DEACTIVATED`, `ACCOUNT_REACTIVATED`, `SECTOR_BECAME_VISIBLE`,
   `SECTOR_RISK_THRESHOLD`).
2. **The TS union in the API's notification port** —
   `apps/api/src/modules/notification/application/ports/notification.port.ts:5-12`. Its own
   comment admits the arrangement (:1-4): "A TS union rather than the Prisma enum: files under
   `application/` must not import from generated/prisma (lint:boundaries enforces this). The
   Prisma enum in schema.prisma mirrors this list — they are kept in step by hand, the same way
   `ManagerRole` already is."
3. **`MANAGER_NOTIFICATION_TYPES`** — `apps/web/src/ports/manager-notifications.port.ts:3-11`,
   the `as const` array the frontend's `z.enum(...)` validates incoming notifications against.
4. **The label map and the copy switch**, both in
   `apps/web/src/presentation/pages/manager-notification-copy.ts` — `NOTIFICATION_TYPE_LABEL`
   (:6-14) and the `switch (notification.type)` inside `notificationCopy()` (:60-91). Both are
   typed against `ManagerNotification["type"]`, which TypeScript infers from
   `MANAGER_NOTIFICATION_TYPES` (place 3) via `z.enum(...)` — so *once place 3 has been updated*,
   forgetting either of these two does fail the build: `NOTIFICATION_TYPE_LABEL` is a
   `Record<ManagerNotification["type"], string>` (a missing key is a compile error), and the
   `switch` has no `default` case with an explicit non-`undefined` return type, so an unhandled
   member trips TS2366 ("Function lacks ending return statement") rather than silently falling
   through.
5. **`GOOD_NEWS_TYPES`** — `apps/web/src/presentation/pages/ManagerNotificationsPage.tsx:18`, the
   `Set<string>` that decides whether an unread row gets the "good news" (brand-colored) treatment
   or the default one. Unlike 4, this one is untyped — a plain `Set<string>`, not a `Set` keyed off
   `ManagerNotification["type"]` — so forgetting to add a new type here compiles and deploys fine;
   the new type just silently never gets the good-news treatment. (The adjacent `RESENDABLE_TYPES`
   set at :19 is a similar hand-kept, untyped list, but it's a UI affordance rather than part of
   this five-way contract — worth knowing it exists if you're already in this file, not one of the
   five you must touch.)

**Nothing enforces the contract as a whole staying in sync.** TypeScript only checks *within*
the frontend, and only once place 3 has already been updated — it catches a forgotten label or
switch case (place 4), but not a forgotten `GOOD_NEWS_TYPES` entry (place 5, untyped) and, more
importantly, not the two links that actually cross a deploy boundary: the Prisma enum (place 1)
and the backend TS union (place 2) are "kept in step by hand" per that file's own comment, and
the frontend's `MANAGER_NOTIFICATION_TYPES` (place 3) has no compile-time or runtime link back to
either — it's a separately-deployed app reading JSON over HTTP. A type added to the Prisma enum
and the backend union but never added to `MANAGER_NOTIFICATION_TYPES` will compile and deploy
fine on both sides; the frontend finds out only when that notification actually ships —
`ManagerNotificationsPageSchema.parse(...)` (`http-manager-notifications.adapter.ts:32`) uses
`.parse()`, not `.safeParse()`, so one unrecognized `type` in the page throws and fails the
*whole* page fetch, not just that row — with nothing before that catching the mismatch.

## 5. `riskSignal` and on-device scoring

Two invariants govern the assessment pipeline, both centered on `riskSignal` — the crisis flag
derived from a PHQ-9 item 9 answer — never reaching the server. First: assessments are scored
on-device through `ScoreAssessmentUseCase` and encrypted through the injected
`EncryptAssessmentUseCase` (which sits behind `EncryptionPort`, implemented by
`WebCryptoEncryptionAdapter` — AES-256-GCM, key generated per device and persisted only in
IndexedDB) before any submit; raw answers are never POSTed for server-side scoring. Second,
and the one this file is for: `riskSignal` itself never crosses the wire, enforced at two
independent points. On the frontend, `SubmitAssessmentUseCase.execute()` builds the outbound
payload as an explicit four-field object literal — `{ id, scaleType, capturedAt, ciphertext }`
— rather than spreading the local `record`, so `riskSignal` (which lives only on that local
`AssessmentRecord`) is never constructed into the request in the first place
(`apps/web/src/use-cases/submit-assessment.usecase.ts:45-52`, with the file's own comment at
:45-46 stating the same thing). On the backend, even a buggy or
malicious client that did send a `riskSignal` field would have it silently dropped: the
controller runs `AssessmentSchema.safeParse(body)`
(`apps/api/src/modules/assessment/infrastructure/assessment.controller.ts:12`) against a schema
that has no `riskSignal` field (`packages/domain/src/entities/assessment.ts:28-33`), and Zod's
default object parsing strips unknown keys before anything is persisted — the schema's own doc
comment says so verbatim (:6-17). `riskSignal` is deliberately typed only on
`AssessmentRecord` (`apps/web/src/domain/assessment-record.ts:9-11`, extending the shared
`Assessment` type from `@zelo/domain`) — don't hoist it into the shared package "to deduplicate
the type"; the shared package *is* the wire contract, and widening it would widen what the
schema allows through.

This is why the tone guard's `hasActiveRiskSignal` bypass (§3) is currently dead code in
production: the only caller hardcodes it to `false`, with the comment explaining real
risk-signal detection is a separate, not-yet-built feature
(`apps/web/src/presentation/pages/ChatPage/ChatPage.tsx:185-187`). Don't wire a device's
`riskSignal` into `hasActiveRiskSignal` as a quick way to "finish" that feature — that would push
PHQ-9 item 9 across the network under the guise of a bug fix, breaking the exact invariant this
section documents.
