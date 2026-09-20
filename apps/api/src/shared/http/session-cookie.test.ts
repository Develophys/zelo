import { afterEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  clearSessionCookie,
  hasSessionCookie,
  readSessionToken,
  setSessionCookie,
} from "./session-cookie.ts";

function fakeResponse() {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response & { cookie: ReturnType<typeof vi.fn>; clearCookie: ReturnType<typeof vi.fn> };
}

function requestWith(headers: Record<string, string | undefined>) {
  return { headers };
}

describe("session cookie", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses one cookie name per role", () => {
    expect(SESSION_COOKIE).toEqual({ manager: "manager_session", admin: "admin_session", peerPartner: "peer_partner_session" });
  });

  it("sets an HttpOnly, SameSite=Lax, host-only cookie that lasts eight hours", () => {
    const res = fakeResponse();

    setSessionCookie(res, "manager", "token-1");

    expect(res.cookie).toHaveBeenCalledWith("manager_session", "token-1", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 28_800_000,
    });
    expect(SESSION_MAX_AGE_MS).toBe(28_800_000);
  });

  it("marks the cookie Secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = fakeResponse();

    setSessionCookie(res, "admin", "token-2");

    expect(res.cookie).toHaveBeenCalledWith("admin_session", "token-2", expect.objectContaining({ secure: true }));
  });

  it("never sets a Domain attribute", () => {
    const res = fakeResponse();

    setSessionCookie(res, "peerPartner", "token-3");

    expect(res.cookie.mock.calls[0]?.[2]).not.toHaveProperty("domain");
  });

  it("clears the cookie with the same attributes as it was set, minus the lifetime", () => {
    const res = fakeResponse();

    clearSessionCookie(res, "manager");

    expect(res.clearCookie).toHaveBeenCalledWith("manager_session", { httpOnly: true, secure: false, sameSite: "lax", path: "/" });
  });

  it("reads the token from the role's own cookie", () => {
    const request = requestWith({ cookie: "other=1; manager_session=abc.def; admin_session=zzz" });

    expect(readSessionToken(request, "manager")).toBe("abc.def");
    expect(readSessionToken(request, "admin")).toBe("zzz");
  });

  it("does not read another role's cookie", () => {
    expect(readSessionToken(requestWith({ cookie: "admin_session=zzz" }), "manager")).toBeUndefined();
  });

  it("falls back to a Bearer token while the migration is in progress", () => {
    expect(readSessionToken(requestWith({ authorization: "Bearer abc.def" }), "manager")).toBe("abc.def");
  });

  it("prefers the cookie over a Bearer token", () => {
    const request = requestWith({ cookie: "manager_session=from-cookie", authorization: "Bearer from-header" });

    expect(readSessionToken(request, "manager")).toBe("from-cookie");
  });

  it("ignores an empty cookie value and a non-Bearer authorization scheme", () => {
    expect(readSessionToken(requestWith({ cookie: "manager_session=" }), "manager")).toBeUndefined();
    expect(readSessionToken(requestWith({ authorization: "Basic abc" }), "manager")).toBeUndefined();
  });

  it("returns undefined when there is no cookie header at all", () => {
    expect(readSessionToken(requestWith({}), "manager")).toBeUndefined();
  });

  it("detects a session cookie of any role and ignores unrelated cookies", () => {
    expect(hasSessionCookie(requestWith({ cookie: "peer_partner_session=x" }))).toBe(true);
    expect(hasSessionCookie(requestWith({ cookie: "theme=dark; other=1" }))).toBe(false);
    expect(hasSessionCookie(requestWith({}))).toBe(false);
  });
});
