import { describe, expect, it } from "vitest";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordSchema } from "./password-policy";

describe("passwordSchema", () => {
  it("sets the floor at 10 characters", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
  });

  it("accepts a password exactly at the minimum", () => {
    expect(passwordSchema.safeParse("a".repeat(MIN_PASSWORD_LENGTH)).success).toBe(true);
  });

  it("rejects a password one character under the minimum", () => {
    expect(passwordSchema.safeParse("a".repeat(MIN_PASSWORD_LENGTH - 1)).success).toBe(false);
  });

  it("accepts a password exactly at the maximum and rejects one over it", () => {
    expect(passwordSchema.safeParse("a".repeat(MAX_PASSWORD_LENGTH)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(MAX_PASSWORD_LENGTH + 1)).success).toBe(false);
  });

  it("imposes no composition rule: a long lowercase-only passphrase passes", () => {
    expect(passwordSchema.safeParse("correct horse battery staple").success).toBe(true);
  });

  it.each([[undefined], [null], [1234567890], [{ length: 12 }]])("rejects a non-string value (%s)", (value) => {
    expect(passwordSchema.safeParse(value).success).toBe(false);
  });
});
