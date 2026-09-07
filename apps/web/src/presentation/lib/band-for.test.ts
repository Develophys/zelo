import { describe, expect, it } from "vitest";
import { bandFor, bandForSeverityFraction } from "./band-for";

describe("bandFor", () => {
  it.each([
    [4, "Mínimo"],
    [5, "Leve"],
    [9, "Leve"],
    [10, "Moderado"],
    [14, "Moderado"],
    [15, "Moderadamente grave"],
    [19, "Moderadamente grave"],
    [20, "Grave"],
    [27, "Grave"],
  ])("PHQ-9 score %i maps to band %s", (score, label) => {
    expect(bandFor("PHQ-9", score).label).toBe(label);
  });

  it.each([
    [4, "Mínimo"],
    [5, "Leve"],
    [9, "Leve"],
    [10, "Moderado"],
    [14, "Moderado"],
    [15, "Grave"],
    [21, "Grave"],
  ])("GAD-7 score %i maps to band %s", (score, label) => {
    expect(bandFor("GAD-7", score).label).toBe(label);
  });

  it("returns a palette tone alongside the label, never a raw color", () => {
    const band = bandFor("PHQ-9", 12);
    expect(band).toEqual({ label: "Moderado", tone: "moderate" });
  });

  it("climbs the tone ramp in step with the label ramp", () => {
    const tones = [0, 5, 10, 15, 20].map((score) => bandFor("PHQ-9", score).tone);
    expect(tones).toEqual(["minimal", "mild", "moderate", "high", "severe"]);
  });
});

describe("bandForSeverityFraction", () => {
  // A history chart plots PHQ-9 and GAD-7 readings on one shared 0-1 axis
  // (score / scale max) so they can sit on the same chart — the same
  // simplification the history use-case already makes. This reads a band off
  // that normalized fraction directly, using PHQ-9's own ramp as the shared
  // approximation, so a severe week is never colored the same as a minimal one
  // just because the chart lost track of which scale it came from.
  it("maps a maximal reading to the severe tone, never minimal", () => {
    expect(bandForSeverityFraction(1).tone).toBe("severe");
  });

  it("maps a near-zero reading to the minimal tone", () => {
    expect(bandForSeverityFraction(0).tone).toBe("minimal");
  });

  it("climbs the same tone ramp as the raw-score lookup", () => {
    const tones = [0, 0.2, 0.4, 0.6, 0.8].map((fraction) => bandForSeverityFraction(fraction).tone);
    expect(tones).toEqual(["minimal", "mild", "moderate", "high", "severe"]);
  });
});
