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
