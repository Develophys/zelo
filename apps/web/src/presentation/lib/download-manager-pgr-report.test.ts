import { describe, expect, it, vi } from "vitest";
import { MANAGER_METHODOLOGY_VERSION, MANAGER_METRICS, sectorCoverageReading } from "@zelo/domain";
import type { ManagerSignalsResponse } from "@/ports/manager-signals.port";

const DEMONSTRATION_SUFFIX = " (dado de demonstração — não usar como evidência)";

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
  abandonedLast4Weeks: 9,
  weeklyTrend: [],
  segments: [
    { label: "Plantão noturno", value: 52, n: 18 },
    { label: "Pronto-socorro", value: 38, n: 24 },
    { label: "UTI", value: 44, n: 9 },
  ],
  followUpResponseRate: 0.7,
  sectorCoverage: { visible: 4, total: 7 },
  // Este fixture não tem tendência alguma, então não há semana de referência
  // para nomear.
  referenceWeekStart: null,
};

const GENERATED_AT = new Date("2026-07-01T00:00:00.000Z");

describe("buildPgrCsvLines", () => {
  it("includes the disclaimer, summary metrics, and one row per segment", () => {
    const lines = buildPgrCsvLines(DATA, GENERATED_AT);

    expect(lines).toContain(`"${DISCLAIMER}"`);
    expect(lines).toContain(`${MANAGER_METRICS.concerningRate.label},41%`);
    expect(lines).toContain(`${MANAGER_METRICS.checkIns.label} (4 semanas),111`);
    expect(lines).toContain(`${MANAGER_METRICS.abandoned.label} (4 semanas),9`);
    expect(lines).toContain(`${MANAGER_METRICS.followUpRate.label}${DEMONSTRATION_SUFFIX},70%`);
    expect(lines).toContain("Plantão noturno,52%,18");
    expect(lines).toContain("Pronto-socorro,38%,24");
    expect(lines).toContain("UTI,44%,9");
  });

  it("uses the glossary label, so the export and the screen cannot disagree", () => {
    const lines = buildPgrCsvLines(DATA, new Date("2026-09-07T00:00:00.000Z"));

    expect(lines.some((line) => line.includes(MANAGER_METRICS.concerningRate.label))).toBe(true);
    expect(lines.some((line) => /burnout/i.test(line))).toBe(false);
  });

  it("records how much of the institution the export covers", () => {
    const lines = buildPgrCsvLines(DATA, new Date("2026-09-07T00:00:00.000Z"));

    expect(lines.some((line) => line.includes("4 de 7 setores"))).toBe(true);
  });

  it("marks the follow-up line as demonstration data", () => {
    const lines = buildPgrCsvLines(DATA, new Date("2026-09-07T00:00:00.000Z"));
    const followUp = lines.find((line) => line.includes(MANAGER_METRICS.followUpRate.label))!;

    expect(followUp).toContain("dado de demonstração — não usar como evidência");
  });

  it("never writes an interpretation band while the follow-up is demonstration data", () => {
    const lines = buildPgrCsvLines(DATA, new Date("2026-09-07T00:00:00.000Z"));

    for (const band of ["Ótima", "Média", "Baixa"]) {
      expect(lines.some((line) => line.includes(band))).toBe(false);
    }
  });

  it("points at the methodology page and its version", () => {
    const lines = buildPgrCsvLines(DATA, new Date("2026-09-07T00:00:00.000Z"));

    expect(lines.some((line) => line.includes("/manager/methodology"))).toBe(true);
  });

  it("quotes the title, date, and disclaimer lines but not the data rows", () => {
    const lines = buildPgrCsvLines(DATA, GENERATED_AT);

    expect(lines).toContain('"Insumo para o PGR - Zelo"');
    expect(lines).toContain(`"${DISCLAIMER}"`);
    expect(lines[1]).toMatch(/^".*"$/);

    // The disclaimer contains a comma; it must be fully wrapped in quotes so
    // a spreadsheet doesn't split it into two cells at that comma.
    expect(lines).not.toContain(DISCLAIMER);

    // Data rows are correctly-shaped CSV already and must remain unquoted.
    expect(lines).not.toContain('"Sinais de burnout na equipe,41%"');
    expect(lines).not.toContain('"Plantão noturno,52%,18"');
    expect(lines).toContain("Métrica,Valor");
    expect(lines).toContain("Setor,Sinais (%),n");
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
    const OriginalBlob = globalThis.Blob;
    let capturedBlobParts: BlobPart[] | undefined;
    const BlobSpy = vi
      .spyOn(globalThis, "Blob")
      .mockImplementation((parts?: BlobPart[], options?: BlobPropertyBag) => {
        capturedBlobParts = parts;
        return new OriginalBlob(parts, options);
      });

    downloadPgrReportAsCsv(DATA, GENERATED_AT);

    expect(createObjectURLMock).toHaveBeenCalledOnce();
    const blobArg = createObjectURLMock.mock.calls[0]![0] as Blob;
    expect(blobArg.type).toBe("text/csv;charset=utf-8");
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(capturedAnchor?.download).toBe("pgr-zelo-2026-07-01.csv");
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock-url");

    expect(BlobSpy).toHaveBeenCalledOnce();
    const csvContent = capturedBlobParts?.[0] as string;
    expect(csvContent.charCodeAt(0)).toBe(0xfeff);
    expect(csvContent).toContain(`"${DISCLAIMER}"`);

    vi.restoreAllMocks();
  });
});

describe("downloadPgrReportAsPdf", () => {
  it("writes the disclaimer, summary, and per-department lines into the PDF and saves it", async () => {
    await downloadPgrReportAsPdf(DATA, GENERATED_AT);

    expect(splitTextToSizeMock).toHaveBeenCalledWith(DISCLAIMER, 180);
    expect(textMock).toHaveBeenCalledWith([DISCLAIMER], 14, 38);
    expect(textMock).toHaveBeenCalledWith(`${MANAGER_METRICS.concerningRate.label}: 41%`, 14, 52);
    expect(textMock).toHaveBeenCalledWith(`${MANAGER_METRICS.checkIns.label} (4 semanas): 111`, 14, 58);
    expect(textMock).toHaveBeenCalledWith(`${MANAGER_METRICS.abandoned.label} (4 semanas): 9`, 14, 64);
    expect(splitTextToSizeMock).toHaveBeenCalledWith(
      `${MANAGER_METRICS.followUpRate.label}${DEMONSTRATION_SUFFIX}: 70%`,
      180,
    );
    expect(textMock).toHaveBeenCalledWith(
      [`${MANAGER_METRICS.followUpRate.label}${DEMONSTRATION_SUFFIX}: 70%`],
      14,
      70,
    );
    expect(textMock).toHaveBeenCalledWith(sectorCoverageReading(DATA.sectorCoverage), 14, 76);
    expect(textMock).toHaveBeenCalledWith("Sinais por setor:", 14, 88);
    expect(textMock).toHaveBeenCalledWith("- Plantão noturno: 52% (n=18)", 14, 96);
    expect(textMock).toHaveBeenCalledWith("- Pronto-socorro: 38% (n=24)", 14, 102);
    expect(textMock).toHaveBeenCalledWith("- UTI: 44% (n=9)", 14, 108);
    expect(setFontSizeMock).toHaveBeenCalledWith(9);
    expect(textMock).toHaveBeenCalledWith(
      `Metodologia: /manager/methodology — versão ${MANAGER_METHODOLOGY_VERSION}`,
      14,
      120,
    );
    expect(saveMock).toHaveBeenCalledWith("pgr-zelo-2026-07-01.pdf");
  });

  it("never writes an interpretation band next to the demonstration follow-up line", async () => {
    await downloadPgrReportAsPdf(DATA, GENERATED_AT);

    for (const band of ["Ótima", "Média", "Baixa"]) {
      expect(textMock.mock.calls.some(([text]) => String(text).includes(band))).toBe(false);
    }
  });

  it("includes the abandoned-questionnaires line", async () => {
    await downloadPgrReportAsPdf(DATA, GENERATED_AT);

    expect(textMock).toHaveBeenCalledWith(`${MANAGER_METRICS.abandoned.label} (4 semanas): 9`, 14, expect.any(Number));
  });
});
