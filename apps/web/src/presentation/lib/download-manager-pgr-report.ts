import { MANAGER_METHODOLOGY_VERSION, MANAGER_METRICS, sectorCoverageReading } from "@zelo/domain";
import type { ManagerSignalsResponse } from "@/ports/manager-signals.port";

const DISCLAIMER =
  "Isto é um insumo para a gestão de risco psicossocial do empregador, não uma certificação de conformidade com a NR-1.";

const DEMONSTRATION_SUFFIX = " (dado de demonstração — não usar como evidência)";

function formatDate(generatedAt: Date): string {
  return generatedAt.toLocaleDateString("pt-BR", { year: "numeric", month: "long", day: "numeric" });
}

function formatFileDate(generatedAt: Date): string {
  return generatedAt.toISOString().slice(0, 10);
}

function csvQuote(field: string): string {
  return `"${field.replace(/"/g, '""')}"`;
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
    csvQuote("Insumo para o PGR - Zelo"),
    csvQuote(formatDate(generatedAt)),
    csvQuote(DISCLAIMER),
    csvQuote(sectorCoverageReading(data.sectorCoverage)),
    "",
    "Métrica,Valor",
    `${MANAGER_METRICS.concerningRate.label},${Math.round(data.overallConcerningRate * 100)}%`,
    `${MANAGER_METRICS.checkIns.label} (4 semanas),${data.checkInsLast4Weeks}`,
    `${MANAGER_METRICS.abandoned.label} (4 semanas),${data.abandonedLast4Weeks}`,
    `${MANAGER_METRICS.followUpRate.label}${DEMONSTRATION_SUFFIX},${Math.round(data.followUpResponseRate * 100)}%`,
    "",
    "Setor,Sinais (%),n",
    ...data.segments.map((segment) => `${segment.label},${segment.value}%,${segment.n}`),
    "",
    csvQuote(`Metodologia: /manager/methodology — versão ${MANAGER_METHODOLOGY_VERSION}`),
  ];
}

export function downloadPgrReportAsCsv(data: ManagerSignalsResponse, generatedAt: Date = new Date()): void {
  const blob = new Blob(["﻿" + buildPgrCsvLines(data, generatedAt).join("\n")], {
    type: "text/csv;charset=utf-8",
  });
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

  doc.text(`${MANAGER_METRICS.concerningRate.label}: ${Math.round(data.overallConcerningRate * 100)}%`, 14, y);
  y += LINE_HEIGHT;
  doc.text(`${MANAGER_METRICS.checkIns.label} (4 semanas): ${data.checkInsLast4Weeks}`, 14, y);
  y += LINE_HEIGHT;
  doc.text(`${MANAGER_METRICS.abandoned.label} (4 semanas): ${data.abandonedLast4Weeks}`, 14, y);
  y += LINE_HEIGHT;
  const followUpLines = doc.splitTextToSize(
    `${MANAGER_METRICS.followUpRate.label}${DEMONSTRATION_SUFFIX}: ${Math.round(data.followUpResponseRate * 100)}%`,
    180,
  );
  doc.text(followUpLines, 14, y);
  y += followUpLines.length * LINE_HEIGHT;
  doc.text(sectorCoverageReading(data.sectorCoverage), 14, y);
  y += LINE_HEIGHT + 6;

  doc.text("Sinais por setor:", 14, y);
  y += 8;

  data.segments.forEach((segment) => {
    doc.text(`- ${segment.label}: ${segment.value}% (n=${segment.n})`, 14, y);
    y += LINE_HEIGHT;
  });

  y += 6;
  doc.setFontSize(9);
  doc.text(`Metodologia: /manager/methodology — versão ${MANAGER_METHODOLOGY_VERSION}`, 14, y);

  doc.save(`pgr-zelo-${formatFileDate(generatedAt)}.pdf`);
}
