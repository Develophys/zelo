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

    expect(lines).toContain(`"${DISCLAIMER}"`);
    expect(lines).toContain("Sinais de burnout na equipe,41%");
    expect(lines).toContain("Questionários respondidos (4 semanas),111");
    expect(lines).toContain("Taxa de resposta do follow-up,70%");
    expect(lines).toContain("Plantão noturno,52%,18");
    expect(lines).toContain("Pronto-socorro,38%,24");
    expect(lines).toContain("UTI,44%,9");
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
