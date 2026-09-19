import { describe, expect, it } from "vitest";
import { resolveClientAddress } from "./client-address.ts";

describe("resolveClientAddress", () => {
  it("prefers Fly-Client-IP, which Fly's proxy sets to the real client", () => {
    expect(resolveClientAddress({ "fly-client-ip": "203.0.113.7" }, "172.16.0.1")).toBe("203.0.113.7");
  });

  it("falls back to the socket address when the header is absent, as in local dev and Docker", () => {
    expect(resolveClientAddress({}, "127.0.0.1")).toBe("127.0.0.1");
  });

  it("ignores an empty or non-string header value", () => {
    expect(resolveClientAddress({ "fly-client-ip": "" }, "127.0.0.1")).toBe("127.0.0.1");
    expect(resolveClientAddress({ "fly-client-ip": ["a", "b"] }, "127.0.0.1")).toBe("127.0.0.1");
  });

  it("never returns an empty key when neither source is available", () => {
    expect(resolveClientAddress(undefined, undefined)).toBe("unknown");
  });
});
