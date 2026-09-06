import { describe, expect, it } from "vitest";
import { hashSetPasswordToken } from "./hash-set-password-token.ts";

describe("hashSetPasswordToken", () => {
  it("returns the SHA-256 hex digest of the token", () => {
    expect(hashSetPasswordToken("abc123")).toBe(
      "6ca13d52ca70c883e0f0bb101e425a89e8624de51db2d2392593af6a84118090",
    );
  });

  it("is deterministic for the same input", () => {
    expect(hashSetPasswordToken("same-token")).toBe(hashSetPasswordToken("same-token"));
  });

  it("produces different hashes for different tokens", () => {
    expect(hashSetPasswordToken("token-a")).not.toBe(hashSetPasswordToken("token-b"));
  });
});
