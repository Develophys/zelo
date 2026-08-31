import { describe, expect, it, vi, beforeEach } from "vitest";

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

import { downloadInsightAsPdf, downloadInsightAsText } from "./download-manager-insight";
import { MANAGER_INSIGHT_DISCLAIMER } from "./manager-insight-disclaimer";
import type { StoredManagerInsight } from "@/ports/manager-insight-history.port";

const ENTRY: StoredManagerInsight = {
  id: "abc123",
  interpretation: "texto de interpretação",
  suggestedActions: ["ação 1", "ação 2"],
  summary: "resumo dos dados",
  generatedAt: "2026-07-01T00:00:00.000Z",
  createdByManagerName: null,
};

describe("downloadInsightAsPdf", () => {
  beforeEach(() => {
    textMock.mockClear();
    saveMock.mockClear();
    splitTextToSizeMock.mockClear();
  });

  it("writes the interpretation and suggested actions into the PDF and saves it", async () => {
    await downloadInsightAsPdf(ENTRY);

    expect(splitTextToSizeMock).toHaveBeenCalledWith("texto de interpretação", 180);
    expect(splitTextToSizeMock).toHaveBeenCalledWith("- ação 1", 180);
    expect(splitTextToSizeMock).toHaveBeenCalledWith("- ação 2", 180);
    expect(textMock).toHaveBeenCalledWith(["texto de interpretação"], 14, 40);
    expect(textMock).toHaveBeenCalledWith(["- ação 1"], 14, 64);
    expect(textMock).toHaveBeenCalledWith(["- ação 2"], 14, 72);
    expect(splitTextToSizeMock).toHaveBeenCalledWith(MANAGER_INSIGHT_DISCLAIMER, 180);
    expect(saveMock).toHaveBeenCalledWith("analise-zelo-abc123.pdf");
  });
});

describe("downloadInsightAsText", () => {
  it("builds a text blob with the interpretation and actions and triggers a download", () => {
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn();
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    }
    const createObjectURLMock = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    const revokeObjectURLMock = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = originalCreateElement(tag);
      if (tag === "a") {
        element.click = clickSpy;
      }
      return element;
    });

    downloadInsightAsText(ENTRY);

    expect(createObjectURLMock).toHaveBeenCalledOnce();
    const blobArg = createObjectURLMock.mock.calls[0]![0] as Blob;
    expect(blobArg.type).toBe("text/plain;charset=utf-8");
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock-url");

    vi.restoreAllMocks();
  });

  it("carries the AI disclaimer into the text export, which leaves the app", () => {
    if (!URL.createObjectURL) URL.createObjectURL = vi.fn();
    if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
    const createObjectURLMock = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = originalCreateElement(tag);
      if (tag === "a") element.click = vi.fn();
      return element;
    });

    // jsdom's Blob has no .text(), so capture what it was built from.
    const parts: string[] = [];
    const RealBlob = globalThis.Blob;
    vi.spyOn(globalThis, "Blob").mockImplementation((blobParts?: BlobPart[], options?: BlobPropertyBag) => {
      parts.push(String(blobParts?.[0] ?? ""));
      return new RealBlob(blobParts, options);
    });

    downloadInsightAsText(ENTRY);

    // The doctor's chat carries a permanent AI banner. This output is the one
    // that leaves the app and gets quoted to leadership, and it carried none.
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(parts.join("")).toContain(MANAGER_INSIGHT_DISCLAIMER);

    vi.restoreAllMocks();
  });
});
