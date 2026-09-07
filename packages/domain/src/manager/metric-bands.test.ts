import { describe, expect, it } from "vitest";
import { followUpBandFor } from "./metric-bands";

describe("followUpBandFor", () => {
  // As quatro fronteiras, uma asserção cada: é exatamente o que muda sem
  // ninguém perceber quando estes valores virarem configuráveis por instituição.
  it("treats 81 as good", () => {
    expect(followUpBandFor(81).tone).toBe("good");
  });

  it("treats 80 exactly as fair, because the rule is 'above 80'", () => {
    expect(followUpBandFor(80).tone).toBe("fair");
  });

  it("treats 70 exactly as fair, because the rule is 'below 70'", () => {
    expect(followUpBandFor(70).tone).toBe("fair");
  });

  it("treats 69 as poor", () => {
    expect(followUpBandFor(69).tone).toBe("poor");
  });

  it("resolves the ends of the scale", () => {
    expect(followUpBandFor(0).tone).toBe("poor");
    expect(followUpBandFor(100).tone).toBe("good");
  });

  it("gives every whole percentage exactly one band, with a label and a meaning", () => {
    for (let percent = 0; percent <= 100; percent += 1) {
      const band = followUpBandFor(percent);
      expect(["good", "fair", "poor"]).toContain(band.tone);
      expect(band.label.length).toBeGreaterThan(0);
      expect(band.meaning.length).toBeGreaterThan(0);
    }
  });
});
