import { describe, expect, it } from "vitest";
import { isConcerningScore } from "./is-concerning-score";

describe("isConcerningScore", () => {
  it("is false at the Leve/Moderado boundary (score 9)", () => {
    expect(isConcerningScore(9)).toBe(false);
  });

  it("is true just above the boundary (score 10, Moderado)", () => {
    expect(isConcerningScore(10)).toBe(true);
  });

  it("is false for a low score", () => {
    expect(isConcerningScore(2)).toBe(false);
  });

  it("is true for a high score", () => {
    expect(isConcerningScore(24)).toBe(true);
  });
});
