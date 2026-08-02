import { describe, expect, it } from "vitest";
import { generateTemporaryPassword } from "./generate-temporary-password.ts";

describe("generateTemporaryPassword", () => {
  it("returns a string at least 12 characters long", () => {
    expect(generateTemporaryPassword().length).toBeGreaterThanOrEqual(12);
  });

  it("returns a different value on each call", () => {
    expect(generateTemporaryPassword()).not.toBe(generateTemporaryPassword());
  });
});
