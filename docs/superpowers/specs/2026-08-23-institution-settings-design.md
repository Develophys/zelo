# Institution Settings

**Date:** 2026-08-23

## Problem

Every number the product reasons with is a constant compiled into the code:

| Value | Where | Applied |
|---|---|---|
| `K_ANONYMITY_THRESHOLD = 5` | `apps/api` | server |
| `CONCERNING_SCORE_THRESHOLD = 9` | `apps/web` | **client** |
| PHQ-9 ceilings `4/9/14/19` · GAD-7 `4/9/14` | `apps/web` | **client** |
| `RECENT_WEEKS_FOR_VOLUME = 4` | `apps/api` | server |
| `SET_PASSWORD_TOKEN_TTL_MS = 48h` | `apps/api` | server |
| Risk thresholds `0.4 / 10 / 0.15` | `apps/api` | server |

A hospital cannot say "for us, ten check-ins is the volume that matters" or "notify us at 35%,
not 40%" without a code change and a deploy. This spec makes those values per-institution data.

It also closes a documented drift. `identity-and-aggregation.md` §4 already specified that the
aggregation signal comes "from whatever **the institution defines** as a 'concerning'
submission". What shipped is a hardcoded constant evaluated in the browser. This spec restores
the intent without giving up the privacy property that made the client-side evaluation
attractive in the first place.

## Scope

**In scope.** One settings record per institution, edited by `HOSPITAL_ADMIN` on
`/manager/settings`, covering every value in the table above plus which notification families
are enabled.

**Out of scope.**

- **A system-wide base layer edited by `SuperAdmin`.** Considered and deferred: the floors stay
  hardcoded, so there is nothing a Zelo operator needs to set per-deployment yet. When it
  arrives it slots above this layer — `InstitutionSettings` defaults become seeded from it
  rather than from constants, and the clamp reads it instead of the code.
- **Retroactive recomputation.** Changing a criterion never rewrites stored aggregates. See
  "Historical integrity".
- **Per-sector settings.** The institution is the unit.

## Two layers, and why the clinical one is clamped

The values split cleanly by who is entitled to move them and in which direction.

**Operational** — `riskRateThreshold`, `riskMinCheckIns`, `riskDeltaThreshold`,
`trendWindowWeeks`, `inviteTtlHours`, `enabledNotificationFamilies`. These describe *when to
tell someone*, not *how to measure*. Free within a sane range.

**Clinical** — `kAnonymityThreshold`, `concerningScore`, `phq9Cutoffs`, `gad7Cutoffs`. These
define what the measurement means, and the party editing them is the party being measured.
They are clamped so an institution can only ever be **more** conservative than the default,
never less:

```text
kAnonymityThreshold  >= 5
concerningScore      >= 9
phq9Cutoffs          >= [4, 9, 14, 19]   element-wise, strictly increasing, length 4
gad7Cutoffs          >= [4, 9, 14]       element-wise, strictly increasing, length 3
```

**Why that direction and not the other.** Lowering `kAnonymityThreshold` below 5 would let a
hospital admin view a segment small enough to re-identify the people in it — and the panel
tells every respondent that segments under five responses stay hidden. Lowering the clinical
cutoffs would silently redefine what "Moderadamente grave" means on the *doctor's own* result
screen, and detach the number from the literature the settings screen cites. Raising them has
the opposite character: the doctor is told the more concerning of two readings, which is the
safe error for a mental-health tool to make.

Ranges for the operational values:

```text
riskRateThreshold    0.10 .. 1.00
riskDeltaThreshold   0.05 .. 1.00
riskMinCheckIns      >= kAnonymityThreshold      (cross-field)
trendWindowWeeks     2 .. 52
inviteTtlHours       1 .. 720
```

`riskMinCheckIns >= kAnonymityThreshold` is a real invariant, not a formality: a risk alert
about a segment too small to display would name a sector the recipient cannot open.

## Data model

```prisma
model InstitutionSettings {
  id            String      @id @default(cuid())
  institutionId String      @unique
  institution   Institution @relation(fields: [institutionId], references: [id], onDelete: Cascade)

  // Clinical — clamped, effective from the next ISO week
  kAnonymityThreshold Int   @default(5)
  concerningScore     Int   @default(9)
  phq9Cutoffs         Int[] @default([4, 9, 14, 19])
  gad7Cutoffs         Int[] @default([4, 9, 14])
  clinicalVersion     Int   @default(1)

  // Operational — effective immediately
  riskRateThreshold           Float    @default(0.4)
  riskMinCheckIns             Int      @default(10)
  riskDeltaThreshold          Float    @default(0.15)
  trendWindowWeeks            Int      @default(4)
  inviteTtlHours              Int      @default(48)
  enabledNotificationFamilies String[] @default(["account", "signals", "operations"])

  updatedAt DateTime @updatedAt

  @@map("institution_settings")
}

model InstitutionSettingsChange {
  id              String      @id @default(cuid())
  institutionId   String
  institution     Institution @relation(fields: [institutionId], references: [id], onDelete: Cascade)
  changedByManagerId String
  changedAt       DateTime    @default(now())
  effectiveFrom   DateTime
  isClinical      Boolean
  clinicalVersion Int?
  diff            Json        // { field: { from, to } }

  @@index([institutionId, effectiveFrom])
  @@map("institution_settings_changes")
}
```

`Signal` gains `clinicalVersion Int @default(1)` — which criterion produced that week's counts.

The change log is not ceremony. It is the data source for the trend-chart annotation below, so
it earns its place before anyone asks for an audit trail.

## Effective-from semantics

**Operational changes apply immediately.** They affect only future notifications and how the
panel displays things; no stored aggregate depends on them.

**Clinical changes apply from the start of the next ISO week** (`startOfIsoWeek(now) + 7d`,
Monday 00:00 UTC), and bump `clinicalVersion`.

The reason is structural, not cautious. A `Signal` row is one weekly aggregate accumulating
check-ins across the week. A criterion change on Wednesday would leave a single row containing
counts measured two different ways, with no way to separate them afterwards. Anchoring to the
week boundary makes every `Signal` row single-criterion **by construction** — the chart
annotation then lands exactly on a row boundary, and no row is ever ambiguous.

The settings screen states the pending change and its date plainly: *"Entra em vigor na
segunda-feira, 31/08."*

## Serving the client

`concerningScore` and the clinical cutoffs are evaluated in the browser today. They stay there.

**The score never leaves the device.** The check-in payload carries `deviceSignalId`; a stream
of raw scores tied to a stable device id, week after week, is a far better fingerprint than a
stream of single bits. Moving the evaluation server-side to get an always-fresh threshold would
buy correctness with re-identification surface, which is the wrong trade for this product. The
assessment itself is stored as `ciphertext` for the same reason.

```http
GET /institution/:id/settings        (no manager session — a linked device has none)
  -> { concerningScore, phq9Cutoffs, gad7Cutoffs, clinicalVersion }
```

Only the **currently effective** values, never a pending change — otherwise a client would
apply a criterion before its week began.

This endpoint is unauthenticated because the device calling it has no session to present: a
doctor's app holds an institution link, not a login. That is acceptable here and only here,
because the response carries nothing private — published clinical cutoffs and a version
number. It must never grow a field that is not already public knowledge. Enumeration reveals
only that an institution id exists, which the link flow already confirms to anyone holding an
invite code. It is rate-limited by the existing global throttler.

```http
POST /signal-checkin
  { institutionId, sectorId, deviceSignalId, concerning, clinicalVersion }
```

The client reports which criterion it used. The server stores it on the `Signal` row. A client
running on a stale cache is therefore visible rather than silent, and the row it contributed to
is still correctly labelled.

**Unlinked devices fall back to the compiled defaults.** A doctor who never linked an
institution has no settings to fetch, and their result screen must still band their score.
`bandFor` takes cutoffs as an argument with the default constants as the fallback — it must not
reach into a store.

**Mixed-version rows.** A week boundary makes these impossible in the normal case, but a stale
client can still post an old `clinicalVersion` into a new week. The first check-in of a week
sets the row's `clinicalVersion`; a later check-in reporting a different one increments a
`mixedCriteriaCount` on the row. Non-zero means the annotation for that week says *"critério em
transição"* rather than asserting a clean boundary. The count is expected to be zero and is
worth alerting on if it is not.

## Historical integrity

Changing a criterion never rewrites stored aggregates. `Signal.concerning` is a count already
computed and committed week by week; recomputing it is impossible without the raw scores, which
by design the server never had.

So the trend chart annotates instead of hiding. Weeks measured under a different
`clinicalVersion` stay in the series, with a vertical marker at the boundary and a note:
*"Critério alterado em 31/08."* The manager sees the whole trend and knows exactly where it
stops being comparable.

The alternative — truncating the series at every change — would make the parameter effectively
unusable, since exercising it would cost the history. Showing the mixed series without a marker
would be worse than both: a drop in the line could be the team improving or the cutoff having
risen, and nothing on screen distinguishes them.

## API contract change

`GetManagerSignalsUseCase` currently returns `checkInsLast4Weeks`, a field name that hardcodes
the very value this spec makes configurable. It becomes:

```ts
interface ManagerSignalsResponse {
  // ...
  checkInsInWindow: number;
  windowWeeks: number;         // so the UI label reads the real window
  criterionChanges: { weekStart: string; changedAt: string }[];   // chart markers
}
```

The dashboard label stops saying "Últimas 4 semanas" and reads `windowWeeks`.

Manager-facing settings endpoints:

```http
GET   /manager/settings   -> current values + pending change + recent changes
PATCH /manager/settings   -> 200 with the stored values, or 422 with per-field violations
```

`HOSPITAL_ADMIN` only; a `SECTOR_MANAGER` gets 403. Validation runs in the domain, not in the
controller, so the clamps hold for any caller.

## The settings screen

`/manager/settings` already carries the appearance preferences from the manager-panel redesign
(accent, density, corners). Those stay client-local — they are one manager's preference, not
the institution's configuration — and gain a second section, visible to `HOSPITAL_ADMIN` only.

**Locked values are shown, not hidden.** Each one displays its current value, its source, and
why it cannot go lower:

> **Mínimo de respostas por segmento — 5**
> Fixo neste mínimo. É a garantia de anonimato que o Zelo faz a quem responde o check-in. Você
> pode exigir mais, nunca menos.
>
> **Cortes do PHQ-9 — 5 / 10 / 15 / 20**
> Kroenke, Spitzer & Williams (2001). Você pode tornar o critério mais conservador, nunca menos.
>
> **Cortes do GAD-7 — 5 / 10 / 15**
> Spitzer, Kroenke, Williams & Löwe (2006).

Cutoffs are **stored** as band ceilings (`[4, 9, 14, 19]`, matching `band-for.ts`) and
**displayed** as thresholds (`5 / 10 / 15 / 20`, matching the literature). The two are the same
statement; the screen uses the form a clinician would recognise.

The section also shows the change log — who changed what, when, and when it took effect.

## Rollout

1. Migration creates `institution_settings` with defaults for every existing institution, so no
   code path ever sees a missing row.
2. `Signal.clinicalVersion` backfills to `1` — every historical row was measured under the
   compiled criterion, which is exactly version 1.
3. The API reads settings; the compiled constants become the seed defaults and the clamp floors,
   and stop being read directly by use cases.
4. The client fetches settings on link and on app start, caching per institution.
5. The settings screen ships last.

## Relationship to the notifications spec

`2026-08-23-manager-notifications-design.md` puts its thresholds in
`modules/notification/application/thresholds.ts` and names it as the single point this spec
replaces. After this lands, that module resolves `riskRateThreshold`, `riskMinCheckIns` and
`riskDeltaThreshold` per institution, and the constants inside it become the clamp floors.
Nothing else in the notification path changes — the sweeps already read through that one module.

`RETENTION_DAYS` stays compiled and does **not** become a setting. How long a read notification
lingers is not something a hospital has a stake in tuning, and making it editable would add a
field whose only effect is data volume. `enabledNotificationFamilies` is the setting that gives
an institution real control over notification noise.

## Testing

- **The clamps, per field, in both directions.** More conservative than default succeeds; less
  conservative is rejected with a per-field violation. Table-driven over every clinical field.
- **The cross-field invariant.** `riskMinCheckIns` below `kAnonymityThreshold` is rejected, and
  raising `kAnonymityThreshold` above the stored `riskMinCheckIns` is rejected too — the pair
  cannot be broken from either side.
- **Cutoff shape.** Non-monotonic, wrong-length and non-integer arrays are rejected.
- **Effective-from.** A clinical change on a Wednesday takes effect the following Monday
  00:00 UTC and not before; an operational change on the same Wednesday takes effect at once.
- **`clinicalVersion` on `Signal`.** The first check-in of a week sets it; a later check-in with
  a different version increments `mixedCriteriaCount` instead of overwriting.
- **Unlinked fallback.** `bandFor` with no institution uses the compiled defaults and never
  throws.
- **Authorisation.** `SECTOR_MANAGER` gets 403 on `PATCH /manager/settings`; a `HOSPITAL_ADMIN`
  patching another institution's settings gets 404.
- **The public endpoint stays public and stays thin.** `GET /institution/:id/settings` answers
  without a session, returns exactly the four documented fields, and returns 404 for an unknown
  institution. A test asserts the response has no additional keys, so a future field cannot be
  added to it by accident.
- **Backfill.** After migration, every institution has a settings row and every `Signal` has
  `clinicalVersion = 1`.
- **Web.** Locked fields render with their source text and no input; a rejected `PATCH` shows
  per-field messages; the pending-change notice states the correct Monday.
