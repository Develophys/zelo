import { describe, expect, it } from "vitest";
import { boundaryIndices } from "./sentence-split.ts";

describe("boundaryIndices", () => {
  it("finds a terminator followed by a space", () => {
    expect(boundaryIndices("Oi. Tudo bem")).toEqual([2]);
  });

  it("finds a terminator at the end of the string", () => {
    expect(boundaryIndices("Oi.")).toEqual([2]);
  });

  it("finds every terminator kind", () => {
    expect(boundaryIndices("A. B! C? D…")).toEqual([1, 4, 7, 10]);
  });

  it("ignores a period inside a decimal number", () => {
    expect(boundaryIndices("subiu 1.5 ponto")).toEqual([]);
  });

  it("returns an empty list for text with no terminator", () => {
    expect(boundaryIndices("ainda escrevendo")).toEqual([]);
  });

  it("treats a newline as boundary whitespace", () => {
    expect(boundaryIndices("Oi.\nTudo bem")).toEqual([2]);
  });

  it("splits early on an abbreviation, which is accepted behaviour", () => {
    expect(boundaryIndices("Falei com o Dr. Paulo")).toEqual([14]);
  });
});
