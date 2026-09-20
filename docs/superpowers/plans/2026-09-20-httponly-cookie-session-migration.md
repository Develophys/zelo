# HttpOnly Cookie Session Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Manager, SuperAdmin and PeerPartner session tokens out of `sessionStorage` and `Authorization: Bearer` into `HttpOnly` cookies, without breaking `develop`, dev or production at any merge.

**Architecture:** Three phases. **Expand** (API only): the API accepts the cookie or a Bearer token, login sets the cookie and still returns the token, and `/me` and `/logout` appear. **Migrate** (web, one role per PR): the web app switches role by role to cookies through one `apiFetch`, one central 401 handler and a `/me`-backed route guard. **Contract**: the API stops accepting Bearer and stops returning the token. A shared origin check protects state-changing requests that carry a session cookie.

**Tech Stack:** NestJS 10 + Express, the `cookie` package, zod, Vitest + supertest; React 19 + react-router data router, TanStack Query, zustand, socket.io.

**Spec:** `docs/superpowers/specs/2026-09-20-httponly-cookie-session-migration-design.md`

**Deviation from the spec (recorded, and applied to the spec in Task 0):** the spec says to add `cookie-parser`. This plan reads the `Cookie` header with the `cookie` package's `parse` inside one helper (`shared/http/session-cookie.ts`) used by the guards, the origin check and the WebSocket gateway. There is no middleware whose order matters, controller tests need no extra setup, and HTTP and WebSocket share one parser.

## Global Constraints

- **Cookie contract (spec §2):** names `manager_session`, `admin_session`, `peer_partner_session`; value is the existing HMAC token unchanged; `HttpOnly`; `SameSite=Strict`; `Path=/`; **no `Domain` attribute**; `Max-Age` 28800 seconds (8 h); `Secure` is `true` when `NODE_ENV === "production"` and `false` otherwise.
- **Origin check (spec §3):** refuse with **403** any `POST`, `PUT`, `PATCH` or `DELETE` that carries a session cookie and whose `Origin` header is missing or not in `CORS_ALLOWED_ORIGINS`. Requests with no session cookie, and all `GET`s, are untouched.
- **Guards keep their re-reads:** `ManagerAuthGuard` re-reads the manager and the institution; `AdminAuthGuard` re-reads the row through `ADMIN_REPOSITORY.findById`; `PeerPartnerAuthGuard` gains the same `isActive` re-read through `PEER_PARTNER_REPOSITORY.findById`.
- **`/me` payloads:** manager `{ name, role }`; admin `{ name }`; peer partner `{ name, specialty }`. `POST /<role>/logout` answers 204.
- **A setup token is not a session token.** `finish-manager-setup.usecase.ts`, `finish-peer-partner-setup.usecase.ts`, every `finishSetup(token, password)` in ports and adapters, `FinishSetupForm`, and the `finish-setup/:token` routes carry an invite token and **keep** their `token` parameter. Only the session token is removed.
- **Anonymous adapters do not change** (`http-assessment-submission`, `http-chat-gateway`, `http-institution-link`, `http-signal-checkin`): they keep plain `fetch` and never send credentials.
- **Import extensions (`apps/api`):** relative specifiers end `.ts`; `@/`-aliased specifiers end `.js`. Get it backwards and `tsc` and `vitest` stay green while the `dist` breaks. `apps/web` uses no extensions.
- **No new explanatory code comments.** The rationale goes in a test name or the commit message.
- **TDD:** every behavior change starts with a failing test, and the plan says what "failing" looks like.
- **Each phase merges as separate PRs into `develop`**, never a squash of several tasks; the PR list is at the end of this file.
- **Nothing in phase 1 or 2 may make the current site stop working.** Phase 3 is the only place sessions end.

## File Structure

Created (API, `apps/api/src/shared/http/`): `allowed-origins.ts`, `session-cookie.ts`, `origin-check.ts`, `configure-app.ts`, each with a `*.test.ts`.

Modified (API): `main.ts`, the three `*-auth.guard.ts`, the three login controllers (`manager.controller.ts`, `admin.controller.ts`, `peer-partner.controller.ts`), `types/express.d.ts`, `peer-chat.gateway.ts`, and the matching tests.

Created (web): `infrastructure/http/api-fetch.ts`, `app/session-expiry.ts`, `app/routes/require-session.ts`, three `use-cases/*-session.usecase.ts` pairs (get and logout, per role), each with tests.

Modified (web): the 7 staff adapters, their ports, 24 use-cases, 24 hooks, the 3 session stores, the 3 login hooks, the 3 route files, 4 logout sites, `query-client.ts`, `App.tsx`, the socket client and hook, `PeerPartnerInboxPage.tsx`, and about 49 test files.

---

## Phase 1 — Expand (API only)

### Task 0: Amend the spec for the parsing deviation

Already done in the pull request that added this plan: the spec's section 3 now says the `Cookie` header is read with the `cookie` package's `parse` and that there is no `cookie-parser` middleware. Nothing to do; start at Task 1.

### Task 1: Shared allowed-origins resolver

The resolver is duplicated in `main.ts` and `peer-chat.gateway.ts`. Extract it once.

**Files:**
- Create: `apps/api/src/shared/http/allowed-origins.ts`
- Test: `apps/api/src/shared/http/allowed-origins.test.ts`
- Modify: `apps/api/src/main.ts`, `apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.ts`

**Interfaces:**
- Produces: `DEFAULT_ALLOWED_ORIGINS: string[]`; `resolveAllowedOrigins(env?: Record<string, string | undefined>): string[]`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @zelo/api exec vitest run src/shared/http/allowed-origins.test.ts`
Expected: FAIL, `Cannot find module './allowed-origins.ts'`.

- [ ] **Step 3: Implement**

```ts
export const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:8080"];

export function resolveAllowedOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const configured = env.CORS_ALLOWED_ORIGINS;
  if (!configured) return DEFAULT_ALLOWED_ORIGINS;
  return configured.split(",").map((origin) => origin.trim()).filter((origin) => origin.length > 0);
}
```

- [ ] **Step 4: Use it in `main.ts` and the gateway**

In `apps/api/src/main.ts`, delete these lines (keep the comment above them):

```ts
const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:8080"];

function resolveAllowedOrigins(): string[] {
  const configured = process.env.CORS_ALLOWED_ORIGINS;
  if (!configured) return DEFAULT_ALLOWED_ORIGINS;
  return configured.split(",").map((origin) => origin.trim()).filter((origin) => origin.length > 0);
}
```

and add `import { resolveAllowedOrigins } from "./shared/http/allowed-origins.ts";` with the other imports.

In `peer-chat.gateway.ts`, delete the same `DEFAULT_ALLOWED_ORIGINS` constant and `resolveAllowedOrigins` function, and add `import { resolveAllowedOrigins } from "@/shared/http/allowed-origins.js";` next to the other `@/shared` import.

- [ ] **Step 5: Run the affected tests**

Run: `pnpm --filter @zelo/api exec vitest run src/shared/http src/modules/peer-chat && pnpm --filter @zelo/api exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/shared/http/allowed-origins.ts apps/api/src/shared/http/allowed-origins.test.ts apps/api/src/main.ts apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.ts
git commit -m "refactor(api): share one allowed-origins resolver between main and the gateway"
```

### Task 2: Session cookie helpers

**Files:**
- Modify: `apps/api/package.json` (dependency)
- Create: `apps/api/src/shared/http/session-cookie.ts`
- Test: `apps/api/src/shared/http/session-cookie.test.ts`

**Interfaces:**
- Produces:
  - `SESSION_COOKIE: { manager: "manager_session"; admin: "admin_session"; peerPartner: "peer_partner_session" }`
  - `type SessionRole = keyof typeof SESSION_COOKIE`
  - `SESSION_MAX_AGE_MS = 28_800_000`
  - `parseCookieHeader(header: string | undefined): Record<string, string | undefined>`
  - `setSessionCookie(res: Response, role: SessionRole, token: string): void`
  - `clearSessionCookie(res: Response, role: SessionRole): void`
  - `readSessionToken(request: Pick<Request, "headers">, role: SessionRole): string | undefined`
  - `hasSessionCookie(request: Pick<Request, "headers">): boolean`

- [ ] **Step 1: Install the dependency**

Run: `pnpm --filter @zelo/api add cookie`
Expected: `cookie` appears in `apps/api/package.json` `dependencies` and `pnpm-lock.yaml` changes.

- [ ] **Step 2: Write the failing test**

```ts
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
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm --filter @zelo/api exec vitest run src/shared/http/session-cookie.test.ts`
Expected: FAIL, `Cannot find module './session-cookie.ts'`.

- [ ] **Step 4: Implement**

```ts
import { parse } from "cookie";
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
    sameSite: "lax",
    path: "/",
  };
}

export function parseCookieHeader(header: string | undefined): Record<string, string | undefined> {
  return header ? parse(header) : {};
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
```

- [ ] **Step 5: Run it to see it pass**

Run: `pnpm --filter @zelo/api exec vitest run src/shared/http/session-cookie.test.ts && pnpm --filter @zelo/api exec tsc --noEmit`
Expected: PASS (12 tests), no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/shared/http/session-cookie.ts apps/api/src/shared/http/session-cookie.test.ts
git commit -m "feat(api): session cookie helpers shared by guards, origin check and gateway"
```

### Task 3: Origin check and `configureApp`

`configureApp` assembles the HTTP pipeline (headers, CORS with credentials, origin check) in one testable place; `main.ts` calls it.

**Files:**
- Create: `apps/api/src/shared/http/origin-check.ts`, `apps/api/src/shared/http/configure-app.ts`
- Test: `apps/api/src/shared/http/configure-app.test.ts`
- Modify: `apps/api/src/main.ts`

**Interfaces:**
- Consumes: `resolveAllowedOrigins`, `hasSessionCookie`, `securityHeaders` (existing, `./security-headers.ts`)
- Produces: `originCheck(allowedOrigins: string[]): (req: Request, res: Response, next: NextFunction) => void`; `configureApp(app: INestApplication): void`

- [ ] **Step 1: Write the failing test**

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Controller, Delete, Get, HttpCode, Patch, Post, Put } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { configureApp } from "./configure-app.ts";

const ALLOWED = "https://www.zelohealth.app";
const FOREIGN = "https://dev.zelohealth.app";

@Controller("probe")
class ProbeController {
  @Get()
  read(): { ok: true } {
    return { ok: true };
  }

  @Post()
  @HttpCode(200)
  create(): { ok: true } {
    return { ok: true };
  }

  @Put()
  replace(): { ok: true } {
    return { ok: true };
  }

  @Patch()
  update(): { ok: true } {
    return { ok: true };
  }

  @Delete()
  remove(): { ok: true } {
    return { ok: true };
  }
}

describe("configureApp", () => {
  let app: INestApplication;

  beforeAll(async () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", ALLOWED);
    const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const cookie = "manager_session=abc.def";

  it("answers a preflight from an allowed origin with credentials enabled and the origin echoed", async () => {
    const response = await request(app.getHttpServer())
      .options("/probe")
      .set("Origin", ALLOWED)
      .set("Access-Control-Request-Method", "POST");

    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not grant CORS to an origin that is not in the list", async () => {
    const response = await request(app.getHttpServer())
      .options("/probe")
      .set("Origin", FOREIGN)
      .set("Access-Control-Request-Method", "POST");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("keeps the security headers in front of everything", async () => {
    const response = await request(app.getHttpServer()).get("/probe");

    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  const stateChanging = [
    ["POST", () => request(app.getHttpServer()).post("/probe")],
    ["PUT", () => request(app.getHttpServer()).put("/probe")],
    ["PATCH", () => request(app.getHttpServer()).patch("/probe")],
    ["DELETE", () => request(app.getHttpServer()).delete("/probe")],
  ] as const;

  it.each(stateChanging)("allows a %s that carries a session cookie from an allowed origin", async (_method, send) => {
    const response = await send().set("Cookie", cookie).set("Origin", ALLOWED);

    expect(response.status).toBe(200);
  });

  it.each(stateChanging)("refuses a %s that carries a session cookie from a foreign origin with 403", async (_method, send) => {
    const response = await send().set("Cookie", cookie).set("Origin", FOREIGN);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ statusCode: 403, message: "Forbidden" });
  });

  it("refuses a state-changing request that carries a session cookie and no Origin header", async () => {
    const response = await request(app.getHttpServer()).post("/probe").set("Cookie", cookie);

    expect(response.status).toBe(403);
  });

  it("refuses when the cookie belongs to any of the three roles", async () => {
    for (const name of ["manager_session", "admin_session", "peer_partner_session"]) {
      const response = await request(app.getHttpServer()).post("/probe").set("Cookie", `${name}=x`).set("Origin", FOREIGN);
      expect(response.status, name).toBe(403);
    }
  });

  it("does not touch a state-changing request that has no session cookie, such as login or an anonymous check-in", async () => {
    const response = await request(app.getHttpServer()).post("/probe").set("Origin", FOREIGN);

    expect(response.status).toBe(200);
  });

  it("does not touch a request whose only cookies are unrelated to the session", async () => {
    const response = await request(app.getHttpServer()).post("/probe").set("Cookie", "theme=dark").set("Origin", FOREIGN);

    expect(response.status).toBe(200);
  });

  it("does not touch a GET, even from a foreign origin with a cookie", async () => {
    const response = await request(app.getHttpServer()).get("/probe").set("Cookie", cookie).set("Origin", FOREIGN);

    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @zelo/api exec vitest run src/shared/http/configure-app.test.ts`
Expected: FAIL, `Cannot find module './configure-app.ts'`.

- [ ] **Step 3: Implement**

`apps/api/src/shared/http/origin-check.ts`:

```ts
import type { NextFunction, Request, Response } from "express";
import { hasSessionCookie } from "./session-cookie.ts";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function originCheck(allowedOrigins: string[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!STATE_CHANGING_METHODS.has(request.method) || !hasSessionCookie(request)) {
      next();
      return;
    }

    const origin = request.headers.origin;
    if (typeof origin === "string" && allowedOrigins.includes(origin)) {
      next();
      return;
    }

    response.status(403).json({ statusCode: 403, message: "Forbidden" });
  };
}
```

`apps/api/src/shared/http/configure-app.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import { resolveAllowedOrigins } from "./allowed-origins.ts";
import { originCheck } from "./origin-check.ts";
import { securityHeaders } from "./security-headers.ts";

export function configureApp(app: INestApplication): void {
  const allowedOrigins = resolveAllowedOrigins();
  app.use(securityHeaders());
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.use(originCheck(allowedOrigins));
}
```

- [ ] **Step 4: Wire it into `main.ts`**

Replace, inside `bootstrap()`:

```ts
  app.use(securityHeaders());
  app.enableCors({ origin: resolveAllowedOrigins() });
```

with:

```ts
  configureApp(app);
```

Then fix the imports at the top of `main.ts`: remove `securityHeaders` and `resolveAllowedOrigins` (no longer used there), and add `import { configureApp } from "./shared/http/configure-app.ts";`.

- [ ] **Step 5: Run the tests and the type check**

Run: `pnpm --filter @zelo/api exec vitest run src/shared/http && pnpm --filter @zelo/api exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/shared/http/origin-check.ts apps/api/src/shared/http/configure-app.ts apps/api/src/shared/http/configure-app.test.ts apps/api/src/main.ts
git commit -m "feat(api): refuse cookie-carrying state-changing requests from foreign origins"
```

### Task 4: Manager backend — cookie login, guard, `/me`, `/logout`

**Files:**
- Modify: `apps/api/src/modules/manager/infrastructure/manager-auth.guard.ts`, `apps/api/src/modules/manager/infrastructure/manager.controller.ts`
- Test: `apps/api/src/modules/manager/infrastructure/manager-auth.guard.test.ts`, `apps/api/src/modules/manager/infrastructure/manager.controller.test.ts`

**Interfaces:**
- Consumes: `readSessionToken`, `setSessionCookie`, `clearSessionCookie` (Task 2)
- Produces: `GET /manager/me` → `{ name: string; role: "HOSPITAL_ADMIN" | "SECTOR_MANAGER" }`; `POST /manager/logout` → 204

- [ ] **Step 1: Write the failing guard tests**

Append to `manager-auth.guard.test.ts` (keep the existing tests). Add this helper next to `contextWithHeader`:

```ts
function contextWithCookie(cookie: string | undefined, authorization?: string): { context: ExecutionContext; request: Partial<Request> } {
  const request: Partial<Request> = { headers: { cookie, authorization } as Request["headers"] };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { context, request };
}
```

and these tests inside `describe("ManagerAuthGuard", ...)`:

```ts
  it("allows a request whose token is in the manager_session cookie and attaches the manager", async () => {
    const guard = buildGuard([managerRow()]);
    const { token } = tokenService.issue("manager-1", "Ana Konder", "institution-1", "SECTOR_MANAGER");
    const { context, request } = contextWithCookie(`manager_session=${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.manager).toEqual({ id: "manager-1", name: "Ana Konder", institutionId: "institution-1", role: "SECTOR_MANAGER" });
  });

  it("does not let a Bearer header rescue a cookie that is present but invalid", async () => {
    const guard = buildGuard([managerRow()]);
    const { token } = tokenService.issue("manager-1", "Ana Konder", "institution-1", "SECTOR_MANAGER");
    const { context } = contextWithCookie("manager_session=forged.token", `Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("does not accept another role's cookie", async () => {
    const guard = buildGuard([managerRow()]);
    const { token } = tokenService.issue("manager-1", "Ana Konder", "institution-1", "SECTOR_MANAGER");
    const { context } = contextWithCookie(`admin_session=${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a cookie whose manager has since been deactivated", async () => {
    const guard = buildGuard([managerRow({ isActive: false })]);
    const { token } = tokenService.issue("manager-1", "Ana Konder", "institution-1", "SECTOR_MANAGER");
    const { context } = contextWithCookie(`manager_session=${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a cookie whose institution has since been deactivated", async () => {
    const guard = buildGuard([managerRow()], [institutionRow({ isActive: false })]);
    const { token } = tokenService.issue("manager-1", "Ana Konder", "institution-1", "SECTOR_MANAGER");
    const { context } = contextWithCookie(`manager_session=${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
```

- [ ] **Step 2: Write the failing controller tests**

Append to `manager.controller.test.ts`, inside `describe("manager controller", ...)`, after the existing login tests:

```ts
  function sessionCookieOf(response: request.Response): string {
    const header = response.headers["set-cookie"] as unknown as string[] | undefined;
    return header?.find((cookie) => cookie.startsWith("manager_session=")) ?? "";
  }

  it("POST /manager/login also sets the session as an HttpOnly, SameSite=Lax cookie that lasts eight hours", async () => {
    const response = await request(app.getHttpServer())
      .post("/manager/login")
      .send({ email: "ana@zelo-demo.local", password: "test-password" });

    const cookie = sessionCookieOf(response);
    expect(cookie).toContain(`manager_session=${response.body.token}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=28800");
    expect(cookie).not.toContain("Domain=");
  });

  it("POST /manager/login does not set a cookie for a wrong password", async () => {
    const response = await request(app.getHttpServer())
      .post("/manager/login")
      .send({ email: "ana@zelo-demo.local", password: "wrong-password" });

    expect(sessionCookieOf(response)).toBe("");
  });

  it("GET /manager/me returns the name and role for a valid session cookie", async () => {
    const token = await getToken("ana@zelo-demo.local", "test-password");

    const response = await request(app.getHttpServer()).get("/manager/me").set("Cookie", `manager_session=${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: "Ana Konder", role: "HOSPITAL_ADMIN" });
  });

  it("GET /manager/me still accepts a Bearer token while the migration is in progress", async () => {
    const token = await getToken("ana@zelo-demo.local", "test-password");

    const response = await request(app.getHttpServer()).get("/manager/me").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
  });

  it("GET /manager/me rejects a request with no session with 401", async () => {
    const response = await request(app.getHttpServer()).get("/manager/me");

    expect(response.status).toBe(401);
  });

  it("GET /manager/me rejects the cookie of a manager who has been deactivated with 401", async () => {
    const token = await getToken("beatriz@zelo-demo.local", "test-password-2");
    const row = managerRepository.rows.find((candidate) => candidate.id === "manager-2")!;
    row.isActive = false;

    try {
      const response = await request(app.getHttpServer()).get("/manager/me").set("Cookie", `manager_session=${token}`);
      expect(response.status).toBe(401);
    } finally {
      row.isActive = true;
    }
  });

  it("POST /manager/logout clears the session cookie and answers 204", async () => {
    const response = await request(app.getHttpServer()).post("/manager/logout");

    expect(response.status).toBe(204);
    const cookie = sessionCookieOf(response);
    expect(cookie).toContain("manager_session=;");
    expect(cookie).toContain("Expires=Thu, 01 Jan 1970");
    expect(cookie).toContain("HttpOnly");
  });
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/infrastructure/manager-auth.guard.test.ts src/modules/manager/infrastructure/manager.controller.test.ts`
Expected: FAIL. The cookie guard tests reject a valid cookie (the guard reads only the header), the login test finds no `set-cookie`, and `/manager/me` and `/manager/logout` answer 404.

- [ ] **Step 4: Update the guard**

In `manager-auth.guard.ts`, add `import { readSessionToken } from "@/shared/http/session-cookie.js";`, delete the two-line comment above `@Injectable()` (it says the guard verifies a Bearer token "not an HttpOnly cookie", which stops being true), and replace the header parsing so `canActivate` starts like this:

```ts
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = readSessionToken(request, "manager");
    if (!token) {
      throw new UnauthorizedException();
    }

    const decoded = this.tokenService.verify(token);
    if (!decoded) {
      throw new UnauthorizedException();
    }
```

Leave everything after `const decoded ...` (the two re-reads and `request.manager = ...`) exactly as it is.

- [ ] **Step 5: Update the controller**

In `manager.controller.ts`: change `Req,` to `Req,\n  Res,` in the `@nestjs/common` import; change `import type { Request } from "express";` to `import type { Request, Response } from "express";`; add `import { clearSessionCookie, setSessionCookie } from "@/shared/http/session-cookie.js";`.

Replace the `login` method with:

```ts
  @Post("login")
  @HttpCode(200)
  @LoginThrottle()
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response): Promise<IssuedManagerToken> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      const issued = await this.loginManager.execute(parsed.data.email, parsed.data.password);
      setSessionCookie(response, "manager", issued.token);
      return issued;
    } catch (error) {
      if (error instanceof InvalidManagerCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }

  @Post("logout")
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    clearSessionCookie(response, "manager");
  }

  @Get("me")
  @UseGuards(ManagerAuthGuard)
  me(@Req() request: Request): { name: string; role: NonNullable<Request["manager"]>["role"] } {
    const manager = request.manager!;
    return { name: manager.name, role: manager.role };
  }
```

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager && pnpm --filter @zelo/api exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/manager/infrastructure/manager-auth.guard.ts apps/api/src/modules/manager/infrastructure/manager-auth.guard.test.ts apps/api/src/modules/manager/infrastructure/manager.controller.ts apps/api/src/modules/manager/infrastructure/manager.controller.test.ts
git commit -m "feat(api): manager session cookie, /manager/me and /manager/logout"
```

### Task 5: Admin backend — cookie login, guard, `/me`, `/logout`

**Files:**
- Modify: `apps/api/src/modules/admin/infrastructure/admin-auth.guard.ts`, `apps/api/src/modules/admin/infrastructure/admin.controller.ts`
- Test: `apps/api/src/modules/admin/infrastructure/admin-auth.guard.test.ts`, `apps/api/src/modules/admin/infrastructure/admin.controller.test.ts`

**Interfaces:**
- Produces: `GET /admin/me` → `{ name: string }`; `POST /admin/logout` → 204

- [ ] **Step 1: Write the failing guard tests**

Append to `admin-auth.guard.test.ts` (keep existing tests). Add the helper next to `contextWithHeader`:

```ts
function contextWithCookie(cookie: string | undefined, authorization?: string): { context: ExecutionContext; request: Partial<Request> } {
  const request: Partial<Request> = { headers: { cookie, authorization } as Request["headers"] };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { context, request };
}
```

and inside `describe("AdminAuthGuard", ...)`:

```ts
  it("allows a request whose token is in the admin_session cookie and attaches the admin", async () => {
    const guard = buildGuard([adminRow()]);
    const { token } = tokenService.issue("admin-1", "Zelo Ops");
    const { context, request } = contextWithCookie(`admin_session=${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.admin).toEqual({ id: "admin-1", name: "Zelo Ops" });
  });

  it("does not let a Bearer header rescue a cookie that is present but invalid", async () => {
    const guard = buildGuard([adminRow()]);
    const { token } = tokenService.issue("admin-1", "Zelo Ops");
    const { context } = contextWithCookie("admin_session=forged.token", `Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("does not accept another role's cookie", async () => {
    const guard = buildGuard([adminRow()]);
    const { token } = tokenService.issue("admin-1", "Zelo Ops");
    const { context } = contextWithCookie(`manager_session=${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a cookie whose admin has since been deactivated", async () => {
    const guard = buildGuard([adminRow({ isActive: false })]);
    const { token } = tokenService.issue("admin-1", "Zelo Ops");
    const { context } = contextWithCookie(`admin_session=${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a cookie whose admin row no longer exists", async () => {
    const guard = buildGuard([]);
    const { token } = tokenService.issue("admin-1", "Zelo Ops");
    const { context } = contextWithCookie(`admin_session=${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
```

- [ ] **Step 2: Write the failing controller tests**

Append to `admin.controller.test.ts` inside its `describe`, after the existing login tests:

```ts
  function adminCookieOf(response: request.Response): string {
    const header = response.headers["set-cookie"] as unknown as string[] | undefined;
    return header?.find((cookie) => cookie.startsWith("admin_session=")) ?? "";
  }

  it("POST /admin/login also sets the session as an HttpOnly, SameSite=Lax cookie that lasts eight hours", async () => {
    const response = await request(app.getHttpServer()).post("/admin/login").send({ email: "ops@zelo-demo.local", password: "test-password" });

    const cookie = adminCookieOf(response);
    expect(cookie).toContain(`admin_session=${response.body.token}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=28800");
    expect(cookie).not.toContain("Domain=");
  });

  it("GET /admin/me returns the admin's name for a valid session cookie", async () => {
    const login = await request(app.getHttpServer()).post("/admin/login").send({ email: "ops@zelo-demo.local", password: "test-password" });

    const response = await request(app.getHttpServer()).get("/admin/me").set("Cookie", `admin_session=${login.body.token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: "Zelo Ops" });
  });

  it("GET /admin/me still accepts a Bearer token while the migration is in progress", async () => {
    const login = await request(app.getHttpServer()).post("/admin/login").send({ email: "ops@zelo-demo.local", password: "test-password" });

    const response = await request(app.getHttpServer()).get("/admin/me").set("Authorization", `Bearer ${login.body.token}`);

    expect(response.status).toBe(200);
  });

  it("GET /admin/me rejects a request with no session with 401", async () => {
    const response = await request(app.getHttpServer()).get("/admin/me");

    expect(response.status).toBe(401);
  });

  it("POST /admin/logout clears the session cookie and answers 204", async () => {
    const response = await request(app.getHttpServer()).post("/admin/logout");

    expect(response.status).toBe(204);
    const cookie = adminCookieOf(response);
    expect(cookie).toContain("admin_session=;");
    expect(cookie).toContain("Expires=Thu, 01 Jan 1970");
  });
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/admin/infrastructure`
Expected: FAIL (cookie guard tests reject a valid cookie; no `set-cookie`; `/admin/me` and `/admin/logout` answer 404).

- [ ] **Step 4: Update the guard**

Replace the body of `admin-auth.guard.ts` (imports first, then the class) with:

```ts
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { AdminTokenService } from "../application/services/admin-token.service.ts";
import { ADMIN_REPOSITORY, type AdminRepository } from "../application/ports/admin-repository.port.ts";
import { readSessionToken } from "@/shared/http/session-cookie.js";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    @Inject(AdminTokenService) private readonly tokenService: AdminTokenService,
    @Inject(ADMIN_REPOSITORY) private readonly adminRepository: AdminRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = readSessionToken(request, "admin");
    if (!token) {
      throw new UnauthorizedException();
    }

    const decoded = this.tokenService.verify(token);
    if (!decoded) {
      throw new UnauthorizedException();
    }

    const admin = await this.adminRepository.findById(decoded.adminId);
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException();
    }

    request.admin = { id: decoded.adminId, name: decoded.adminName };
    return true;
  }
}
```

- [ ] **Step 5: Update the controller**

In `admin.controller.ts`: add `Get`, `Res` to the `@nestjs/common` import (keep every name already imported), change the express type import to `import type { Request, Response } from "express";` (add `Request` only if the file does not already import it), and add `import { clearSessionCookie, setSessionCookie } from "@/shared/http/session-cookie.js";`.

Replace the `login` method with:

```ts
  @Post("login")
  @HttpCode(200)
  @LoginThrottle()
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response): Promise<IssuedAdminToken> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      const issued = await this.loginAdmin.execute(parsed.data.email, parsed.data.password);
      setSessionCookie(response, "admin", issued.token);
      return issued;
    } catch (error) {
      if (error instanceof InvalidAdminCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }

  @Post("logout")
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    clearSessionCookie(response, "admin");
  }

  @Get("me")
  @UseGuards(AdminAuthGuard)
  me(@Req() request: Request): { name: string } {
    return { name: request.admin!.name };
  }
```

The original `catch` rethrows every other error, as above.

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/admin && pnpm --filter @zelo/api exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/admin/infrastructure/admin-auth.guard.ts apps/api/src/modules/admin/infrastructure/admin-auth.guard.test.ts apps/api/src/modules/admin/infrastructure/admin.controller.ts apps/api/src/modules/admin/infrastructure/admin.controller.test.ts
git commit -m "feat(api): admin session cookie, /admin/me and /admin/logout"
```

### Task 6: PeerPartner REST backend — guard re-read, cookie login, `/me`, `/logout`

`PeerPartnerAuthGuard` is provided but wired to no route, and it accepts a deactivated peer partner's token. It becomes the guard of `/peer-partner/me`, so it must re-read the row like the others.

**Files:**
- Modify: `apps/api/src/types/express.d.ts`, `apps/api/src/modules/peer-partner/infrastructure/peer-partner-auth.guard.ts`, `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts`
- Test: `apps/api/src/modules/peer-partner/infrastructure/peer-partner-auth.guard.test.ts`, `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.test.ts`

**Interfaces:**
- Consumes: `PEER_PARTNER_REPOSITORY.findById(id): Promise<PeerPartnerRow | null>` (row has `id`, `name`, `institutionId`, `specialty`, `isActive`)
- Produces: `GET /peer-partner/me` → `{ name: string; specialty: string }`; `POST /peer-partner/logout` → 204; `Request.peerPartner` gains `specialty: string`

- [ ] **Step 1: Write the failing guard tests**

Rewrite `peer-partner-auth.guard.test.ts` completely (the constructor now takes a repository, so the old tests must change with it):

```ts
import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { PeerPartnerAuthGuard } from "./peer-partner-auth.guard.ts";
import { PeerPartnerTokenService } from "../application/services/peer-partner-token.service.ts";
import type { PeerPartnerRepository, PeerPartnerRow } from "../application/ports/peer-partner-repository.port.ts";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  rows: PeerPartnerRow[] = [];
  async findByEmail(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }
  async findAllByInstitution(): Promise<never> {
    throw new Error("not used in this test");
  }
  async create(): Promise<never> {
    throw new Error("not used in this test");
  }
  async update(): Promise<void> {
    throw new Error("not used in this test");
  }
  async findLapsedInvites(): Promise<never> {
    throw new Error("not used in this test");
  }
  async delete(): Promise<never> {
    throw new Error("not used in this test");
  }
}

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

function contextWith(headers: { authorization?: string; cookie?: string }): { context: ExecutionContext; request: Partial<Request> } {
  const request: Partial<Request> = { headers: headers as Request["headers"] };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { context, request };
}

function peerPartnerRow(overrides: Partial<PeerPartnerRow> = {}): PeerPartnerRow {
  return {
    id: "peer-1",
    name: "Dra. Ana",
    email: "ana@zelo-demo.local",
    passwordHash: "hash",
    setPasswordTokenExpiresAt: null,
    institutionId: "institution-1",
    specialty: "Clínica médica",
    isActive: true,
    ...overrides,
  };
}

describe("PeerPartnerAuthGuard", () => {
  const tokenService = new PeerPartnerTokenService(fakeConfig("test-secret"));

  function buildGuard(rows: PeerPartnerRow[]): PeerPartnerAuthGuard {
    const repository = new FakePeerPartnerRepository();
    repository.rows = rows;
    return new PeerPartnerAuthGuard(tokenService, repository);
  }

  it("allows a valid token in the peer_partner_session cookie and attaches the peer partner, including specialty", async () => {
    const guard = buildGuard([peerPartnerRow()]);
    const { token } = tokenService.issue("peer-1", "Dra. Ana", "institution-1");
    const { context, request } = contextWith({ cookie: `peer_partner_session=${token}` });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.peerPartner).toEqual({ id: "peer-1", name: "Dra. Ana", institutionId: "institution-1", specialty: "Clínica médica" });
  });

  it("still allows a valid Bearer token while the migration is in progress", async () => {
    const guard = buildGuard([peerPartnerRow()]);
    const { token } = tokenService.issue("peer-1", "Dra. Ana", "institution-1");
    const { context } = contextWith({ authorization: `Bearer ${token}` });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("rejects a request with no session", async () => {
    const guard = buildGuard([peerPartnerRow()]);
    const { context } = contextWith({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a malformed or tampered token", async () => {
    const guard = buildGuard([peerPartnerRow()]);
    const { context } = contextWith({ cookie: "peer_partner_session=not-a-real-token" });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("does not let a Bearer header rescue a cookie that is present but invalid", async () => {
    const guard = buildGuard([peerPartnerRow()]);
    const { token } = tokenService.issue("peer-1", "Dra. Ana", "institution-1");
    const { context } = contextWith({ cookie: "peer_partner_session=forged.token", authorization: `Bearer ${token}` });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a still-valid token whose peer partner has since been deactivated", async () => {
    const guard = buildGuard([peerPartnerRow({ isActive: false })]);
    const { token } = tokenService.issue("peer-1", "Dra. Ana", "institution-1");
    const { context } = contextWith({ cookie: `peer_partner_session=${token}` });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a still-valid token whose peer partner row no longer exists", async () => {
    const guard = buildGuard([]);
    const { token } = tokenService.issue("peer-1", "Dra. Ana", "institution-1");
    const { context } = contextWith({ cookie: `peer_partner_session=${token}` });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Write the failing controller tests**

In `peer-partner.controller.test.ts`: add `import { PeerPartnerAuthGuard } from "./peer-partner-auth.guard.ts";` and add `PeerPartnerAuthGuard,` to the `providers` array of `Test.createTestingModule` (after `PeerPartnerPasswordService,`). Then append inside the `describe`:

```ts
  function peerCookieOf(response: request.Response): string {
    const header = response.headers["set-cookie"] as unknown as string[] | undefined;
    return header?.find((cookie) => cookie.startsWith("peer_partner_session=")) ?? "";
  }

  it("POST /peer-partner/login also sets the session as an HttpOnly, SameSite=Lax cookie that lasts eight hours", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/login").send({ email: "ana@zelo-demo.local", password: "test-password" });

    const cookie = peerCookieOf(response);
    expect(cookie).toContain(`peer_partner_session=${response.body.token}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=28800");
    expect(cookie).not.toContain("Domain=");
  });

  it("GET /peer-partner/me returns the name and specialty for a valid session cookie", async () => {
    const login = await request(app.getHttpServer()).post("/peer-partner/login").send({ email: "ana@zelo-demo.local", password: "test-password" });

    const response = await request(app.getHttpServer()).get("/peer-partner/me").set("Cookie", `peer_partner_session=${login.body.token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: "Dra. Ana", specialty: expect.any(String) });
  });

  it("GET /peer-partner/me rejects a request with no session with 401", async () => {
    const response = await request(app.getHttpServer()).get("/peer-partner/me");

    expect(response.status).toBe(401);
  });

  it("GET /peer-partner/me rejects the cookie of a peer partner who has been deactivated with 401", async () => {
    const login = await request(app.getHttpServer()).post("/peer-partner/login").send({ email: "ana@zelo-demo.local", password: "test-password" });
    const row = repository.rows.find((candidate) => candidate.id === "peer-1")!;
    row.isActive = false;

    try {
      const response = await request(app.getHttpServer()).get("/peer-partner/me").set("Cookie", `peer_partner_session=${login.body.token}`);
      expect(response.status).toBe(401);
    } finally {
      row.isActive = true;
    }
  });

  it("POST /peer-partner/logout clears the session cookie and answers 204", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/logout");

    expect(response.status).toBe(204);
    const cookie = peerCookieOf(response);
    expect(cookie).toContain("peer_partner_session=;");
    expect(cookie).toContain("Expires=Thu, 01 Jan 1970");
  });
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/peer-partner/infrastructure`
Expected: FAIL. The guard test file does not compile against the one-argument constructor, and the controller tests find no cookie and 404 on `/me` and `/logout`.

- [ ] **Step 4: Extend the request type**

In `apps/api/src/types/express.d.ts`, change the `peerPartner` line to:

```ts
      peerPartner?: { id: string; name: string; institutionId: string; specialty: string };
```

- [ ] **Step 5: Rewrite the guard**

Replace `peer-partner-auth.guard.ts` with:

```ts
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { PeerPartnerTokenService } from "../application/services/peer-partner-token.service.ts";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../application/ports/peer-partner-repository.port.ts";
import { readSessionToken } from "@/shared/http/session-cookie.js";

@Injectable()
export class PeerPartnerAuthGuard implements CanActivate {
  constructor(
    @Inject(PeerPartnerTokenService) private readonly tokenService: PeerPartnerTokenService,
    @Inject(PEER_PARTNER_REPOSITORY) private readonly peerPartnerRepository: PeerPartnerRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = readSessionToken(request, "peerPartner");
    if (!token) {
      throw new UnauthorizedException();
    }

    const decoded = this.tokenService.verify(token);
    if (!decoded) {
      throw new UnauthorizedException();
    }

    const peerPartner = await this.peerPartnerRepository.findById(decoded.peerPartnerId);
    if (!peerPartner || !peerPartner.isActive) {
      throw new UnauthorizedException();
    }

    request.peerPartner = {
      id: peerPartner.id,
      name: peerPartner.name,
      institutionId: peerPartner.institutionId,
      specialty: peerPartner.specialty,
    };
    return true;
  }
}
```

- [ ] **Step 6: Update the controller**

In `peer-partner.controller.ts`: change the first import to add `Get`, `Req`, `Res` and `UseGuards` (keep the existing names: `BadRequestException, Body, Controller, HttpCode, Inject, Post, UnauthorizedException`); add `import type { Request, Response } from "express";`, `import { PeerPartnerAuthGuard } from "./peer-partner-auth.guard.ts";` and `import { clearSessionCookie, setSessionCookie } from "@/shared/http/session-cookie.js";`.

Replace the `login` method with:

```ts
  @Post("login")
  @HttpCode(200)
  @LoginThrottle()
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response): Promise<IssuedPeerPartnerToken> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      const issued = await this.loginPeerPartner.execute(parsed.data.email, parsed.data.password);
      setSessionCookie(response, "peerPartner", issued.token);
      return issued;
    } catch (error) {
      if (error instanceof InvalidPeerPartnerCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }

  @Post("logout")
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    clearSessionCookie(response, "peerPartner");
  }

  @Get("me")
  @UseGuards(PeerPartnerAuthGuard)
  me(@Req() request: Request): { name: string; specialty: string } {
    const peerPartner = request.peerPartner!;
    return { name: peerPartner.name, specialty: peerPartner.specialty };
  }
```

- [ ] **Step 7: Confirm the module already provides the guard**

Run: `grep -n "PeerPartnerAuthGuard" apps/api/src/modules/peer-partner/peer-partner.module.ts`
Expected: it appears in `providers` (and `exports`). If it does not, add it to `providers`.

- [ ] **Step 8: Run the tests**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/peer-partner src/modules/peer-chat && pnpm --filter @zelo/api exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/types/express.d.ts apps/api/src/modules/peer-partner/infrastructure/peer-partner-auth.guard.ts apps/api/src/modules/peer-partner/infrastructure/peer-partner-auth.guard.test.ts apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.test.ts
git commit -m "feat(api): peer partner session cookie, /peer-partner/me, and the isActive re-read in its guard"
```

### Task 7: Peer-chat gateway reads the session cookie

**Files:**
- Modify: `apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.ts`
- Test: `apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.test.ts`

**Interfaces:**
- Consumes: `parseCookieHeader`, `SESSION_COOKIE` (Task 2), `resolveAllowedOrigins` (Task 1)

- [ ] **Step 1: Write the failing tests**

In `peer-chat.gateway.test.ts`, extend `fakeClient` so a test can set a cookie and an origin. Replace its `network` parameter type and the `headers` line with:

```ts
function fakeClient(id: string, token?: string, network: { address?: string; flyClientIp?: string; cookie?: string; origin?: string } = {}) {
  return {
    id,
    handshake: {
      auth: token ? { token } : {},
      address: network.address ?? `10.0.0.${id.length}`,
      headers: {
        ...(network.flyClientIp ? { "fly-client-ip": network.flyClientIp } : {}),
        ...(network.cookie ? { cookie: network.cookie } : {}),
        ...(network.origin ? { origin: network.origin } : {}),
      },
    },
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
}
```

Add these tests inside the top-level `describe("PeerChatGateway", ...)` after the existing connection tests:

```ts
  describe("session cookie handshake", () => {
    const ALLOWED_ORIGIN = "http://localhost:5173";

    function addPeerPartner(id: string, isActive = true) {
      repository.rows.push({ id, name: "Dra. Ana", email: `${id}@zelo-demo.local`, passwordHash: "irrelevant", setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive });
      return tokenService.issue(id, "Dra. Ana", "institution-1").token;
    }

    it("registers a peer partner who presents the cookie from an allowed origin", async () => {
      const token = addPeerPartner("peer-1");
      const client = fakeClient("socket-cookie", undefined, { cookie: `peer_partner_session=${token}`, origin: ALLOWED_ORIGIN });

      await gateway.handleConnection(client as never);

      expect(presence.findAvailable("institution-1", new Set())?.peerPartnerId).toBe("peer-1");
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it("disconnects a socket that presents the cookie from an origin that is not allowed", async () => {
      const token = addPeerPartner("peer-1");
      const client = fakeClient("socket-cookie", undefined, { cookie: `peer_partner_session=${token}`, origin: "https://evil.example" });

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(presence.findAvailable("institution-1", new Set())).toBeNull();
    });

    it("disconnects a socket that presents the cookie with no origin at all", async () => {
      const token = addPeerPartner("peer-1");
      const client = fakeClient("socket-cookie", undefined, { cookie: `peer_partner_session=${token}` });

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it("disconnects a socket whose cookie is forged", async () => {
      const client = fakeClient("socket-cookie", undefined, { cookie: "peer_partner_session=forged.token", origin: ALLOWED_ORIGIN });

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it("disconnects a socket whose cookie is valid but whose peer partner has been deactivated", async () => {
      const token = addPeerPartner("peer-1", false);
      const client = fakeClient("socket-cookie", undefined, { cookie: `peer_partner_session=${token}`, origin: ALLOWED_ORIGIN });

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it("still registers a peer partner who presents auth.token while the migration is in progress", async () => {
      const token = addPeerPartner("peer-1");
      const client = fakeClient("socket-auth", token);

      await gateway.handleConnection(client as never);

      expect(presence.findAvailable("institution-1", new Set())?.peerPartnerId).toBe("peer-1");
    });

    it("leaves an anonymous connection with no cookie and no token alone", async () => {
      const client = fakeClient("medico-socket", undefined, { origin: "https://evil.example" });

      await gateway.handleConnection(client as never);

      expect(client.disconnect).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/peer-chat/infrastructure/peer-chat.gateway.test.ts`
Expected: FAIL. The cookie tests register nobody (the gateway only reads `auth.token`), so "registers a peer partner who presents the cookie" fails.

- [ ] **Step 3: Update the gateway**

In `peer-chat.gateway.ts`, add `import { SESSION_COOKIE, parseCookieHeader } from "@/shared/http/session-cookie.js";`. Change the decorator to:

```ts
@WebSocketGateway({ cors: { origin: resolveAllowedOrigins(), credentials: true } })
```

Add a field next to `pendingTimeouts`:

```ts
  private readonly allowedOrigins = resolveAllowedOrigins();
```

Replace the start of `handleConnection`:

```ts
  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) return; // an anonymous médico connection — nothing to register
```

with:

```ts
  async handleConnection(client: Socket): Promise<void> {
    const cookieToken = parseCookieHeader(client.handshake.headers.cookie)[SESSION_COOKIE.peerPartner];
    const authToken = client.handshake.auth?.token;
    const token = cookieToken || (typeof authToken === "string" && authToken.length > 0 ? authToken : undefined);
    if (!token) return;

    if (cookieToken && !this.allowedOrigins.includes(client.handshake.headers.origin ?? "")) {
      client.disconnect(true);
      return;
    }
```

(Keep the rest of `handleConnection` unchanged: `verify`, the repository re-read, `presence.register`.) The old inline comment on the removed `return` line goes away with it.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/peer-chat && pnpm --filter @zelo/api exec tsc --noEmit && pnpm --filter @zelo/api exec eslint src/shared/http src/modules`
Expected: PASS, no type or lint errors.

- [ ] **Step 5: Run the whole API suite and the boundaries check**

Run: `pnpm --filter @zelo/api exec vitest run && pnpm turbo run lint lint:boundaries --filter=@zelo/api`
Expected: all tests pass; lint and boundaries green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.ts apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.test.ts
git commit -m "feat(api): peer-chat handshake accepts the session cookie from an allowed origin"
```

### Phase 1 checkpoint (PR 1: Tasks 0 to 7)

- [ ] Push `feat/cookie-session-api-expand`, open the PR, wait for CI.
- [ ] After merge, the `develop` deploy updates `api-dev.zelohealth.app`. Then verify in **headless Chrome against dev** (this is the check the unit tests cannot give), using the script in Task 15 with `PHASE=1`: credentialed CORS works with `helmet` in front (`Cross-Origin-Resource-Policy: same-origin` must not block it), the login response sets the cookie with the right flags, and a cross-origin `POST` that carries the cookie is answered 403.
- [ ] Confirm the current dev site (still on Bearer) keeps working: log in as each role.

---

## Phase 2 — Migrate (web, one role per PR)

### Task 8: `apiFetch`, the peer-partner unauthorized error, and the session-role map

**Files:**
- Create: `apps/web/src/infrastructure/http/api-fetch.ts`, `apps/web/src/app/session-expiry.ts`
- Test: `apps/web/src/infrastructure/http/api-fetch.test.ts`, `apps/web/src/app/session-expiry.test.ts`
- Modify: `apps/web/src/ports/peer-partner-auth.port.ts` (add `UnauthorizedPeerPartnerError`)

**Interfaces:**
- Produces:
  - `apiFetch(path: string, init?: RequestInit): Promise<Response>`
  - `type SessionRole = "manager" | "admin" | "peerPartner"`
  - `sessionRoleOfError(error: unknown): SessionRole | null`
  - `UnauthorizedPeerPartnerError` (class, `extends Error`), exported from `@/ports/peer-partner-auth.port`

- [ ] **Step 1: Write the failing `apiFetch` test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api-fetch";
import { API_BASE_URL } from "./api-base-url";

describe("apiFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubFetch() {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200 } as Response);
  }

  it("prefixes the API base URL and always sends credentials", async () => {
    const fetchSpy = stubFetch();

    await apiFetch("/manager/me");

    expect(fetchSpy).toHaveBeenCalledWith(`${API_BASE_URL}/manager/me`, { credentials: "include" });
  });

  it("keeps the caller's method, headers and body", async () => {
    const fetchSpy = stubFetch();

    await apiFetch("/manager/admin/sectors", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });

    expect(fetchSpy).toHaveBeenCalledWith(`${API_BASE_URL}/manager/admin/sectors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      credentials: "include",
    });
  });

  it("does not let a caller turn credentials off", async () => {
    const fetchSpy = stubFetch();

    await apiFetch("/x", { credentials: "omit" });

    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });

  it("never adds an Authorization header", async () => {
    const fetchSpy = stubFetch();

    await apiFetch("/x");

    expect(JSON.stringify(fetchSpy.mock.calls[0]?.[1])).not.toContain("Authorization");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @zelo/web exec vitest run src/infrastructure/http/api-fetch.test.ts`
Expected: FAIL, `Failed to resolve import "./api-fetch"`.

- [ ] **Step 3: Implement `apiFetch`**

```ts
import { API_BASE_URL } from "./api-base-url";

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, { ...init, credentials: "include" });
}
```

- [ ] **Step 4: Add `UnauthorizedPeerPartnerError`**

In `apps/web/src/ports/peer-partner-auth.port.ts`, add next to the other error classes (or under the schema if there are none):

```ts
export class UnauthorizedPeerPartnerError extends Error {}
```

- [ ] **Step 5: Write the failing `session-expiry` test**

```ts
import { describe, expect, it } from "vitest";
import { UnauthorizedAdminError } from "@/ports/admin-institution.port";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { UnauthorizedPeerPartnerError } from "@/ports/peer-partner-auth.port";
import { sessionRoleOfError } from "./session-expiry";

describe("sessionRoleOfError", () => {
  it("maps each role's unauthorized error to its role", () => {
    expect(sessionRoleOfError(new UnauthorizedManagerError())).toBe("manager");
    expect(sessionRoleOfError(new UnauthorizedAdminError())).toBe("admin");
    expect(sessionRoleOfError(new UnauthorizedPeerPartnerError())).toBe("peerPartner");
  });

  it("returns null for any other error or value", () => {
    expect(sessionRoleOfError(new Error("boom"))).toBeNull();
    expect(sessionRoleOfError("nope")).toBeNull();
    expect(sessionRoleOfError(null)).toBeNull();
  });
});
```

- [ ] **Step 6: Implement `session-expiry.ts`**

```ts
import { UnauthorizedAdminError } from "@/ports/admin-institution.port";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { UnauthorizedPeerPartnerError } from "@/ports/peer-partner-auth.port";

export type SessionRole = "manager" | "admin" | "peerPartner";

export function sessionRoleOfError(error: unknown): SessionRole | null {
  if (error instanceof UnauthorizedManagerError) return "manager";
  if (error instanceof UnauthorizedAdminError) return "admin";
  if (error instanceof UnauthorizedPeerPartnerError) return "peerPartner";
  return null;
}
```

- [ ] **Step 7: Run and commit**

Run: `pnpm --filter @zelo/web exec vitest run src/infrastructure/http/api-fetch.test.ts src/app/session-expiry.test.ts && pnpm --filter @zelo/web exec tsc --noEmit`
Expected: PASS.

```bash
git add apps/web/src/infrastructure/http/api-fetch.ts apps/web/src/infrastructure/http/api-fetch.test.ts apps/web/src/app/session-expiry.ts apps/web/src/app/session-expiry.test.ts apps/web/src/ports/peer-partner-auth.port.ts
git commit -m "feat(web): apiFetch with credentials and a map from unauthorized errors to session roles"
```

### Task 9: One place ends a rejected session

`createQueryClient` takes an `onSessionExpired(role)` callback. Both caches call it when an error maps to a role, and dedupe is left to the callback (it is idempotent). `App.tsx` wires it to the stores and the router.

**Files:**
- Modify: `apps/web/src/app/query-client.ts`, `apps/web/src/app/App.tsx`
- Create: `apps/web/src/app/handle-session-expired.ts`
- Test: `apps/web/src/app/query-client.test.ts` (append), `apps/web/src/app/handle-session-expired.test.ts`

**Interfaces:**
- Consumes: `sessionRoleOfError`, `SessionRole` (Task 8)
- Produces: `createQueryClient(options?: { onSessionExpired?: (role: SessionRole) => void }): QueryClient`; `handleSessionExpired(role: SessionRole, deps: { clearSession: (role: SessionRole) => void; currentPath: () => string; navigate: (to: string, options: { replace: true; state: { reason: "expired" } }) => void }): void`

- [ ] **Step 1: Write the failing `query-client` tests**

Append inside the existing `describe` in `apps/web/src/app/query-client.test.ts` (reuse its imports; add `vi` and `UnauthorizedManagerError`/`UnauthorizedAdminError`/`UnauthorizedPeerPartnerError` imports if missing):

```ts
  it("reports a manager 401 from a query to onSessionExpired", async () => {
    const onSessionExpired = vi.fn();
    const client = createQueryClient({ onSessionExpired });

    await client.fetchQuery({ queryKey: ["m"], queryFn: () => Promise.reject(new UnauthorizedManagerError()), retry: false }).catch(() => undefined);

    expect(onSessionExpired).toHaveBeenCalledWith("manager");
  });

  it("reports an admin 401 from a mutation to onSessionExpired, and does not toast for it", async () => {
    const onSessionExpired = vi.fn();
    const client = createQueryClient({ onSessionExpired });
    const toastSpy = vi.spyOn(toast, "error");

    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(new UnauthorizedAdminError()) })
      .execute(undefined)
      .catch(() => undefined);

    expect(onSessionExpired).toHaveBeenCalledWith("admin");
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("reports a peer-partner 401 to onSessionExpired", async () => {
    const onSessionExpired = vi.fn();
    const client = createQueryClient({ onSessionExpired });

    await client.fetchQuery({ queryKey: ["p"], queryFn: () => Promise.reject(new UnauthorizedPeerPartnerError()), retry: false }).catch(() => undefined);

    expect(onSessionExpired).toHaveBeenCalledWith("peerPartner");
  });

  it("does not call onSessionExpired for an ordinary error, and a failing mutation still toasts", async () => {
    const onSessionExpired = vi.fn();
    const client = createQueryClient({ onSessionExpired });
    const toastSpy = vi.spyOn(toast, "error");

    await client.fetchQuery({ queryKey: ["x"], queryFn: () => Promise.reject(new Error("boom")), retry: false }).catch(() => undefined);
    await client.getMutationCache().build(client, { mutationFn: () => Promise.reject(new Error("boom")) }).execute(undefined).catch(() => undefined);

    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledTimes(1);
  });
```

If the file does not already import `toast` from `@/stores/toast.store`, add that import.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @zelo/web exec vitest run src/app/query-client.test.ts`
Expected: FAIL. `createQueryClient` ignores its argument, so `onSessionExpired` is never called, and the admin mutation still toasts.

- [ ] **Step 3: Implement**

Replace `apps/web/src/app/query-client.ts` with (keeping the existing doc comment above `createQueryClient`):

```ts
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "@/stores/toast.store";
import { sessionRoleOfError, type SessionRole } from "./session-expiry";

const MUTATION_FAILED = "Não foi possível concluir a ação. Tente de novo.";

interface CreateQueryClientOptions {
  onSessionExpired?: (role: SessionRole) => void;
}

/**
 * Error handling used to be declared per call site and reached two of eighteen
 * of them, so most admin writes failed in complete silence: the spinner
 * stopped, the modal stayed open with the fields filled, and the only
 * reasonable next move was to press the button again.
 *
 * The cache-level `onError` is a floor, not a ceiling — react-query still runs
 * a mutation's own `onError` when it has one, so a call site with specific copy
 * keeps it and everything else stops failing quietly.
 */
export function createQueryClient({ onSessionExpired }: CreateQueryClientOptions = {}): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        const role = sessionRoleOfError(error);
        if (role) onSessionExpired?.(role);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        const role = sessionRoleOfError(error);
        if (role) {
          onSessionExpired?.(role);
          return;
        }
        if (mutation.options.onError) return;
        toast.error(MUTATION_FAILED);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
      },
    },
  });
}
```

- [ ] **Step 4: Write the failing `handleSessionExpired` test**

```ts
import { describe, expect, it, vi } from "vitest";
import { handleSessionExpired } from "./handle-session-expired";

function deps(currentPath: string) {
  return { clearSession: vi.fn(), currentPath: () => currentPath, navigate: vi.fn() };
}

describe("handleSessionExpired", () => {
  it("clears the role's session and sends the person to that role's login with the expired reason", () => {
    const d = deps("/manager");

    handleSessionExpired("manager", d);

    expect(d.clearSession).toHaveBeenCalledWith("manager");
    expect(d.navigate).toHaveBeenCalledWith("/manager/login", { replace: true, state: { reason: "expired" } });
  });

  it.each([
    ["admin", "/admin/login"],
    ["peerPartner", "/peer/login"],
  ] as const)("uses the %s login route", (role, loginRoute) => {
    const d = deps("/somewhere");

    handleSessionExpired(role, d);

    expect(d.navigate).toHaveBeenCalledWith(loginRoute, { replace: true, state: { reason: "expired" } });
  });

  it("does not navigate a second time when several requests fail at once and the login page is already showing", () => {
    const d = deps("/manager/login");

    handleSessionExpired("manager", d);

    expect(d.clearSession).toHaveBeenCalledWith("manager");
    expect(d.navigate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Implement `handle-session-expired.ts`**

```ts
import { routes } from "@/presentation/lib/routes";
import type { SessionRole } from "./session-expiry";

const LOGIN_ROUTE: Record<SessionRole, string> = {
  manager: routes.managerLogin,
  admin: routes.adminLogin,
  peerPartner: routes.peerPartnerLogin,
};

interface HandleSessionExpiredDeps {
  clearSession: (role: SessionRole) => void;
  currentPath: () => string;
  navigate: (to: string, options: { replace: true; state: { reason: "expired" } }) => void;
}

export function handleSessionExpired(role: SessionRole, { clearSession, currentPath, navigate }: HandleSessionExpiredDeps): void {
  clearSession(role);
  const loginRoute = LOGIN_ROUTE[role];
  if (currentPath() === loginRoute) return;
  navigate(loginRoute, { replace: true, state: { reason: "expired" } });
}
```

- [ ] **Step 6: Wire it in `App.tsx`**

In `apps/web/src/app/App.tsx` replace `const queryClient = createQueryClient();` with:

```tsx
const queryClient = createQueryClient({
  onSessionExpired: (role) =>
    handleSessionExpired(role, {
      clearSession: (target) => {
        if (target === "manager") useManagerSessionStore.getState().clearSession();
        if (target === "admin") useAdminSessionStore.getState().clearSession();
        if (target === "peerPartner") usePeerPartnerSessionStore.getState().clearSession();
      },
      currentPath: () => router.state.location.pathname,
      navigate: (to, options) => void router.navigate(to, options),
    }),
});
```

and add the imports (`handleSessionExpired` from `./handle-session-expired`, the three stores from `@/stores/...`, and `router` from `./router` if `App.tsx` does not already import it).

- [ ] **Step 7: Run and commit**

Run: `pnpm --filter @zelo/web exec vitest run src/app && pnpm --filter @zelo/web exec tsc --noEmit`
Expected: PASS. (`useManagerSessionExpiry` still exists and still runs inside the manager shell; a manager 401 now triggers both, and the second navigation is a no-op because the login page is already showing.)

```bash
git add apps/web/src/app/query-client.ts apps/web/src/app/query-client.test.ts apps/web/src/app/handle-session-expired.ts apps/web/src/app/handle-session-expired.test.ts apps/web/src/app/App.tsx
git commit -m "feat(web): end a rejected session in one place for all three roles"
```

### Task 10: The `/me`-backed route guard

**Files:**
- Create: `apps/web/src/app/routes/require-session.ts`
- Test: `apps/web/src/app/routes/require-session.test.ts`

**Interfaces:**
- Produces: `requireSession<Profile>(options: { loginRoute: string; isLoggedIn: () => boolean; confirm: () => Promise<Profile>; isRejected: (error: unknown) => boolean; onConfirmed: (profile: Profile) => void; onRejected: () => void }): () => Promise<Response | null>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { requireSession } from "./require-session";

class Rejected extends Error {}

function build(overrides: Partial<Parameters<typeof requireSession<{ name: string }>>[0]> = {}) {
  const options = {
    loginRoute: "/manager/login",
    isLoggedIn: () => false,
    confirm: vi.fn().mockResolvedValue({ name: "Ana" }),
    isRejected: (error: unknown) => error instanceof Rejected,
    onConfirmed: vi.fn(),
    onRejected: vi.fn(),
    ...overrides,
  };
  return { options, loader: requireSession(options) };
}

describe("requireSession", () => {
  it("renders at once when the flag says logged in, and confirms with /me in the background", async () => {
    const { options, loader } = build({ isLoggedIn: () => true });

    await expect(loader()).resolves.toBeNull();
    await Promise.resolve();

    expect(options.confirm).toHaveBeenCalledTimes(1);
    expect(options.onConfirmed).toHaveBeenCalledWith({ name: "Ana" });
  });

  it("ends the session when the background confirmation is rejected", async () => {
    const { options, loader } = build({ isLoggedIn: () => true, confirm: vi.fn().mockRejectedValue(new Rejected()) });

    await expect(loader()).resolves.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(options.onRejected).toHaveBeenCalledTimes(1);
  });

  it("ignores a background failure that is not a rejection, such as a network error", async () => {
    const { options, loader } = build({ isLoggedIn: () => true, confirm: vi.fn().mockRejectedValue(new Error("offline")) });

    await expect(loader()).resolves.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(options.onRejected).not.toHaveBeenCalled();
  });

  it("waits for /me when the flag is absent, sets the flag and continues if it answers", async () => {
    const { options, loader } = build();

    await expect(loader()).resolves.toBeNull();

    expect(options.confirm).toHaveBeenCalledTimes(1);
    expect(options.onConfirmed).toHaveBeenCalledWith({ name: "Ana" });
  });

  it("redirects to login when the flag is absent and /me answers 401", async () => {
    const { loader } = build({ confirm: vi.fn().mockRejectedValue(new Rejected()) });

    const result = await loader();

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get("Location")).toBe("/manager/login");
  });

  it("lets a network failure reach the route's error boundary instead of bouncing to login", async () => {
    const { loader } = build({ confirm: vi.fn().mockRejectedValue(new Error("offline")) });

    await expect(loader()).rejects.toThrow("offline");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @zelo/web exec vitest run src/app/routes/require-session.test.ts`
Expected: FAIL, `Failed to resolve import "./require-session"`.

- [ ] **Step 3: Implement**

```ts
import { redirect } from "react-router";

interface RequireSessionOptions<Profile> {
  loginRoute: string;
  isLoggedIn: () => boolean;
  confirm: () => Promise<Profile>;
  isRejected: (error: unknown) => boolean;
  onConfirmed: (profile: Profile) => void;
  onRejected: () => void;
}

export function requireSession<Profile>(options: RequireSessionOptions<Profile>) {
  return async (): Promise<Response | null> => {
    if (options.isLoggedIn()) {
      void options
        .confirm()
        .then(options.onConfirmed)
        .catch((error: unknown) => {
          if (options.isRejected(error)) options.onRejected();
        });
      return null;
    }

    try {
      options.onConfirmed(await options.confirm());
      return null;
    } catch (error) {
      if (options.isRejected(error)) return redirect(options.loginRoute);
      throw error;
    }
  };
}
```

- [ ] **Step 4: Run and commit**

Run: `pnpm --filter @zelo/web exec vitest run src/app/routes/require-session.test.ts && pnpm --filter @zelo/web exec tsc --noEmit`
Expected: PASS.

```bash
git add apps/web/src/app/routes/require-session.ts apps/web/src/app/routes/require-session.test.ts
git commit -m "feat(web): route guard that trusts /me, with the local flag as a hint"
```

### Phase 2 checkpoint A (PR 2: Tasks 8 to 10)

- [ ] `pnpm --filter @zelo/web exec vitest run && pnpm turbo run lint lint:boundaries --filter=@zelo/web`, then PR. The site is still on Bearer and no screen uses `apiFetch` or `requireSession` yet. One behavior does change, for SuperAdmin only: `http-admin-institution.adapter.ts` already throws `UnauthorizedAdminError` on a 401, so an admin 401 now clears the admin session and sends the person to `/admin/login`, and an admin mutation 401 no longer toasts; before, the page stayed with an inline error. After merge, check it on dev: log in as SuperAdmin, clear the cookie (or let it expire), trigger a refetch. Task 13 adds the expired notice to `AdminLoginPage`.

---

### Task 11: Manager migrates to the cookie

This is the large task. Do it in the order below and commit after each step group; keep the suite green at each commit.

**Interfaces:**
- Produces (auth): `ManagerAuthPort.me(): Promise<ManagerProfile>` and `ManagerAuthPort.logout(): Promise<void>`; `type ManagerProfile = { name: string; role: "HOSPITAL_ADMIN" | "SECTOR_MANAGER" }`; use-cases `GetManagerSessionUseCase.execute(): Promise<ManagerProfile>` and `LogoutManagerUseCase.execute(): Promise<void>`; container exports `getManagerSessionUseCase`, `logoutManagerUseCase`
- Produces (store): `useManagerSessionStore` state `{ loggedIn: boolean; role: ManagerRole | null; name: string | null; setSession(role, name): void; clearSession(): void }` (no token, no `expiresAt`, no `isValid`)

#### 11a. Auth: port, adapter, use-cases, container

- [ ] **Step 1: Write the failing adapter tests** — append to `apps/web/src/infrastructure/http/http-manager-auth.adapter.test.ts` (create the file with the same header as the signals adapter test if it does not exist):

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpManagerAuthAdapter } from "./http-manager-auth.adapter";
import { API_BASE_URL } from "./api-base-url";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";

describe("HttpManagerAuthAdapter session", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("login sends credentials so the browser stores the cookie, and returns only the profile", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: "ignored", expiresAt: "ignored", role: "HOSPITAL_ADMIN", name: "Ana" }),
    } as Response);

    const result = await new HttpManagerAuthAdapter().login("ana@zelo-demo.local", "secret-password");

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(`${API_BASE_URL}/manager/login`);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(result).toEqual({ role: "HOSPITAL_ADMIN", name: "Ana" });
  });

  it("me returns the profile", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200, json: async () => ({ name: "Ana", role: "SECTOR_MANAGER" }) } as Response);

    await expect(new HttpManagerAuthAdapter().me()).resolves.toEqual({ name: "Ana", role: "SECTOR_MANAGER" });
  });

  it("me throws UnauthorizedManagerError on a 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 401 } as Response);

    await expect(new HttpManagerAuthAdapter().me()).rejects.toBeInstanceOf(UnauthorizedManagerError);
  });

  it("me throws a plain error on any other failure, so the route shows its error page instead of the login form", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(new HttpManagerAuthAdapter().me()).rejects.not.toBeInstanceOf(UnauthorizedManagerError);
  });

  it("logout posts with credentials and resolves on 204", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 204 } as Response);

    await new HttpManagerAuthAdapter().logout();

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(`${API_BASE_URL}/manager/logout`);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ method: "POST", credentials: "include" });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @zelo/web exec vitest run src/infrastructure/http/http-manager-auth.adapter.test.ts`
Expected: FAIL (`me` and `logout` are not functions; `login` still returns the token).

- [ ] **Step 3: Update the port** — `apps/web/src/ports/manager-auth.port.ts`:

```ts
import { z } from "zod";

export const ManagerLoginResultSchema = z.object({
  role: z.enum(["HOSPITAL_ADMIN", "SECTOR_MANAGER"]),
  name: z.string(),
});
export type ManagerLoginResult = z.infer<typeof ManagerLoginResultSchema>;
export type ManagerProfile = ManagerLoginResult;

export class InvalidManagerCredentialsError extends Error {}
export class InvalidOrExpiredManagerSetupTokenError extends Error {}

export interface ManagerAuthPort {
  login(email: string, password: string): Promise<ManagerLoginResult>;
  me(): Promise<ManagerProfile>;
  logout(): Promise<void>;
  finishSetup(token: string, password: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
}
```

- [ ] **Step 4: Update the adapter** — in `http-manager-auth.adapter.ts`: add `import { apiFetch } from "./api-fetch";`, `import { UnauthorizedManagerError } from "@/ports/manager-signals.port";` and `import type { ManagerProfile } from "@/ports/manager-auth.port";`; change `login` to use `apiFetch("/manager/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })`; leave `finishSetup` and `requestPasswordReset` on plain `fetch` (they are unauthenticated); add:

```ts
  async me(): Promise<ManagerProfile> {
    const response = await apiFetch("/manager/me");

    if (response.status === 401) {
      throw new UnauthorizedManagerError();
    }
    if (!response.ok) {
      throw new Error(`manager me failed with status ${response.status}`);
    }

    return ManagerLoginResultSchema.parse(await response.json());
  }

  async logout(): Promise<void> {
    const response = await apiFetch("/manager/logout", { method: "POST" });

    if (!response.ok) {
      throw new Error(`manager logout failed with status ${response.status}`);
    }
  }
```

(`ManagerLoginResultSchema` is already imported in this file; the new schema is `{ role, name }`, which is also the `/me` shape.)

- [ ] **Step 5: Add the use-cases** — create `apps/web/src/use-cases/get-manager-session.usecase.ts` and `apps/web/src/use-cases/logout-manager.usecase.ts`:

```ts
import type { ManagerAuthPort, ManagerProfile } from "@/ports/manager-auth.port";

export class GetManagerSessionUseCase {
  constructor(private readonly authPort: ManagerAuthPort) {}

  async execute(): Promise<ManagerProfile> {
    return this.authPort.me();
  }
}
```

```ts
import type { ManagerAuthPort } from "@/ports/manager-auth.port";

export class LogoutManagerUseCase {
  constructor(private readonly authPort: ManagerAuthPort) {}

  async execute(): Promise<void> {
    return this.authPort.logout();
  }
}
```

and a test each (`get-manager-session.usecase.test.ts`, `logout-manager.usecase.test.ts`) that asserts the use-case delegates to a fake port's `me()` / `logout()` once and returns/awaits its result.

- [ ] **Step 6: Export from the container** — `apps/web/src/app/container/manager-auth.ts` gains:

```ts
import { GetManagerSessionUseCase } from "@/use-cases/get-manager-session.usecase";
import { LogoutManagerUseCase } from "@/use-cases/logout-manager.usecase";

export const getManagerSessionUseCase = new GetManagerSessionUseCase(managerAuthAdapter);
export const logoutManagerUseCase = new LogoutManagerUseCase(managerAuthAdapter);
```

- [ ] **Step 7: Run and commit**

Run: `pnpm --filter @zelo/web exec vitest run src/infrastructure/http/http-manager-auth.adapter.test.ts src/use-cases/get-manager-session.usecase.test.ts src/use-cases/logout-manager.usecase.test.ts && pnpm --filter @zelo/web exec tsc --noEmit`
Expected: PASS. (`tsc` will still fail in files that read `result.token`; they are fixed in 11b. If `tsc` fails only in `useManagerLogin.ts`, continue.)

```bash
git add apps/web/src/ports/manager-auth.port.ts apps/web/src/infrastructure/http/http-manager-auth.adapter.ts apps/web/src/infrastructure/http/http-manager-auth.adapter.test.ts apps/web/src/use-cases/get-manager-session.usecase.ts apps/web/src/use-cases/get-manager-session.usecase.test.ts apps/web/src/use-cases/logout-manager.usecase.ts apps/web/src/use-cases/logout-manager.usecase.test.ts apps/web/src/app/container/manager-auth.ts
git commit -m "feat(web): manager auth port, adapter and use-cases for /me and /logout"
```

#### 11b. Store, login hook, logout sites, route guard

- [ ] **Step 1: Write the failing store test** — `apps/web/src/stores/manager-session.store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useManagerSessionStore } from "./manager-session.store";

describe("manager session store", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useManagerSessionStore.setState({ loggedIn: false, role: null, name: null });
  });

  it("starts logged out", () => {
    expect(useManagerSessionStore.getState()).toMatchObject({ loggedIn: false, role: null, name: null });
  });

  it("setSession records the role and name and marks the person logged in", () => {
    useManagerSessionStore.getState().setSession("HOSPITAL_ADMIN", "Ana");

    expect(useManagerSessionStore.getState()).toMatchObject({ loggedIn: true, role: "HOSPITAL_ADMIN", name: "Ana" });
  });

  it("clearSession returns to logged out", () => {
    useManagerSessionStore.getState().setSession("HOSPITAL_ADMIN", "Ana");

    useManagerSessionStore.getState().clearSession();

    expect(useManagerSessionStore.getState()).toMatchObject({ loggedIn: false, role: null, name: null });
  });

  it("holds no token, no expiry and nothing that authenticates", () => {
    const state = useManagerSessionStore.getState() as unknown as Record<string, unknown>;

    expect(state).not.toHaveProperty("token");
    expect(state).not.toHaveProperty("expiresAt");
  });

  it("drops a token left in sessionStorage by an older version of the app when it rehydrates", async () => {
    sessionStorage.setItem(
      "zelo.manager-session",
      JSON.stringify({ state: { token: "leaked.token", expiresAt: "2099-01-01T00:00:00.000Z", role: "HOSPITAL_ADMIN", name: "Ana" }, version: 0 }),
    );

    await useManagerSessionStore.persist.rehydrate();

    const state = useManagerSessionStore.getState() as unknown as Record<string, unknown>;
    expect(state).not.toHaveProperty("token");
    expect(state.loggedIn).toBe(false);
    expect(sessionStorage.getItem("zelo.manager-session")).not.toContain("leaked.token");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @zelo/web exec vitest run src/stores/manager-session.store.test.ts`
Expected: FAIL (the store still has `token`; `setSession` takes four arguments).

- [ ] **Step 3: Rewrite the store** — `apps/web/src/stores/manager-session.store.ts`:

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ManagerRole = "HOSPITAL_ADMIN" | "SECTOR_MANAGER";

interface ManagerSessionState {
  loggedIn: boolean;
  role: ManagerRole | null;
  name: string | null;
  setSession: (role: ManagerRole, name: string) => void;
  clearSession: () => void;
}

const LOGGED_OUT = { loggedIn: false, role: null, name: null } as const;

export const useManagerSessionStore = create<ManagerSessionState>()(
  persist(
    (set) => ({
      ...LOGGED_OUT,
      setSession: (role, name) => set({ loggedIn: true, role, name }),
      clearSession: () => set({ ...LOGGED_OUT }),
    }),
    {
      name: "zelo.manager-session",
      storage: createJSONStorage(() => sessionStorage),
      version: 1,
      migrate: () => ({ ...LOGGED_OUT }),
    },
  ),
);
```

- [ ] **Step 4: Update the login hook** — `useManagerLogin.ts` `onSuccess`:

```ts
    onSuccess: (result) => {
      queryClient.clear();
      setSession(result.role, result.name);
    },
```

with `const queryClient = useQueryClient();` added and `useQueryClient` imported from `@tanstack/react-query`.

- [ ] **Step 5: Add a logout hook** — `apps/web/src/presentation/hooks/useManagerLogout.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logoutManagerUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useManagerLogout() {
  const clearSession = useManagerSessionStore((state) => state.clearSession);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => logoutManagerUseCase.execute(),
    onSettled: () => {
      clearSession();
      queryClient.clear();
    },
  });
}
```

`onSettled` (not `onSuccess`) so a failed logout request still clears the local state; the cookie expires on its own.

- [ ] **Step 6: Point the two logout sites at it** — in `presentation/layout/ManagerBottomNav.tsx` (line ~57) and `presentation/layout/ManagerSidebar.tsx` (line ~181), replace the `clearSession();` call inside the logout handler with `logout.mutate();`, replace the `clearSession` selector line with `const logout = useManagerLogout();`, and import `useManagerLogout`. Keep the navigation that follows the call exactly as it is.

- [ ] **Step 7: Replace the route guard** — in `apps/web/src/app/routes/manager.routes.ts`, replace the layout loader with:

```ts
      loader: requireSession({
        loginRoute: routes.managerLogin,
        isLoggedIn: () => useManagerSessionStore.getState().loggedIn,
        confirm: () => getManagerSessionUseCase.execute(),
        isRejected: (error) => error instanceof UnauthorizedManagerError,
        onConfirmed: (profile) => useManagerSessionStore.getState().setSession(profile.role, profile.name),
        onRejected: () => endSession("manager"),
      }),
```

with imports `requireSession` from `./require-session`, `getManagerSessionUseCase` from `@/app/container`, and `UnauthorizedManagerError` from `@/ports/manager-signals.port`.

`onRejected` ends the session the same way a data 401 does: `endSession("manager")` clears the flag and sends the person to `/manager/login` with `state: { reason: "expired" }` (spec §5: a rejected `/me` goes through the central handler). `endSession` is exported from `app/router.tsx` (added in PR 2). Route files cannot import `router.tsx` (it imports them, an import cycle), so it reaches them as a parameter: change `managerRoutes()` to `managerRoutes(endSession: (role: SessionRole) => void)`, change `createRouteChildren()` in `router.tsx` to `createRouteChildren(endSession: (role: SessionRole) => void = clearRoleSession)` passing it to `managerRoutes(endSession)`, and build `routeChildren` with `createRouteChildren(endSession)`. Tests that call `createRouteChildren()` with no argument keep working and only clear the flag; a test that needs the redirect passes an `endSession` bound to its own memory router. `SessionRole` comes from `@/app/session-expiry` and `clearRoleSession` from `@/app/clear-role-session`.

- [ ] **Step 8: Delete the manager-only expiry hook** — remove `apps/web/src/presentation/hooks/useManagerSessionExpiry.ts` and its call and import in `presentation/layout/ManagerShell.tsx` (line 22 and the import on line 2); delete its test file if one exists.

- [ ] **Step 9: Run and commit**

Run: `pnpm --filter @zelo/web exec vitest run src/stores src/presentation/layout src/app`
Expected: the store tests pass. Some layout and router tests fail because they still seed `token`; fix them now with this rule and re-run: every `useManagerSessionStore.setState({ token: ..., expiresAt: ..., ... })` becomes `useManagerSessionStore.setState({ loggedIn: true, role: "HOSPITAL_ADMIN", name: "Ana" })` (keep the role the test already used), and every `setState({ token: null, expiresAt: null })` becomes `setState({ loggedIn: false, role: null, name: null })`. In `router.test.tsx`, tests that expected a redirect to login for a missing token now stub `getManagerSessionUseCase.execute` (via `vi.spyOn`) to reject with `UnauthorizedManagerError` and assert the redirect; tests that expected the panel to render stub it to resolve `{ name: "Ana", role: "HOSPITAL_ADMIN" }`. Add one router test: "a new tab with a valid cookie but an empty flag reaches the panel" (flag false, `execute` resolves) asserting the manager dashboard renders and the flag becomes true.

```bash
git add -A apps/web/src/stores apps/web/src/presentation apps/web/src/app
git commit -m "feat(web): manager session store, login, logout and route guard use the cookie"
```

(When you stage with `-A` on those three directories, review `git status` first: only files from this step should be present.)

#### 11c. Strip the session token from every manager adapter, port, use-case and hook

The transformation is mechanical. Apply it to the inventory below, one file group at a time, running the group's tests after each.

**Layer rules with a worked example (`signals`):**

Adapter, before:

```ts
  async fetchSignals(token: string, sectorIds?: string[]): Promise<ManagerSignalsResponse> {
    const query = sectorIds !== undefined ? `?sectorIds=${sectorIds.map(encodeURIComponent).join(",")}` : "";
    const response = await fetch(`${API_BASE_URL}/manager/signals${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
```

after:

```ts
  async fetchSignals(sectorIds?: string[]): Promise<ManagerSignalsResponse> {
    const query = sectorIds !== undefined ? `?sectorIds=${sectorIds.map(encodeURIComponent).join(",")}` : "";
    const response = await apiFetch(`/manager/signals${query}`);
```

with `import { apiFetch } from "./api-fetch";` and the now-unused `API_BASE_URL` import removed.

Port: drop `token: string` from each method (`fetchSignals(token: string, sectorIds?: string[])` becomes `fetchSignals(sectorIds?: string[])`).

Use-case: `execute(token: string, sectorIds?: string[])` becomes `execute(sectorIds?: string[])` and forwards without `token`.

Query hook, before: `useManagerSignals` reads `token`, keys the query on it and gates on `enabled: token !== null`. After:

```ts
export function useManagerSignals(sectorIds?: string[]) {
  return useQuery({
    queryKey: ["manager-signals", sectorIds],
    queryFn: () => getManagerSignalsUseCase.execute(sectorIds),
    retry: false,
    placeholderData: keepPreviousData,
  });
}
```

(delete the `useManagerSessionStore` import and keep the existing comments in that file as they are).

Mutation hook, before (`useCreateSector`): `mutationFn: (params) => createSectorUseCase.execute(token!, params)` with `const token = useManagerSessionStore((state) => state.token);`. After: `mutationFn: (params: { name: string; inviteCode?: string }) => createSectorUseCase.execute(params)`; delete the store import and the `token` line.

Adapter JSON bodies: where the file has `authHeaders(token)` (`http-manager-admin.adapter.ts`), replace the helper with `const JSON_HEADERS: HeadersInit = { "Content-Type": "application/json" };` and each `headers: authHeaders(token)` with `headers: JSON_HEADERS`; a call that only passed `{ headers: authHeaders(token) }` for a GET becomes a bare `apiFetch(path)`.

**Test rule:** in each touched test, drop the `token` argument from calls to the adapter, port fake and use-case, and delete assertions on the `Authorization` header. Where a test asserted the header, replace it with `expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" })`.

**Inventory (manager role), in commit groups:**

| Group | Adapter | Port | Use-cases (`apps/web/src/use-cases/`) | Hooks (`apps/web/src/presentation/hooks/`) |
|---|---|---|---|---|
| signals | `http-manager-signals.adapter.ts` | `manager-signals.port.ts` | `get-manager-signals.usecase.ts` | `useManagerSignals.ts` |
| sectors | `http-manager-sectors.adapter.ts` | `manager-sectors.port.ts` | `list-accessible-sectors.usecase.ts` | `useManagerSectors.ts` |
| insight | `http-manager-insight.adapter.ts`, `http-manager-insight-history.adapter.ts` | `manager-insight.port.ts`, `manager-insight-history.port.ts` | `generate-manager-insight.usecase.ts`, `get-manager-insight-history.usecase.ts` | `useManagerInsight.ts`, `useManagerInsightHistory.ts` |
| notifications | `http-manager-notifications.adapter.ts` | `manager-notifications.port.ts` | `list-manager-notifications.usecase.ts`, `mark-manager-notification-read.usecase.ts` | `useManagerNotifications.ts` (two reads of `token`) |
| admin | `http-manager-admin.adapter.ts` | `manager-admin.port.ts` | `create-manager`, `create-peer-partner`, `create-sector`, `delete-manager`, `delete-peer-partner`, `delete-sector`, `list-managers`, `list-peer-partners`, `list-sectors`, `send-manager-set-password-email`, `send-peer-partner-set-password-email`, `update-manager`, `update-peer-partner`, `update-sector` (each `.usecase.ts`) | `useAdminManagers`, `useAdminPeerPartners`, `useAdminSectors`, `useCreateManager`, `useCreatePeerPartner`, `useCreateSector`, `useDeleteManager`, `useDeletePeerPartner`, `useDeleteSector`, `useSendManagerSetPasswordEmail`, `useSendPeerPartnerSetPasswordEmail`, `useUpdateManager`, `useUpdatePeerPartner`, `useUpdateSector` (each `.ts`) |

`finish-manager-setup.usecase.ts` is **not** in the table: its `token` is the invite token.

- [ ] **Step 1: For each group, in order** — apply the layer rules to its files, then run the group's tests. Example for the first group:

Run: `pnpm --filter @zelo/web exec vitest run src/infrastructure/http/http-manager-signals.adapter.test.ts src/use-cases/get-manager-signals.usecase.test.ts src/presentation/hooks/useManagerSignals.test.tsx`
Expected: PASS after the edits. (If a hook test file does not exist, skip it.) Commit each group:

```bash
git add apps/web/src/infrastructure/http/http-manager-signals.adapter.ts apps/web/src/infrastructure/http/http-manager-signals.adapter.test.ts apps/web/src/ports/manager-signals.port.ts apps/web/src/use-cases/get-manager-signals.usecase.ts apps/web/src/use-cases/get-manager-signals.usecase.test.ts apps/web/src/presentation/hooks/useManagerSignals.ts
git commit -m "refactor(web): manager signals no longer carry a session token"
```

- [ ] **Step 2: Page and component tests** — 19 page tests and a few component tests seed the store or mock use-cases with a token. Apply the same test rule; run `pnpm --filter @zelo/web exec vitest run src/presentation` and fix until green.

- [ ] **Step 3: Prove no manager token is left**

Run: `grep -rn "useManagerSessionStore((state) => state.token)" apps/web/src; grep -rn "Bearer" apps/web/src --include=*.ts --include=*.tsx | grep -v "http-admin-institution" | grep -v test`
Expected: no output from either command.

Run: `pnpm --filter @zelo/web exec tsc --noEmit && pnpm --filter @zelo/web exec vitest run && pnpm turbo run lint lint:boundaries --filter=@zelo/web`
Expected: all green.

#### Phase 2 checkpoint B (PR 3: Task 11)

- [ ] Open the PR. After merge and the dev deploy, in headless Chrome against dev (Task 15 with `PHASE=2 ROLE=manager`): log in as a manager, confirm the cookie flags, `document.cookie` without the session, `sessionStorage` without a token, the panel loading data, and a new tab reaching the panel without a login; then log out and confirm the redirect.
- [ ] The admin and peer-partner panels are untouched and still work on Bearer.

---

### Task 12: PeerPartner migrates to the cookie, including the socket

**Interfaces:**
- Produces: `PeerPartnerAuthPort.me(): Promise<PeerPartnerProfile>`, `logout(): Promise<void>`; `type PeerPartnerProfile = { name: string; specialty: string }`; `PeerPartnerLoginResult = { peerPartnerName: string }`; use-cases `GetPeerPartnerSessionUseCase`, `LogoutPeerPartnerUseCase`; container exports `getPeerPartnerSessionUseCase`, `logoutPeerPartnerUseCase`
- Store: `usePeerPartnerSessionStore` state `{ loggedIn: boolean; peerPartnerName: string | null; setSession(peerPartnerName: string): void; clearSession(): void }`
- Socket: `PeerChatSocketClient.connect(options?: { withCredentials?: boolean }): Socket`

- [ ] **Step 1: Port** — `peer-partner-auth.port.ts` login result and interface:

```ts
export const PeerPartnerLoginResultSchema = z.object({
  peerPartnerName: z.string(),
});
export type PeerPartnerLoginResult = z.infer<typeof PeerPartnerLoginResultSchema>;

export const PeerPartnerProfileSchema = z.object({ name: z.string(), specialty: z.string() });
export type PeerPartnerProfile = z.infer<typeof PeerPartnerProfileSchema>;
```

and add `me(): Promise<PeerPartnerProfile>; logout(): Promise<void>;` to `PeerPartnerAuthPort` (keep `login`, `finishSetup`, `requestPasswordReset`).

- [ ] **Step 2: Adapter tests then adapter** — write `http-peer-partner-auth.adapter.test.ts` mirroring the manager one (login sends `credentials: "include"` and returns `{ peerPartnerName }`; `me` returns `{ name, specialty }`; `me` throws `UnauthorizedPeerPartnerError` on 401 and a plain `Error` on 503; `logout` posts with credentials). Run it and see it fail. Then in `http-peer-partner-auth.adapter.ts` switch `login` to `apiFetch("/peer-partner/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })` and add:

```ts
  async me(): Promise<PeerPartnerProfile> {
    const response = await apiFetch("/peer-partner/me");

    if (response.status === 401) {
      throw new UnauthorizedPeerPartnerError();
    }
    if (!response.ok) {
      throw new Error(`peer partner me failed with status ${response.status}`);
    }

    return PeerPartnerProfileSchema.parse(await response.json());
  }

  async logout(): Promise<void> {
    const response = await apiFetch("/peer-partner/logout", { method: "POST" });

    if (!response.ok) {
      throw new Error(`peer partner logout failed with status ${response.status}`);
    }
  }
```

(import `apiFetch`, `UnauthorizedPeerPartnerError`, `PeerPartnerProfileSchema`, `PeerPartnerProfile`). `finishSetup` and `requestPasswordReset` stay on plain `fetch`.

- [ ] **Step 3: Use-cases and container** — create `get-peer-partner-session.usecase.ts` and `logout-peer-partner.usecase.ts` (same shape as the manager ones, against `PeerPartnerAuthPort`) with delegation tests, and export `getPeerPartnerSessionUseCase` and `logoutPeerPartnerUseCase` from `app/container/peer-partner-auth.ts`.

- [ ] **Step 4: Store test then store** — write `peer-partner-session.store.test.ts` with the same five cases as the manager store test (starts logged out; `setSession("Dra. Ana")` sets `loggedIn` and `peerPartnerName`; `clearSession`; no `token` or `expiresAt`; rehydrating an old `{ token, expiresAt, peerPartnerName }` payload at `version: 0` from `zelo.peer-partner-session` drops the token). Run and see it fail, then rewrite the store:

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface PeerPartnerSessionState {
  loggedIn: boolean;
  peerPartnerName: string | null;
  setSession: (peerPartnerName: string) => void;
  clearSession: () => void;
}

const LOGGED_OUT = { loggedIn: false, peerPartnerName: null } as const;

export const usePeerPartnerSessionStore = create<PeerPartnerSessionState>()(
  persist(
    (set) => ({
      ...LOGGED_OUT,
      setSession: (peerPartnerName) => set({ loggedIn: true, peerPartnerName }),
      clearSession: () => set({ ...LOGGED_OUT }),
    }),
    {
      name: "zelo.peer-partner-session",
      storage: createJSONStorage(() => sessionStorage),
      version: 1,
      migrate: () => ({ ...LOGGED_OUT }),
    },
  ),
);
```

- [ ] **Step 5: Login hook, logout hook, logout site** — `usePeerPartnerLogin.ts` `onSuccess`: `queryClient.clear(); setSession(result.peerPartnerName);` (add `useQueryClient`). Create `usePeerPartnerLogout.ts` like `useManagerLogout.ts` but with `logoutPeerPartnerUseCase` and `usePeerPartnerSessionStore`. In `presentation/layout/PeerPartnerBottomNav.tsx` (line ~24) replace the `clearSession();` in the logout handler with `logout.mutate();` (keep the navigation).

- [ ] **Step 6: Route guard** — in `apps/web/src/app/routes/peer-partner.routes.ts` replace `requireSession`'s local definition with the shared helper:

```ts
export function peerPartnerRoutes(endSession: (role: SessionRole) => void): RouteObject[] {
  const requireSession = requirePeerPartnerSession({
    loginRoute: routes.peerPartnerLogin,
    isLoggedIn: () => usePeerPartnerSessionStore.getState().loggedIn,
    confirm: () => getPeerPartnerSessionUseCase.execute(),
    isRejected: (error) => error instanceof UnauthorizedPeerPartnerError,
    onConfirmed: (profile) => usePeerPartnerSessionStore.getState().setSession(profile.name),
    onRejected: () => endSession("peerPartner"),
  });
```

importing the shared function as `import { requireSession as requirePeerPartnerSession } from "./require-session";`. Because it needs `endSession`, build the constant inside `peerPartnerRoutes(endSession: (role: SessionRole) => void)` and pass `endSession` from `createRouteChildren` (same plumbing as Task 11 Step 7). Attach the guard once, through a pathless layout route that wraps `peer` and `peer/settings`, instead of on each sibling: as siblings, every hop between the inbox and settings is a new route instance and fires another background `/me`. React Router renders a pathless route without a `Component` as an `Outlet`; if an existing router test depends on the sibling structure, keep the siblings and say so in the report.

The guard's `onConfirmed` also calls `clearSessionCache()` (from `@/app/session-cache`, added in PR 3) when the confirmed profile differs from the one in the store, exactly as `manager.routes.ts` does for the manager; `endSession` already clears the cache.

- [ ] **Step 6b: Expired notice on the login page** — `PeerPartnerLoginPage.tsx` reads `useLocation().state?.reason` and, when it is `"expired"`, renders the same notice as `ManagerLoginPage.tsx` (`<p role="status" ...>`) with the same copy, `Sua sessão expirou. Entre de novo para continuar.` (no screen spec defines a different string). Add a test that renders the page with `state: { reason: "expired" }` and finds the notice, and one without state that does not (see `ManagerLoginPage.test.tsx` around line 118 for the pattern).

- [ ] **Step 7: Socket client** — write the failing test `peer-chat-socket.client.test.ts` (mock `socket.io-client`'s `io` with `vi.mock`, a legitimate third-party SDK boundary):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const ioMock = vi.hoisted(() => vi.fn(() => ({ disconnect: vi.fn() })));
vi.mock("socket.io-client", () => ({ io: ioMock }));

import { PeerChatSocketClient } from "./peer-chat-socket.client";
import { API_BASE_URL } from "../http/api-base-url";

describe("PeerChatSocketClient", () => {
  beforeEach(() => {
    ioMock.mockClear();
  });

  it("connects a peer partner with credentials so the browser sends the session cookie", () => {
    new PeerChatSocketClient().connect({ withCredentials: true });

    expect(ioMock).toHaveBeenCalledWith(API_BASE_URL, { withCredentials: true });
  });

  it("connects an anonymous doctor with no credentials and no auth payload", () => {
    new PeerChatSocketClient().connect();

    expect(ioMock).toHaveBeenCalledWith(API_BASE_URL, {});
  });

  it("never sends a token in the handshake", () => {
    new PeerChatSocketClient().connect({ withCredentials: true });

    expect(JSON.stringify(ioMock.mock.calls[0]?.[1])).not.toContain("token");
  });
});
```

Run it and see it fail (the client takes `token?: string`). Then replace `connect` in `peer-chat-socket.client.ts`:

```ts
  connect(options: { withCredentials?: boolean } = {}): Socket {
    this.socket = io(API_BASE_URL, options.withCredentials ? { withCredentials: true } : {});
    return this.socket;
  }
```

- [ ] **Step 8: Connection hook and inbox page** — in `usePeerPartnerConnection.ts`: add `import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";`; change `export function usePeerPartnerConnection(token: string | null) {` to `export function usePeerPartnerConnection() {\n  const loggedIn = usePeerPartnerSessionStore((state) => state.loggedIn);`; change `if (!token) return;` to `if (!loggedIn) return;`; change `client.connect(token)` to `client.connect({ withCredentials: true })`; change the effect dependency `[token, clearCountdown, reconnectNonce]` to `[loggedIn, clearCountdown, reconnectNonce]`. In `PeerPartnerInboxPage.tsx` delete the line `const token = usePeerPartnerSessionStore((state) => state.token);` and call `usePeerPartnerConnection()` with no argument.

- [ ] **Step 9: Update the affected tests** by the same rule as Task 11 (`usePeerPartnerSessionStore.setState({ token: "abc", expiresAt: ... })` becomes `setState({ loggedIn: true, peerPartnerName: "Dra. Ana" })`; the connection-hook test stops passing a token and asserts `connect` was called with `{ withCredentials: true }`). Then:

Run: `pnpm --filter @zelo/web exec tsc --noEmit && pnpm --filter @zelo/web exec vitest run && pnpm turbo run lint lint:boundaries --filter=@zelo/web`
Expected: all green.

Run: `grep -rn "usePeerPartnerSessionStore((state) => state.token)" apps/web/src`
Expected: no output.

- [ ] **Step 10: Commit and checkpoint** — commit in two commits (`feat(web): peer partner auth, store, route guard on the cookie`, `feat(web): peer chat connects with the session cookie`), open the PR. After the dev deploy, run Task 15 with `PHASE=2 ROLE=peerPartner`, then a real chat: a peer partner and a doctor in two windows exchange messages (this exercises the cookie handshake, the `request_peer` event and the #8 limits together).

---

### Task 13: SuperAdmin migrates to the cookie

**Interfaces:**
- Produces: `AdminAuthPort.me(): Promise<AdminProfile>`, `logout(): Promise<void>`; `type AdminProfile = { name: string }`; `AdminLoginResult = {}` (the login body is ignored); use-cases `GetAdminSessionUseCase`, `LogoutAdminUseCase`; container exports `getAdminSessionUseCase`, `logoutAdminUseCase`
- Store: `useAdminSessionStore` state `{ loggedIn: boolean; setSession(): void; clearSession(): void }`

- [ ] **Step 1: Port** — `admin-auth.port.ts`:

```ts
export const AdminProfileSchema = z.object({ name: z.string() });
export type AdminProfile = z.infer<typeof AdminProfileSchema>;
```

Remove `AdminLoginResultSchema`'s `token` and `expiresAt` (make `login(...)` resolve `void`), and add `me(): Promise<AdminProfile>; logout(): Promise<void>;` to `AdminAuthPort`. Update `login-admin.usecase.ts` to return `Promise<void>`.

- [ ] **Step 2: Adapter tests then adapter** — same five cases as Task 11 (login with `credentials: "include"`; `me` returns `{ name }`; `me` throws `UnauthorizedAdminError` on 401 and a plain `Error` on 503; `logout` posts with credentials). See them fail, then update `http-admin-auth.adapter.ts` to use `apiFetch` for `login`, `me` and `logout` (same code as the peer-partner adapter, with `/admin/...` paths, `UnauthorizedAdminError` from `@/ports/admin-institution.port`, and `AdminProfileSchema`).

- [ ] **Step 3: Use-cases and container** — `get-admin-session.usecase.ts`, `logout-admin.usecase.ts` with delegation tests; export `getAdminSessionUseCase` and `logoutAdminUseCase` from `app/container/admin-auth.ts`.

- [ ] **Step 4: Store test then store** — five cases as in Task 12 against `zelo.admin-session`; then:

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface AdminSessionState {
  loggedIn: boolean;
  setSession: () => void;
  clearSession: () => void;
}

export const useAdminSessionStore = create<AdminSessionState>()(
  persist(
    (set) => ({
      loggedIn: false,
      setSession: () => set({ loggedIn: true }),
      clearSession: () => set({ loggedIn: false }),
    }),
    {
      name: "zelo.admin-session",
      storage: createJSONStorage(() => sessionStorage),
      version: 1,
      migrate: () => ({ loggedIn: false }),
    },
  ),
);
```

- [ ] **Step 5: Login hook, logout hook, logout site** — `useAdminLogin.ts` `onSuccess`: `queryClient.clear(); setSession();`. Create `useAdminLogout.ts` (as the manager one, with `logoutAdminUseCase` and `useAdminSessionStore`). In `presentation/pages/AdminInstitutionsPage.tsx` (line ~267) replace `clearSession();` with `logout.mutate();` and obtain `logout` from `useAdminLogout()`.

- [ ] **Step 6: Route guard** — in `apps/web/src/app/routes/super-admin.routes.ts` replace the loader with:

```ts
      loader: requireSession({
        loginRoute: routes.adminLogin,
        isLoggedIn: () => useAdminSessionStore.getState().loggedIn,
        confirm: () => getAdminSessionUseCase.execute(),
        isRejected: (error) => error instanceof UnauthorizedAdminError,
        onConfirmed: () => useAdminSessionStore.getState().setSession(),
        onRejected: () => endSession("admin"),
      }),
```

(imports: `requireSession` from `./require-session`, `getAdminSessionUseCase` from `@/app/container`, `UnauthorizedAdminError` from `@/ports/admin-institution.port`).

`superAdminRoutes` takes `endSession: (role: SessionRole) => void` like the manager and peer-partner factories (Task 11 Step 7); pass it from `createRouteChildren`.

The guard's `onConfirmed` also calls `clearSessionCache()` (from `@/app/session-cache`, added in PR 3) when the confirmed profile differs from the one in the store, exactly as `manager.routes.ts` does for the manager; `endSession` already clears the cache.

- [ ] **Step 6b: Expired notice on the login page** — same as Task 12 Step 6b, for `AdminLoginPage.tsx`: the page shows `Sua sessão expirou. Entre de novo para continuar.` when `location.state.reason === "expired"`, with the same two tests. This matters more here than for the others: since PR 2, a SuperAdmin 401 already redirects to `/admin/login` with that state.

- [ ] **Step 7: Strip the session token from the institution adapter, port, use-cases and hooks** — apply the Task 11c layer rules to:

| Adapter | Port | Use-cases | Hooks |
|---|---|---|---|
| `http-admin-institution.adapter.ts` (4 `Authorization` sites; JSON writes keep `{ "Content-Type": "application/json" }`) | `admin-institution.port.ts` | `create-institution`, `list-admin-institution-sectors`, `list-institutions`, `update-institution` (each `.usecase.ts`) | `useAdminInstitutionSectors`, `useAdminInstitutions`, `useCreateInstitution`, `useUpdateInstitution` (each `.ts`) |

- [ ] **Step 8: Update tests, then prove nothing is left**

Run: `grep -rn "Authorization\|Bearer" apps/web/src --include=*.ts --include=*.tsx | grep -v "\.test\."; grep -rn "state\.token" apps/web/src | grep -v "\.test\."`
Expected: no output.

Run: `pnpm --filter @zelo/web exec tsc --noEmit && pnpm --filter @zelo/web exec vitest run && pnpm turbo run lint lint:boundaries --filter=@zelo/web`
Expected: all green.

- [ ] **Step 9: Commit and checkpoint** — commit in groups (`feat(web): admin auth, store and route guard on the cookie`, `refactor(web): admin institution calls no longer carry a session token`), open the PR. After the dev deploy, run Task 15 with `PHASE=2 ROLE=admin`.

### Phase 2 exit check

- [ ] `git grep -nE "Authorization|Bearer" -- apps/web/src ':!*.test.*'` prints nothing.
- [ ] All three roles verified on dev with Task 15.
- [ ] Release phase 2 to production through the normal tag process (`docs/releasing.md`), and let it run for **at least a day** before phase 3, so cached PWA bundles that still send Bearer have updated.

---

## Phase 3 — Contract

### Task 14: The API stops accepting Bearer and stops returning the token

**Files:**
- Modify: `apps/api/src/shared/http/session-cookie.ts` (+ its test), the three token services' `Issued*Token` interfaces and `issue()` return values if they are also used only for login bodies, the three login controllers and their tests, `peer-chat.gateway.ts` (+ test)

- [ ] **Step 1: Write the failing tests** — in `session-cookie.test.ts` replace the two Bearer tests with:

```ts
  it("no longer reads a Bearer token", () => {
    expect(readSessionToken(requestWith({ authorization: "Bearer abc.def" }), "manager")).toBeUndefined();
  });

  it("ignores a Bearer header even when a cookie is present", () => {
    expect(readSessionToken(requestWith({ cookie: "manager_session=from-cookie", authorization: "Bearer from-header" }), "manager")).toBe("from-cookie");
  });
```

In each guard test, replace "still accepts a Bearer token" style tests with a rejection: a request that carries only `Authorization: Bearer <valid token>` and no cookie is rejected with `UnauthorizedException`. In each controller test: `GET /<role>/me` with only `Authorization: Bearer ...` answers 401; the login response body does **not** contain `token` or `expiresAt` (`expect(response.body).not.toHaveProperty("token")`), and the cookie is still set. Manager login body is `{ role, name }`; admin login body is `{ name }`; peer-partner login body is `{ peerPartnerName }`. In the gateway test, replace "still registers a peer partner who presents auth.token" with "disconnects nothing and registers nobody for a peer partner who presents only auth.token" (`presence.findAvailable(...)` is `null`).

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @zelo/api exec vitest run`
Expected: FAIL in exactly those tests (Bearer is still accepted; the body still carries the token).

- [ ] **Step 3: Implement**

`readSessionToken` becomes:

```ts
export function readSessionToken(request: Pick<Request, "headers">, role: SessionRole): string | undefined {
  return parseCookieHeader(request.headers.cookie)[SESSION_COOKIE[role]] || undefined;
}
```

In the gateway, drop the `authToken` branch: `const token = cookieToken;` and `if (!token) return;`.

In each login controller, return the profile instead of the issued token. Keep `setSessionCookie(response, role, issued.token)` and return:

- manager: `return { role: issued.role, name: issued.name };` with the method's return type `Promise<{ role: IssuedManagerToken["role"]; name: string }>`
- admin: `return { name: <admin name> };`. `IssuedAdminToken` has no name, so add `name` to it: `interface IssuedAdminToken { token: string; expiresAt: string; name: string }` and have `AdminTokenService.issue(adminId, adminName)` return `name: adminName` (update `admin-token.service.test.ts` and `login-admin.use-case.test.ts` expectations accordingly).
- peer partner: `return { peerPartnerName: issued.peerPartnerName };`

- [ ] **Step 4: Run everything**

Run: `pnpm --filter @zelo/api exec vitest run && pnpm --filter @zelo/api exec tsc --noEmit && pnpm turbo run lint lint:boundaries --filter=@zelo/api`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A apps/api/src
git commit -m "feat(api)!: sessions are cookie-only; login no longer returns the token"
```

(Review `git status` before `-A`: only API files from this task may be staged.)

### Task 15: Guard against reintroducing a token in the web app, and the real-browser check

**Files:**
- Create: `apps/web/src/no-authorization-header.test.ts`

- [ ] **Step 1: Write the test that fails the build if a header comes back**

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

describe("session handling in apps/web", () => {
  const files = sourceFiles(SRC);

  it("never builds an Authorization header", () => {
    const offenders = files.filter((file) => /Authorization|Bearer/.test(readFileSync(file, "utf8")));

    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([]);
  });

  it("never reads or writes a session token in a store", () => {
    const offenders = files.filter((file) => /session\.store/.test(file) && /\btoken\b/.test(readFileSync(file, "utf8")));

    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @zelo/web exec vitest run src/no-authorization-header.test.ts`
Expected: PASS after Task 13. (Before Task 13 it fails in `http-admin-institution.adapter.ts`, which is how you know it fires.)

- [ ] **Step 3: The real-browser check** — this script is run by hand, not committed. Save it to the session scratchpad as `cookie-check.cjs` (adapting the headless-Chrome CDP harness already used for the CSP check: a Chrome launched with `--remote-debugging-port`, the `ws` package from `apps/api/node_modules`), pointed at `DEV_WEB=https://dev.zelohealth.app` and `DEV_API=https://api-dev.zelohealth.app`. It does, with credentials read from the environment and never printed:

  1. `POST ${DEV_API}/<role>/login` from the page with `credentials: "include"` and the role's e-mail and password.
  2. `Network.getCookies` for the API host: the `<role>_session` cookie is present with `httpOnly: true`, `secure: true`, `sameSite: "Strict"`, and no `domain` starting with a dot.
  3. In the page: `document.cookie` does not contain `_session`; `Object.keys(sessionStorage)` holds no value containing the cookie's value.
  4. `fetch(`${DEV_API}/<role>/me`, { credentials: "include" })` answers 200.
  5. A cross-origin `POST`: navigate to `about:blank`, then `fetch(`${DEV_API}/<role>/logout`, { method: "POST", credentials: "include" })` from that origin. Expect a network failure or a 403, never a 204.
  6. Open a new tab on `${DEV_WEB}/<role panel path>` and confirm the panel renders without redirecting to login.
  7. `POST /<role>/logout` from the site's own origin answers 204 and a following `/me` answers 401.

  Expected: every assertion holds for `manager`, `admin` and `peerPartner`. The script exits non-zero on the first failure.

- [ ] **Step 4: Commit the guard test**

```bash
git add apps/web/src/no-authorization-header.test.ts
git commit -m "test(web): fail the build if an Authorization header or a stored token comes back"
```

### Task 16: Documentation and closure

**Files:**
- Modify: `docs/superpowers/specs/technical-debt.md` (TD-001), `docs/conventions/security-privacy.md`, `CLAUDE.md`, `docs/android-apk.md`, `docs/conventions/priorities.md`, `docs/conventions/backend-http.md`, `docs/releasing.md`, `general-documentations/architecture-reference.md`

- [ ] **Step 1: TD-001** — change `Status` to `Resolved (2026-MM-DD, v1.X.0)` with the real date and version, add a `**Resolution.**` paragraph: sessions are `HttpOnly` cookies, guards read only the cookie, the login response carries no token, and the lint rules and the CSP from #10 stay because an injected script can still act inside the open tab.

- [ ] **Step 2: `security-privacy.md`** — rewrite §1's auth-model paragraphs that say tokens live in `sessionStorage` and travel as Bearer; document the cookie contract, the origin check, `/me`, `/logout`, and that `PeerPartnerAuthGuard` now re-reads the row (delete the paragraph that calls it a trap). Update §4's sentence that names the `sessionStorage` token as the thing at risk.

- [ ] **Step 3: `CLAUDE.md`** — in the Security rules paragraph, replace "session tokens all sit in `sessionStorage` behind `Authorization: Bearer`" with "session tokens are `HttpOnly` cookies" and keep the ban list and the CSP sentence.

- [ ] **Step 4: `docs/android-apk.md`** — add a warning at the top of the CORS section: staff login (manager, admin, peer partner) does not work in the APK, because it serves from `https://localhost`, which is cross-site to the API, so the `SameSite=Strict` session cookie is not sent. Before the APK is distributed, decide between web-only staff, a Bearer fallback for native, or `SameSite=None` with CSRF tokens. Also fix the stale origins in that file (`zelo-dusky.vercel.app`, `zelo-api.fly.dev`) to `www.zelohealth.app` and `api.zelohealth.app`.

- [ ] **Step 5: `backend-http.md`, `releasing.md`, `architecture-reference.md`** — mention cookie-based sessions where those files describe auth (the guard sections and any "Bearer" example); in `releasing.md`'s "Versions" paragraph, the cookie cutover is the example of a major or a coordinated minor.

- [ ] **Step 6: `priorities.md`** — mark #30 `FIXED`, remove the "Design written" and "Not covered" scaffolding, and record the proof: the real-browser check results per role, the guard test that fails on a returning `Authorization` header, and that the APK remains undecided and undistributed.

- [ ] **Step 7: Verify no link points at the superseded design or plan**

Run: `git grep -n "2026-09-14-httponly-cookie-session-migration"`
Expected: no output. (The superseded design and plan were deleted in the pull requests that added the new design and this plan.)

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md docs general-documentations
git commit -m "docs: sessions are HttpOnly cookies; close TD-001 and priorities #30"
```

---

## PR list and release order

| PR | Tasks | Deploy effect |
|---|---|---|
| 1. `feat/cookie-session-api-expand` | 0 to 7 | API only. Site unchanged. |
| 2. `feat/cookie-session-web-infra` | 8 to 10 | One SuperAdmin change (see checkpoint A). |
| 3. `feat/cookie-session-web-manager` | 11 | Managers move to the cookie; managers log in once. |
| 4. `feat/cookie-session-web-peer-partner` | 12 | Peer partners move; log in once. |
| 5. `feat/cookie-session-web-admin` | 13 | Admin moves; log in once. |
| **Release phase 2** through `docs/releasing.md`, wait a day. | | |
| 6. `feat/cookie-session-contract` | 14, 15, 16 | API rejects Bearer and stops returning the token. |

Each row is a normal PR into `develop`. The release PRs from `develop` to `main` must be merged with **"Create a merge commit"**, and each release goes out by tag.

## Self-review

**Spec coverage.**
- §1 same-site domains: prod live, dev live; a `VITE_API_BASE_URL` switch for dev is done. No task needed. The `Origin` consequence is Task 3.
- §2 cookie contract: Task 2 (helpers) and Tasks 4 to 6 (login).
- §3 API: shared infra (Tasks 1 to 3), origin check (Task 3), login sets cookie (Tasks 4 to 6), guards read the cookie and keep re-reads (Tasks 4 to 6), `PeerPartnerAuthGuard` re-read (Task 6), `/logout` (Tasks 4 to 6), `/me` (Tasks 4 to 6), body after phase 3 (Task 14).
- §4 WebSocket: Task 7 (server) and Task 12 (client).
- §5 web: `apiFetch` (Task 8), token removed from ports, use-cases and hooks (Tasks 11c and 13), central 401 handler (Task 9), `queryClient.clear()` on login and logout (Tasks 11b, 12, 13), stores keep a flag (Tasks 11b, 12, 13), `/me` route guards (Tasks 10 to 13), socket client (Task 12).
- §6 rollout: the PR list, the phase checkpoints and the one-day wait.
- §7 local and deployed environments: `Secure` follows `NODE_ENV` (Task 2); CORS with credentials (Task 3).
- Verification: unit and controller tests per task, the real-browser check (Task 15), the guard test (Task 15).
- Non-goals and risks: Task 16 records the APK; iOS home-screen behaviour is a manual check in the Phase 2 exit step.

**Placeholder scan.** No "TBD" or "similar to Task N" without the content. Tasks 12 and 13 reuse the Task 11 test cases by naming each case and the code that changes; the store, adapter, hook and route code is written out in each. The manager inventory in Task 11c is enumerated file by file with a worked example per layer.

**Type consistency.** `SessionRole` is `"manager" | "admin" | "peerPartner"` on the web (Task 8) and the API's `SessionRole` is the same union (Task 2), used by `setSessionCookie(res, "peerPartner", ...)` and `readSessionToken(request, "peerPartner")`. `SESSION_COOKIE.peerPartner` is `peer_partner_session` everywhere, including the gateway. `ManagerProfile`, `PeerPartnerProfile` and `AdminProfile` match the `/me` payloads in Global Constraints. `readSessionToken`'s signature is the same in Tasks 2, 4, 5, 6 and 14. `requireSession`'s option names match between Task 10 and Tasks 11 to 13.
