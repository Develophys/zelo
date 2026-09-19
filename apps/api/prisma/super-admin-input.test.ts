import { describe, expect, it } from "vitest";
import { parseSuperAdminInput } from "./super-admin-input.ts";

const VALID = {
  SUPER_ADMIN_NAME: "Zelo Ops",
  SUPER_ADMIN_EMAIL: "ops@zelo-demo.local",
  SUPER_ADMIN_PASSWORD: "a-long-enough-password",
};

describe("parseSuperAdminInput", () => {
  it("returns the name, e-mail and password when all three are valid", () => {
    expect(parseSuperAdminInput(VALID)).toEqual({
      name: "Zelo Ops",
      email: "ops@zelo-demo.local",
      password: "a-long-enough-password",
    });
  });

  it.each(["SUPER_ADMIN_NAME", "SUPER_ADMIN_EMAIL", "SUPER_ADMIN_PASSWORD"])("requires %s", (key) => {
    const env = { ...VALID, [key]: undefined };

    expect(() => parseSuperAdminInput(env)).toThrow(/SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, and SUPER_ADMIN_PASSWORD are all required/);
  });

  it("rejects a password under the shared minimum and says so, without echoing the password", () => {
    const env = { ...VALID, SUPER_ADMIN_PASSWORD: "short-pw" };

    expect(() => parseSuperAdminInput(env)).toThrow(/SUPER_ADMIN_PASSWORD must be at least 10 characters/);
    expect(() => parseSuperAdminInput(env)).not.toThrow(/short-pw/);
  });

  it("rejects a password over the shared maximum", () => {
    const env = { ...VALID, SUPER_ADMIN_PASSWORD: "a".repeat(201) };

    expect(() => parseSuperAdminInput(env)).toThrow(/SUPER_ADMIN_PASSWORD must be at most 200 characters/);
  });

  it("rejects an e-mail that login could never match", () => {
    const env = { ...VALID, SUPER_ADMIN_EMAIL: "not-an-email" };

    expect(() => parseSuperAdminInput(env)).toThrow(/SUPER_ADMIN_EMAIL must be a valid e-mail/);
  });
});
