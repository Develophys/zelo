import { describe, expect, it } from "vitest";
import { shouldAllowTrailingQuestion } from "./cadence.ts";

describe("shouldAllowTrailingQuestion", () => {
  it("permits a question on the very first reply", () => {
    expect(shouldAllowTrailingQuestion([])).toBe(true);
  });

  it("forbids a question when the previous reply ended in one", () => {
    expect(shouldAllowTrailingQuestion(["Faz quanto tempo que tá assim?"])).toBe(false);
  });

  it("permits a question when the previous reply did not end in one", () => {
    expect(shouldAllowTrailingQuestion(["Isso é pesado mesmo."])).toBe(true);
  });

  it("looks only at the most recent reply", () => {
    expect(
      shouldAllowTrailingQuestion(["Como tá o sono?", "Isso é pesado mesmo."]),
    ).toBe(true);
  });

  it("ignores trailing whitespace", () => {
    expect(shouldAllowTrailingQuestion(["Como tá o sono?  \n"])).toBe(false);
  });

  it("permits a question when the previous reply merely contains one mid-text", () => {
    expect(
      shouldAllowTrailingQuestion(["Como tá o sono? Pergunto porque isso costuma ser o primeiro a ir."]),
    ).toBe(true);
  });
});
