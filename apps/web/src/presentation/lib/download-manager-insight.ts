import type { StoredManagerInsight } from "@/ports/manager-insight-history.port";
import { MANAGER_INSIGHT_DISCLAIMER } from "./manager-insight-disclaimer";

function formatDate(generatedAt: string): string {
  return new Date(generatedAt).toLocaleDateString("pt-BR", { year: "numeric", month: "long", day: "numeric" });
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

export function downloadInsightAsText(entry: StoredManagerInsight): void {
  const lines = [
    "Análise com IA — Zelo",
    formatDate(entry.generatedAt),
    "",
    entry.interpretation,
    "",
    "Ações sugeridas:",
    ...entry.suggestedActions.map((action) => `- ${action}`),
    "",
    MANAGER_INSIGHT_DISCLAIMER,
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, `analise-zelo-${entry.id}.txt`);
}

export async function downloadInsightAsPdf(entry: StoredManagerInsight): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const LINE_HEIGHT = 6;
  let y = 20;

  doc.setFontSize(16);
  doc.text("Análise com IA — Zelo", 14, y);
  y += 8;

  doc.setFontSize(11);
  doc.text(formatDate(entry.generatedAt), 14, y);
  y += 12;

  const interpretationLines = doc.splitTextToSize(entry.interpretation, 180);
  doc.text(interpretationLines, 14, y);
  y += interpretationLines.length * LINE_HEIGHT + 10;

  doc.text("Ações sugeridas:", 14, y);
  y += 8;

  entry.suggestedActions.forEach((action) => {
    const actionLines = doc.splitTextToSize(`- ${action}`, 180);
    doc.text(actionLines, 14, y);
    y += actionLines.length * LINE_HEIGHT + 2;
  });

  // Travels with the document. Once this is a PDF in a meeting deck, nothing
  // around it says how the text was produced.
  y += 8;
  doc.setFontSize(9);
  doc.text(doc.splitTextToSize(MANAGER_INSIGHT_DISCLAIMER, 180), 14, y);

  doc.save(`analise-zelo-${entry.id}.pdf`);
}
