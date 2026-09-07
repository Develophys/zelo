import { describe, expect, it } from "vitest";
import { MANAGER_INSIGHT_SYSTEM_PROMPT } from "./manager-insight-system-prompt";

describe("MANAGER_INSIGHT_SYSTEM_PROMPT", () => {
  // O texto que o modelo devolve é persistido e reaparece em /manager/history
  // para sempre. "Taxa de burnout" ali contradiz o rótulo que todas as outras
  // superfícies leem do glossário.
  it("forbids the model from calling the data burnout in its answer", () => {
    expect(MANAGER_INSIGHT_SYSTEM_PROMPT).toMatch(/nunca chame estes dados de burnout/i);
    expect(MANAGER_INSIGHT_SYSTEM_PROMPT).toMatch(/taxa de burnout/i);
    expect(MANAGER_INSIGHT_SYSTEM_PROMPT).toMatch(/sinais de sofrimento/i);
  });

  it("tells the model outright that the numbers are not a burnout measurement", () => {
    expect(MANAGER_INSIGHT_SYSTEM_PROMPT).toMatch(/não são uma medição de burnout/i);
    expect(MANAGER_INSIGHT_SYSTEM_PROMPT).toMatch(/PHQ-9/);
    expect(MANAGER_INSIGHT_SYSTEM_PROMPT).toMatch(/GAD-7/);
  });

  it("frames the MBI as background on the concept, not as what was measured here", () => {
    expect(MANAGER_INSIGHT_SYSTEM_PROMPT).toMatch(/Maslach/);
    expect(MANAGER_INSIGHT_SYSTEM_PROMPT).toMatch(/não foi aplicado/i);
  });

  it("keeps the regulatory background it already carried", () => {
    expect(MANAGER_INSIGHT_SYSTEM_PROMPT).toMatch(/NR-1/);
    expect(MANAGER_INSIGHT_SYSTEM_PROMPT).toMatch(/CID-11/);
  });

  it("still asks for the exact JSON envelope the adapter parses", () => {
    expect(MANAGER_INSIGHT_SYSTEM_PROMPT).toContain(
      '{"interpretation": "2 a 3 frases interpretando o padrão nos dados", "suggestedActions": ["2 a 4 ações concretas e curtas"]}',
    );
  });
});
