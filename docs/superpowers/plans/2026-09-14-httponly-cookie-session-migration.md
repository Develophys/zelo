# HttpOnly Cookie Session Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Manager/PeerPartner/Admin session auth off `sessionStorage` + `Authorization: Bearer` onto `HttpOnly` cookies, closing TD-001 for all three roles, with a shared same-site API domain and a centralized frontend auth-handling layer instead of touching every call site individually.

**Architecture:** Two new Fly custom domains (`api.zelohealth.app`, `api-dev.zelohealth.app`) put the API on the same registrable domain as the frontend, so `SameSite=Lax` cookies work without a CSRF-token system. Each role's login endpoint sets an `HttpOnly` cookie instead of returning the token in the body; each guard reads the cookie instead of the header. On the frontend, the `token` parameter is deleted (not replaced) from every adapter/port/use-case/hook — auth is transport-level now — and the cross-cutting concerns (fetch credentials, 401→logout, cache invalidation on identity change) centralize at the app's single `QueryClient`, generalizing a pattern (`useManagerSessionExpiry.ts`) that already exists for Manager alone. PeerPartner's chat, which authenticates over a Socket.IO handshake rather than REST, gets the equivalent treatment on its own transport.

**Tech Stack:** NestJS 10 / Express 4 (`cookie-parser`), React 18 / React Router 6 (data router, `loader`s), TanStack Query v5 (`QueryCache`/`MutationCache`), Zustand (`persist` to `sessionStorage`), Socket.IO, Fly.io custom domains, Vitest.

**Spec:** [docs/superpowers/specs/2026-09-14-httponly-cookie-session-migration-design.md](../specs/2026-09-14-httponly-cookie-session-migration-design.md)

## Global Constraints

- Cookie attributes for all three roles: `httpOnly: true`, `secure: process.env.NODE_ENV === "production"` (both deployed Fly environments set `NODE_ENV=production`; only bare local dev over `http://localhost` needs `secure: false`), `sameSite: "lax"`, `path: "/"`, `maxAge` derived from the token's own `expiresAt` (`new Date(expiresAt).getTime() - Date.now()`) — never hardcode the 8h duration a second time.
- Cookie names, one per role, never shared: `manager_session`, `peer_partner_session`, `admin_session`. No explicit `domain` attribute on any of them (scopes each cookie to the issuing API subdomain only).
- No CSRF-token system is built — `SameSite=Lax` is accepted as sufficient, per the spec.
- Token services (`manager-token.service.ts`, `peer-partner-token.service.ts`, `admin-token.service.ts`) are **not modified** — `issue()`/`verify()` are storage-agnostic; only where the token is read from/written to changes.
- Password-reset / finish-setup flows (`finish-setup`, `forgot-password` routes and their one-time link tokens) are **untouched** — unrelated mechanism, out of scope per the spec.
- Every adapter method that drops its `token` parameter switches its `fetch` call to the new shared `apiFetch()` helper (Task 7) instead of raw `fetch`, so `credentials: "include"` is set in one place.
- CI/CD-adjacent or cross-origin-dependent behavior (the cookie itself, CORS) can only be verified against a real deployed environment — `dev.zelohealth.app` talking to `api-dev.zelohealth.app` — never by local docker-compose alone, since local dev's `localhost:5173`/`localhost:3000` pair is same-site by browser special-casing regardless of `SameSite` config, and would mask a misconfiguration that only breaks in production.

---

### Task 1: Backend shared infra — `cookie-parser` + CORS credentials

**Files:**
- Modify: `apps/api/package.json` (add `cookie-parser` dependency, `@types/cookie-parser` devDependency)
- Modify: `apps/api/src/main.ts`

**Interfaces:**
- Produces: `app.use(cookieParser())` registered before any route handles a request, so every later task's `req.cookies` is populated; `credentials: true` in CORS so the browser will both send and accept the cookie cross-subdomain.

- [ ] **Step 1: Add the dependency**

```bash
cd apps/api
pnpm add cookie-parser
pnpm add -D @types/cookie-parser
```

- [ ] **Step 2: Wire it into `main.ts`**

In `apps/api/src/main.ts`, add the import and register the middleware, and turn on CORS credentials:

```ts
import "./shared/config/load-env.ts";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.ts";
```

Change:

```ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: resolveAllowedOrigins() });
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Zelo API listening on port ${port}`);
}
```

to:

```ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({ origin: resolveAllowedOrigins(), credentials: true });
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Zelo API listening on port ${port}`);
}
```

- [ ] **Step 3: Verify the app still boots and existing tests pass**

```bash
pnpm --filter @zelo/api exec vitest run
pnpm --filter @zelo/api dev &
sleep 3
curl -sf http://localhost:3000/health
kill %1
```

Expected: full test suite green (nothing yet depends on cookies), health check `{"status":"ok",...}`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json apps/api/pnpm-lock.yaml apps/api/src/main.ts
git commit -m "feat(api): add cookie-parser and enable CORS credentials"
```

---

### Task 2: Custom Fly domains for the API — `api.zelohealth.app` / `api-dev.zelohealth.app`

**Files:** none (Fly + DNS)

**Interfaces:**
- Produces: `https://api.zelohealth.app` routes to `zelo-api`, `https://api-dev.zelohealth.app` routes to `zelo-api-dev` — both share `zelohealth.app`'s registrable domain with the frontend, required for `SameSite=Lax` to apply.

- [ ] **Step 1 (CONFIRM before running — DNS change on the live domain): Provision the prod API domain**

```bash
fly certs add api.zelohealth.app --app zelo-api
```

Fly prints the DNS record to add (an A/AAAA pair, or a CNAME — matches the pattern already used for `dev.zelohealth.app`). Add it at Cloudflare (DNS only, not proxied — same reason the Vercel CNAME needed `disableProxy: true`).

- [ ] **Step 2: Verify**

```bash
fly certs show api.zelohealth.app --app zelo-api
```

Poll until it reports the certificate issued (may take a few minutes for DNS to propagate and Let's Encrypt to issue).

- [ ] **Step 3: Provision the dev API domain**

```bash
fly certs add api-dev.zelohealth.app --app zelo-api-dev
```

Add the printed DNS record the same way, then verify with `fly certs show api-dev.zelohealth.app --app zelo-api-dev`.

- [ ] **Step 4: Confirm both resolve**

```bash
curl -sf https://api.zelohealth.app/health
curl -sf https://api-dev.zelohealth.app/health
```

Expected: both return `{"status":"ok",...}` — the existing Fly apps already serve `/health` regardless of which hostname reaches them, so this only needs DNS+cert, no app config change.

- [ ] **Step 5: Point the two Vercel projects at the new API domains**

```bash
vercel env rm VITE_API_BASE_URL production --project zelo --yes
vercel env add VITE_API_BASE_URL production --value "https://api.zelohealth.app" --yes --project zelo
vercel env rm VITE_API_BASE_URL preview --project zelo-dev --yes
vercel env add VITE_API_BASE_URL preview --value "https://api-dev.zelohealth.app" --yes --project zelo-dev --git-branch develop
vercel env rm VITE_API_BASE_URL production --project zelo-dev --yes
vercel env add VITE_API_BASE_URL production --value "https://api-dev.zelohealth.app" --yes --project zelo-dev
```

(`zelo` is the prod Vercel project, `zelo-dev` is the dev one — both env targets updated on `zelo-dev` since its Production Branch tracking is still broken per the dev/prod-split plan, and `dev.zelohealth.app` is actually served via the `gitBranch`-bound Preview environment, not Production.)

- [ ] **Step 6: No commit** — this task touches no repo files.

---

### Task 3: Manager backend — cookie login, guard, logout, `/me`

**Files:**
- Modify: `apps/api/src/modules/manager/infrastructure/manager.controller.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager-auth.guard.ts`
- Test: `apps/api/src/modules/manager/infrastructure/manager.controller.test.ts`
- Test: `apps/api/src/modules/manager/infrastructure/manager-auth.guard.test.ts`

**Interfaces:**
- Produces: `POST /manager/login` sets an `httpOnly` `manager_session` cookie and returns `{ role: ManagerRole }` in the body (no `token`/`expiresAt`). `POST /manager/logout` clears it. `GET /manager/me` (guarded) returns `{ name: string; role: ManagerRole }`.

- [ ] **Step 1: Write the failing guard test — reads the cookie, not the header**

Find the existing test file's request-construction helper (it currently sets `Authorization: Bearer <token>` on a supertest request) and change it to set a cookie instead. Add this test to `manager-auth.guard.test.ts` (adjust the exact supertest/test-harness calls to match the file's existing style — the assertion is what matters):

```ts
it("accepts a request whose manager_session cookie holds a valid token", async () => {
  const token = tokenService.issue(manager.id, manager.name, manager.institutionId, manager.role).token;
  const response = await request(app.getHttpServer())
    .get("/manager/me")
    .set("Cookie", [`manager_session=${token}`]);
  expect(response.status).toBe(200);
});

it("rejects a request with no manager_session cookie", async () => {
  const response = await request(app.getHttpServer()).get("/manager/me");
  expect(response.status).toBe(401);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @zelo/api exec vitest run manager-auth.guard.test.ts
```

Expected: FAIL — `/manager/me` doesn't exist yet, and the guard still reads `Authorization`, not the cookie.

- [ ] **Step 3: Update the guard to read the cookie**

In `apps/api/src/modules/manager/infrastructure/manager-auth.guard.ts`, delete the doc comment referencing TD-001 (this migration is what closes it) and change:

```ts
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice("Bearer ".length);
    const decoded = this.tokenService.verify(token);
```

to:

```ts
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.manager_session as string | undefined;

    if (!token) {
      throw new UnauthorizedException();
    }

    const decoded = this.tokenService.verify(token);
```

(the rest of the guard — decode failure, manager/institution re-check, `request.manager = {...}` — is unchanged.)

- [ ] **Step 4: Update the controller — login sets the cookie, add logout and me**

In `apps/api/src/modules/manager/infrastructure/manager.controller.ts`, add to the imports:

```ts
import type { Response } from "express";
```

Change the login handler:

```ts
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown): Promise<IssuedManagerToken> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.loginManager.execute(parsed.data.email, parsed.data.password);
    } catch (error) {
      if (error instanceof InvalidManagerCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }
```

to:

```ts
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response): Promise<{ role: IssuedManagerToken["role"] }> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      const issued = await this.loginManager.execute(parsed.data.email, parsed.data.password);
      res.cookie("manager_session", issued.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: new Date(issued.expiresAt).getTime() - Date.now(),
      });
      return { role: issued.role };
    } catch (error) {
      if (error instanceof InvalidManagerCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Res({ passthrough: true }) res: Response): Promise<void> {
    res.clearCookie("manager_session", { path: "/" });
  }

  @Get("me")
  @UseGuards(ManagerAuthGuard)
  async me(@Req() request: Request): Promise<{ name: string; role: ManagerRole }> {
    return { name: request.manager!.name, role: request.manager!.role };
  }
```

Add `Res` to the `@nestjs/common` import list at the top of the file, and add `type { ManagerRole } from "../application/ports/manager-repository.port.ts"` (matches how the guard already imports it) if not already imported.

- [ ] **Step 5: Run the guard and controller tests**

```bash
pnpm --filter @zelo/api exec vitest run manager-auth.guard.test.ts manager.controller.test.ts
```

Expected: PASS. Existing controller tests that assert the old `{token, expiresAt, role}` login response body need updating to assert `{role}` only plus a `Set-Cookie` header containing `manager_session=`; existing tests that build authenticated requests with an `Authorization` header need updating to use `.set("Cookie", ...)` instead — update them inline as part of this step, they are this task's test surface.

- [ ] **Step 6: Run the full API suite**

```bash
pnpm --filter @zelo/api exec vitest run
```

Expected: all green — nothing outside `manager` module should reference the manager token's transport.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/manager
git commit -m "feat(api): move manager session to an HttpOnly cookie"
```

---

### Task 4: PeerPartner backend (REST) — cookie login, guard, logout, `/me`

**Files:**
- Modify: `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts`
- Modify: `apps/api/src/modules/peer-partner/infrastructure/peer-partner-auth.guard.ts`
- Test: `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.test.ts`
- Test: `apps/api/src/modules/peer-partner/infrastructure/peer-partner-auth.guard.test.ts`

**Interfaces:**
- Produces: `POST /peer-partner/login` sets `peer_partner_session` cookie, returns `{ peerPartnerName: string }`. `POST /peer-partner/logout` clears it. `GET /peer-partner/me` (guarded) returns `{ peerPartnerName: string }`. New: `UnauthorizedPeerPartnerError` did not exist before this task on the frontend side (Task 11) — the API side already throws a plain `UnauthorizedException` via the guard, which is what matters here.

- [ ] **Step 1: Write the failing guard test**

Same shape as Task 3 Step 1, adapted:

```ts
it("accepts a request whose peer_partner_session cookie holds a valid token", async () => {
  const token = tokenService.issue(peerPartner.id, peerPartner.name, peerPartner.institutionId).token;
  const response = await request(app.getHttpServer())
    .get("/peer-partner/me")
    .set("Cookie", [`peer_partner_session=${token}`]);
  expect(response.status).toBe(200);
});

it("rejects a request with no peer_partner_session cookie", async () => {
  const response = await request(app.getHttpServer()).get("/peer-partner/me");
  expect(response.status).toBe(401);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @zelo/api exec vitest run peer-partner-auth.guard.test.ts
```

- [ ] **Step 3: Update the guard**

In `apps/api/src/modules/peer-partner/infrastructure/peer-partner-auth.guard.ts`, change:

```ts
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice("Bearer ".length);
    const decoded = this.tokenService.verify(token);
```

to:

```ts
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.peer_partner_session as string | undefined;

    if (!token) {
      throw new UnauthorizedException();
    }

    const decoded = this.tokenService.verify(token);
```

- [ ] **Step 4: Update the controller**

In `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts`, add `import type { Response } from "express";` and `Get, Req, UseGuards` to the `@nestjs/common` import, `import { PeerPartnerAuthGuard } from "./peer-partner-auth.guard.ts";`. Change the login handler:

```ts
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown): Promise<IssuedPeerPartnerToken> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.loginPeerPartner.execute(parsed.data.email, parsed.data.password);
    } catch (error) {
      if (error instanceof InvalidPeerPartnerCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }
```

to:

```ts
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response): Promise<{ peerPartnerName: string }> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      const issued = await this.loginPeerPartner.execute(parsed.data.email, parsed.data.password);
      res.cookie("peer_partner_session", issued.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: new Date(issued.expiresAt).getTime() - Date.now(),
      });
      return { peerPartnerName: issued.peerPartnerName };
    } catch (error) {
      if (error instanceof InvalidPeerPartnerCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Res({ passthrough: true }) res: Response): Promise<void> {
    res.clearCookie("peer_partner_session", { path: "/" });
  }

  @Get("me")
  @UseGuards(PeerPartnerAuthGuard)
  async me(@Req() request: Request): Promise<{ peerPartnerName: string }> {
    return { peerPartnerName: request.peerPartner!.name };
  }
```

- [ ] **Step 5: Run the tests, update pre-existing ones the same way as Task 3 Step 5**

```bash
pnpm --filter @zelo/api exec vitest run peer-partner-auth.guard.test.ts peer-partner.controller.test.ts
```

- [ ] **Step 6: Run the full API suite**

```bash
pnpm --filter @zelo/api exec vitest run
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/peer-partner
git commit -m "feat(api): move peer-partner REST session to an HttpOnly cookie"
```

---

### Task 5: PeerPartner WebSocket — cookie-based handshake auth

**Files:**
- Modify: `apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.ts`
- Modify: `apps/web/src/infrastructure/websocket/peer-chat-socket.client.ts`
- Modify: `apps/web/src/presentation/hooks/usePeerPartnerConnection.ts`
- Test: `apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.test.ts`

**Interfaces:**
- Consumes: `peer_partner_session` cookie name (Task 4), `PeerPartnerTokenService.verify()` (unchanged).
- Produces: the gateway authenticates a connecting médico's socket the same way as before (still anonymous when no cookie is present — an anonymous médico connection is a real, intentional case, not an error) but reads the token from the handshake's cookie header instead of `handshake.auth.token`.

PeerPartner's authenticated surface is this socket, not a REST call — this is why it gets its own task instead of folding into Task 4. Socket.IO does not parse cookies itself; the raw `Cookie` header on the handshake needs manual parsing.

- [ ] **Step 1: Add a cookie-parsing dependency for the gateway**

`cookie-parser` (Task 1) is Express middleware and doesn't apply to the Socket.IO handshake object. Add the lightweight `cookie` package it depends on, directly:

```bash
cd apps/api
pnpm add cookie
pnpm add -D @types/cookie
```

- [ ] **Step 2: Write the failing test**

Add to `peer-chat.gateway.test.ts` (adapt to the file's existing socket-testing harness style — likely a real or mocked `Socket` with a `handshake` object):

```ts
it("registers a peer partner whose handshake carries a valid peer_partner_session cookie", async () => {
  const token = tokenService.issue(peerPartner.id, peerPartner.name, peerPartner.institutionId).token;
  const client = makeMockSocket({ handshake: { headers: { cookie: `peer_partner_session=${token}` }, auth: {} } });
  await gateway.handleConnection(client);
  expect(presence.isRegistered(peerPartner.id)).toBe(true); // or whatever the existing "connect_error"/registration assertions check for the current auth.token-based test
});

it("treats a connection with no session cookie as anonymous, not an error", async () => {
  const client = makeMockSocket({ handshake: { headers: {}, auth: {} } });
  await gateway.handleConnection(client);
  expect(client.disconnect).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
pnpm --filter @zelo/api exec vitest run peer-chat.gateway.test.ts
```

- [ ] **Step 4: Update the gateway's handshake auth**

In `apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.ts`, add `import { parse as parseCookies } from "cookie";` to the imports. Change:

```ts
  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) return; // an anonymous médico connection — nothing to register
```

to:

```ts
  async handleConnection(client: Socket): Promise<void> {
    const cookieHeader = client.handshake.headers.cookie;
    const token = cookieHeader ? parseCookies(cookieHeader).peer_partner_session : undefined;
    if (!token) return; // an anonymous médico connection — nothing to register
```

(everything after — `tokenService.verify(token)`, the disconnect-on-invalid branch, registration — is unchanged.)

- [ ] **Step 5: Update the `@WebSocketGateway` CORS to allow credentials**

Find the `@WebSocketGateway({ cors: { origin: resolveAllowedOrigins() } })` decorator in the same file and add `credentials: true`:

```ts
@WebSocketGateway({ cors: { origin: resolveAllowedOrigins(), credentials: true } })
```

- [ ] **Step 6: Update the frontend socket client to send the cookie**

In `apps/web/src/infrastructure/websocket/peer-chat-socket.client.ts`, change:

```ts
export class PeerChatSocketClient {
  private socket: Socket | null = null;

  connect(token?: string): Socket {
    this.socket = io(API_BASE_URL, token ? { auth: { token } } : {});
    return this.socket;
  }
```

to:

```ts
export class PeerChatSocketClient {
  private socket: Socket | null = null;

  connect(): Socket {
    this.socket = io(API_BASE_URL, { withCredentials: true });
    return this.socket;
  }
```

- [ ] **Step 7: Update the hook that calls it**

In `apps/web/src/presentation/hooks/usePeerPartnerConnection.ts`, the effect currently does `if (!token) return;` and `client.connect(token)`. Since the cookie is what the server checks now (not a JS-visible value), this hook no longer needs to gate on or pass a `token` argument — but it still needs to know whether *this specific browser tab* considers itself a logged-in peer partner, using the same non-sensitive flag Task 11 introduces on `usePeerPartnerSessionStore`. Change the hook's signature from `usePeerPartnerConnection(token: string | null)` to `usePeerPartnerConnection(loggedIn: boolean)`, and inside the effect:

```ts
  useEffect(() => {
    if (!loggedIn) return;

    const client = new PeerChatSocketClient();
    const socket = client.connect();
```

(the dependency array's `token` becomes `loggedIn`.) This task only updates the hook's signature and internals — Task 11 updates `PeerPartnerInboxPage.tsx`'s call site to pass the new `loggedIn` value instead of `token`.

- [ ] **Step 8: Run the gateway test and the full API/web suites**

```bash
pnpm --filter @zelo/api exec vitest run peer-chat.gateway.test.ts
pnpm --filter @zelo/api exec vitest run
pnpm --filter @zelo/web exec vitest run usePeerPartnerConnection
```

Expected: gateway tests green. The web-side hook test will need its own `token`→`loggedIn` signature update in this same step if it exists — check `usePeerPartnerConnection.test.ts` (if present) and update its mock calls accordingly.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/peer-chat apps/web/src/infrastructure/websocket apps/web/src/presentation/hooks/usePeerPartnerConnection.ts
git commit -m "feat(peer-chat): authenticate the socket handshake via cookie, not auth.token"
```

---

### Task 6: Admin backend — cookie login, guard, logout, `/me`

**Files:**
- Modify: `apps/api/src/modules/admin/infrastructure/admin.controller.ts`
- Modify: `apps/api/src/modules/admin/infrastructure/admin-auth.guard.ts`
- Test: `apps/api/src/modules/admin/infrastructure/admin.controller.test.ts`
- Test: `apps/api/src/modules/admin/infrastructure/admin-auth.guard.test.ts`

**Interfaces:**
- Produces: `POST /admin/login` sets `admin_session` cookie, returns `{}`. `POST /admin/logout` clears it. `GET /admin/me` (guarded) returns `{ name: string }`.

- [ ] **Step 1: Write the failing guard test**

```ts
it("accepts a request whose admin_session cookie holds a valid token", async () => {
  const token = tokenService.issue(admin.id, admin.name).token;
  const response = await request(app.getHttpServer())
    .get("/admin/me")
    .set("Cookie", [`admin_session=${token}`]);
  expect(response.status).toBe(200);
});

it("rejects a request with no admin_session cookie", async () => {
  const response = await request(app.getHttpServer()).get("/admin/me");
  expect(response.status).toBe(401);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @zelo/api exec vitest run admin-auth.guard.test.ts
```

- [ ] **Step 3: Update the guard**

In `apps/api/src/modules/admin/infrastructure/admin-auth.guard.ts`, change:

```ts
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice("Bearer ".length);
    const decoded = this.tokenService.verify(token);
```

to:

```ts
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.admin_session as string | undefined;

    if (!token) {
      throw new UnauthorizedException();
    }

    const decoded = this.tokenService.verify(token);
```

- [ ] **Step 4: Update the controller**

In `apps/api/src/modules/admin/infrastructure/admin.controller.ts`, add `import type { Response } from "express";` and `Res` to the `@nestjs/common` import list. Change the login handler:

```ts
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown): Promise<IssuedAdminToken> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.loginAdmin.execute(parsed.data.email, parsed.data.password);
    } catch (error) {
      if (error instanceof InvalidAdminCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }
```

to:

```ts
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response): Promise<Record<string, never>> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      const issued = await this.loginAdmin.execute(parsed.data.email, parsed.data.password);
      res.cookie("admin_session", issued.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: new Date(issued.expiresAt).getTime() - Date.now(),
      });
      return {};
    } catch (error) {
      if (error instanceof InvalidAdminCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Res({ passthrough: true }) res: Response): Promise<void> {
    res.clearCookie("admin_session", { path: "/" });
  }

  @Get("me")
  @UseGuards(AdminAuthGuard)
  async me(@Req() request: Request): Promise<{ name: string }> {
    return { name: request.admin!.name };
  }
```

`Req` and a `Request` type import already exist elsewhere in this codebase's controllers (see Task 3) — add `import type { Request } from "express";` if `admin.controller.ts` doesn't already import it, and add `Req` to the `@nestjs/common` import.

- [ ] **Step 5: Run the tests, updating pre-existing ones the same way as Task 3 Step 5**

```bash
pnpm --filter @zelo/api exec vitest run admin-auth.guard.test.ts admin.controller.test.ts
```

- [ ] **Step 6: Run the full API suite**

```bash
pnpm --filter @zelo/api exec vitest run
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/admin
git commit -m "feat(api): move admin session to an HttpOnly cookie"
```

---

### Task 7: Frontend shared infra — `apiFetch()` helper

**Files:**
- Create: `apps/web/src/infrastructure/http/api-fetch.ts`
- Test: `apps/web/src/infrastructure/http/api-fetch.test.ts`

**Interfaces:**
- Produces: `apiFetch(path: string, init?: RequestInit): Promise<Response>` — every later adapter task imports and uses this instead of calling `fetch` directly.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { apiFetch } from "./api-fetch";

describe("apiFetch", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prefixes the path with API_BASE_URL and sends credentials", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    await apiFetch("/manager/signals");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/manager/signals"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("merges caller-supplied init options without dropping credentials", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    await apiFetch("/manager/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const [, init] = fetchSpy.mock.calls[0];
    expect(init).toMatchObject({ credentials: "include", method: "POST", body: "{}" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @zelo/web exec vitest run api-fetch.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement it**

```ts
import { API_BASE_URL } from "./api-base-url";

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, { ...init, credentials: "include" });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @zelo/web exec vitest run api-fetch.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/infrastructure/http/api-fetch.ts apps/web/src/infrastructure/http/api-fetch.test.ts
git commit -m "feat(web): add a shared apiFetch helper that always sends credentials"
```

---

### Task 8: Frontend shared infra — centralize 401 handling in the QueryClient

**Files:**
- Modify: `apps/web/src/app/query-client.ts`
- Modify: `apps/web/src/presentation/layout/ManagerShell.tsx`
- Delete: `apps/web/src/presentation/hooks/useManagerSessionExpiry.ts`
- Delete: `apps/web/src/presentation/hooks/useManagerSessionExpiry.test.ts` (if it exists as a standalone file)
- Test: `apps/web/src/app/query-client.test.ts` (new, or extend if a test file for this module already exists)

**Interfaces:**
- Consumes: `UnauthorizedManagerError` (`@/ports/manager-signals.port`), `UnauthorizedAdminError` (`@/ports/admin-institution.port`), a new `UnauthorizedPeerPartnerError` this task adds (peer-partner has no REST error of this kind yet — add it to `apps/web/src/ports/peer-partner-auth.port.ts`, since `GET /peer-partner/me` from Task 4 is the first peer-partner endpoint that can 401 after a valid login).
- Produces: `createQueryClient()` — its cache-level handlers redirect via `router.navigate(...)`, importing the `router` singleton `router.tsx` already exports from `createBrowserRouter(...)` directly, rather than threading a `navigate` function in as a parameter. `router.tsx` doesn't import `query-client.ts`, so this import direction (`query-client.ts` → `router.tsx`) doesn't create a cycle.

- [ ] **Step 1: Add `UnauthorizedPeerPartnerError`**

In `apps/web/src/ports/peer-partner-auth.port.ts`, add alongside the existing error classes:

```ts
export class UnauthorizedPeerPartnerError extends Error {}
```

- [ ] **Step 2: Write the failing test for the centralized handler**

This task runs before Tasks 9/11/12 change the session stores' shape, so the test below is written against — and stays correct against — each store's *current* fields (`token`/`expiresAt`/`role`, etc.). The handler itself only ever calls `.clearSession()` with no arguments, which is already every store's current signature and stays their signature after Tasks 9/11/12 — nothing here needs revisiting once those tasks land.

```ts
import { describe, it, expect, vi } from "vitest";
import { createQueryClient } from "./query-client";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { useManagerSessionStore } from "@/stores/manager-session.store";

vi.mock("./router", () => ({ router: { navigate: vi.fn() } }));

describe("createQueryClient", () => {
  it("clears the manager session and redirects to manager login on UnauthorizedManagerError", async () => {
    const { router } = await import("./router");
    useManagerSessionStore.getState().setSession("a-token", new Date(Date.now() + 1000).toISOString(), "HOSPITAL_ADMIN");
    const queryClient = createQueryClient();

    queryClient.getQueryCache().build(queryClient, { queryKey: ["x"], queryFn: () => Promise.reject(new UnauthorizedManagerError()) });
    await queryClient.getQueryCache().find({ queryKey: ["x"] })?.fetch();

    expect(useManagerSessionStore.getState().token).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith("/manager/login", { replace: true, state: { reason: "expired" } });
  });
});
```

- [ ] **Step 3: Implement the centralized handler**

```ts
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "@/stores/toast.store";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { UnauthorizedPeerPartnerError } from "@/ports/peer-partner-auth.port";
import { UnauthorizedAdminError } from "@/ports/admin-institution.port";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";
import { useAdminSessionStore } from "@/stores/admin-session.store";
import { routes } from "@/presentation/lib/routes";
import { router } from "./router";

const MUTATION_FAILED = "Não foi possível concluir a ação. Tente de novo.";

function handleUnauthorized(error: unknown): boolean {
  if (error instanceof UnauthorizedManagerError) {
    useManagerSessionStore.getState().clearSession();
    router.navigate(routes.managerLogin, { replace: true, state: { reason: "expired" } });
    return true;
  }
  if (error instanceof UnauthorizedPeerPartnerError) {
    usePeerPartnerSessionStore.getState().clearSession();
    router.navigate(routes.peerPartnerLogin, { replace: true, state: { reason: "expired" } });
    return true;
  }
  if (error instanceof UnauthorizedAdminError) {
    useAdminSessionStore.getState().clearSession();
    router.navigate(routes.adminLogin, { replace: true, state: { reason: "expired" } });
    return true;
  }
  return false;
}

/**
 * Error handling used to be declared per call site and reached two of eighteen
 * of them, so most admin writes failed in complete silence: the spinner
 * stopped, the modal stayed open with the fields filled, and the only
 * reasonable next move was to press the button again.
 *
 * The cache-level `onError` is a floor, not a ceiling — react-query still runs
 * a mutation's own `onError` when it has one, so a call site with specific copy
 * keeps it and everything else stops failing quietly. An `Unauthorized*Error`
 * (any role) is handled ahead of that — session cleared, redirected to that
 * role's login — on both caches, so a query or a mutation whose session died
 * mid-flight behaves the same way either way.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        handleUnauthorized(error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (handleUnauthorized(error)) return;
        if (mutation.options.onError) return;
        toast.error(MUTATION_FAILED);
      },
    }),
  });
}
```

- [ ] **Step 4: Delete `useManagerSessionExpiry` and its call site**

```bash
rm apps/web/src/presentation/hooks/useManagerSessionExpiry.ts
rm -f apps/web/src/presentation/hooks/useManagerSessionExpiry.test.ts
```

In `apps/web/src/presentation/layout/ManagerShell.tsx`, remove the import and the call:

```tsx
import { useManagerSessionExpiry } from '@/presentation/hooks/useManagerSessionExpiry';
```

and

```tsx
  useManagerSessionExpiry();
```

both deleted; the rest of `ManagerShell.tsx` is unchanged.

- [ ] **Step 5: Run the tests**

```bash
pnpm --filter @zelo/web exec vitest run query-client
pnpm --filter @zelo/web exec vitest run ManagerShell
```

- [ ] **Step 6: Run the full web suite**

```bash
pnpm --filter @zelo/web exec vitest run
```

Expected: failures here are expected and fine at this point — every hook/adapter/store this task's `query-client.ts` now references by its *future* shape (`clearSession()` with no args, a `loggedIn` field) still has its *old* shape (`clearSession()` already takes no args today for all three stores, so this part is already compatible — verify by re-reading each store's current `clearSession` signature before assuming). Fix only failures caused by this task's own changes (the deleted hook, `ManagerShell`); leave failures in files Tasks 9-12 haven't touched yet.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/query-client.ts apps/web/src/presentation/layout/ManagerShell.tsx apps/web/src/ports/peer-partner-auth.port.ts
git rm apps/web/src/presentation/hooks/useManagerSessionExpiry.ts
git add -u apps/web/src/presentation/hooks
git commit -m "feat(web): centralize 401 handling in the QueryClient for all three roles"
```

---

### Task 9: Manager frontend — auth (login, logout, store, router loader)

**Files:**
- Modify: `apps/web/src/stores/manager-session.store.ts`
- Modify: `apps/web/src/ports/manager-auth.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-manager-auth.adapter.ts`
- Modify: `apps/web/src/use-cases/login-manager.usecase.ts` (find its actual path via the container wiring — `apps/web/src/app/container/manager-auth.ts` imports `LoginManagerUseCase` from `@/use-cases/login-manager.usecase`)
- Modify: `apps/web/src/presentation/hooks/useManagerLogin.ts`
- Modify: `apps/web/src/app/router.tsx`
- Test: corresponding `.test.ts`/`.test.tsx` for every file above that has one today

**Interfaces:**
- Produces: `useManagerSessionStore` exposes `{ loggedIn: boolean; role: ManagerRole | null; setSession(role: ManagerRole): void; clearSession(): void }` — no `token`/`expiresAt`/`isValid`. `loginManagerUseCase.execute(email, password)` returns `{ role: ManagerRole }`.

- [ ] **Step 1: Update the session store**

Full replacement of `apps/web/src/stores/manager-session.store.ts`:

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ManagerRole = "HOSPITAL_ADMIN" | "SECTOR_MANAGER";

interface ManagerSessionState {
  loggedIn: boolean;
  role: ManagerRole | null;
  setSession: (role: ManagerRole) => void;
  clearSession: () => void;
}

export const useManagerSessionStore = create<ManagerSessionState>()(
  persist(
    (set) => ({
      loggedIn: false,
      role: null,
      setSession: (role) => set({ loggedIn: true, role }),
      clearSession: () => set({ loggedIn: false, role: null }),
    }),
    { name: "zelo.manager-session", storage: createJSONStorage(() => sessionStorage) },
  ),
);
```

- [ ] **Step 2: Update the auth port**

In `apps/web/src/ports/manager-auth.port.ts`, change:

```ts
export const ManagerLoginResultSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  role: z.enum(["HOSPITAL_ADMIN", "SECTOR_MANAGER"]),
});
```

to:

```ts
export const ManagerLoginResultSchema = z.object({
  role: z.enum(["HOSPITAL_ADMIN", "SECTOR_MANAGER"]),
});
```

`finishSetup`/`requestPasswordReset` and their error classes are unchanged (unrelated mechanism, per Global Constraints).

- [ ] **Step 3: Update the auth adapter**

In `apps/web/src/infrastructure/http/http-manager-auth.adapter.ts`, replace the `import { API_BASE_URL } from './api-base-url';` line with `import { apiFetch } from './api-fetch';`, and change the `login` method's body:

```ts
  async login(email: string, password: string): Promise<ManagerLoginResult> {
    const response = await fetch(`${API_BASE_URL}/manager/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
```

to:

```ts
  async login(email: string, password: string): Promise<ManagerLoginResult> {
    const response = await apiFetch(`/manager/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
```

`finishSetup`/`requestPasswordReset` keep calling `fetch(`${API_BASE_URL}/...`)` directly (unauthenticated endpoints — `apiFetch`'s `credentials: "include"` would be harmless there too, but there is no reason to touch them; leave them as-is per Global Constraints).

Add a new `logout` method to the adapter and its port (`ManagerAuthPort`):

```ts
  async logout(): Promise<void> {
    await apiFetch(`/manager/logout`, { method: "POST" });
  }
```

and in `manager-auth.port.ts`'s `ManagerAuthPort` interface, add `logout(): Promise<void>;`.

- [ ] **Step 4: Update the use-case**

`apps/web/src/use-cases/login-manager.usecase.ts` currently returns whatever the port returns unchanged — its `execute` signature return type follows `ManagerLoginResult`, which Step 2 already narrowed. No code change needed in this file beyond the type flowing through automatically **unless** it destructures `token`/`expiresAt` explicitly — check the file; if it does, remove those references. Add a sibling `LogoutManagerUseCase` (new file, `apps/web/src/use-cases/logout-manager.usecase.ts`) mirroring the existing use-case class shape:

```ts
import type { ManagerAuthPort } from "@/ports/manager-auth.port";

export class LogoutManagerUseCase {
  constructor(private readonly authPort: ManagerAuthPort) {}

  async execute(): Promise<void> {
    await this.authPort.logout();
  }
}
```

Wire it in `apps/web/src/app/container/manager-auth.ts`:

```ts
export const logoutManagerUseCase = new LogoutManagerUseCase(managerAuthAdapter);
```

(add the import for `LogoutManagerUseCase` alongside the existing use-case imports in that file).

- [ ] **Step 5: Update the login hook**

In `apps/web/src/presentation/hooks/useManagerLogin.ts`, change:

```ts
  return useMutation({
    mutationFn: ({ email, password }: LoginVariables) => loginManagerUseCase.execute(email, password),
    onSuccess: (result) => {
      setSession(result.token, result.expiresAt, result.role);
    },
  });
```

to:

```ts
  return useMutation({
    mutationFn: ({ email, password }: LoginVariables) => loginManagerUseCase.execute(email, password),
    onSuccess: (result) => {
      setSession(result.role);
    },
  });
```

- [ ] **Step 6: Add a logout hook**

New file `apps/web/src/presentation/hooks/useManagerLogout.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { logoutManagerUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { routes } from "@/presentation/lib/routes";

export function useManagerLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const clearSession = useManagerSessionStore((state) => state.clearSession);

  return useMutation({
    mutationFn: () => logoutManagerUseCase.execute(),
    onSuccess: () => {
      clearSession();
      queryClient.clear();
      navigate(routes.managerLogin, { replace: true });
    },
  });
}
```

(Wire this into whatever UI element currently triggers logout — find it by searching for the manager equivalent of a "sign out" button; update its call site to use this hook instead of whatever it did before. If no logout UI exists yet for manager, this hook is still correct to add now and gets wired when one does — not a placeholder, a complete, independently correct unit.)

- [ ] **Step 7: Update the router loader**

In `apps/web/src/app/router.tsx`, change the `ManagerShell` layout route's loader:

```ts
    loader: () =>
      useManagerSessionStore.getState().isValid() ? null : redirect(routes.managerLogin),
```

to:

```ts
    loader: () =>
      useManagerSessionStore.getState().loggedIn ? null : redirect(routes.managerLogin),
```

and in `ADMIN_ONLY_ROUTES`'s `.map()`, the `role` check is unchanged (`useManagerSessionStore.getState().role === "HOSPITAL_ADMIN"` — `role` still exists on the store, just no longer alongside `token`).

- [ ] **Step 8: Run manager auth tests**

```bash
pnpm --filter @zelo/web exec vitest run manager-session.store manager-auth.port http-manager-auth.adapter login-manager useManagerLogin router.test
```

Fix every test that asserted the old `{token, expiresAt, role}` shape or called `setSession(token, expiresAt, role)` — update to the new `{role}` / `setSession(role)` shape. This is expected, not a regression.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/stores/manager-session.store.ts apps/web/src/ports/manager-auth.port.ts apps/web/src/infrastructure/http/http-manager-auth.adapter.ts apps/web/src/use-cases/login-manager.usecase.ts apps/web/src/use-cases/logout-manager.usecase.ts apps/web/src/presentation/hooks/useManagerLogin.ts apps/web/src/presentation/hooks/useManagerLogout.ts apps/web/src/app/container/manager-auth.ts apps/web/src/app/router.tsx
git commit -m "feat(web): switch manager auth to the HttpOnly cookie, drop client-side token"
```

---

### Task 10: Manager frontend — strip `token` from every remaining adapter/port/use-case/hook

**Files:**
- Modify (reference transformation shown in full below, applied identically to each): `apps/web/src/infrastructure/http/http-manager-signals.adapter.ts`, `http-manager-sectors.adapter.ts`, `http-manager-admin.adapter.ts`, `http-manager-insight.adapter.ts`, `http-manager-insight-history.adapter.ts`, `http-manager-notifications.adapter.ts`
- Modify: `apps/web/src/ports/manager-signals.port.ts`, `manager-sectors.port.ts`, `manager-admin.port.ts`, `manager-insight.port.ts`, `manager-insight-history.port.ts`, `manager-notifications.port.ts`
- Modify: every use-case under `apps/web/src/use-cases/` whose adapter is one of the above (`get-manager-signals.usecase.ts`, `list-accessible-sectors.usecase.ts`, `create-manager.usecase.ts`, `update-manager.usecase.ts`, `delete-manager.usecase.ts`, `create-peer-partner.usecase.ts`, `update-peer-partner.usecase.ts`, `delete-peer-partner.usecase.ts`, `create-sector.usecase.ts`, `update-sector.usecase.ts`, `delete-sector.usecase.ts`, `generate-manager-insight.usecase.ts`, `get-manager-insight-history.usecase.ts`, `list-manager-notifications.usecase.ts`, `mark-manager-notification-read.usecase.ts`)
- Modify: every hook under `apps/web/src/presentation/hooks/` that reads `useManagerSessionStore((s) => s.token)` (`useManagerSignals.ts`, `useManagerSectors.ts`, `useCreateManager.ts`, `useUpdateManager.ts`, `useDeleteManager.ts`, `useCreatePeerPartner.ts`, `useUpdatePeerPartner.ts`, `useDeletePeerPartner.ts`, `useCreateSector.ts`, `useUpdateSector.ts`, `useDeleteSector.ts`, `useManagerInsight.ts`, `useManagerInsightHistory.ts`, `useManagerNotifications.ts`, `useAdminManagers.ts`, `useAdminPeerPartners.ts`, `useAdminSectors.ts`, `useAdminInstitutionSectors.ts`)
- Test: the `.test.ts`/`.test.tsx` sibling of every file above

**Interfaces:**
- Consumes: `apiFetch` (Task 7).
- Produces: none of these files take or pass a `token` anywhere anymore.

This is one mechanical transformation, applied to every file listed above — shown once in full against `http-manager-signals.adapter.ts` (chosen because its current content is fully known), then applied identically everywhere else.

- [ ] **Step 1: Reference transformation — adapter**

`apps/web/src/infrastructure/http/http-manager-signals.adapter.ts`, full before/after:

Before:
```ts
import type { ManagerSignalsPort, ManagerSignalsResponse } from "@/ports/manager-signals.port";
import { ManagerSignalsResponseSchema, UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { API_BASE_URL } from './api-base-url';


export class HttpManagerSignalsAdapter implements ManagerSignalsPort {
  async fetchSignals(token: string, sectorIds?: string[]): Promise<ManagerSignalsResponse> {
    const query = sectorIds !== undefined ? `?sectorIds=${sectorIds.map(encodeURIComponent).join(",")}` : "";
    const response = await fetch(`${API_BASE_URL}/manager/signals${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      throw new UnauthorizedManagerError();
    }
    if (!response.ok) {
      throw new Error(`manager signals failed with status ${response.status}`);
    }

    return ManagerSignalsResponseSchema.parse(await response.json());
  }
}
```

After:
```ts
import type { ManagerSignalsPort, ManagerSignalsResponse } from "@/ports/manager-signals.port";
import { ManagerSignalsResponseSchema, UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { apiFetch } from './api-fetch';


export class HttpManagerSignalsAdapter implements ManagerSignalsPort {
  async fetchSignals(sectorIds?: string[]): Promise<ManagerSignalsResponse> {
    const query = sectorIds !== undefined ? `?sectorIds=${sectorIds.map(encodeURIComponent).join(",")}` : "";
    const response = await apiFetch(`/manager/signals${query}`);

    if (response.status === 401) {
      throw new UnauthorizedManagerError();
    }
    if (!response.ok) {
      throw new Error(`manager signals failed with status ${response.status}`);
    }

    return ManagerSignalsResponseSchema.parse(await response.json());
  }
}
```

The rule, applied to every other adapter/method in the file list above: delete the leading `token: string,` parameter from every method; replace `` `${API_BASE_URL}/...` `` built for a raw `fetch(url, { headers: { Authorization: \`Bearer ${token}\` }, ...restInit })` call with `apiFetch(path, { ...restInit })` (drop the `Authorization` header entirely — `apiFetch` supplies `credentials: "include"`, which is what authenticates the request now); for a `POST`/`PATCH` method that also sends `"Content-Type": "application/json"`, keep that header, only the `Authorization` one is removed. Every method's 401/error handling is otherwise byte-for-byte unchanged.

- [ ] **Step 2: Reference transformation — port**

`apps/web/src/ports/manager-signals.port.ts` — delete `token: string,` from the `ManagerSignalsPort` interface's method signature the same way. Every other port in the list gets the identical treatment for each of its methods.

- [ ] **Step 3: Reference transformation — use-case**

`apps/web/src/use-cases/get-manager-signals.usecase.ts`, full before/after:

Before:
```ts
import type { ManagerSignalsPort, ManagerSignalsResponse } from "@/ports/manager-signals.port";

export class GetManagerSignalsUseCase {
  constructor(private readonly signalsPort: ManagerSignalsPort) {}

  async execute(token: string, sectorIds?: string[]): Promise<ManagerSignalsResponse> {
    return this.signalsPort.fetchSignals(token, sectorIds);
  }
}
```

After:
```ts
import type { ManagerSignalsPort, ManagerSignalsResponse } from "@/ports/manager-signals.port";

export class GetManagerSignalsUseCase {
  constructor(private readonly signalsPort: ManagerSignalsPort) {}

  async execute(sectorIds?: string[]): Promise<ManagerSignalsResponse> {
    return this.signalsPort.fetchSignals(sectorIds);
  }
}
```

Apply identically to every other use-case listed above — delete the `token: string,` parameter and its pass-through argument, nothing else in any of these files changes.

- [ ] **Step 4: Reference transformation — hook**

`apps/web/src/presentation/hooks/useManagerSignals.ts`, full before/after:

Before:
```ts
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getManagerSignalsUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useManagerSignals(sectorIds?: string[]) {
  const token = useManagerSessionStore((state) => state.token);

  return useQuery({
    queryKey: ["manager-signals", token, sectorIds],
    queryFn: () => getManagerSignalsUseCase.execute(token!, sectorIds),
    enabled: token !== null,
    retry: false,
    placeholderData: keepPreviousData,
  });
}
```

After:
```ts
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getManagerSignalsUseCase } from "@/app/container";

export function useManagerSignals(sectorIds?: string[]) {
  return useQuery({
    queryKey: ["manager-signals", sectorIds],
    queryFn: () => getManagerSignalsUseCase.execute(sectorIds),
    retry: false,
    placeholderData: keepPreviousData,
  });
}
```

Apply identically to every other hook listed above: delete the `useManagerSessionStore((state) => state.token)` line (and the import if nothing else in that hook needs the store), delete `token` from the `queryKey`/`mutationKey` array, delete the `enabled: token !== null` line entirely (the router loader already gates rendering — see Task 9 Step 7), delete the `token!` argument from the use-case call. If a hook's `enabled` also included another real condition alongside the token check (e.g. `enabled: token !== null && someOtherThing`), keep that other condition — only the token part is removed.

- [ ] **Step 5: Apply the four transformations above to every remaining file in the Files list**

Work through each adapter → its port → its use-case(s) → its hook(s) in one pass per feature area (sectors, manager/peer/sector CRUD via `http-manager-admin.adapter.ts`, insight, insight history, notifications), so each area's full chain compiles together before moving to the next.

- [ ] **Step 6: Run every affected test file**

```bash
pnpm --filter @zelo/web exec vitest run manager-signals manager-sectors manager-admin manager-insight manager-notifications
```

Update each test's mock calls and assertions to match the new no-`token` signatures — this is expected, not a regression; the tests are what confirm the mechanical transformation was applied correctly to every listed file.

- [ ] **Step 7: Run the full web suite**

```bash
pnpm --filter @zelo/web exec vitest run
```

Expected: green except for peer-partner and admin files Tasks 11-12 haven't touched yet — confirm any remaining failures are confined to those, not to anything this task touched.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/infrastructure/http apps/web/src/ports apps/web/src/use-cases apps/web/src/presentation/hooks
git commit -m "refactor(web): delete the token parameter from every manager adapter/port/use-case/hook"
```

---

### Task 11: PeerPartner frontend — auth, store, router loaders, socket wiring

**Files:**
- Modify: `apps/web/src/stores/peer-partner-session.store.ts`
- Modify: `apps/web/src/ports/peer-partner-auth.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-peer-partner-auth.adapter.ts`
- Modify: `apps/web/src/use-cases/login-peer-partner.usecase.ts`
- Create: `apps/web/src/use-cases/logout-peer-partner.usecase.ts`
- Modify: `apps/web/src/presentation/hooks/usePeerPartnerLogin.ts`
- Create: `apps/web/src/presentation/hooks/usePeerPartnerLogout.ts`
- Modify: `apps/web/src/app/container/peer-partner-auth.ts`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/presentation/pages/PeerPartnerInboxPage.tsx`
- Test: sibling `.test.ts`/`.test.tsx` for every file above with one today

**Interfaces:**
- Consumes: `usePeerPartnerConnection(loggedIn: boolean)` (Task 5 already changed its signature).
- Produces: `usePeerPartnerSessionStore` exposes `{ loggedIn: boolean; peerPartnerName: string | null; setSession(peerPartnerName: string): void; clearSession(): void }`.

- [ ] **Step 1: Update the session store**

Full replacement of `apps/web/src/stores/peer-partner-session.store.ts`:

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface PeerPartnerSessionState {
  loggedIn: boolean;
  peerPartnerName: string | null;
  setSession: (peerPartnerName: string) => void;
  clearSession: () => void;
}

export const usePeerPartnerSessionStore = create<PeerPartnerSessionState>()(
  persist(
    (set) => ({
      loggedIn: false,
      peerPartnerName: null,
      setSession: (peerPartnerName) => set({ loggedIn: true, peerPartnerName }),
      clearSession: () => set({ loggedIn: false, peerPartnerName: null }),
    }),
    { name: "zelo.peer-partner-session", storage: createJSONStorage(() => sessionStorage) },
  ),
);
```

- [ ] **Step 2: Update the port**

In `apps/web/src/ports/peer-partner-auth.port.ts`, change:

```ts
export const PeerPartnerLoginResultSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  peerPartnerName: z.string(),
});
```

to:

```ts
export const PeerPartnerLoginResultSchema = z.object({
  peerPartnerName: z.string(),
});
```

and add `logout(): Promise<void>;` to the `PeerPartnerAuthPort` interface. (`UnauthorizedPeerPartnerError` already added in Task 8 Step 1.)

- [ ] **Step 3: Update the adapter**

Same transformation as Task 9 Step 3, applied to `http-peer-partner-auth.adapter.ts`'s `login` method (swap `API_BASE_URL`+manual fetch for `apiFetch`), plus add:

```ts
  async logout(): Promise<void> {
    await apiFetch(`/peer-partner/logout`, { method: "POST" });
  }
```

`finishSetup`/`requestPasswordReset` stay on raw `fetch`/`API_BASE_URL`, unchanged (same reasoning as Task 9 Step 3).

- [ ] **Step 4: Update the use-case and add logout**

`login-peer-partner.usecase.ts` needs no change beyond the type narrowing from Step 2 flowing through (check for an explicit `token`/`expiresAt` destructure the way Task 9 Step 4 did for manager). New `apps/web/src/use-cases/logout-peer-partner.usecase.ts`:

```ts
import type { PeerPartnerAuthPort } from "@/ports/peer-partner-auth.port";

export class LogoutPeerPartnerUseCase {
  constructor(private readonly authPort: PeerPartnerAuthPort) {}

  async execute(): Promise<void> {
    await this.authPort.logout();
  }
}
```

Wire it in `apps/web/src/app/container/peer-partner-auth.ts`: `export const logoutPeerPartnerUseCase = new LogoutPeerPartnerUseCase(peerPartnerAuthAdapter);`.

- [ ] **Step 5: Update the login hook**

In `usePeerPartnerLogin.ts`, change `setSession(result.token, result.expiresAt, result.peerPartnerName)` to `setSession(result.peerPartnerName)`.

- [ ] **Step 6: Add a logout hook**

`apps/web/src/presentation/hooks/usePeerPartnerLogout.ts`, mirroring Task 9 Step 6 exactly (swap manager for peer-partner throughout, target route `routes.peerPartnerLogin`).

- [ ] **Step 7: Update the two router loaders**

In `apps/web/src/app/router.tsx`, `peer` and `peer/settings` currently each have their own inline loader:

```ts
    loader: () => (usePeerPartnerSessionStore.getState().isValid() ? null : redirect(routes.peerPartnerLogin)),
```

Change both occurrences to:

```ts
    loader: () => (usePeerPartnerSessionStore.getState().loggedIn ? null : redirect(routes.peerPartnerLogin)),
```

- [ ] **Step 8: Update `PeerPartnerInboxPage.tsx` for the new store shape and the socket hook's new signature**

Change:

```tsx
  const token = usePeerPartnerSessionStore((state) => state.token);
  const peerPartnerName = usePeerPartnerSessionStore((state) => state.peerPartnerName);
  const { state, incomingRequest, secondsRemaining, messages, peerLeft, accept, decline, sendMessage, leave, reconnect } = usePeerPartnerConnection(token);
```

to:

```tsx
  const loggedIn = usePeerPartnerSessionStore((state) => state.loggedIn);
  const peerPartnerName = usePeerPartnerSessionStore((state) => state.peerPartnerName);
  const { state, incomingRequest, secondsRemaining, messages, peerLeft, accept, decline, sendMessage, leave, reconnect } = usePeerPartnerConnection(loggedIn);
```

- [ ] **Step 9: Run peer-partner tests**

```bash
pnpm --filter @zelo/web exec vitest run peer-partner-session peer-partner-auth http-peer-partner-auth login-peer-partner usePeerPartnerLogin usePeerPartnerConnection PeerPartnerInboxPage router.test
```

Update assertions to the new shapes throughout, same as prior tasks.

- [ ] **Step 10: Run the full web suite**

```bash
pnpm --filter @zelo/web exec vitest run
```

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/stores/peer-partner-session.store.ts apps/web/src/ports/peer-partner-auth.port.ts apps/web/src/infrastructure/http/http-peer-partner-auth.adapter.ts apps/web/src/use-cases/login-peer-partner.usecase.ts apps/web/src/use-cases/logout-peer-partner.usecase.ts apps/web/src/presentation/hooks/usePeerPartnerLogin.ts apps/web/src/presentation/hooks/usePeerPartnerLogout.ts apps/web/src/app/container/peer-partner-auth.ts apps/web/src/app/router.tsx apps/web/src/presentation/pages/PeerPartnerInboxPage.tsx
git commit -m "feat(web): switch peer-partner auth to the HttpOnly cookie, drop client-side token"
```

---

### Task 12: Admin frontend — auth, store, router loader, institution adapter

**Files:**
- Modify: `apps/web/src/stores/admin-session.store.ts`
- Modify: `apps/web/src/ports/admin-auth.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-admin-auth.adapter.ts`
- Modify: `apps/web/src/use-cases/login-admin.usecase.ts`
- Create: `apps/web/src/use-cases/logout-admin.usecase.ts`
- Modify: `apps/web/src/presentation/hooks/useAdminLogin.ts`
- Create: `apps/web/src/presentation/hooks/useAdminLogout.ts`
- Modify: `apps/web/src/app/container/admin-auth.ts`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/ports/admin-institution.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-admin-institution.adapter.ts`
- Modify: `apps/web/src/use-cases/create-institution.usecase.ts`, `list-institutions.usecase.ts`, `update-institution.usecase.ts`, `list-admin-institution-sectors.usecase.ts`
- Modify: `apps/web/src/presentation/hooks/useAdminInstitutions.ts`, `useCreateInstitution.ts`, `useUpdateInstitution.ts`, `useAdminInstitutionSectors.ts`
- Test: sibling `.test.ts`/`.test.tsx` for every file above with one today

**Interfaces:**
- Produces: `useAdminSessionStore` exposes `{ loggedIn: boolean; setSession(): void; clearSession(): void }` — admin never tracked a name/role client-side, so this is the smallest of the three stores.

- [ ] **Step 1: Update the session store**

Full replacement of `apps/web/src/stores/admin-session.store.ts`:

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
    { name: "zelo.admin-session", storage: createJSONStorage(() => sessionStorage) },
  ),
);
```

- [ ] **Step 2: Update the auth port, adapter, use-case, hook, logout — same pattern as Tasks 9/11**

- `admin-auth.port.ts`: `AdminLoginResultSchema` becomes `z.object({})`; add `logout(): Promise<void>;` to `AdminAuthPort`.
- `http-admin-auth.adapter.ts`: swap `API_BASE_URL`+manual `fetch` for `apiFetch` in `login`; add a `logout` method identical in shape to Task 9 Step 3's.
- `login-admin.usecase.ts`: no change beyond the narrowed type, unless it destructures `token`/`expiresAt` explicitly.
- New `apps/web/src/use-cases/logout-admin.usecase.ts`, mirroring Task 9 Step 4's `LogoutManagerUseCase` exactly.
- `apps/web/src/app/container/admin-auth.ts`: add `export const logoutAdminUseCase = new LogoutAdminUseCase(new HttpAdminAuthAdapter());` reusing the module's existing adapter instance if the file already keeps one, or add one the same way `manager-auth.ts`/`peer-partner-auth.ts` do.
- `useAdminLogin.ts`: change `setSession(result.token, result.expiresAt)` to `setSession()` (no arguments — admin's login response body is now empty; nothing to pass).
- New `apps/web/src/presentation/hooks/useAdminLogout.ts`, mirroring Task 9 Step 6 (target route `routes.adminLogin`).

- [ ] **Step 3: Update the router loader**

In `apps/web/src/app/router.tsx`, change:

```ts
    loader: () => (useAdminSessionStore.getState().isValid() ? null : redirect(routes.adminLogin)),
```

to:

```ts
    loader: () => (useAdminSessionStore.getState().loggedIn ? null : redirect(routes.adminLogin)),
```

- [ ] **Step 4: Strip `token` from the institution adapter/port/use-cases/hooks**

Same mechanical transformation as Task 10, applied to the admin-institution chain. Reference (full before/after) for `http-admin-institution.adapter.ts`'s `create` method:

Before:
```ts
  async create(token: string, params: CreateInstitutionParams): Promise<CreateInstitutionResult> {
    const response = await fetch(`${API_BASE_URL}/admin/institutions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    });
```

After:
```ts
  async create(params: CreateInstitutionParams): Promise<CreateInstitutionResult> {
    const response = await apiFetch(`/admin/institutions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
```

Apply the identical rule to `list`, `update`, and `listSectors` in the same file (each currently takes `token: string` as its first parameter and sets `Authorization: Bearer ${token}` — delete both, keep every other header/param/response-handling line unchanged), to `AdminInstitutionPort`'s matching method signatures in `admin-institution.port.ts`, to each of the four use-cases listed in Files, and to each of the four hooks listed in Files (deleting their `useAdminSessionStore((s) => s.token)` read, the `token` entry in `queryKey`/`mutationFn`, and any `enabled: token !== null` gate — same as Task 10 Step 4's rule).

- [ ] **Step 5: Run admin tests**

```bash
pnpm --filter @zelo/web exec vitest run admin-session admin-auth admin-institution login-admin useAdminLogin useAdminInstitutions useCreateInstitution useUpdateInstitution useAdminInstitutionSectors router.test
```

- [ ] **Step 6: Run the full web suite**

```bash
pnpm --filter @zelo/web exec vitest run
```

Expected: fully green now — this is the last frontend task.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/stores/admin-session.store.ts apps/web/src/ports/admin-auth.port.ts apps/web/src/ports/admin-institution.port.ts apps/web/src/infrastructure/http/http-admin-auth.adapter.ts apps/web/src/infrastructure/http/http-admin-institution.adapter.ts apps/web/src/use-cases apps/web/src/presentation/hooks apps/web/src/app/container/admin-auth.ts apps/web/src/app/router.tsx
git commit -m "feat(web): switch admin auth and institution CRUD to the HttpOnly cookie"
```

---

### Task 13: End-to-end verification against the deployed dev environment

**Files:** none

Cross-origin cookie behavior cannot be verified locally (local dev's `localhost` pair is same-site regardless of `SameSite` config) — this task is the real test, against `dev.zelohealth.app` ↔ `api-dev.zelohealth.app`.

- [ ] **Step 1: Push everything through to `develop` via PR, watch CI**

```bash
git push -u origin <this-plan's-branch>
gh pr create --repo Develophys/zelo --base develop --head <branch> --title "feat: HttpOnly cookie session migration" --body "Implements docs/superpowers/specs/2026-09-14-httponly-cookie-session-migration-design.md"
gh pr merge <number> --repo Develophys/zelo --merge
gh run watch --repo Develophys/zelo
```

Expected: `api-test` and `deploy-dev` (and `web-test`) all green.

- [ ] **Step 2: Confirm the cookie is actually set, HttpOnly, and same-site**

```bash
curl -si -X POST https://api-dev.zelohealth.app/manager/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<a seeded dev manager email>","password":"<its password>"}' \
  | grep -i "set-cookie"
```

Expected: a `Set-Cookie: manager_session=...; Path=/; HttpOnly; SameSite=Lax` (plus `Secure`, since this is the deployed dev environment with `NODE_ENV=production`). No `token` field in the JSON body — confirm with the same command piped through `| tail -1` to see the body.

- [ ] **Step 3: Confirm the browser round-trip actually works**

Open `https://dev.zelohealth.app/manager/login` in a real browser, log in with a seeded manager account, confirm the dashboard loads (proves the cookie round-trips: set on login, sent back on `/manager/signals` etc., `SameSite=Lax` doesn't block it). Open DevTools → Application → Cookies and confirm `manager_session` shows `HttpOnly: true` and is **not** visible via `document.cookie` in the console. Repeat for `/admin/login` and `/peer/login` (peer-partner: confirm the chat connects — the socket handshake should register successfully now via the cookie).

- [ ] **Step 4: Confirm logout actually clears the cookie**

Click whatever UI now triggers logout (Task 9/11/12 added the hooks; confirm they're wired to a real button — if not yet wired to any UI, call the underlying endpoint directly: `curl -si -X POST https://api-dev.zelohealth.app/manager/logout -H "Cookie: manager_session=<value from step 2>"` and confirm the response's `Set-Cookie` header expires it, e.g. `Max-Age=0`).

- [ ] **Step 5: Confirm a stale/invalid cookie redirects to login instead of erroring**

In the browser, manually corrupt the `manager_session` cookie's value via DevTools, then navigate to `/manager`. Expected: redirected to `/manager/login?reason=expired` (or however `routes.managerLogin` + the `state.reason` renders), not a broken/blank dashboard — this is the centralized `QueryCache.onError` handler (Task 8) actually firing in production.

No commit — this task is verification only. If any step fails, the fix belongs in the task that owns the broken behavior, with its own re-verification, not a patch bolted onto this task.
