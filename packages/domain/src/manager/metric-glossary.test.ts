import { describe, expect, it } from "vitest";
import {
  MANAGER_METRICS,
  MANAGER_METHODOLOGY_VERSION,
  checkInsReading,
  concerningRateReading,
  followUpReading,
  sectorCoverageReading,
} from "./metric-glossary";

describe("MANAGER_METRICS", () => {
  it("defines every field for every metric", () => {
    for (const metric of Object.values(MANAGER_METRICS)) {
      expect(metric.label.length).toBeGreaterThan(0);
      expect(metric.method.length).toBeGreaterThan(0);
      expect(metric.window.length).toBeGreaterThan(0);
      expect(metric.suppression.length).toBeGreaterThan(0);
    }
  });

  // Regressão para a decisão D2: o indicador conta PHQ-9/GAD-7 acima de 9,
  // que não é uma medida de burnout. A palavra só pode aparecer em `method`,
  // descrevendo a associação clínica.
  it("never calls a metric 'burnout' in its label", () => {
    for (const metric of Object.values(MANAGER_METRICS)) {
      expect(metric.label.toLowerCase()).not.toContain("burnout");
    }
  });

  it("marks the follow-up rate as demonstration data", () => {
    expect(MANAGER_METRICS.followUpRate.provenance).toBe("demonstration");
  });

  it("marks nothing else as demonstration data", () => {
    const demo = Object.values(MANAGER_METRICS).filter((m) => m.provenance === "demonstration");
    expect(demo.map((m) => m.id)).toEqual(["followUpRate"]);
  });

  it("carries a methodology version, so a change of rule is datable", () => {
    expect(MANAGER_METHODOLOGY_VERSION.length).toBeGreaterThan(0);
  });

  // O k-anonimato é decidido por setor, uma vez, na semana de referência —
  // não semana a semana. Um setor visível mostra todas as suas semanas com a
  // contagem real, inclusive as que sozinhas ficariam abaixo de 5. Quem audita
  // a supressão precisa ler isso na metodologia, não deduzir do código.
  it("discloses that a visible sector shows its sub-threshold weeks with their real counts", () => {
    expect(MANAGER_METRICS.concerningRate.suppression).toMatch(/por setor,? e não semana a semana/i);
    expect(MANAGER_METRICS.concerningRate.suppression).toMatch(/abaixo de 5/i);
  });
});

describe("plain-language readings", () => {
  it("states the numerator, the denominator and the week for the concerning rate", () => {
    expect(concerningRateReading({ percent: 47, responses: 62, weekLabel: "31 de ago." })).toBe(
      "47% das 62 respostas na semana de 31 de ago.",
    );
  });

  it("uses the singular for a single response", () => {
    expect(concerningRateReading({ percent: 0, responses: 1, weekLabel: "3 de ago." })).toBe(
      "0% de 1 resposta na semana de 3 de ago.",
    );
  });

  it("states the total and how many sectors it spans", () => {
    expect(checkInsReading({ total: 312, visibleSectors: 4 })).toBe(
      "312 respostas em 4 setores visíveis, nas últimas 4 semanas",
    );
  });

  it("uses the singular for a single sector", () => {
    expect(checkInsReading({ total: 9, visibleSectors: 1 })).toBe(
      "9 respostas em 1 setor visível, nas últimas 4 semanas",
    );
  });

  it("says outright that the follow-up rate is not this institution's data", () => {
    expect(followUpReading()).toContain("demonstração");
  });

  it("states visible, total and hidden sectors", () => {
    expect(sectorCoverageReading({ visible: 4, total: 7 })).toBe(
      "4 de 7 setores · 3 ocultos por terem menos de 5 respostas",
    );
  });

  it("drops the hidden clause when nothing is hidden", () => {
    expect(sectorCoverageReading({ visible: 7, total: 7 })).toBe("7 de 7 setores · nenhum oculto");
  });
});
