import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.validation.ts";

function baseConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    DATABASE_URL: "postgresql://localhost/zelo",
    MANAGER_TOKEN_SECRET: "secret",
    ADMIN_TOKEN_SECRET: "secret",
    PEER_PARTNER_TOKEN_SECRET: "secret",
    AI_PROVIDER: "mock", // avoid tripping the unrelated GROQ_API_KEY refine in these fixtures
    ...overrides,
  };
}

describe("validateEnv", () => {
  it("accepts the local-dev defaults (EMAIL_PROVIDER=mock, localhost WEB_APP_BASE_URL) when NODE_ENV is not production", () => {
    expect(() => validateEnv(baseConfig({ NODE_ENV: "development" }))).not.toThrow();
    expect(() => validateEnv(baseConfig({ NODE_ENV: "test" }))).not.toThrow();
  });

  it("rejects a boot with no ADMIN_TOKEN_SECRET set", () => {
    const config = baseConfig({ NODE_ENV: "development" });
    delete config.ADMIN_TOKEN_SECRET;
    expect(() => validateEnv(config)).toThrow(/ADMIN_TOKEN_SECRET is required/);
  });

  it("rejects a boot with no PEER_PARTNER_TOKEN_SECRET set", () => {
    const config = baseConfig({ NODE_ENV: "development" });
    delete config.PEER_PARTNER_TOKEN_SECRET;
    expect(() => validateEnv(config)).toThrow(/PEER_PARTNER_TOKEN_SECRET is required/);
  });

  it("rejects a production boot with the default mock EMAIL_PROVIDER", () => {
    expect(() =>
      validateEnv(
        baseConfig({
          NODE_ENV: "production",
          WEB_APP_BASE_URL: "https://app.zelo.example",
        }),
      ),
    ).toThrow(/EMAIL_PROVIDER must be "resend" in production/);
  });

  it("rejects a production boot with the default localhost WEB_APP_BASE_URL", () => {
    expect(() =>
      validateEnv(
        baseConfig({
          NODE_ENV: "production",
          EMAIL_PROVIDER: "resend",
          RESEND_API_KEY: "re_test",
        }),
      ),
    ).toThrow(/WEB_APP_BASE_URL must be set explicitly in production/);
  });

  it("accepts a production boot with EMAIL_PROVIDER=resend, a RESEND_API_KEY, and a non-default WEB_APP_BASE_URL", () => {
    expect(() =>
      validateEnv(
        baseConfig({
          NODE_ENV: "production",
          EMAIL_PROVIDER: "resend",
          RESEND_API_KEY: "re_test",
          WEB_APP_BASE_URL: "https://app.zelo.example",
        }),
      ),
    ).not.toThrow();
  });
});
