# Manager Dashboard NR-1/PGR Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a labeling + CSV/PDF export layer (FR-16) to the manager dashboard that maps its existing aggregate signals to NR-1 psychosocial risk factors, honestly framed as a PGR input rather than a compliance certification.

**Architecture:** Pure frontend addition, no backend or data-model changes. A new lib module (`download-manager-pgr-report.ts`) builds CSV/PDF documents from the `ManagerSignalsResponse` the dashboard already fetches via `useManagerSignals()`. A new `Card` on `ManagerDashboardPage.tsx` renders the disclaimer copy and two export buttons wired to that module.

**Tech Stack:** React + TypeScript, Vitest + Testing Library, `jspdf` (already a dependency, lazy-imported).

## Global Constraints

- Disclaimer copy is exact, verbatim, in both the on-screen card and both exported documents: "Isto é um insumo para a gestão de risco psicossocial do empregador, não uma certificação de conformidade com a NR-1."
- No new backend endpoint, no new field on `ManagerSignalsResponse`, no change to the k=5 suppression — this reads only `overallConcerningRate`, `checkInsLast4Weeks`, `followUpResponseRate`, and `segments` from the response the page already has.
- No per-department mapping to a specific named risk factor (e.g. "UTI = sobrecarga"). The three factor names (sobrecarga, jornada, esgotamento por setor) are cited once, generically, never per-row.
- Export filenames: `pgr-zelo-<YYYY-MM-DD>.csv` / `.pdf`, date from `generatedAt.toISOString().slice(0, 10)` (UTC-based, so it's deterministic in tests regardless of local timezone).
- Follow existing patterns exactly: `download-manager-insight.ts`'s `triggerDownload` blob helper and lazy `import("jspdf")`; `ManagerInsightHistoryPage.tsx`'s `Button variant="outline" full={false}` export-button style; test mocking conventions from `download-manager-insight.test.ts` and `ManagerInsightHistoryPage.test.tsx` (`vi.spyOn` on the module namespace import).

---

### Task 1: `download-manager-pgr-report.ts` — CSV/PDF builders

**Files:**
- Create: `apps/web/src/presentation/lib/download-manager-pgr-report.ts`
- Test: `apps/web/src/presentation/lib/download-manager-pgr-report.test.ts`

**Interfaces:**
- Consumes: `ManagerSignalsResponse` from `apps/web/src/ports/manager-signals.port.ts` (`{ overallConcerningRate: number; checkInsLast4Weeks: number; weeklyTrend: {...}[]; segments: { label: string; value: number; n: number }[]; followUpResponseRate: number }`).
- Produces (used by Task 2): `buildPgrCsvLines(data: ManagerSignalsResponse, generatedAt: Date): string[]`, `downloadPgrReportAsCsv(data: ManagerSignalsResponse, generatedAt?: Date): void`, `downloadPgrReportAsPdf(data: ManagerSignalsResponse, generatedAt?: Date): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/presentation/lib/download-manager-pgr-report.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ManagerSignalsResponse } from "@/ports/manager-signals.port";

const { textMock, saveMock, setFontSizeMock, splitTextToSizeMock } = vi.hoisted(() => ({
  textMock: vi.fn(),
  saveMock: vi.fn(),
  setFontSizeMock: vi.fn(),
  splitTextToSizeMock: vi.fn((text: string) => [text]),
}));

vi.mock("jspdf", () => ({
  jsPDF: vi.fn().mockImplementation(() => ({
    text: textMock,
    setFontSize: setFontSizeMock,
    splitTextToSize: splitTextToSizeMock,
    save: saveMock,
  })),
}));

import {
  buildPgrCsvLines,
  downloadPgrReportAsCsv,
  downloadPgrReportAsPdf,
} from "./download-manager-pgr-report";

const DISCLAIMER =
  "Isto é um insumo para a gestão de risco psicossocial do empregador, não uma certificação de conformidade com a NR-1.";

const DATA: ManagerSignalsResponse = {
  overallConcerningRate: 0.41,
  checkInsLast4Weeks: 111,
  weeklyTrend: [],
  segments: [
    { label: "Plantão noturno", value: 52, n: 18 },
    { label: "Pronto-socorro", value: 38, n: 24 },
    { label: "UTI", value: 44, n: 9 },
  ],
  followUpResponseRate: 0.7,
};

const GENERATED_AT = new Date("2026-07-01T00:00:00.000Z");

describe("buildPgrCsvLines", () => {
  it("includes the disclaimer, summary metrics, and one row per segment", () => {
    const lines = buildPgrCsvLines(DATA, GENERATED_AT);

    expect(lines).toContain(DISCLAIMER);
    expect(lines).toContain("Sinais de burnout na equipe,41%");
    expect(lines).toContain("Questionários respondidos (4 semanas),111");
    expect(lines).toContain("Taxa de resposta do follow-up,70%");
    expect(lines).toContain("Plantão noturno,52%,18");
    expect(lines).toContain("Pronto-socorro,38%,24");
    expect(lines).toContain("UTI,44%,9");
  });
});

describe("downloadPgrReportAsCsv", () => {
  it("builds a CSV blob and triggers a download with a date-based filename", () => {
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn();
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    }
    const createObjectURLMock = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    const revokeObjectURLMock = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.fn();
    let capturedAnchor: HTMLAnchorElement | undefined;
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = originalCreateElement(tag);
      if (tag === "a") {
        element.click = clickSpy;
        capturedAnchor = element as HTMLAnchorElement;
      }
      return element;
    });

    downloadPgrReportAsCsv(DATA, GENERATED_AT);

    expect(createObjectURLMock).toHaveBeenCalledOnce();
    const blobArg = createObjectURLMock.mock.calls[0]![0] as Blob;
    expect(blobArg.type).toBe("text/csv;charset=utf-8");
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(capturedAnchor?.download).toBe("pgr-zelo-2026-07-01.csv");
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock-url");

    vi.restoreAllMocks();
  });
});

describe("downloadPgrReportAsPdf", () => {
  it("writes the disclaimer, summary, and per-department lines into the PDF and saves it", async () => {
    await downloadPgrReportAsPdf(DATA, GENERATED_AT);

    expect(splitTextToSizeMock).toHaveBeenCalledWith(DISCLAIMER, 180);
    expect(textMock).toHaveBeenCalledWith([DISCLAIMER], 14, 38);
    expect(textMock).toHaveBeenCalledWith("Sinais de burnout na equipe: 41%", 14, 52);
    expect(textMock).toHaveBeenCalledWith("Questionários respondidos (4 semanas): 111", 14, 58);
    expect(textMock).toHaveBeenCalledWith("Taxa de resposta do follow-up: 70%", 14, 64);
    expect(textMock).toHaveBeenCalledWith("Sinais por setor:", 14, 76);
    expect(textMock).toHaveBeenCalledWith("- Plantão noturno: 52% (n=18)", 14, 84);
    expect(textMock).toHaveBeenCalledWith("- Pronto-socorro: 38% (n=24)", 14, 90);
    expect(textMock).toHaveBeenCalledWith("- UTI: 44% (n=9)", 14, 96);
    expect(saveMock).toHaveBeenCalledWith("pgr-zelo-2026-07-01.pdf");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zelo/web test download-manager-pgr-report -- --run`
Expected: FAIL — `download-manager-pgr-report` module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/presentation/lib/download-manager-pgr-report.ts`:

```ts
import type { ManagerSignalsResponse } from "@/ports/manager-signals.port";

const DISCLAIMER =
  "Isto é um insumo para a gestão de risco psicossocial do empregador, não uma certificação de conformidade com a NR-1.";

function formatDate(generatedAt: Date): string {
  return generatedAt.toLocaleDateString("pt-BR", { year: "numeric", month: "long", day: "numeric" });
}

function formatFileDate(generatedAt: Date): string {
  return generatedAt.toISOString().slice(0, 10);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function buildPgrCsvLines(data: ManagerSignalsResponse, generatedAt: Date): string[] {
  return [
    "Insumo para o PGR - Zelo",
    formatDate(generatedAt),
    DISCLAIMER,
    "",
    "Métrica,Valor",
    `Sinais de burnout na equipe,${Math.round(data.overallConcerningRate * 100)}%`,
    `Questionários respondidos (4 semanas),${data.checkInsLast4Weeks}`,
    `Taxa de resposta do follow-up,${Math.round(data.followUpResponseRate * 100)}%`,
    "",
    "Setor,Sinais (%),n",
    ...data.segments.map((segment) => `${segment.label},${segment.value}%,${segment.n}`),
  ];
}

export function downloadPgrReportAsCsv(data: ManagerSignalsResponse, generatedAt: Date = new Date()): void {
  const blob = new Blob([buildPgrCsvLines(data, generatedAt).join("\n")], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `pgr-zelo-${formatFileDate(generatedAt)}.csv`);
}

export async function downloadPgrReportAsPdf(
  data: ManagerSignalsResponse,
  generatedAt: Date = new Date(),
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const LINE_HEIGHT = 6;
  let y = 20;

  doc.setFontSize(16);
  doc.text("Insumo para o PGR — Zelo", 14, y);
  y += 8;

  doc.setFontSize(11);
  doc.text(formatDate(generatedAt), 14, y);
  y += 10;

  const disclaimerLines = doc.splitTextToSize(DISCLAIMER, 180);
  doc.text(disclaimerLines, 14, y);
  y += disclaimerLines.length * LINE_HEIGHT + 8;

  doc.text(`Sinais de burnout na equipe: ${Math.round(data.overallConcerningRate * 100)}%`, 14, y);
  y += LINE_HEIGHT;
  doc.text(`Questionários respondidos (4 semanas): ${data.checkInsLast4Weeks}`, 14, y);
  y += LINE_HEIGHT;
  doc.text(`Taxa de resposta do follow-up: ${Math.round(data.followUpResponseRate * 100)}%`, 14, y);
  y += LINE_HEIGHT + 6;

  doc.text("Sinais por setor:", 14, y);
  y += 8;

  data.segments.forEach((segment) => {
    doc.text(`- ${segment.label}: ${segment.value}% (n=${segment.n})`, 14, y);
    y += LINE_HEIGHT;
  });

  doc.save(`pgr-zelo-${formatFileDate(generatedAt)}.pdf`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @zelo/web test download-manager-pgr-report -- --run`
Expected: PASS (all three describe blocks).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/lib/download-manager-pgr-report.ts apps/web/src/presentation/lib/download-manager-pgr-report.test.ts
git commit -m "feat(web): add CSV/PDF builders for the manager dashboard's PGR export"
```

---

### Task 2: "Insumo para o PGR" card on `ManagerDashboardPage.tsx`

**Files:**
- Modify: `apps/web/src/presentation/pages/ManagerDashboardPage.tsx:1-14` (imports), `apps/web/src/presentation/pages/ManagerDashboardPage.tsx:168-170` (insert new section between the trend/segments grid and the "Análise com IA" card)
- Test: `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx`

**Interfaces:**
- Consumes: `downloadPgrReportAsCsv`, `downloadPgrReportAsPdf` from Task 1's `apps/web/src/presentation/lib/download-manager-pgr-report.ts`; the page's existing `data` (typed `ManagerSignalsResponse | undefined`) and `segments` (`data?.segments ?? []`) locals from `useManagerSignals()`.
- Produces: nothing consumed by later tasks — this is the last task in this plan.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx`, add the import at the top (alongside the existing imports):

```ts
import * as pgrExport from "@/presentation/lib/download-manager-pgr-report";
```

Add these `it` blocks inside the existing `describe("ManagerDashboardPage", ...)`:

```ts
  it("renders the PGR export card with the NR-1 disclaimer", async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    expect(screen.getByText("Insumo para o PGR")).toBeInTheDocument();
    expect(screen.getByText(/não uma certificação de conformidade com a NR-1/)).toBeInTheDocument();
  });

  it("triggers a CSV export when 'Exportar CSV' is clicked", async () => {
    const csvSpy = vi.spyOn(pgrExport, "downloadPgrReportAsCsv").mockImplementation(() => {});
    const user = userEvent.setup();
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Exportar CSV" }));

    expect(csvSpy).toHaveBeenCalledWith(SIGNALS_RESPONSE);
  });

  it("triggers a PDF export when 'Exportar PDF' is clicked", async () => {
    const pdfSpy = vi.spyOn(pgrExport, "downloadPgrReportAsPdf").mockImplementation(async () => {});
    const user = userEvent.setup();
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Exportar PDF" }));

    expect(pdfSpy).toHaveBeenCalledWith(SIGNALS_RESPONSE);
  });

  it("disables both export buttons when there are no segments", async () => {
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockResolvedValue({
      ...SIGNALS_RESPONSE,
      segments: [],
    });
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Insumo para o PGR")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Exportar PDF" })).toBeDisabled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zelo/web test ManagerDashboardPage -- --run`
Expected: FAIL — "Insumo para o PGR" text not found / "Exportar CSV" role not found.

- [ ] **Step 3: Write the implementation**

In `apps/web/src/presentation/pages/ManagerDashboardPage.tsx`, add the import after the existing `UnauthorizedManagerError` import (line 14):

```ts
import { downloadPgrReportAsCsv, downloadPgrReportAsPdf } from "@/presentation/lib/download-manager-pgr-report";
```

Insert this new block between the closing `</div>` of `trend-segments-grid` (line 168) and the `<div className="mt-3.5">` that starts the "Análise com IA" card (line 170):

```tsx
        {data && (
          <div className="mt-3.5">
            <Card>
              <SectionLabel>Conformidade NR-1</SectionLabel>
              <p className="mt-2 text-body font-extrabold text-ink">Insumo para o PGR</p>
              <p className="mt-2 text-label text-ink-2">
                Estes sinais mapeiam fatores de risco psicossocial reconhecidos pela NR-1 — sobrecarga,
                jornada, esgotamento por setor. Isto é um insumo para a gestão de risco psicossocial do
                empregador, <strong>não uma certificação de conformidade com a NR-1</strong>.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  full={false}
                  disabled={segments.length === 0}
                  onClick={() => downloadPgrReportAsCsv(data)}
                >
                  Exportar CSV
                </Button>
                <Button
                  variant="outline"
                  full={false}
                  disabled={segments.length === 0}
                  onClick={() => downloadPgrReportAsPdf(data)}
                >
                  Exportar PDF
                </Button>
              </div>
            </Card>
          </div>
        )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @zelo/web test ManagerDashboardPage -- --run`
Expected: PASS (all existing tests plus the four new ones).

- [ ] **Step 5: Run the full web test suite and type check**

Run: `pnpm --filter @zelo/web test -- --run` and `pnpm --filter @zelo/web exec tsc --noEmit`
Expected: both PASS, no regressions in other manager tests (`ManagerInsightHistoryPage.test.tsx`, `router.test.tsx`, `a11y.test.tsx`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/presentation/pages/ManagerDashboardPage.tsx apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx
git commit -m "feat(web): add NR-1/PGR labeling and CSV/PDF export to the manager dashboard"
```

---

## Plan self-review notes

- **Spec coverage:** §2 (card content/placement) → Task 2. §3 (export content, CSV/PDF) → Task 1. §4 (testing) → both tasks' test steps. §5 (acceptance criteria) → covered by the combination of both tasks' passing tests plus the full-suite/type-check step in Task 2 Step 5.
- **Placeholder scan:** none — every step has literal code.
- **Type consistency:** `ManagerSignalsResponse` (Task 1's param type) matches the type already imported in `ManagerDashboardPage.tsx` via `useManagerSignals()`'s return (`data?: ManagerSignalsResponse`); `buildPgrCsvLines`/`downloadPgrReportAsCsv`/`downloadPgrReportAsPdf` names and signatures are identical between Task 1's implementation and Task 2's import/usage.
