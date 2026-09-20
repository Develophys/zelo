import { describe, expect, it } from "vitest";
import { DEFAULT_ALLOWED_ORIGINS, resolveAllowedOrigins } from "./allowed-origins.ts";

describe("resolveAllowedOrigins", () => {
  it("falls back to the two local dev origins when CORS_ALLOWED_ORIGINS is unset", () => {
    expect(resolveAllowedOrigins({})).toEqual(["http://localhost:5173", "http://localhost:8080"]);
    expect(DEFAULT_ALLOWED_ORIGINS).toEqual(["http://localhost:5173", "http://localhost:8080"]);
  });

  it("falls back to the defaults when the variable is an empty string", () => {
    expect(resolveAllowedOrigins({ CORS_ALLOWED_ORIGINS: "" })).toEqual(DEFAULT_ALLOWED_ORIGINS);
  });

  it("splits on commas, trims each entry and drops empty ones", () => {
    expect(resolveAllowedOrigins({ CORS_ALLOWED_ORIGINS: " https://www.zelohealth.app , ,https://dev.zelohealth.app," })).toEqual([
      "https://www.zelohealth.app",
      "https://dev.zelohealth.app",
    ]);
  });

  it("reads process.env when no environment is passed", () => {
    const previous = process.env.CORS_ALLOWED_ORIGINS;
    process.env.CORS_ALLOWED_ORIGINS = "https://a.example";
    try {
      expect(resolveAllowedOrigins()).toEqual(["https://a.example"]);
    } finally {
      if (previous === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
      else process.env.CORS_ALLOWED_ORIGINS = previous;
    }
  });
});
