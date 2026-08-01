# Manager dashboard — NR-1/PGR labeling + export (FR-16) — design spec

**Status:** approved design, not yet implemented.

**Relationship to prior decisions:** this spec implements `general-documentations/documentacao-produto/adr-001-fr16-nr1-painel-gestor.md` (status: **Aceito**, 2026-07-11), which became `prd.md` FR-16 and `user-stories.md` US-006 AC-4. The decision was accepted in week 2 of the original 28-day timeline but was never built — the manager dashboard shipped with `docs/superpowers/specs/2026-07-11-manager-login-simulated-dashboard-design.md` and `2026-07-21-manager-dashboard-skeleton-design.md` covering everything else on the page, but FR-16 itself has no code. This spec closes that gap.

This is the first of several "de-demo-ify the manager screen" pendings identified in a 2026-08-01 brainstorm (others — per-manager accounts, insight-history scoping, session-cookie hardening — are separate, larger sub-projects not covered here).

---

## 1. What this is and isn't

Per ADR-001's Decision: a **minimal, honestly-labeled** layer that maps the dashboard's existing aggregate metrics to the psychosocial risk factors NR-1 recognizes (overload, workload/hours, burnout), with a simple CSV/PDF export — explicitly labeled **"insumo para o PGR"** (an input to the employer's risk-management program), never **"certificação de conformidade NR-1"** (a compliance certification).

**Explicitly out of scope** (per ADR-001's rejected Option A and "excluído" list):
- Any per-department mapping to a specific named risk factor (e.g. claiming "UTI = sobrecarga"). That requires a validated methodology (COPSOQ-BR or equivalent) the team doesn't have legal/clinical sign-off for. The three factor names are cited once, generically, as the category this data maps to.
- Any new metric, any new granularity, or any change to the k=5 threshold. This is a presentation/export layer over data the dashboard already fetches — `apps/web/src/ports/manager-signals.port.ts`'s `ManagerSignalsResponse` — nothing new is computed server-side.
- Any claim of guaranteed NR-1 compliance.
- Legal/SST review of the label copy itself (tracked separately in `roadmap/mauricio.md` as still open — this spec ships the honestly-caveated version described in ADR-001's "Neutras" consequence: presentable now, with formal legal validation as a follow-up, not a blocker).

## 2. Frontend: new card on `ManagerDashboardPage.tsx`

Placed below the existing "Sinais por setor" (segments) card, additive only — the segments card itself is untouched (no regression risk to its existing spec/tests in `screens/13-manager.md` and `ManagerDashboardPage.test.tsx`). Rendered only when `!isLoading` (same gating as the rest of the page's data-driven sections); no new skeleton, since this card is static framing copy + buttons rather than a new query.

```
[eyebrow]  Conformidade NR-1
[title]    Insumo para o PGR
[body]     Estes sinais mapeiam fatores de risco psicossocial reconhecidos
           pela NR-1 — sobrecarga, jornada, esgotamento por setor. Isto é
           um insumo para a gestão de risco psicossocial do empregador,
           não uma certificação de conformidade com a NR-1.
[buttons]  [Exportar CSV]  [Exportar PDF]
```

- Both buttons disabled when `segments.length === 0` (nothing meaningful to export).
- "Isto é... não uma certificação..." is rendered with the negation visually emphasized (e.g. bold), matching the ADR's concern that this distinction must not be glossed over.
- No new route. No new store. No new query — reads straight from the same `useManagerSignals()` call already in `ManagerDashboardPage.tsx`.

## 3. Export content

New file `apps/web/src/presentation/lib/download-manager-pgr-report.ts`, mirroring the existing `download-manager-insight.ts` pattern (same `triggerDownload` blob helper; same lazy `import("jspdf")` for the PDF path so `jspdf` stays out of the main bundle).

Both functions take the currently-loaded `ManagerSignalsResponse` plus a `generatedAt: Date` (defaults to `new Date()`) and produce a document with, in order:

1. **Header**: "Insumo para o PGR — Zelo" + generation date (`toLocaleDateString("pt-BR", { year: "numeric", month: "long", day: "numeric" })`, same formatter already used in `download-manager-insight.ts`).
2. **Disclaimer line** (verbatim — the exported artifact is the thing that could end up in front of an auditor or a hospital's SST team, so it carries the same caveat as the on-screen copy, not a shortened version): "Isto é um insumo para a gestão de risco psicossocial do empregador, não uma certificação de conformidade com a NR-1."
3. **Summary**: overall concerning rate (`Math.round(overallConcerningRate * 100)}%`), check-ins last 4 weeks, follow-up response rate (`Math.round(followUpResponseRate * 100)}%`).
4. **Per-department table**: one row per `segments` entry — label, `value`%, `n` — verbatim from the already k=5-filtered array. The export never re-derives, re-aggregates, or adds granularity beyond what's already on screen.

### `downloadPgrReportAsCsv`

- Builds a CSV string: header row, one summary row, one row per segment.
- `Blob` type `text/csv;charset=utf-8`.
- Filename: `pgr-zelo-<YYYY-MM-DD>.csv` (date from `generatedAt`, ISO date portion).

### `downloadPgrReportAsPdf`

- Same jsPDF layout style as `downloadInsightAsPdf` (title, disclaimer, summary lines, then a simple per-department list via `splitTextToSize` + sequential `text` calls).
- Filename: `pgr-zelo-<YYYY-MM-DD>.pdf`.

## 4. Testing

- **`download-manager-pgr-report.test.ts`** — same mocking approach as `download-manager-insight.test.ts`: hoisted `jspdf` mock for the PDF path; `URL.createObjectURL`/`document.createElement` spy for the CSV path. Assertions:
  - Disclaimer text is present in both the CSV content and the PDF's `text`/`splitTextToSize` calls.
  - CSV has the correct MIME type and exactly one row per segment (verified against a fixture with 2-3 segments).
  - PDF writes the disclaimer line and one line per department.
  - Filenames follow the `pgr-zelo-<date>.<ext>` convention.
- **`ManagerDashboardPage.test.tsx`** — extend with:
  - New card renders (disclaimer text visible) once loading resolves.
  - Clicking each export button calls the corresponding `downloadPgrReportAs*` function (mock the module, assert call).
  - Both buttons are `disabled` when the mocked `useManagerSignals()` response has an empty `segments` array.
- No change to `a11y.test.tsx`'s route sweep — no new route.

## 5. Acceptance criteria

- The manager dashboard shows a card labeled "Insumo para o PGR" below the segments card, with the exact disclaimer distinguishing it from a compliance certification.
- "Exportar CSV" and "Exportar PDF" each produce a downloadable file containing: header, disclaimer, summary metrics, and the per-department table — using only data already present in the loaded `ManagerSignalsResponse`.
- No backend changes; no new metrics; no change to the k=5 suppression behavior.
- New tests pass; full `apps/web` test suite and `tsc --noEmit` still pass.
