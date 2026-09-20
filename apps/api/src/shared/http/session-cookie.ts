import { parseCookie } from "cookie";
import type { CookieOptions, Request, Response } from "express";

export const SESSION_COOKIE = {
  manager: "manager_session",
  admin: "admin_session",
  peerPartner: "peer_partner_session",
} as const;

export type SessionRole = keyof typeof SESSION_COOKIE;

export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  };
}

export function parseCookieHeader(header: string | undefined): Record<string, string | undefined> {
  return header ? parseCookie(header) : {};
}

export function setSessionCookie(res: Response, role: SessionRole, token: string): void {
  res.cookie(SESSION_COOKIE[role], token, { ...baseCookieOptions(), maxAge: SESSION_MAX_AGE_MS });
}

export function clearSessionCookie(res: Response, role: SessionRole): void {
  res.clearCookie(SESSION_COOKIE[role], baseCookieOptions());
}

export function readSessionToken(request: Pick<Request, "headers">, role: SessionRole): string | undefined {
  const fromCookie = parseCookieHeader(request.headers.cookie)[SESSION_COOKIE[role]];
  if (fromCookie) return fromCookie;

  const authorization = request.headers.authorization;
  return authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
}

export function hasSessionCookie(request: Pick<Request, "headers">): boolean {
  const cookies = parseCookieHeader(request.headers.cookie);
  return Object.values(SESSION_COOKIE).some((name) => Boolean(cookies[name]));
}
