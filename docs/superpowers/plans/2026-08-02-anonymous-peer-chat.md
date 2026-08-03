# Anonymous Peer-Doctor Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a hospital admin register volunteer "peer partner" doctors, and let a médico get real-time, mutually-anonymous websocket chat with an available peer partner from their own linked institution — matched automatically, accepted/declined by the peer partner, relayed live with zero message persistence.

**Architecture:** A new `peer-partner` module gives peer partners their own auth stack (password/token/guard/login), mirroring `Manager`/`SuperAdmin` exactly. A new `peer-chat` module holds a Socket.IO `@WebSocketGateway()` plus two small in-memory state services (`PeerPresenceService` for who's connected/available, `PeerMatchRegistry` for in-flight requests and active conversations) — no database table for any of this, since presence and conversation state are both inherently ephemeral. The existing `ManagerAdminController` (from the sibling admin/sectors/permissions plan) gains a third set of endpoints for peer-partner CRUD. Frontend gets a new low-level `PeerChatSocketClient` wrapping `socket.io-client`, two purpose-built hooks (médico side, peer-partner side) built on it, a shared `PeerChatRoom` conversation UI, and a `PeersPage` rewrite.

**Tech Stack:** NestJS + `@nestjs/websockets` + `socket.io` (backend), `socket.io-client` (frontend), Prisma, Vitest, Node `crypto` (scrypt password hashing, HMAC token signing, `randomUUID`), React 18 + Zustand + TanStack Query.

## Global Constraints

- **This plan depends on `docs/superpowers/plans/2026-08-02-admin-institutions-sectors-permissions.md` being implemented first** — it extends that plan's `ManagerAdminController`, `HospitalAdminGuard`, and `generateTemporaryPassword()` utility, all of which must already exist. Do not start this plan until that one is merged.
- **No conversation content is ever persisted.** No `Conversation`/`Message` table exists anywhere in this plan — the only new table is `PeerPartner` itself (account data, not conversation data).
- **Presence is in-memory, never a database column.** A peer partner is "available" exactly while holding an active websocket connection — this is deliberate, not a shortcut (see spec §3).
- Every new file follows the exact conventions already in this codebase: kebab-case files with role suffixes (`*.use-case.ts`, `*.port.ts`, `*.repository.ts`, `*.service.ts`, `*.guard.ts`, `*.controller.ts`, `*.gateway.ts`), PascalCase classes, DI tokens as `Symbol("SCREAMING_SNAKE_NAME")` exported alongside the port interface, tests co-located as `*.test.ts`, explicit `.ts` import extensions (ESM) on the backend, no extension on the frontend (`@/...` alias).
- Thin Prisma-passthrough repositories are not unit-tested individually — exercised indirectly through controller/gateway tests, same convention as the sibling plan.
- One peer partner handles one conversation at a time; deactivating one who's connected forcibly disconnects them immediately.
- Full spec: `docs/superpowers/specs/2026-08-02-anonymous-peer-chat-design.md`.

---

### Task 1: Prisma `PeerPartner` model + migration

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_peer_partner/migration.sql`

**Interfaces:**

- Produces (used by every later task): Prisma model `PeerPartner { id, name (unique), passwordHash, institutionId (FK), specialty, isActive, createdAt }`, mapped table `peer_partners`.

- [ ] **Step 1: Add the model**

In `apps/api/prisma/schema.prisma`:

```prisma
model PeerPartner {
  id            String      @id @default(cuid())
  name          String      @unique
  passwordHash  String
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  specialty     String
  isActive      Boolean     @default(true)
  createdAt     DateTime    @default(now())

  @@map("peer_partners")
}
```

Add `peerPartners PeerPartner[]` to `Institution`'s relation list.

- [ ] **Step 2: Generate and apply the migration**

Local Postgres must be running: `docker compose -f docker/docker-compose.yml up -d postgres`.

From `apps/api/`:

```bash
DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
DIRECT_DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
pnpm exec prisma migrate dev --name add_peer_partner
```

This is a purely additive new table — no hand-editing needed, unlike the sibling plan's `signals` cutover. Accept Prisma's auto-generated migration as-is.

- [ ] **Step 3: Verify**

```bash
docker exec zelo-postgres psql -U zelo -d zelo -c "\d peer_partners"
```

Expected: columns `id, name, passwordHash, institutionId, specialty, isActive, createdAt`, FK to `institutions`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add PeerPartner model and migration"
```

---

### Task 2: Peer-partner auth stack (`peer-partner` module) — `POST /peer-partner/login`

**Files:**

- Create: `apps/api/src/modules/peer-partner/application/services/peer-partner-password.service.ts`
- Create: `apps/api/src/modules/peer-partner/application/services/timing-safe-equal.ts`
- Create: `apps/api/src/modules/peer-partner/application/services/peer-partner-token.service.ts`
- Create: `apps/api/src/modules/peer-partner/application/services/peer-partner-token.service.test.ts`
- Create: `apps/api/src/modules/peer-partner/application/ports/peer-partner-repository.port.ts`
- Create: `apps/api/src/modules/peer-partner/infrastructure/persistence/prisma-peer-partner.repository.ts`
- Create: `apps/api/src/modules/peer-partner/application/use-cases/login-peer-partner.use-case.ts`
- Create: `apps/api/src/modules/peer-partner/application/use-cases/login-peer-partner.use-case.test.ts`
- Create: `apps/api/src/modules/peer-partner/infrastructure/peer-partner-auth.guard.ts`
- Create: `apps/api/src/modules/peer-partner/infrastructure/peer-partner-auth.guard.test.ts`
- Create: `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts`
- Create: `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.test.ts`
- Create: `apps/api/src/modules/peer-partner/peer-partner.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**

- Consumes: `PeerPartner` Prisma model (Task 1).
- Produces (used by Task 3, Task 5): `PeerPartnerRepository` port (`findByName`, `findById`, `findAllByInstitution`, `create`, `update`), `PEER_PARTNER_REPOSITORY` token; `PeerPartnerTokenService.issue(peerPartnerId, peerPartnerName, institutionId): { token, expiresAt }`, `.verify(token): { peerPartnerId, peerPartnerName, institutionId } | null`; `PeerPartnerAuthGuard` attaching `request.peerPartner = { id, name, institutionId }`; `PeerPartnerModule` (exports `PEER_PARTNER_REPOSITORY`, `PeerPartnerTokenService`, `PeerPartnerAuthGuard`).

This task mirrors the `SuperAdmin`/`Manager` auth stacks exactly, with `institutionId` carried in the token (like `Manager`, unlike `SuperAdmin`).

- [ ] **Step 1: Password service and timing-safe-equal helper (no test — identical shape to the already-tested `ManagerPasswordService`)**

Create `apps/api/src/modules/peer-partner/application/services/peer-partner-password.service.ts`:

```ts
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Injectable } from "@nestjs/common";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

@Injectable()
export class PeerPartnerPasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
    return `${salt}:${derived.toString("hex")}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [salt, hashHex] = stored.split(":");
    if (!salt || !hashHex) return false;

    const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
    const storedBuf = Buffer.from(hashHex, "hex");
    return derived.length === storedBuf.length && timingSafeEqual(derived, storedBuf);
  }
}
```

Create `apps/api/src/modules/peer-partner/application/services/timing-safe-equal.ts`:

```ts
import { timingSafeEqual } from "node:crypto";

export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
```

- [ ] **Step 2: Write the failing test for `PeerPartnerTokenService`**

Create `apps/api/src/modules/peer-partner/application/services/peer-partner-token.service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { PeerPartnerTokenService } from "./peer-partner-token.service.ts";

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("PeerPartnerTokenService", () => {
  it("issues a token that verify() decodes back to the same id/name/institutionId", () => {
    const service = new PeerPartnerTokenService(fakeConfig("test-secret"));
    const { token, expiresAt } = service.issue("peer-1", "Dra. Ana", "institution-1");

    expect(service.verify(token)).toEqual({
      peerPartnerId: "peer-1",
      peerPartnerName: "Dra. Ana",
      institutionId: "institution-1",
    });
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects a token signed with a different secret", () => {
    const issuer = new PeerPartnerTokenService(fakeConfig("secret-a"));
    const verifier = new PeerPartnerTokenService(fakeConfig("secret-b"));
    const { token } = issuer.issue("peer-1", "Dra. Ana", "institution-1");

    expect(verifier.verify(token)).toBeNull();
  });

  it("rejects a malformed token", () => {
    const service = new PeerPartnerTokenService(fakeConfig("test-secret"));
    expect(service.verify("not-a-valid-token")).toBeNull();
    expect(service.verify("")).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    const service = new PeerPartnerTokenService(fakeConfig("test-secret"));
    const { token } = service.issue("peer-1", "Dra. Ana", "institution-1");

    vi.advanceTimersByTime(9 * 60 * 60 * 1000);
    expect(service.verify(token)).toBeNull();

    vi.useRealTimers();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails, then create `PeerPartnerTokenService`**

Run: `pnpm --filter @zelo/api test peer-partner-token.service -- --run` — expected FAIL (file doesn't exist).

Create `apps/api/src/modules/peer-partner/application/services/peer-partner-token.service.ts`:

```ts
import { createHmac, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeStringEqual } from "./timing-safe-equal.ts";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface IssuedPeerPartnerToken {
  token: string;
  expiresAt: string;
}

export interface DecodedPeerPartnerToken {
  peerPartnerId: string;
  peerPartnerName: string;
  institutionId: string;
}

interface TokenPayload {
  sessionId: string;
  peerPartnerId: string;
  peerPartnerName: string;
  institutionId: string;
  expiresAtEpoch: number;
}

@Injectable()
export class PeerPartnerTokenService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  issue(peerPartnerId: string, peerPartnerName: string, institutionId: string): IssuedPeerPartnerToken {
    const sessionId = randomUUID();
    const expiresAtEpoch = Date.now() + SESSION_DURATION_MS;
    const payload: TokenPayload = { sessionId, peerPartnerId, peerPartnerName, institutionId, expiresAtEpoch };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = this.sign(payloadB64);

    return { token: `${payloadB64}.${signature}`, expiresAt: new Date(expiresAtEpoch).toISOString() };
  }

  verify(token: string): DecodedPeerPartnerToken | null {
    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) return null;

    const expectedSignature = this.sign(payloadB64);
    if (!timingSafeStringEqual(signature, expectedSignature)) return null;

    let payload: TokenPayload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    } catch {
      return null;
    }

    if (
      typeof payload.peerPartnerId !== "string" ||
      typeof payload.peerPartnerName !== "string" ||
      typeof payload.institutionId !== "string" ||
      !Number.isFinite(payload.expiresAtEpoch)
    ) {
      return null;
    }

    if (Date.now() >= payload.expiresAtEpoch) return null;

    return { peerPartnerId: payload.peerPartnerId, peerPartnerName: payload.peerPartnerName, institutionId: payload.institutionId };
  }

  private sign(payloadB64: string): string {
    return createHmac("sha256", this.config.getOrThrow<string>("PEER_PARTNER_TOKEN_SECRET"))
      .update(payloadB64)
      .digest("base64url");
  }
}
```

Run: `pnpm --filter @zelo/api test peer-partner-token.service -- --run` — expected PASS.

- [ ] **Step 4: Repository port and Prisma adapter (no standalone test — thin passthrough)**

Create `apps/api/src/modules/peer-partner/application/ports/peer-partner-repository.port.ts`:

```ts
export interface PeerPartnerRow {
  id: string;
  name: string;
  passwordHash: string;
  institutionId: string;
  specialty: string;
  isActive: boolean;
}

export interface PeerPartnerSummaryRow {
  id: string;
  name: string;
  specialty: string;
  isActive: boolean;
}

export interface CreatePeerPartnerParams {
  name: string;
  passwordHash: string;
  institutionId: string;
  specialty: string;
}

export interface UpdatePeerPartnerParams {
  isActive?: boolean;
  specialty?: string;
  passwordHash?: string;
}

export interface PeerPartnerRepository {
  findByName(name: string): Promise<PeerPartnerRow | null>;
  findById(id: string): Promise<PeerPartnerRow | null>;
  findAllByInstitution(institutionId: string): Promise<PeerPartnerSummaryRow[]>;
  create(params: CreatePeerPartnerParams): Promise<{ id: string; name: string }>;
  update(id: string, patch: UpdatePeerPartnerParams): Promise<void>;
}

export const PEER_PARTNER_REPOSITORY = Symbol("PEER_PARTNER_REPOSITORY");
```

Create `apps/api/src/modules/peer-partner/infrastructure/persistence/prisma-peer-partner.repository.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type {
  CreatePeerPartnerParams,
  PeerPartnerRepository,
  PeerPartnerRow,
  PeerPartnerSummaryRow,
  UpdatePeerPartnerParams,
} from "../../application/ports/peer-partner-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaPeerPartnerRepository implements PeerPartnerRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByName(name: string): Promise<PeerPartnerRow | null> {
    const row = await this.prisma.peerPartner.findUnique({ where: { name } });
    return row ? this.toRow(row) : null;
  }

  async findById(id: string): Promise<PeerPartnerRow | null> {
    const row = await this.prisma.peerPartner.findUnique({ where: { id } });
    return row ? this.toRow(row) : null;
  }

  async findAllByInstitution(institutionId: string): Promise<PeerPartnerSummaryRow[]> {
    const rows = await this.prisma.peerPartner.findMany({ where: { institutionId } });
    return rows.map((row) => ({ id: row.id, name: row.name, specialty: row.specialty, isActive: row.isActive }));
  }

  async create(params: CreatePeerPartnerParams): Promise<{ id: string; name: string }> {
    const row = await this.prisma.peerPartner.create({
      data: { name: params.name, passwordHash: params.passwordHash, institutionId: params.institutionId, specialty: params.specialty },
    });
    return { id: row.id, name: row.name };
  }

  async update(id: string, patch: UpdatePeerPartnerParams): Promise<void> {
    await this.prisma.peerPartner.update({ where: { id }, data: patch });
  }

  private toRow(row: { id: string; name: string; passwordHash: string; institutionId: string; specialty: string; isActive: boolean }): PeerPartnerRow {
    return { id: row.id, name: row.name, passwordHash: row.passwordHash, institutionId: row.institutionId, specialty: row.specialty, isActive: row.isActive };
  }
}
```

- [ ] **Step 5: Write the failing test for `LoginPeerPartnerUseCase`**

Create `apps/api/src/modules/peer-partner/application/use-cases/login-peer-partner.use-case.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { LoginPeerPartnerUseCase, InvalidPeerPartnerCredentialsError } from "./login-peer-partner.use-case.ts";
import { PeerPartnerPasswordService } from "../services/peer-partner-password.service.ts";
import { PeerPartnerTokenService } from "../services/peer-partner-token.service.ts";
import type { PeerPartnerRepository, PeerPartnerRow } from "../ports/peer-partner-repository.port.ts";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  rows: PeerPartnerRow[] = [];
  async findByName(name: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((row) => row.name === name) ?? null;
  }
  async findById(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
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
}

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("LoginPeerPartnerUseCase", () => {
  it("issues a token carrying the peer partner's institutionId when name and password match", async () => {
    const passwordService = new PeerPartnerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", passwordHash, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    const tokenService = new PeerPartnerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginPeerPartnerUseCase(repository, passwordService, tokenService);

    const result = await useCase.execute("Dra. Ana", "correct-password");

    expect(tokenService.verify(result.token)).toEqual({ peerPartnerId: "peer-1", peerPartnerName: "Dra. Ana", institutionId: "institution-1" });
  });

  it("throws InvalidPeerPartnerCredentialsError when the name is unknown", async () => {
    const passwordService = new PeerPartnerPasswordService();
    const repository = new FakePeerPartnerRepository();
    const tokenService = new PeerPartnerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginPeerPartnerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Unknown", "any-password")).rejects.toThrow(InvalidPeerPartnerCredentialsError);
  });

  it("throws InvalidPeerPartnerCredentialsError when the password is wrong", async () => {
    const passwordService = new PeerPartnerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", passwordHash, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    const tokenService = new PeerPartnerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginPeerPartnerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Dra. Ana", "wrong-password")).rejects.toThrow(InvalidPeerPartnerCredentialsError);
  });

  it("throws InvalidPeerPartnerCredentialsError for a correct password on a deactivated peer partner", async () => {
    const passwordService = new PeerPartnerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", passwordHash, institutionId: "institution-1", specialty: "Clínica médica", isActive: false }];
    const tokenService = new PeerPartnerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginPeerPartnerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Dra. Ana", "correct-password")).rejects.toThrow(InvalidPeerPartnerCredentialsError);
  });

  it("pays the same password-verification cost for an unknown name as for a known one", async () => {
    const passwordService = new PeerPartnerPasswordService();
    const verifySpy = vi.spyOn(passwordService, "verify");
    const repository = new FakePeerPartnerRepository();
    const tokenService = new PeerPartnerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginPeerPartnerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("Unknown", "any-password")).rejects.toThrow(InvalidPeerPartnerCredentialsError);
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails, then create `LoginPeerPartnerUseCase`**

Run: `pnpm --filter @zelo/api test login-peer-partner -- --run` — expected FAIL (file doesn't exist).

Create `apps/api/src/modules/peer-partner/application/use-cases/login-peer-partner.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../ports/peer-partner-repository.port.ts";
import { PeerPartnerPasswordService } from "../services/peer-partner-password.service.ts";
import { PeerPartnerTokenService, type IssuedPeerPartnerToken } from "../services/peer-partner-token.service.ts";

export class InvalidPeerPartnerCredentialsError extends Error {}

const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

@Injectable()
export class LoginPeerPartnerUseCase {
  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
    @Inject(PeerPartnerPasswordService) private readonly passwordService: PeerPartnerPasswordService,
    @Inject(PeerPartnerTokenService) private readonly tokenService: PeerPartnerTokenService,
  ) {}

  async execute(name: string, password: string): Promise<IssuedPeerPartnerToken> {
    const peerPartner = await this.repository.findByName(name);

    const isValid = await this.passwordService.verify(password, peerPartner?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!peerPartner || !isValid || !peerPartner.isActive) {
      throw new InvalidPeerPartnerCredentialsError();
    }

    return this.tokenService.issue(peerPartner.id, peerPartner.name, peerPartner.institutionId);
  }
}
```

Run: `pnpm --filter @zelo/api test login-peer-partner -- --run` — expected PASS.

- [ ] **Step 7: Write the failing guard test, then create `PeerPartnerAuthGuard`**

Create `apps/api/src/modules/peer-partner/infrastructure/peer-partner-auth.guard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { PeerPartnerAuthGuard } from "./peer-partner-auth.guard.ts";
import { PeerPartnerTokenService } from "../application/services/peer-partner-token.service.ts";

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

function contextWithHeader(authorization: string | undefined): { context: ExecutionContext; request: Partial<Request> } {
  const request: Partial<Request> = { headers: { authorization } as Request["headers"] };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { context, request };
}

describe("PeerPartnerAuthGuard", () => {
  const tokenService = new PeerPartnerTokenService(fakeConfig("test-secret"));
  const guard = new PeerPartnerAuthGuard(tokenService);

  it("allows a valid Bearer token and attaches the decoded peer partner to the request", () => {
    const { token } = tokenService.issue("peer-1", "Dra. Ana", "institution-1");
    const { context, request } = contextWithHeader(`Bearer ${token}`);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.peerPartner).toEqual({ id: "peer-1", name: "Dra. Ana", institutionId: "institution-1" });
  });

  it("rejects a request with no Authorization header", () => {
    const { context } = contextWithHeader(undefined);
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("rejects a malformed or tampered token", () => {
    const { context } = contextWithHeader("Bearer not-a-real-token");
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
```

Run: `pnpm --filter @zelo/api test peer-partner-auth.guard -- --run` — expected FAIL (file doesn't exist).

Create `apps/api/src/modules/peer-partner/infrastructure/peer-partner-auth.guard.ts`:

```ts
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { PeerPartnerTokenService } from "../application/services/peer-partner-token.service.ts";

declare global {
  namespace Express {
    interface Request {
      peerPartner?: { id: string; name: string; institutionId: string };
    }
  }
}

@Injectable()
export class PeerPartnerAuthGuard implements CanActivate {
  constructor(@Inject(PeerPartnerTokenService) private readonly tokenService: PeerPartnerTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice("Bearer ".length);
    const decoded = this.tokenService.verify(token);
    if (!decoded) {
      throw new UnauthorizedException();
    }

    request.peerPartner = { id: decoded.peerPartnerId, name: decoded.peerPartnerName, institutionId: decoded.institutionId };
    return true;
  }
}
```

Run: `pnpm --filter @zelo/api test peer-partner-auth.guard -- --run` — expected PASS.

- [ ] **Step 8: Write the failing controller test, then create `PeerPartnerController` and `PeerPartnerModule`**

Create `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.test.ts`:

```ts
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { PeerPartnerController } from "./peer-partner.controller.ts";
import { LoginPeerPartnerUseCase } from "../application/use-cases/login-peer-partner.use-case.ts";
import { PeerPartnerTokenService } from "../application/services/peer-partner-token.service.ts";
import { PeerPartnerPasswordService } from "../application/services/peer-partner-password.service.ts";
import { PEER_PARTNER_REPOSITORY } from "../application/ports/peer-partner-repository.port.ts";
import type { PeerPartnerRepository, PeerPartnerRow } from "../application/ports/peer-partner-repository.port.ts";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  rows: PeerPartnerRow[] = [];
  async findByName(name: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((row) => row.name === name) ?? null;
  }
  async findById(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
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
}

function fakeConfig(): ConfigService {
  const values: Record<string, string> = { PEER_PARTNER_TOKEN_SECRET: "test-secret" };
  return { getOrThrow: (key: string) => values[key], get: () => undefined } as unknown as ConfigService;
}

describe("peer partner controller", () => {
  let app: INestApplication;
  let repository: FakePeerPartnerRepository;

  beforeAll(async () => {
    const passwordService = new PeerPartnerPasswordService();
    repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", passwordHash: await passwordService.hash("test-password"), institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];

    const moduleRef = await Test.createTestingModule({
      controllers: [PeerPartnerController],
      providers: [
        LoginPeerPartnerUseCase,
        PeerPartnerTokenService,
        PeerPartnerPasswordService,
        { provide: PEER_PARTNER_REPOSITORY, useValue: repository },
        { provide: ConfigService, useValue: fakeConfig() },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /peer-partner/login returns a token for the correct name and password", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/login").send({ name: "Dra. Ana", password: "test-password" });
    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
  });

  it("POST /peer-partner/login rejects an unknown name with 401", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/login").send({ name: "Unknown", password: "test-password" });
    expect(response.status).toBe(401);
  });

  it("POST /peer-partner/login rejects a malformed body with 400", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/login").send({});
    expect(response.status).toBe(400);
  });
});
```

Run: `pnpm --filter @zelo/api test peer-partner.controller -- --run` — expected FAIL (file doesn't exist).

Create `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts`:

```ts
import { BadRequestException, Body, Controller, HttpCode, Post, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { LoginPeerPartnerUseCase, InvalidPeerPartnerCredentialsError } from "../application/use-cases/login-peer-partner.use-case.ts";
import type { IssuedPeerPartnerToken } from "../application/services/peer-partner-token.service.ts";

const LoginRequestSchema = z.object({ name: z.string().min(1).max(200), password: z.string().min(1).max(200) });

@Controller("peer-partner")
export class PeerPartnerController {
  constructor(private readonly loginPeerPartner: LoginPeerPartnerUseCase) {}

  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown): Promise<IssuedPeerPartnerToken> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.loginPeerPartner.execute(parsed.data.name, parsed.data.password);
    } catch (error) {
      if (error instanceof InvalidPeerPartnerCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }
}
```

Create `apps/api/src/modules/peer-partner/peer-partner.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { PeerPartnerController } from "./infrastructure/peer-partner.controller.ts";
import { PeerPartnerAuthGuard } from "./infrastructure/peer-partner-auth.guard.ts";
import { PrismaPeerPartnerRepository } from "./infrastructure/persistence/prisma-peer-partner.repository.ts";
import { LoginPeerPartnerUseCase } from "./application/use-cases/login-peer-partner.use-case.ts";
import { PeerPartnerTokenService } from "./application/services/peer-partner-token.service.ts";
import { PeerPartnerPasswordService } from "./application/services/peer-partner-password.service.ts";
import { PEER_PARTNER_REPOSITORY } from "./application/ports/peer-partner-repository.port.ts";

@Module({
  controllers: [PeerPartnerController],
  providers: [
    LoginPeerPartnerUseCase,
    PeerPartnerTokenService,
    PeerPartnerPasswordService,
    PeerPartnerAuthGuard,
    { provide: PEER_PARTNER_REPOSITORY, useClass: PrismaPeerPartnerRepository },
  ],
  exports: [PEER_PARTNER_REPOSITORY, PeerPartnerTokenService, PeerPartnerAuthGuard],
})
export class PeerPartnerModule {}
```

Run: `pnpm --filter @zelo/api test peer-partner.controller -- --run` — expected PASS.

- [ ] **Step 9: Register the module and add the env var**

In `apps/api/src/app.module.ts`, add `import { PeerPartnerModule } from "./modules/peer-partner/peer-partner.module.ts";` and `PeerPartnerModule` to `imports`.

In `apps/api/.env.example`, add after `ADMIN_TOKEN_SECRET=change-me-in-production`:

```env
PEER_PARTNER_TOKEN_SECRET=change-me-in-production
```

- [ ] **Step 10: Run the full API test suite**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/modules/peer-partner apps/api/src/app.module.ts apps/api/.env.example
git commit -m "feat(api): add peer-partner auth stack (password/token/guard/login) as its own module"
```

---

### Task 3: Hospital-admin peer-partner CRUD (`ManagerAdminController` extension)

**Files:**

- Create: `apps/api/src/modules/manager/application/use-cases/create-peer-partner.use-case.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/create-peer-partner.use-case.test.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/reset-peer-partner-password.use-case.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/reset-peer-partner-password.use-case.test.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager-admin.controller.test.ts`
- Modify: `apps/api/src/modules/manager/manager.module.ts`

**Interfaces:**

- Consumes: `PeerPartnerRepository`, `PEER_PARTNER_REPOSITORY`, `PeerPartnerPasswordService` (Task 2, imported via `PeerPartnerModule`); `generateTemporaryPassword()` (already built in the sibling admin/sectors plan, `apps/api/src/shared/generate-temporary-password.ts`); `HospitalAdminGuard`, `ManagerAdminController` (already built in that same sibling plan).
- Produces (used by Task 6, Task 11): `GET/POST/PATCH /manager/admin/peer-partners[/:id]`, `POST /manager/admin/peer-partners/:id/reset-password`.

This task assumes `apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts` and `manager-admin.controller.test.ts` already exist exactly as the sibling admin/sectors/permissions plan leaves them (sectors + managers handlers, `@UseGuards(ManagerAuthGuard, HospitalAdminGuard)` at the class level, base path `manager/admin`) — every step below **adds** to that file, it never replaces sections this task doesn't mention.

- [ ] **Step 1: Write the failing test for `CreatePeerPartnerUseCase`**

Create `apps/api/src/modules/manager/application/use-cases/create-peer-partner.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CreatePeerPartnerUseCase } from "./create-peer-partner.use-case.ts";
import { PeerPartnerPasswordService } from "../../../peer-partner/application/services/peer-partner-password.service.ts";
import type { CreatePeerPartnerParams, PeerPartnerRepository, PeerPartnerRow, PeerPartnerSummaryRow, UpdatePeerPartnerParams } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  public lastCreateParams: CreatePeerPartnerParams | null = null;
  async findByName(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findAllByInstitution(): Promise<PeerPartnerSummaryRow[]> {
    throw new Error("not used in this test");
  }
  async create(params: CreatePeerPartnerParams): Promise<{ id: string; name: string }> {
    this.lastCreateParams = params;
    return { id: "peer-new", name: params.name };
  }
  async update(): Promise<void> {
    throw new Error("not used in this test");
  }
}

describe("CreatePeerPartnerUseCase", () => {
  it("hashes a generated temporary password and returns it alongside the created row", async () => {
    const repository = new FakePeerPartnerRepository();
    const passwordService = new PeerPartnerPasswordService();
    const useCase = new CreatePeerPartnerUseCase(repository, passwordService);

    const result = await useCase.execute({ institutionId: "institution-1", name: "Dra. Ana", specialty: "Clínica médica" });

    expect(result.peerPartner).toEqual({ id: "peer-new", name: "Dra. Ana" });
    expect(result.temporaryPassword).toEqual(expect.any(String));
    expect(repository.lastCreateParams).toEqual({
      name: "Dra. Ana",
      passwordHash: expect.any(String),
      institutionId: "institution-1",
      specialty: "Clínica médica",
    });

    const isValid = await passwordService.verify(result.temporaryPassword, repository.lastCreateParams!.passwordHash);
    expect(isValid).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails, then create `CreatePeerPartnerUseCase`**

Run: `pnpm --filter @zelo/api test create-peer-partner -- --run` — expected FAIL (file doesn't exist).

Create `apps/api/src/modules/manager/application/use-cases/create-peer-partner.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";
import { PeerPartnerPasswordService } from "../../../peer-partner/application/services/peer-partner-password.service.ts";
import { generateTemporaryPassword } from "../../../../shared/generate-temporary-password.ts";

export interface CreatePeerPartnerInput {
  institutionId: string;
  name: string;
  specialty: string;
}

export interface CreatePeerPartnerResult {
  peerPartner: { id: string; name: string };
  temporaryPassword: string;
}

@Injectable()
export class CreatePeerPartnerUseCase {
  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
    @Inject(PeerPartnerPasswordService) private readonly passwordService: PeerPartnerPasswordService,
  ) {}

  async execute(input: CreatePeerPartnerInput): Promise<CreatePeerPartnerResult> {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);

    const peerPartner = await this.repository.create({
      name: input.name,
      passwordHash,
      institutionId: input.institutionId,
      specialty: input.specialty,
    });

    return { peerPartner, temporaryPassword };
  }
}
```

Run: `pnpm --filter @zelo/api test create-peer-partner -- --run` — expected PASS.

- [ ] **Step 3: Write the failing test for `ResetPeerPartnerPasswordUseCase`**

Create `apps/api/src/modules/manager/application/use-cases/reset-peer-partner-password.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ResetPeerPartnerPasswordUseCase } from "./reset-peer-partner-password.use-case.ts";
import { PeerPartnerNotFoundError } from "./manager-admin-errors.ts";
import { PeerPartnerPasswordService } from "../../../peer-partner/application/services/peer-partner-password.service.ts";
import type { PeerPartnerRepository, PeerPartnerRow, UpdatePeerPartnerParams } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  rows: PeerPartnerRow[] = [];
  lastUpdate: { id: string; patch: UpdatePeerPartnerParams } | null = null;
  async findByName(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findAllByInstitution(): Promise<never> {
    throw new Error("not used in this test");
  }
  async create(): Promise<never> {
    throw new Error("not used in this test");
  }
  async update(id: string, patch: UpdatePeerPartnerParams): Promise<void> {
    this.lastUpdate = { id, patch };
  }
}

describe("ResetPeerPartnerPasswordUseCase", () => {
  it("throws PeerPartnerNotFoundError when the peer partner doesn't belong to the given institution", async () => {
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", passwordHash: "hash", institutionId: "institution-other", specialty: "Clínica médica", isActive: true }];
    const useCase = new ResetPeerPartnerPasswordUseCase(repository, new PeerPartnerPasswordService());

    await expect(useCase.execute({ institutionId: "institution-1", peerPartnerId: "peer-1" })).rejects.toThrow(PeerPartnerNotFoundError);
  });

  it("generates and hashes a new temporary password", async () => {
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", passwordHash: "old-hash", institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    const passwordService = new PeerPartnerPasswordService();
    const useCase = new ResetPeerPartnerPasswordUseCase(repository, passwordService);

    const result = await useCase.execute({ institutionId: "institution-1", peerPartnerId: "peer-1" });

    expect(result.temporaryPassword).toEqual(expect.any(String));
    const newHash = repository.lastUpdate!.patch.passwordHash!;
    expect(await passwordService.verify(result.temporaryPassword, newHash)).toBe(true);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails, then add `PeerPartnerNotFoundError` and create `ResetPeerPartnerPasswordUseCase`**

Run: `pnpm --filter @zelo/api test reset-peer-partner-password -- --run` — expected FAIL (file and error class don't exist).

In `apps/api/src/modules/manager/application/use-cases/manager-admin-errors.ts` (already exists from the sibling plan, holding `ManagerNotFoundError`/`SectorNotInInstitutionError`/`LastActiveHospitalAdminError`), add:

```ts
export class PeerPartnerNotFoundError extends Error {}
```

Create `apps/api/src/modules/manager/application/use-cases/reset-peer-partner-password.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";
import { PeerPartnerPasswordService } from "../../../peer-partner/application/services/peer-partner-password.service.ts";
import { generateTemporaryPassword } from "../../../../shared/generate-temporary-password.ts";
import { PeerPartnerNotFoundError } from "./manager-admin-errors.ts";

export interface ResetPeerPartnerPasswordInput {
  institutionId: string;
  peerPartnerId: string;
}

@Injectable()
export class ResetPeerPartnerPasswordUseCase {
  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
    @Inject(PeerPartnerPasswordService) private readonly passwordService: PeerPartnerPasswordService,
  ) {}

  async execute(input: ResetPeerPartnerPasswordInput): Promise<{ temporaryPassword: string }> {
    const peerPartner = await this.repository.findById(input.peerPartnerId);
    if (!peerPartner || peerPartner.institutionId !== input.institutionId) {
      throw new PeerPartnerNotFoundError();
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);
    await this.repository.update(input.peerPartnerId, { passwordHash });

    return { temporaryPassword };
  }
}
```

Run: `pnpm --filter @zelo/api test reset-peer-partner-password -- --run` — expected PASS.

- [ ] **Step 5: Extend `manager-admin.controller.test.ts` with peer-partner tests**

Add to `apps/api/src/modules/manager/infrastructure/manager-admin.controller.test.ts` (new imports, a `FakePeerPartnerRepository` alongside the existing `FakeSectorRepository`/`FakeManagerRepository`, wired into the same `Test.createTestingModule` providers array — keep every existing test as-is):

```ts
import { CreatePeerPartnerUseCase } from "../application/use-cases/create-peer-partner.use-case.ts";
import { ResetPeerPartnerPasswordUseCase } from "../application/use-cases/reset-peer-partner-password.use-case.ts";
import { PeerPartnerPasswordService } from "../../peer-partner/application/services/peer-partner-password.service.ts";
import { PEER_PARTNER_REPOSITORY } from "../../peer-partner/application/ports/peer-partner-repository.port.ts";
import type { CreatePeerPartnerParams, PeerPartnerRepository, PeerPartnerRow, PeerPartnerSummaryRow, UpdatePeerPartnerParams } from "../../peer-partner/application/ports/peer-partner-repository.port.ts";
```

```ts
class FakePeerPartnerRepository implements PeerPartnerRepository {
  public rows: PeerPartnerRow[] = [];
  async findByName(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findAllByInstitution(institutionId: string): Promise<PeerPartnerSummaryRow[]> {
    return this.rows.filter((r) => r.institutionId === institutionId).map((r) => ({ id: r.id, name: r.name, specialty: r.specialty, isActive: r.isActive }));
  }
  async create(params: CreatePeerPartnerParams): Promise<{ id: string; name: string }> {
    const row: PeerPartnerRow = { id: `peer-${this.rows.length + 10}`, name: params.name, passwordHash: params.passwordHash, institutionId: params.institutionId, specialty: params.specialty, isActive: true };
    this.rows.push(row);
    return { id: row.id, name: row.name };
  }
  async update(id: string, patch: UpdatePeerPartnerParams): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
  }
}
```

Add `peerPartnerRepository = new FakePeerPartnerRepository()` in `beforeAll` (and reset `peerPartnerRepository.rows = []` in `beforeEach` alongside the existing resets), add `CreatePeerPartnerUseCase`, `ResetPeerPartnerPasswordUseCase`, `PeerPartnerPasswordService`, and `{ provide: PEER_PARTNER_REPOSITORY, useValue: peerPartnerRepository }` to the `Test.createTestingModule({...})` providers array. Add these `it` blocks:

```ts
it("GET /manager/admin/peer-partners returns every peer partner in the institution", async () => {
  peerPartnerRepository.rows = [{ id: "peer-1", name: "Dra. Ana", passwordHash: "h", institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];

  const response = await request(app.getHttpServer()).get("/manager/admin/peer-partners").set("Authorization", `Bearer ${hospitalAdminToken()}`);

  expect(response.status).toBe(200);
  expect(response.body).toEqual([{ id: "peer-1", name: "Dra. Ana", specialty: "Clínica médica", isActive: true }]);
});

it("POST /manager/admin/peer-partners creates a peer partner and returns a temporary password", async () => {
  const response = await request(app.getHttpServer())
    .post("/manager/admin/peer-partners")
    .set("Authorization", `Bearer ${hospitalAdminToken()}`)
    .send({ name: "Dra. Ana", specialty: "Clínica médica" });

  expect(response.status).toBe(201);
  expect(response.body.peerPartner).toEqual({ id: expect.any(String), name: "Dra. Ana" });
  expect(response.body.temporaryPassword).toEqual(expect.any(String));
});

it("POST /manager/admin/peer-partners rejects a request missing specialty with 400", async () => {
  const response = await request(app.getHttpServer())
    .post("/manager/admin/peer-partners")
    .set("Authorization", `Bearer ${hospitalAdminToken()}`)
    .send({ name: "Dra. Ana" });

  expect(response.status).toBe(400);
});

it("PATCH /manager/admin/peer-partners/:id updates specialty and isActive", async () => {
  peerPartnerRepository.rows = [{ id: "peer-1", name: "Dra. Ana", passwordHash: "h", institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];

  const response = await request(app.getHttpServer())
    .patch("/manager/admin/peer-partners/peer-1")
    .set("Authorization", `Bearer ${hospitalAdminToken()}`)
    .send({ isActive: false });

  expect(response.status).toBe(204);
  expect(peerPartnerRepository.rows[0]!.isActive).toBe(false);
});

it("PATCH /manager/admin/peer-partners/:id returns 404 for a peer partner in a different institution", async () => {
  peerPartnerRepository.rows = [{ id: "peer-other", name: "Outro", passwordHash: "h", institutionId: "institution-2", specialty: "x", isActive: true }];

  const response = await request(app.getHttpServer())
    .patch("/manager/admin/peer-partners/peer-other")
    .set("Authorization", `Bearer ${hospitalAdminToken()}`)
    .send({ isActive: false });

  expect(response.status).toBe(404);
});

it("POST /manager/admin/peer-partners/:id/reset-password returns a new temporary password", async () => {
  peerPartnerRepository.rows = [{ id: "peer-1", name: "Dra. Ana", passwordHash: "old", institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];

  const response = await request(app.getHttpServer())
    .post("/manager/admin/peer-partners/peer-1/reset-password")
    .set("Authorization", `Bearer ${hospitalAdminToken()}`);

  expect(response.status).toBe(200);
  expect(response.body.temporaryPassword).toEqual(expect.any(String));
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test manager-admin.controller -- --run`
Expected: FAIL — `ManagerAdminController` has no peer-partner handlers yet.

- [ ] **Step 7: Extend `ManagerAdminController`**

Add these imports to `apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts` (alongside the existing ones):

```ts
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository, type PeerPartnerSummaryRow } from "../../peer-partner/application/ports/peer-partner-repository.port.ts";
import { CreatePeerPartnerUseCase, type CreatePeerPartnerResult } from "../application/use-cases/create-peer-partner.use-case.ts";
import { ResetPeerPartnerPasswordUseCase } from "../application/use-cases/reset-peer-partner-password.use-case.ts";
import { PeerPartnerNotFoundError } from "../application/use-cases/manager-admin-errors.ts";
```

Add this schema alongside the existing `CreateSectorSchema`/`UpdateSectorSchema`/`CreateManagerSchema`/`UpdateManagerSchema`:

```ts
const CreatePeerPartnerSchema = z.object({ name: z.string().trim().min(1).max(200), specialty: z.string().trim().min(1).max(200) });
const UpdatePeerPartnerSchema = z.object({ isActive: z.boolean().optional(), specialty: z.string().trim().min(1).max(200).optional() });
```

Add these two constructor parameters (alongside the existing ones) and these five handler methods to the `ManagerAdminController` class:

```ts
    @Inject(PEER_PARTNER_REPOSITORY) private readonly peerPartnerRepository: PeerPartnerRepository,
    private readonly createPeerPartner: CreatePeerPartnerUseCase,
    private readonly resetPeerPartnerPassword: ResetPeerPartnerPasswordUseCase,
```

```ts
  @Get("peer-partners")
  async listPeerPartners(@Req() request: Request): Promise<PeerPartnerSummaryRow[]> {
    return this.peerPartnerRepository.findAllByInstitution(request.manager!.institutionId);
  }

  @Post("peer-partners")
  @HttpCode(201)
  async createPeerPartnerHandler(@Req() request: Request, @Body() body: unknown): Promise<CreatePeerPartnerResult> {
    const parsed = CreatePeerPartnerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.createPeerPartner.execute({ institutionId: request.manager!.institutionId, ...parsed.data });
  }

  @Patch("peer-partners/:id")
  @HttpCode(204)
  async updatePeerPartnerHandler(@Req() request: Request, @Param("id") id: string, @Body() body: unknown): Promise<void> {
    const parsed = UpdatePeerPartnerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const peerPartner = await this.peerPartnerRepository.findById(id);
    if (!peerPartner || peerPartner.institutionId !== request.manager!.institutionId) {
      throw new NotFoundException();
    }

    await this.peerPartnerRepository.update(id, parsed.data);
  }

  @Post("peer-partners/:id/reset-password")
  @HttpCode(200)
  async resetPeerPartnerPasswordHandler(@Req() request: Request, @Param("id") id: string): Promise<{ temporaryPassword: string }> {
    try {
      return await this.resetPeerPartnerPassword.execute({ institutionId: request.manager!.institutionId, peerPartnerId: id });
    } catch (error) {
      if (error instanceof PeerPartnerNotFoundError) {
        throw new NotFoundException();
      }
      throw error;
    }
  }
```

(`updatePeerPartnerHandler`'s 404 check doesn't need a try/catch — it checks ownership directly via `findById`, same pattern as the existing `updateSector` handler in this file.)

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test manager-admin.controller -- --run`
Expected: PASS (all tests).

- [ ] **Step 9: Register the new providers and import `PeerPartnerModule`**

In `apps/api/src/modules/manager/manager.module.ts`, add `import { PeerPartnerModule } from "../peer-partner/peer-partner.module.ts";`, add `PeerPartnerModule` to the `@Module({...})`'s `imports` array (alongside the existing `SectorModule`), and add `CreatePeerPartnerUseCase`, `ResetPeerPartnerPasswordUseCase` to `providers`.

- [ ] **Step 10: Run the full API test suite**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/modules/manager
git commit -m "feat(api): add hospital-admin peer-partner CRUD and password reset"
```

---

### Task 4: In-memory presence and match-state services

**Files:**

- Create: `apps/api/src/modules/peer-chat/application/services/peer-presence.service.ts`
- Create: `apps/api/src/modules/peer-chat/application/services/peer-presence.service.test.ts`
- Create: `apps/api/src/modules/peer-chat/application/services/peer-match-registry.service.ts`
- Create: `apps/api/src/modules/peer-chat/application/services/peer-match-registry.service.test.ts`

**Interfaces:**

- Produces (used by Task 5): `PeerPresenceService` — `register(peerPartnerId, institutionId, socketId, specialty)`, `unregisterBySocketId(socketId): PeerPresenceEntry | null`, `setStatus(peerPartnerId, status)`, `findAvailable(institutionId, excludePeerPartnerIds): PeerPresenceEntry | null`, `getBySocketId(socketId): PeerPresenceEntry | null`; `PeerMatchRegistry` — `createPending(...)`, `getPending(requestId)`, `markTried(...)`, `resolvePending(requestId)`, `activate(...)`, `getActive(requestId)`, `findActiveBySocketId(socketId)`, `endActive(requestId)`.

Both are plain injectable classes with no constructor dependencies — pure in-memory state, no I/O, no timers (the gateway in Task 5 owns all `setTimeout` calls and socket emits).

- [ ] **Step 1: Write the failing test for `PeerPresenceService`**

Create `apps/api/src/modules/peer-chat/application/services/peer-presence.service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PeerPresenceService } from "./peer-presence.service.ts";

describe("PeerPresenceService", () => {
  it("registers a peer partner and finds them as available", () => {
    const service = new PeerPresenceService();
    service.register("peer-1", "institution-1", "socket-1", "Clínica médica");

    const found = service.findAvailable("institution-1", new Set());

    expect(found).toEqual({ peerPartnerId: "peer-1", institutionId: "institution-1", socketId: "socket-1", specialty: "Clínica médica", status: "available" });
  });

  it("does not find a peer partner from a different institution", () => {
    const service = new PeerPresenceService();
    service.register("peer-1", "institution-1", "socket-1", "Clínica médica");

    expect(service.findAvailable("institution-2", new Set())).toBeNull();
  });

  it("excludes ids in the exclude set", () => {
    const service = new PeerPresenceService();
    service.register("peer-1", "institution-1", "socket-1", "Clínica médica");

    expect(service.findAvailable("institution-1", new Set(["peer-1"]))).toBeNull();
  });

  it("does not find a peer partner whose status is not available", () => {
    const service = new PeerPresenceService();
    service.register("peer-1", "institution-1", "socket-1", "Clínica médica");
    service.setStatus("peer-1", "busy");

    expect(service.findAvailable("institution-1", new Set())).toBeNull();
  });

  it("unregisterBySocketId removes the entry and returns it", () => {
    const service = new PeerPresenceService();
    service.register("peer-1", "institution-1", "socket-1", "Clínica médica");

    const removed = service.unregisterBySocketId("socket-1");

    expect(removed?.peerPartnerId).toBe("peer-1");
    expect(service.getBySocketId("socket-1")).toBeNull();
    expect(service.findAvailable("institution-1", new Set())).toBeNull();
  });

  it("unregisterBySocketId on an unknown socket returns null without throwing", () => {
    const service = new PeerPresenceService();
    expect(service.unregisterBySocketId("unknown-socket")).toBeNull();
  });

  it("setStatus on an unknown peerPartnerId is a no-op, not a throw", () => {
    const service = new PeerPresenceService();
    expect(() => service.setStatus("unknown-peer", "available")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails, then create `PeerPresenceService`**

Run: `pnpm --filter @zelo/api test peer-presence.service -- --run` — expected FAIL (file doesn't exist).

Create `apps/api/src/modules/peer-chat/application/services/peer-presence.service.ts`:

```ts
import { Injectable } from "@nestjs/common";

export type PeerPartnerStatus = "available" | "pending" | "busy";

export interface PeerPresenceEntry {
  peerPartnerId: string;
  institutionId: string;
  socketId: string;
  specialty: string;
  status: PeerPartnerStatus;
}

@Injectable()
export class PeerPresenceService {
  private bySocketId = new Map<string, PeerPresenceEntry>();
  private byPeerPartnerId = new Map<string, PeerPresenceEntry>();

  register(peerPartnerId: string, institutionId: string, socketId: string, specialty: string): void {
    const entry: PeerPresenceEntry = { peerPartnerId, institutionId, socketId, specialty, status: "available" };
    this.bySocketId.set(socketId, entry);
    this.byPeerPartnerId.set(peerPartnerId, entry);
  }

  unregisterBySocketId(socketId: string): PeerPresenceEntry | null {
    const entry = this.bySocketId.get(socketId);
    if (!entry) return null;
    this.bySocketId.delete(socketId);
    this.byPeerPartnerId.delete(entry.peerPartnerId);
    return entry;
  }

  setStatus(peerPartnerId: string, status: PeerPartnerStatus): void {
    const entry = this.byPeerPartnerId.get(peerPartnerId);
    if (entry) entry.status = status;
  }

  findAvailable(institutionId: string, excludePeerPartnerIds: Set<string>): PeerPresenceEntry | null {
    for (const entry of this.byPeerPartnerId.values()) {
      if (entry.institutionId === institutionId && entry.status === "available" && !excludePeerPartnerIds.has(entry.peerPartnerId)) {
        return entry;
      }
    }
    return null;
  }

  getBySocketId(socketId: string): PeerPresenceEntry | null {
    return this.bySocketId.get(socketId) ?? null;
  }
}
```

Run: `pnpm --filter @zelo/api test peer-presence.service -- --run` — expected PASS.

- [ ] **Step 3: Write the failing test for `PeerMatchRegistry`**

Create `apps/api/src/modules/peer-chat/application/services/peer-match-registry.service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PeerMatchRegistry } from "./peer-match-registry.service.ts";

describe("PeerMatchRegistry", () => {
  it("creates and retrieves a pending match", () => {
    const registry = new PeerMatchRegistry();
    registry.createPending("request-1", "medico-socket", "institution-1", "UTI", "peer-1");

    const pending = registry.getPending("request-1");

    expect(pending).toEqual({
      requestId: "request-1",
      medicoSocketId: "medico-socket",
      institutionId: "institution-1",
      sectorName: "UTI",
      triedPeerPartnerIds: new Set(["peer-1"]),
      candidatePeerPartnerId: "peer-1",
    });
  });

  it("markTried adds the old candidate to the tried set and updates the current candidate", () => {
    const registry = new PeerMatchRegistry();
    registry.createPending("request-1", "medico-socket", "institution-1", undefined, "peer-1");

    registry.markTried("request-1", "peer-1", "peer-2");

    const pending = registry.getPending("request-1");
    expect(pending!.triedPeerPartnerIds).toEqual(new Set(["peer-1", "peer-2"]));
    expect(pending!.candidatePeerPartnerId).toBe("peer-2");
  });

  it("resolvePending removes and returns the pending match", () => {
    const registry = new PeerMatchRegistry();
    registry.createPending("request-1", "medico-socket", "institution-1", undefined, "peer-1");

    const resolved = registry.resolvePending("request-1");

    expect(resolved?.requestId).toBe("request-1");
    expect(registry.getPending("request-1")).toBeUndefined();
  });

  it("resolvePending on an unknown requestId returns undefined without throwing", () => {
    const registry = new PeerMatchRegistry();
    expect(registry.resolvePending("unknown")).toBeUndefined();
  });

  it("activate creates an active conversation, findable by either socket id", () => {
    const registry = new PeerMatchRegistry();
    registry.activate("request-1", "medico-socket", "peer-socket", "peer-1");

    expect(registry.getActive("request-1")).toEqual({ requestId: "request-1", medicoSocketId: "medico-socket", peerPartnerSocketId: "peer-socket", peerPartnerId: "peer-1" });
    expect(registry.findActiveBySocketId("medico-socket")?.requestId).toBe("request-1");
    expect(registry.findActiveBySocketId("peer-socket")?.requestId).toBe("request-1");
    expect(registry.findActiveBySocketId("unrelated-socket")).toBeUndefined();
  });

  it("endActive removes the conversation", () => {
    const registry = new PeerMatchRegistry();
    registry.activate("request-1", "medico-socket", "peer-socket", "peer-1");

    registry.endActive("request-1");

    expect(registry.getActive("request-1")).toBeUndefined();
    expect(registry.findActiveBySocketId("medico-socket")).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails, then create `PeerMatchRegistry`**

Run: `pnpm --filter @zelo/api test peer-match-registry.service -- --run` — expected FAIL (file doesn't exist).

Create `apps/api/src/modules/peer-chat/application/services/peer-match-registry.service.ts`:

```ts
import { Injectable } from "@nestjs/common";

export interface PendingMatch {
  requestId: string;
  medicoSocketId: string;
  institutionId: string;
  sectorName: string | undefined;
  triedPeerPartnerIds: Set<string>;
  candidatePeerPartnerId: string;
}

export interface ActiveConversation {
  requestId: string;
  medicoSocketId: string;
  peerPartnerSocketId: string;
  peerPartnerId: string;
}

@Injectable()
export class PeerMatchRegistry {
  private pending = new Map<string, PendingMatch>();
  private active = new Map<string, ActiveConversation>();

  createPending(requestId: string, medicoSocketId: string, institutionId: string, sectorName: string | undefined, candidatePeerPartnerId: string): void {
    this.pending.set(requestId, {
      requestId,
      medicoSocketId,
      institutionId,
      sectorName,
      triedPeerPartnerIds: new Set([candidatePeerPartnerId]),
      candidatePeerPartnerId,
    });
  }

  getPending(requestId: string): PendingMatch | undefined {
    return this.pending.get(requestId);
  }

  markTried(requestId: string, triedPeerPartnerId: string, nextCandidatePeerPartnerId: string): void {
    const match = this.pending.get(requestId);
    if (!match) return;
    match.triedPeerPartnerIds.add(triedPeerPartnerId);
    match.candidatePeerPartnerId = nextCandidatePeerPartnerId;
  }

  resolvePending(requestId: string): PendingMatch | undefined {
    const match = this.pending.get(requestId);
    this.pending.delete(requestId);
    return match;
  }

  activate(requestId: string, medicoSocketId: string, peerPartnerSocketId: string, peerPartnerId: string): void {
    this.active.set(requestId, { requestId, medicoSocketId, peerPartnerSocketId, peerPartnerId });
  }

  getActive(requestId: string): ActiveConversation | undefined {
    return this.active.get(requestId);
  }

  findActiveBySocketId(socketId: string): ActiveConversation | undefined {
    for (const conversation of this.active.values()) {
      if (conversation.medicoSocketId === socketId || conversation.peerPartnerSocketId === socketId) return conversation;
    }
    return undefined;
  }

  endActive(requestId: string): void {
    this.active.delete(requestId);
  }
}
```

Run: `pnpm --filter @zelo/api test peer-match-registry.service -- --run` — expected PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/peer-chat/application/services
git commit -m "feat(api): add in-memory peer-presence and match-registry state services"
```

---

### Task 5: `PeerChatGateway` — connection, matching, relay

**Files:**

- Create: `apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.ts`
- Create: `apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.test.ts`
- Create: `apps/api/src/modules/peer-chat/peer-chat.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json`

**Interfaces:**

- Consumes: `PeerPresenceService`, `PeerMatchRegistry` (Task 4); `PeerPartnerTokenService`, `PeerPartnerRepository` (Task 2).
- Produces (used by Task 6): `PeerChatGateway.forceDisconnect(peerPartnerId: string): void` (exported via `PeerChatModule`, used by `ManagerAdminController` on deactivation).

Implementation note on rooms: rather than using Socket.IO's room feature literally, message relay and "who's talking to whom" bookkeeping is handled entirely by `PeerMatchRegistry`'s active-conversation map (Task 4) — every emit addresses a specific socket id directly via `server.to(socketId).emit(...)`. This is simpler than tracking room membership and produces the identical effect for a 1:1 pairing.

- [ ] **Step 1: Add dependencies**

```bash
pnpm --filter @zelo/api add @nestjs/websockets socket.io
```

- [ ] **Step 2: Write the failing tests for `PeerChatGateway`**

Create `apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PeerChatGateway } from "./peer-chat.gateway.ts";
import { PeerPresenceService } from "../application/services/peer-presence.service.ts";
import { PeerMatchRegistry } from "../application/services/peer-match-registry.service.ts";
import { PeerPartnerTokenService } from "../../peer-partner/application/services/peer-partner-token.service.ts";
import type { PeerPartnerRepository, PeerPartnerRow } from "../../peer-partner/application/ports/peer-partner-repository.port.ts";
import type { ConfigService } from "@nestjs/config";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  rows: PeerPartnerRow[] = [];
  async findByName(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
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
}

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

function fakeClient(id: string, token?: string) {
  return {
    id,
    handshake: { auth: token ? { token } : {} },
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
}

function fakeServer() {
  const emitted: { socketId: string; event: string; payload?: unknown }[] = [];
  return {
    to: (socketId: string) => ({ emit: (event: string, payload?: unknown) => emitted.push({ socketId, event, payload }) }),
    sockets: { sockets: new Map<string, ReturnType<typeof fakeClient>>() },
    emitted,
  };
}

describe("PeerChatGateway", () => {
  let presence: PeerPresenceService;
  let registry: PeerMatchRegistry;
  let tokenService: PeerPartnerTokenService;
  let repository: FakePeerPartnerRepository;
  let gateway: PeerChatGateway;
  let server: ReturnType<typeof fakeServer>;

  beforeEach(() => {
    presence = new PeerPresenceService();
    registry = new PeerMatchRegistry();
    tokenService = new PeerPartnerTokenService(fakeConfig("test-secret"));
    repository = new FakePeerPartnerRepository();
    gateway = new PeerChatGateway(presence, registry, tokenService, repository);
    server = fakeServer();
    gateway.server = server as never;
  });

  async function connectPeerPartner(id: string, name: string, institutionId: string, specialty: string) {
    repository.rows.push({ id, name, passwordHash: "irrelevant", institutionId, specialty, isActive: true });
    const { token } = tokenService.issue(id, name, institutionId);
    const client = fakeClient(`socket-${id}`, token);
    await gateway.handleConnection(client as never);
    return client;
  }

  it("registers a peer partner as available on connect with a valid token", async () => {
    await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    expect(presence.findAvailable("institution-1", new Set())?.peerPartnerId).toBe("peer-1");
  });

  it("disconnects a socket presenting an invalid token", async () => {
    const client = fakeClient("socket-bad", "not-a-real-token");
    await gateway.handleConnection(client as never);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it("disconnects a socket presenting a valid token for a deactivated peer partner", async () => {
    repository.rows.push({ id: "peer-1", name: "Dra. Ana", passwordHash: "x", institutionId: "institution-1", specialty: "Clínica médica", isActive: false });
    const { token } = tokenService.issue("peer-1", "Dra. Ana", "institution-1");
    const client = fakeClient("socket-1", token);

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it("does nothing special for an anonymous (no-token) médico connection", async () => {
    const client = fakeClient("medico-socket");
    await gateway.handleConnection(client as never);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("request-peer emits no_peer_available when nobody is connected for that institution", () => {
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });

    expect(medico.emit).toHaveBeenCalledWith("no_peer_available");
  });

  it("request-peer emits incoming_request to the available peer partner's socket", async () => {
    await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const medico = fakeClient("medico-socket");

    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1", sectorName: "UTI" });

    const incoming = server.emitted.find((e) => e.event === "incoming_request");
    expect(incoming?.socketId).toBe("socket-peer-1");
    expect(incoming?.payload).toEqual({ requestId: expect.any(String), sectorName: "UTI" });
  });

  it("accept_request marks the peer partner busy and emits matched to both sides with the peer's specialty", async () => {
    const peerClient = await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });
    const requestId = (server.emitted.find((e) => e.event === "incoming_request")!.payload as { requestId: string }).requestId;

    gateway.handleAcceptRequest(peerClient as never, { requestId });

    expect(presence.getBySocketId("socket-peer-1")?.status).toBe("busy");
    const matchedToMedico = server.emitted.find((e) => e.event === "matched" && e.socketId === "medico-socket");
    expect(matchedToMedico?.payload).toEqual({ requestId, specialty: "Clínica médica" });
    expect(peerClient.emit).toHaveBeenCalledWith("matched", { requestId });
  });

  it("decline_request tries the next available candidate", async () => {
    await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const peer2 = await connectPeerPartner("peer-2", "Dr. Bruno", "institution-1", "Residência");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });
    const firstRequestId = (server.emitted.find((e) => e.event === "incoming_request")!.payload as { requestId: string }).requestId;

    gateway.handleDeclineRequest(fakeClient("socket-peer-1") as never, { requestId: firstRequestId });

    const secondIncoming = server.emitted.filter((e) => e.event === "incoming_request")[1];
    expect(secondIncoming?.socketId).toBe(peer2.id);
  });

  it("decline_request emits no_peer_available to the médico when no other candidate exists", async () => {
    await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });
    const requestId = (server.emitted.find((e) => e.event === "incoming_request")!.payload as { requestId: string }).requestId;

    gateway.handleDeclineRequest(fakeClient("socket-peer-1") as never, { requestId });

    expect(server.emitted.some((e) => e.event === "no_peer_available" && e.socketId === "medico-socket")).toBe(true);
  });

  it("a 30-second timeout with no response behaves identically to an explicit decline", async () => {
    vi.useFakeTimers();
    await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });

    vi.advanceTimersByTime(30_000);

    expect(server.emitted.some((e) => e.event === "no_peer_available" && e.socketId === "medico-socket")).toBe(true);
    vi.useRealTimers();
  });

  it("message relays only to the other party in the matched conversation", async () => {
    const peerClient = await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });
    const requestId = (server.emitted.find((e) => e.event === "incoming_request")!.payload as { requestId: string }).requestId;
    gateway.handleAcceptRequest(peerClient as never, { requestId });

    gateway.handleMessage(medico as never, { requestId, text: "oi" });

    const relayed = server.emitted.find((e) => e.event === "message" && e.socketId === "socket-peer-1");
    expect(relayed?.payload).toEqual({ text: "oi" });
  });

  it("disconnecting during an active conversation notifies the other side and frees the peer partner", async () => {
    const peerClient = await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });
    const requestId = (server.emitted.find((e) => e.event === "incoming_request")!.payload as { requestId: string }).requestId;
    gateway.handleAcceptRequest(peerClient as never, { requestId });

    gateway.handleDisconnect(medico as never);

    expect(server.emitted.some((e) => e.event === "peer_left" && e.socketId === "socket-peer-1")).toBe(true);
    expect(presence.getBySocketId("socket-peer-1")?.status).toBe("available");
  });

  it("leave_conversation notifies the other side and frees the peer partner", async () => {
    const peerClient = await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });
    const requestId = (server.emitted.find((e) => e.event === "incoming_request")!.payload as { requestId: string }).requestId;
    gateway.handleAcceptRequest(peerClient as never, { requestId });

    gateway.handleLeaveConversation(medico as never, { requestId });

    expect(server.emitted.some((e) => e.event === "peer_left" && e.socketId === "socket-peer-1")).toBe(true);
    expect(presence.getBySocketId("socket-peer-1")?.status).toBe("available");
  });

  it("forceDisconnect disconnects a connected peer partner's socket", async () => {
    const peerClient = await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    server.sockets.sockets.set(peerClient.id, peerClient as never);

    gateway.forceDisconnect("peer-1");

    expect(peerClient.disconnect).toHaveBeenCalledWith(true);
  });

  it("forceDisconnect on a peer partner who isn't connected does nothing, doesn't throw", () => {
    expect(() => gateway.forceDisconnect("not-connected")).not.toThrow();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @zelo/api test peer-chat.gateway -- --run` — expected FAIL (`peer-chat.gateway.ts` doesn't exist).

- [ ] **Step 4: Create `PeerChatGateway`**

Create `apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.ts`:

```ts
import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { PeerPresenceService } from "../application/services/peer-presence.service.ts";
import { PeerMatchRegistry } from "../application/services/peer-match-registry.service.ts";
import { PeerPartnerTokenService } from "../../peer-partner/application/services/peer-partner-token.service.ts";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../../peer-partner/application/ports/peer-partner-repository.port.ts";

const ACCEPT_TIMEOUT_MS = 30_000;
const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:8080"];

function resolveAllowedOrigins(): string[] {
  const configured = process.env.CORS_ALLOWED_ORIGINS;
  if (!configured) return DEFAULT_ALLOWED_ORIGINS;
  return configured.split(",").map((origin) => origin.trim()).filter((origin) => origin.length > 0);
}

interface RequestPeerPayload {
  institutionId: string;
  sectorName?: string;
}
interface RequestIdPayload {
  requestId: string;
}
interface MessagePayload {
  requestId: string;
  text: string;
}

@Injectable()
@WebSocketGateway({ cors: { origin: resolveAllowedOrigins() } })
export class PeerChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private readonly pendingTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly presence: PeerPresenceService,
    private readonly registry: PeerMatchRegistry,
    private readonly tokenService: PeerPartnerTokenService,
    @Inject(PEER_PARTNER_REPOSITORY) private readonly peerPartnerRepository: PeerPartnerRepository,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) return; // an anonymous médico connection — nothing to register

    const decoded = this.tokenService.verify(token);
    if (!decoded) {
      client.disconnect(true);
      return;
    }

    const peerPartner = await this.peerPartnerRepository.findById(decoded.peerPartnerId);
    if (!peerPartner || !peerPartner.isActive) {
      client.disconnect(true);
      return;
    }

    this.presence.register(peerPartner.id, peerPartner.institutionId, client.id, peerPartner.specialty);
  }

  handleDisconnect(client: Socket): void {
    this.presence.unregisterBySocketId(client.id);

    const conversation = this.registry.findActiveBySocketId(client.id);
    if (!conversation) return;

    const otherSocketId = conversation.medicoSocketId === client.id ? conversation.peerPartnerSocketId : conversation.medicoSocketId;
    this.server.to(otherSocketId).emit("peer_left");
    this.registry.endActive(conversation.requestId);
    this.presence.setStatus(conversation.peerPartnerId, "available");
  }

  @SubscribeMessage("request-peer")
  handleRequestPeer(@ConnectedSocket() client: Socket, @MessageBody() payload: RequestPeerPayload): void {
    const candidate = this.presence.findAvailable(payload.institutionId, new Set());
    if (!candidate) {
      client.emit("no_peer_available");
      return;
    }

    const requestId = randomUUID();
    this.presence.setStatus(candidate.peerPartnerId, "pending");
    this.registry.createPending(requestId, client.id, payload.institutionId, payload.sectorName, candidate.peerPartnerId);
    this.server.to(candidate.socketId).emit("incoming_request", { requestId, sectorName: payload.sectorName });
    this.startTimeout(requestId);
  }

  @SubscribeMessage("accept_request")
  handleAcceptRequest(@ConnectedSocket() client: Socket, @MessageBody() payload: RequestIdPayload): void {
    this.clearTimeout(payload.requestId);
    const pending = this.registry.resolvePending(payload.requestId);
    if (!pending) return; // already resolved (declined/expired) — a late accept is ignored

    this.presence.setStatus(pending.candidatePeerPartnerId, "busy");
    this.registry.activate(payload.requestId, pending.medicoSocketId, client.id, pending.candidatePeerPartnerId);

    const specialty = this.presence.getBySocketId(client.id)?.specialty ?? "";
    this.server.to(pending.medicoSocketId).emit("matched", { requestId: payload.requestId, specialty });
    client.emit("matched", { requestId: payload.requestId });
  }

  @SubscribeMessage("decline_request")
  handleDeclineRequest(@ConnectedSocket() _client: Socket, @MessageBody() payload: RequestIdPayload): void {
    this.declineOrExpire(payload.requestId);
  }

  @SubscribeMessage("message")
  handleMessage(@ConnectedSocket() client: Socket, @MessageBody() payload: MessagePayload): void {
    const conversation = this.registry.getActive(payload.requestId);
    if (!conversation) return;

    const otherSocketId = conversation.medicoSocketId === client.id ? conversation.peerPartnerSocketId : conversation.medicoSocketId;
    this.server.to(otherSocketId).emit("message", { text: payload.text });
  }

  @SubscribeMessage("leave_conversation")
  handleLeaveConversation(@ConnectedSocket() client: Socket, @MessageBody() payload: RequestIdPayload): void {
    const conversation = this.registry.getActive(payload.requestId);
    if (!conversation) return;

    const otherSocketId = conversation.medicoSocketId === client.id ? conversation.peerPartnerSocketId : conversation.medicoSocketId;
    this.server.to(otherSocketId).emit("peer_left");
    this.registry.endActive(payload.requestId);
    this.presence.setStatus(conversation.peerPartnerId, "available");
  }

  /** Used by ManagerAdminController when a hospital admin deactivates a connected peer partner. */
  forceDisconnect(peerPartnerId: string): void {
    const entry = this.presence.getByPeerPartnerId(peerPartnerId);
    if (!entry) return;
    this.server.sockets.sockets.get(entry.socketId)?.disconnect(true);
  }

  private startTimeout(requestId: string): void {
    const timeout = setTimeout(() => this.declineOrExpire(requestId), ACCEPT_TIMEOUT_MS);
    this.pendingTimeouts.set(requestId, timeout);
  }

  private clearTimeout(requestId: string): void {
    const timeout = this.pendingTimeouts.get(requestId);
    if (timeout) clearTimeout(timeout);
    this.pendingTimeouts.delete(requestId);
  }

  private declineOrExpire(requestId: string): void {
    this.clearTimeout(requestId);
    const pending = this.registry.getPending(requestId);
    if (!pending) return; // already accepted — a race between accept and a late decline/timeout

    this.presence.setStatus(pending.candidatePeerPartnerId, "available");
    const next = this.presence.findAvailable(pending.institutionId, pending.triedPeerPartnerIds);

    if (!next) {
      this.registry.resolvePending(requestId);
      this.server.to(pending.medicoSocketId).emit("no_peer_available");
      return;
    }

    this.presence.setStatus(next.peerPartnerId, "pending");
    this.registry.markTried(requestId, pending.candidatePeerPartnerId, next.peerPartnerId);
    this.server.to(next.socketId).emit("incoming_request", { requestId, sectorName: pending.sectorName });
    this.startTimeout(requestId);
  }
}
```

`forceDisconnect` needs a way to look up a peer partner's current socket id by `peerPartnerId`. Add this one method to `PeerPresenceService` (Task 4's file), in `apps/api/src/modules/peer-chat/application/services/peer-presence.service.ts`:

```ts
  getByPeerPartnerId(peerPartnerId: string): PeerPresenceEntry | null {
    return this.byPeerPartnerId.get(peerPartnerId) ?? null;
  }
```

Add a test for it to `peer-presence.service.test.ts`:

```ts
it("getByPeerPartnerId finds a registered entry by id", () => {
  const service = new PeerPresenceService();
  service.register("peer-1", "institution-1", "socket-1", "Clínica médica");
  expect(service.getByPeerPartnerId("peer-1")?.socketId).toBe("socket-1");
});

it("getByPeerPartnerId returns null for an unknown id", () => {
  const service = new PeerPresenceService();
  expect(service.getByPeerPartnerId("unknown")).toBeNull();
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @zelo/api test peer-chat.gateway peer-presence.service -- --run`
Expected: PASS (all tests).

- [ ] **Step 6: Create `PeerChatModule` and register it**

Create `apps/api/src/modules/peer-chat/peer-chat.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { PeerChatGateway } from "./infrastructure/peer-chat.gateway.ts";
import { PeerPresenceService } from "./application/services/peer-presence.service.ts";
import { PeerMatchRegistry } from "./application/services/peer-match-registry.service.ts";
import { PeerPartnerModule } from "../peer-partner/peer-partner.module.ts";

@Module({
  imports: [PeerPartnerModule],
  providers: [PeerChatGateway, PeerPresenceService, PeerMatchRegistry],
  exports: [PeerChatGateway],
})
export class PeerChatModule {}
```

In `apps/api/src/app.module.ts`, add `import { PeerChatModule } from "./modules/peer-chat/peer-chat.module.ts";` and `PeerChatModule` to `imports`.

- [ ] **Step 7: Run the full API test suite**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/peer-chat apps/api/src/app.module.ts apps/api/package.json apps/api/pnpm-lock.yaml
git commit -m "feat(api): add PeerChatGateway (websocket connection, matching, relay)"
```

---

### Task 6: Wire forced disconnect into peer-partner deactivation

**Files:**

- Modify: `apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager-admin.controller.test.ts`
- Modify: `apps/api/src/modules/manager/manager.module.ts`

**Interfaces:**

- Consumes: `PeerChatGateway.forceDisconnect(peerPartnerId: string): void` (Task 5, exported via `PeerChatModule`).

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/modules/manager/infrastructure/manager-admin.controller.test.ts` (new import for `PeerChatGateway`, a fake with a spy method, wired into the `Test.createTestingModule` providers):

```ts
import { PeerChatGateway } from "../../peer-chat/infrastructure/peer-chat.gateway.ts";
```

```ts
class FakePeerChatGateway {
  forceDisconnect = vi.fn();
}
```

Declare `peerChatGateway = new FakePeerChatGateway()` in `beforeAll`, add `{ provide: PeerChatGateway, useValue: peerChatGateway }` to the providers array (import `vi` from `vitest` in this file's existing import line if not already present), and add:

```ts
it("PATCH /manager/admin/peer-partners/:id with isActive:false forcibly disconnects the peer partner", async () => {
  peerPartnerRepository.rows = [{ id: "peer-1", name: "Dra. Ana", passwordHash: "h", institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];

  await request(app.getHttpServer())
    .patch("/manager/admin/peer-partners/peer-1")
    .set("Authorization", `Bearer ${hospitalAdminToken()}`)
    .send({ isActive: false });

  expect(peerChatGateway.forceDisconnect).toHaveBeenCalledWith("peer-1");
});

it("PATCH /manager/admin/peer-partners/:id with only specialty does not disconnect anyone", async () => {
  peerPartnerRepository.rows = [{ id: "peer-1", name: "Dra. Ana", passwordHash: "h", institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
  peerChatGateway.forceDisconnect.mockClear();

  await request(app.getHttpServer())
    .patch("/manager/admin/peer-partners/peer-1")
    .set("Authorization", `Bearer ${hospitalAdminToken()}`)
    .send({ specialty: "Residência" });

  expect(peerChatGateway.forceDisconnect).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test manager-admin.controller -- --run`
Expected: FAIL — `updatePeerPartnerHandler` doesn't call `forceDisconnect` yet.

- [ ] **Step 3: Wire it in**

In `apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts`, add the import:

```ts
import { PeerChatGateway } from "../../peer-chat/infrastructure/peer-chat.gateway.ts";
```

Add one constructor parameter (alongside the existing ones):

```ts
    private readonly peerChatGateway: PeerChatGateway,
```

Change the body of `updatePeerPartnerHandler` from:

```ts
    await this.peerPartnerRepository.update(id, parsed.data);
```

to:

```ts
    await this.peerPartnerRepository.update(id, parsed.data);
    if (parsed.data.isActive === false) {
      this.peerChatGateway.forceDisconnect(id);
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test manager-admin.controller -- --run`
Expected: PASS (all tests).

- [ ] **Step 5: Import `PeerChatModule` in `ManagerModule`**

In `apps/api/src/modules/manager/manager.module.ts`, add `import { PeerChatModule } from "../peer-chat/peer-chat.module.ts";` and add `PeerChatModule` to the `@Module({...})`'s `imports` array (alongside `SectorModule`, `PeerPartnerModule`).

- [ ] **Step 6: Run the full API test suite**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/manager
git commit -m "feat(api): forcibly disconnect a peer partner's live websocket on deactivation"
```

---

### Task 7: Frontend — peer-partner login

**Files:**

- Create: `apps/web/src/ports/peer-partner-auth.port.ts`
- Create: `apps/web/src/infrastructure/http/http-peer-partner-auth.adapter.ts`
- Create: `apps/web/src/use-cases/login-peer-partner.usecase.ts`
- Create: `apps/web/src/use-cases/login-peer-partner.usecase.test.ts`
- Create: `apps/web/src/stores/peer-partner-session.store.ts`
- Create: `apps/web/src/stores/peer-partner-session.store.test.ts`
- Create: `apps/web/src/presentation/hooks/usePeerPartnerLogin.ts`
- Create: `apps/web/src/presentation/pages/PeerPartnerLoginPage.tsx`
- Create: `apps/web/src/presentation/pages/PeerPartnerLoginPage.test.tsx`
- Modify: `apps/web/src/presentation/lib/routes.ts`
- Modify: `apps/web/src/app/container.ts`

**Interfaces:**

- Consumes: `POST /peer-partner/login` (Task 2).
- Produces (used by Task 10): `usePeerPartnerSessionStore` (`token`, `expiresAt`, `institutionId`, `setSession`, `clearSession`, `isValid`); `routes.peerPartnerLogin` (`/peer/login`).

This task mirrors Task 6 of the sibling admin/sectors/permissions plan (`AdminLoginPage`) almost exactly — same shell, same mocking convention, `institutionId` added to the session since Task 10's médico-matching UI needs it for peer-partner-side display context (unlike the super-admin session, which has none).

- [ ] **Step 1: Ports and adapter**

Create `apps/web/src/ports/peer-partner-auth.port.ts`:

```ts
import { z } from "zod";

export const PeerPartnerLoginResultSchema = z.object({ token: z.string(), expiresAt: z.string() });
export type PeerPartnerLoginResult = z.infer<typeof PeerPartnerLoginResultSchema>;

export class InvalidPeerPartnerCredentialsError extends Error {}

export interface PeerPartnerAuthPort {
  login(name: string, password: string): Promise<PeerPartnerLoginResult>;
}
```

Create `apps/web/src/infrastructure/http/http-peer-partner-auth.adapter.ts`:

```ts
import type { PeerPartnerAuthPort, PeerPartnerLoginResult } from "@/ports/peer-partner-auth.port";
import { PeerPartnerLoginResultSchema, InvalidPeerPartnerCredentialsError } from "@/ports/peer-partner-auth.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpPeerPartnerAuthAdapter implements PeerPartnerAuthPort {
  async login(name: string, password: string): Promise<PeerPartnerLoginResult> {
    const response = await fetch(`${API_BASE_URL}/peer-partner/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });

    if (response.status === 401) {
      throw new InvalidPeerPartnerCredentialsError();
    }
    if (!response.ok) {
      throw new Error(`peer partner login failed with status ${response.status}`);
    }

    return PeerPartnerLoginResultSchema.parse(await response.json());
  }
}
```

- [ ] **Step 2: Write the failing test for the frontend use-case, then create it**

Create `apps/web/src/use-cases/login-peer-partner.usecase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LoginPeerPartnerUseCase } from "./login-peer-partner.usecase";
import type { PeerPartnerAuthPort, PeerPartnerLoginResult } from "@/ports/peer-partner-auth.port";

class FakePeerPartnerAuthAdapter implements PeerPartnerAuthPort {
  constructor(private readonly result: PeerPartnerLoginResult) {}
  async login(): Promise<PeerPartnerLoginResult> {
    return this.result;
  }
}

describe("LoginPeerPartnerUseCase", () => {
  it("delegates to the port and returns its result", async () => {
    const port = new FakePeerPartnerAuthAdapter({ token: "t", expiresAt: "2026-01-01T00:00:00.000Z" });
    const useCase = new LoginPeerPartnerUseCase(port);

    const result = await useCase.execute("Dra. Ana", "password");

    expect(result).toEqual({ token: "t", expiresAt: "2026-01-01T00:00:00.000Z" });
  });
});
```

Run: `pnpm --filter web test login-peer-partner.usecase -- --run` — expected FAIL (file doesn't exist).

Create `apps/web/src/use-cases/login-peer-partner.usecase.ts`:

```ts
import type { PeerPartnerAuthPort, PeerPartnerLoginResult } from "@/ports/peer-partner-auth.port";

export class LoginPeerPartnerUseCase {
  constructor(private readonly peerPartnerAuthPort: PeerPartnerAuthPort) {}

  async execute(name: string, password: string): Promise<PeerPartnerLoginResult> {
    return this.peerPartnerAuthPort.login(name, password);
  }
}
```

Run: `pnpm --filter web test login-peer-partner.usecase -- --run` — expected PASS.

- [ ] **Step 3: Write the failing test for the session store, then create it**

Create `apps/web/src/stores/peer-partner-session.store.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { usePeerPartnerSessionStore } from "./peer-partner-session.store";

describe("usePeerPartnerSessionStore", () => {
  beforeEach(() => {
    usePeerPartnerSessionStore.getState().clearSession();
  });

  it("isValid() is false with no session", () => {
    expect(usePeerPartnerSessionStore.getState().isValid()).toBe(false);
  });

  it("isValid() is true after setSession with a future expiry", () => {
    usePeerPartnerSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString());
    expect(usePeerPartnerSessionStore.getState().isValid()).toBe(true);
  });

  it("isValid() is false after clearSession", () => {
    usePeerPartnerSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString());
    usePeerPartnerSessionStore.getState().clearSession();
    expect(usePeerPartnerSessionStore.getState().isValid()).toBe(false);
  });
});
```

Run: `pnpm --filter web test peer-partner-session.store -- --run` — expected FAIL (file doesn't exist).

Create `apps/web/src/stores/peer-partner-session.store.ts` (mirrors `manager-session.store.ts`/`admin-session.store.ts`, own storage key):

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface PeerPartnerSessionState {
  token: string | null;
  expiresAt: string | null;
  setSession: (token: string, expiresAt: string) => void;
  clearSession: () => void;
  isValid: () => boolean;
}

export const usePeerPartnerSessionStore = create<PeerPartnerSessionState>()(
  persist(
    (set, get) => ({
      token: null,
      expiresAt: null,
      setSession: (token, expiresAt) => set({ token, expiresAt }),
      clearSession: () => set({ token: null, expiresAt: null }),
      isValid: () => {
        const { token, expiresAt } = get();
        if (!token || !expiresAt) return false;
        return new Date(expiresAt).getTime() > Date.now();
      },
    }),
    { name: "zelo.peer-partner-session", storage: createJSONStorage(() => sessionStorage) },
  ),
);
```

Run: `pnpm --filter web test peer-partner-session.store -- --run` — expected PASS.

- [ ] **Step 4: Wire the container, hook, and route**

In `apps/web/src/app/container.ts`, add:

```ts
import { LoginPeerPartnerUseCase } from "@/use-cases/login-peer-partner.usecase";
import { HttpPeerPartnerAuthAdapter } from "@/infrastructure/http/http-peer-partner-auth.adapter";

export const loginPeerPartnerUseCase = new LoginPeerPartnerUseCase(new HttpPeerPartnerAuthAdapter());
```

Create `apps/web/src/presentation/hooks/usePeerPartnerLogin.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import { loginPeerPartnerUseCase } from "@/app/container";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";

interface LoginVariables {
  name: string;
  password: string;
}

export function usePeerPartnerLogin() {
  const setSession = usePeerPartnerSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: ({ name, password }: LoginVariables) => loginPeerPartnerUseCase.execute(name, password),
    onSuccess: (result) => {
      setSession(result.token, result.expiresAt);
    },
  });
}
```

In `apps/web/src/presentation/lib/routes.ts`, add:

```ts
  peerPartnerLogin: "/peer/login",
  peerPartnerInbox: "/peer",
```

- [ ] **Step 5: Write the failing test for `PeerPartnerLoginPage`, then create it**

Create `apps/web/src/presentation/pages/PeerPartnerLoginPage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PeerPartnerLoginPage } from "./PeerPartnerLoginPage";
import * as container from "@/app/container";
import { InvalidPeerPartnerCredentialsError } from "@/ports/peer-partner-auth.port";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/peer/login"]}>
        <Routes>
          <Route path="/peer/login" element={<PeerPartnerLoginPage />} />
          <Route path="/peer" element={<div>Peer partner inbox</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PeerPartnerLoginPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("navigates to /peer on a correct name and password", async () => {
    vi.spyOn(container.loginPeerPartnerUseCase, "execute").mockResolvedValue({
      token: "abc.def",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Nome"), "Dra. Ana");
    await user.type(screen.getByLabelText("Senha"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Peer partner inbox")).toBeInTheDocument();
  });

  it("shows an inline error on invalid credentials, without navigating", async () => {
    vi.spyOn(container.loginPeerPartnerUseCase, "execute").mockRejectedValue(new InvalidPeerPartnerCredentialsError());
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Nome"), "Dra. Ana");
    await user.type(screen.getByLabelText("Senha"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Nome ou senha incorretos."));
    expect(screen.queryByText("Peer partner inbox")).not.toBeInTheDocument();
  });
});
```

Run: `pnpm --filter web test PeerPartnerLoginPage -- --run` — expected FAIL (component doesn't exist).

Create `apps/web/src/presentation/pages/PeerPartnerLoginPage.tsx` (mirrors `ManagerLoginPage.tsx`/`AdminLoginPage.tsx`):

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { usePeerPartnerLogin } from "@/presentation/hooks/usePeerPartnerLogin";
import { InvalidPeerPartnerCredentialsError } from "@/ports/peer-partner-auth.port";

export function PeerPartnerLoginPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const login = usePeerPartnerLogin();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ name, password }, { onSuccess: () => navigate(routes.peerPartnerInbox) });
  };

  const errorMessage = login.isError
    ? login.error instanceof InvalidPeerPartnerCredentialsError
      ? "Nome ou senha incorretos."
      : "Não foi possível entrar agora. Tente novamente."
    : null;

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Acesso do par anônimo</h1>
        <p className="text-caption text-muted">Entre com seu nome e senha de par anônimo.</p>

        <form onSubmit={handleSubmit}>
          <Card className="mt-5">
            <label htmlFor="peer-partner-name" className="text-label font-semibold text-ink-2">
              Nome
            </label>
            <input
              id="peer-partner-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Digite seu nome"
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />

            <label htmlFor="peer-partner-password" className="mt-4 block text-label font-semibold text-ink-2">
              Senha
            </label>
            <input
              id="peer-partner-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Digite sua senha"
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />

            {errorMessage && (
              <p role="alert" className="mt-2 text-label text-danger">
                {errorMessage}
              </p>
            )}
          </Card>

          <div className="mt-6">
            <Button
              type="submit"
              variant="primary"
              loading={login.isPending}
              disabled={name.trim().length === 0 || password.trim().length === 0}
            >
              Entrar
            </Button>
          </div>
        </form>
      </div>
    </PhoneShell>
  );
}
```

Run: `pnpm --filter web test PeerPartnerLoginPage -- --run` — expected PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ports/peer-partner-auth.port.ts apps/web/src/infrastructure/http/http-peer-partner-auth.adapter.ts \
        apps/web/src/use-cases/login-peer-partner.usecase.ts apps/web/src/use-cases/login-peer-partner.usecase.test.ts \
        apps/web/src/stores/peer-partner-session.store.ts apps/web/src/stores/peer-partner-session.store.test.ts \
        apps/web/src/presentation/hooks/usePeerPartnerLogin.ts \
        apps/web/src/presentation/pages/PeerPartnerLoginPage.tsx apps/web/src/presentation/pages/PeerPartnerLoginPage.test.tsx \
        apps/web/src/presentation/lib/routes.ts apps/web/src/app/container.ts
git commit -m "feat(web): add peer-partner login page and session store"
```

---

### Task 8: Frontend — low-level socket client + shared `PeerChatRoom`

**Files:**

- Modify: `apps/web/package.json`
- Create: `apps/web/src/infrastructure/websocket/peer-chat-socket.client.ts`
- Create: `apps/web/src/presentation/components/PeerChatRoom.tsx`
- Create: `apps/web/src/presentation/components/PeerChatRoom.test.tsx`

**Interfaces:**

- Produces (used by Task 9, Task 10): `PeerChatSocketClient` — `connect(token?: string): Socket`, `disconnect(): void` (thin wrapper around `socket.io-client`, not unit-tested individually — exercised through the hooks that use it, same convention as thin HTTP adapters); `PeerChatRoom` component — props `{ messages: { from: "me" | "peer"; text: string }[]; onSend: (text: string) => void; onLeave: () => void; peerLeft: boolean }`.

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @zelo/web add socket.io-client
```

- [ ] **Step 2: Create `PeerChatSocketClient`**

Create `apps/web/src/infrastructure/websocket/peer-chat-socket.client.ts`:

```ts
import { io, type Socket } from "socket.io-client";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class PeerChatSocketClient {
  private socket: Socket | null = null;

  connect(token?: string): Socket {
    this.socket = io(API_BASE_URL, token ? { auth: { token } } : {});
    return this.socket;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
```

- [ ] **Step 3: Write the failing test for `PeerChatRoom`**

Create `apps/web/src/presentation/components/PeerChatRoom.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PeerChatRoom } from "./PeerChatRoom";

describe("PeerChatRoom", () => {
  it("renders messages from both sides", () => {
    render(
      <PeerChatRoom
        messages={[{ from: "me", text: "oi" }, { from: "peer", text: "olá" }]}
        onSend={() => {}}
        onLeave={() => {}}
        peerLeft={false}
      />,
    );

    expect(screen.getByText("oi")).toBeInTheDocument();
    expect(screen.getByText("olá")).toBeInTheDocument();
  });

  it("calls onSend with the trimmed message and clears the input", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<PeerChatRoom messages={[]} onSend={onSend} onLeave={() => {}} peerLeft={false} />);

    const input = screen.getByLabelText("Mensagem");
    await user.type(input, "  oi  ");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(onSend).toHaveBeenCalledWith("oi");
    expect(input).toHaveValue("");
  });

  it("does not call onSend for an empty message", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<PeerChatRoom messages={[]} onSend={onSend} onLeave={() => {}} peerLeft={false} />);

    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(onSend).not.toHaveBeenCalled();
  });

  it("calls onLeave when 'Sair da conversa' is clicked", async () => {
    const onLeave = vi.fn();
    const user = userEvent.setup();
    render(<PeerChatRoom messages={[]} onSend={() => {}} onLeave={onLeave} peerLeft={false} />);

    await user.click(screen.getByRole("button", { name: "Sair da conversa" }));

    expect(onLeave).toHaveBeenCalled();
  });

  it("shows a banner when the other side has left", () => {
    render(<PeerChatRoom messages={[]} onSend={() => {}} onLeave={() => {}} peerLeft={true} />);
    expect(screen.getByRole("status")).toHaveTextContent("O colega saiu da conversa.");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails, then create `PeerChatRoom`**

Run: `pnpm --filter web test PeerChatRoom -- --run` — expected FAIL (component doesn't exist).

Create `apps/web/src/presentation/components/PeerChatRoom.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { Button } from "@/presentation/ui/Button";

export interface PeerChatMessage {
  from: "me" | "peer";
  text: string;
}

interface PeerChatRoomProps {
  messages: PeerChatMessage[];
  onSend: (text: string) => void;
  onLeave: () => void;
  peerLeft: boolean;
}

export function PeerChatRoom({ messages, onSend, onLeave, peerLeft }: PeerChatRoomProps) {
  const [text, setText] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <div>
      <div className="flex flex-col gap-2">
        {messages.map((message, index) => (
          <p key={index} className={message.from === "me" ? "text-right text-ink" : "text-left text-ink-2"}>
            {message.text}
          </p>
        ))}
      </div>

      {peerLeft && (
        <p role="status" className="mt-3 text-label text-muted">
          O colega saiu da conversa.
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <label htmlFor="peer-chat-message" className="sr-only">
          Mensagem
        </label>
        <input
          id="peer-chat-message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="flex-1 rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
        />
        <Button type="submit" full={false}>
          Enviar
        </Button>
      </form>

      <div className="mt-3">
        <Button variant="outline" onClick={onLeave}>
          Sair da conversa
        </Button>
      </div>
    </div>
  );
}
```

Run: `pnpm --filter web test PeerChatRoom -- --run` — expected PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/src/infrastructure/websocket apps/web/src/presentation/components/PeerChatRoom.tsx apps/web/src/presentation/components/PeerChatRoom.test.tsx
git commit -m "feat(web): add PeerChatSocketClient and the shared PeerChatRoom component"
```

---

### Task 9: Frontend — `usePeerRequest` hook + `PeersPage` rewrite

**Files:**

- Create: `apps/web/src/presentation/hooks/usePeerRequest.ts`
- Modify: `apps/web/src/presentation/pages/PeersPage.tsx`
- Modify: `apps/web/src/presentation/pages/PeersPage.test.tsx`

**Interfaces:**

- Consumes: `PeerChatSocketClient` (Task 8), `useInstitutionLinkStore` (already carries `institutionId`/`sectorName` from the sibling admin/sectors plan's Task 11).
- Produces: `usePeerRequest()` — `{ state: "idle" | "searching" | "matched" | "no_peer_available"; specialty: string | null; messages: PeerChatMessage[]; peerLeft: boolean; requestPeer(institutionId, sectorName?): void; sendMessage(text): void; leave(): void }`.

- [ ] **Step 1: Create `usePeerRequest`**

Create `apps/web/src/presentation/hooks/usePeerRequest.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { PeerChatSocketClient } from "@/infrastructure/websocket/peer-chat-socket.client";
import type { PeerChatMessage } from "@/presentation/components/PeerChatRoom";

export type PeerRequestState = "idle" | "searching" | "matched" | "no_peer_available";

export function usePeerRequest() {
  const [state, setState] = useState<PeerRequestState>("idle");
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [messages, setMessages] = useState<PeerChatMessage[]>([]);
  const [peerLeft, setPeerLeft] = useState(false);

  const clientRef = useRef<PeerChatSocketClient | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  const requestPeer = useCallback((institutionId: string, sectorName?: string) => {
    setState("searching");
    setMessages([]);
    setPeerLeft(false);

    const client = new PeerChatSocketClient();
    clientRef.current = client;
    const socket = client.connect();
    socketRef.current = socket;

    socket.on("no_peer_available", () => setState("no_peer_available"));
    socket.on("matched", (payload: { requestId: string; specialty: string }) => {
      requestIdRef.current = payload.requestId;
      setSpecialty(payload.specialty);
      setState("matched");
    });
    socket.on("message", (payload: { text: string }) => {
      setMessages((prev) => [...prev, { from: "peer", text: payload.text }]);
    });
    socket.on("peer_left", () => setPeerLeft(true));

    socket.emit("request-peer", { institutionId, sectorName });
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (!requestIdRef.current) return;
    socketRef.current?.emit("message", { requestId: requestIdRef.current, text });
    setMessages((prev) => [...prev, { from: "me", text }]);
  }, []);

  const leave = useCallback(() => {
    if (requestIdRef.current) {
      socketRef.current?.emit("leave_conversation", { requestId: requestIdRef.current });
    }
    clientRef.current?.disconnect();
    clientRef.current = null;
    socketRef.current = null;
    requestIdRef.current = null;
    setState("idle");
    setSpecialty(null);
    setMessages([]);
    setPeerLeft(false);
  }, []);

  return { state, specialty, messages, peerLeft, requestPeer, sendMessage, leave };
}
```

- [ ] **Step 2: Write the failing test for `PeersPage`**

Replace `apps/web/src/presentation/pages/PeersPage.test.tsx` in full:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { PeersPage } from "./PeersPage";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";

const handlers: Record<string, (payload?: unknown) => void> = {};
const emitSpy = vi.fn();
const disconnectSpy = vi.fn();

vi.mock("socket.io-client", () => ({
  io: () => ({
    on: (event: string, handler: (payload?: unknown) => void) => {
      handlers[event] = handler;
    },
    emit: emitSpy,
    disconnect: disconnectSpy,
  }),
}));

function renderPeers() {
  return render(
    <MemoryRouter initialEntries={["/peers"]}>
      <Routes>
        <Route path="/peers" element={<PeersPage />} />
        <Route path="/home" element={<div>Home screen</div>} />
        <Route path="/you/link" element={<div>Link screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PeersPage", () => {
  beforeEach(() => {
    for (const key of Object.keys(handlers)) delete handlers[key];
    emitSpy.mockClear();
    disconnectSpy.mockClear();
    useInstitutionLinkStore.setState({ institutionId: null, institutionName: null, sectorId: null, sectorName: null, deviceSignalId: null });
  });

  it("shows a link prompt, not the matching flow, when not linked to an institution", () => {
    renderPeers();
    expect(screen.getByText("Vincule-se ao seu hospital para falar com um colega.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Falar com um colega" })).not.toBeInTheDocument();
  });

  it("emits request-peer with the linked institutionId and sectorName when tapped", async () => {
    useInstitutionLinkStore.setState({ institutionId: "institution-1", institutionName: "Hospital Teste", sectorId: "sector-1", sectorName: "UTI", deviceSignalId: "device-1" });
    const user = userEvent.setup();
    renderPeers();

    await user.click(screen.getByRole("button", { name: "Falar com um colega" }));

    expect(emitSpy).toHaveBeenCalledWith("request-peer", { institutionId: "institution-1", sectorName: "UTI" });
  });

  it("shows the retry message when no_peer_available fires", async () => {
    useInstitutionLinkStore.setState({ institutionId: "institution-1", institutionName: "Hospital Teste", sectorId: "sector-1", sectorName: "UTI", deviceSignalId: "device-1" });
    const user = userEvent.setup();
    renderPeers();
    await user.click(screen.getByRole("button", { name: "Falar com um colega" }));

    handlers["no_peer_available"]!();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Nenhum colega disponível agora."));
  });

  it("renders PeerChatRoom once matched fires, showing the peer's specialty", async () => {
    useInstitutionLinkStore.setState({ institutionId: "institution-1", institutionName: "Hospital Teste", sectorId: "sector-1", sectorName: "UTI", deviceSignalId: "device-1" });
    const user = userEvent.setup();
    renderPeers();
    await user.click(screen.getByRole("button", { name: "Falar com um colega" }));

    handlers["matched"]!({ requestId: "request-1", specialty: "Clínica médica" });

    await waitFor(() => expect(screen.getByText("Conectado com um colega de Clínica médica.")).toBeInTheDocument());
  });

  it("shows the mutual-anonymity guarantee regardless of state", () => {
    renderPeers();
    expect(screen.getByText("conexão sem troca de identidade")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter web test PeersPage -- --run` — expected FAIL (old placeholder assertions no longer match).

- [ ] **Step 4: Replace `PeersPage.tsx`**

Replace `apps/web/src/presentation/pages/PeersPage.tsx` in full:

```tsx
import { Lock } from "lucide-react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { PrivacyBadge } from "@/presentation/ui/PrivacyBadge";
import { PeerChatRoom } from "@/presentation/components/PeerChatRoom";
import { routes } from "@/presentation/lib/routes";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
import { usePeerRequest } from "@/presentation/hooks/usePeerRequest";

export function PeersPage() {
  const navigate = useNavigate();
  const institutionId = useInstitutionLinkStore((state) => state.institutionId);
  const sectorName = useInstitutionLinkStore((state) => state.sectorName);
  const { state, specialty, messages, peerLeft, requestPeer, sendMessage, leave } = usePeerRequest();

  const header = (
    <div className="flex items-center justify-between">
      <BackButton label="Início" onClick={() => navigate(routes.home)} />
      <PrivacyBadge />
    </div>
  );

  if (!institutionId) {
    return (
      <PhoneShell centered>
        <div className="pt-[26px]">
          {header}
          <h1 className="mt-4 text-h1 text-ink">Pares anônimos</h1>
          <p className="mt-1 text-caption text-muted">Vincule-se ao seu hospital para falar com um colega.</p>
          <div className="mt-5">
            <Button variant="outline" onClick={() => navigate(routes.linkInstitution)}>
              Vincular ao hospital
            </Button>
          </div>
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell centered>
      <div className="pt-[26px]">
        {header}
        <h1 className="mt-4 text-h1 text-ink">Pares anônimos</h1>
        <p className="mt-1 text-caption text-muted">
          Médicos treinados para ouvir. Nem você nem seu par veem a identidade um do outro.
        </p>

        {state === "idle" && (
          <div className="mt-5">
            <Button variant="primary" onClick={() => requestPeer(institutionId, sectorName ?? undefined)}>
              Falar com um colega
            </Button>
          </div>
        )}

        {state === "searching" && (
          <div className="mt-5">
            <Button variant="primary" loading disabled>
              Procurando um colega disponível...
            </Button>
          </div>
        )}

        {state === "no_peer_available" && (
          <div className="mt-5">
            <p role="alert" className="mb-2 text-label text-danger">
              Nenhum colega disponível agora.
            </p>
            <Button variant="outline" onClick={() => requestPeer(institutionId, sectorName ?? undefined)}>
              Tentar novamente
            </Button>
          </div>
        )}

        {state === "matched" && (
          <div className="mt-5">
            <p className="mb-3 text-label text-muted">Conectado com um colega de {specialty}.</p>
            <PeerChatRoom messages={messages} onSend={sendMessage} onLeave={leave} peerLeft={peerLeft} />
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-1 rounded-2xl bg-surface-brand p-[13px]">
          <Lock size={14} className="text-brand" />
          <span className="font-mono text-[12.5px] text-brand">conexão sem troca de identidade</span>
        </div>
      </div>
    </PhoneShell>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter web test PeersPage -- --run` — expected PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/presentation/hooks/usePeerRequest.ts apps/web/src/presentation/pages/PeersPage.tsx apps/web/src/presentation/pages/PeersPage.test.tsx
git commit -m "feat(web): replace placeholder Peers list with real institution-scoped auto-matching"
```

---

### Task 10: Frontend — `usePeerPartnerConnection` hook + `PeerPartnerInboxPage`

**Files:**

- Create: `apps/web/src/presentation/hooks/usePeerPartnerConnection.ts`
- Create: `apps/web/src/presentation/pages/PeerPartnerInboxPage.tsx`
- Create: `apps/web/src/presentation/pages/PeerPartnerInboxPage.test.tsx`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**

- Consumes: `PeerChatSocketClient` (Task 8), `usePeerPartnerSessionStore` (Task 7).
- Produces: `usePeerPartnerConnection(token)` — `{ state: "connecting" | "idle" | "incoming_request" | "matched"; incomingRequest: { requestId, sectorName? } | null; secondsRemaining: number; messages; peerLeft; accept(); decline(); sendMessage(text); leave() }`; route `routes.peerPartnerInbox` (`/peer`, already added in Task 7) wired into the router.

- [ ] **Step 1: Create `usePeerPartnerConnection`**

Create `apps/web/src/presentation/hooks/usePeerPartnerConnection.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { PeerChatSocketClient } from "@/infrastructure/websocket/peer-chat-socket.client";
import type { PeerChatMessage } from "@/presentation/components/PeerChatRoom";

export type PeerPartnerConnectionState = "connecting" | "idle" | "incoming_request" | "matched";
const ACCEPT_TIMEOUT_SECONDS = 30;

export function usePeerPartnerConnection(token: string | null) {
  const [state, setState] = useState<PeerPartnerConnectionState>("connecting");
  const [incomingRequest, setIncomingRequest] = useState<{ requestId: string; sectorName?: string } | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(ACCEPT_TIMEOUT_SECONDS);
  const [messages, setMessages] = useState<PeerChatMessage[]>([]);
  const [peerLeft, setPeerLeft] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
  }, []);

  useEffect(() => {
    if (!token) return;

    const client = new PeerChatSocketClient();
    const socket = client.connect(token);
    socketRef.current = socket;
    setState("idle");

    socket.on("incoming_request", (payload: { requestId: string; sectorName?: string }) => {
      setIncomingRequest(payload);
      setState("incoming_request");
      setSecondsRemaining(ACCEPT_TIMEOUT_SECONDS);
      clearCountdown();
      countdownRef.current = setInterval(() => {
        setSecondsRemaining((prev) => Math.max(0, prev - 1));
      }, 1000);
    });

    socket.on("matched", (payload: { requestId: string }) => {
      clearCountdown();
      requestIdRef.current = payload.requestId;
      setIncomingRequest(null);
      setMessages([]);
      setPeerLeft(false);
      setState("matched");
    });

    socket.on("message", (payload: { text: string }) => {
      setMessages((prev) => [...prev, { from: "peer", text: payload.text }]);
    });

    socket.on("peer_left", () => setPeerLeft(true));

    return () => {
      clearCountdown();
      client.disconnect();
    };
  }, [token, clearCountdown]);

  const accept = useCallback(() => {
    if (!incomingRequest) return;
    socketRef.current?.emit("accept_request", { requestId: incomingRequest.requestId });
  }, [incomingRequest]);

  const decline = useCallback(() => {
    if (!incomingRequest) return;
    socketRef.current?.emit("decline_request", { requestId: incomingRequest.requestId });
    clearCountdown();
    setIncomingRequest(null);
    setState("idle");
  }, [incomingRequest, clearCountdown]);

  const sendMessage = useCallback((text: string) => {
    if (!requestIdRef.current) return;
    socketRef.current?.emit("message", { requestId: requestIdRef.current, text });
    setMessages((prev) => [...prev, { from: "me", text }]);
  }, []);

  const leave = useCallback(() => {
    if (requestIdRef.current) {
      socketRef.current?.emit("leave_conversation", { requestId: requestIdRef.current });
    }
    requestIdRef.current = null;
    setMessages([]);
    setPeerLeft(false);
    setState("idle");
  }, []);

  return { state, incomingRequest, secondsRemaining, messages, peerLeft, accept, decline, sendMessage, leave };
}
```

- [ ] **Step 2: Write the failing test for `PeerPartnerInboxPage`**

Create `apps/web/src/presentation/pages/PeerPartnerInboxPage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { PeerPartnerInboxPage } from "./PeerPartnerInboxPage";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";

const handlers: Record<string, (payload?: unknown) => void> = {};
const emitSpy = vi.fn();
const disconnectSpy = vi.fn();

vi.mock("socket.io-client", () => ({
  io: () => ({
    on: (event: string, handler: (payload?: unknown) => void) => {
      handlers[event] = handler;
    },
    emit: emitSpy,
    disconnect: disconnectSpy,
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/peer"]}>
      <Routes>
        <Route path="/peer" element={<PeerPartnerInboxPage />} />
        <Route path="/peer/login" element={<div>Peer login screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PeerPartnerInboxPage", () => {
  beforeEach(() => {
    for (const key of Object.keys(handlers)) delete handlers[key];
    emitSpy.mockClear();
    disconnectSpy.mockClear();
    sessionStorage.clear();
    usePeerPartnerSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString());
  });

  it("shows the idle connected state", () => {
    renderPage();
    expect(screen.getByText("Conectado, aguardando solicitações.")).toBeInTheDocument();
  });

  it("renders the accept/decline card on an incoming request, showing sectorName", async () => {
    renderPage();
    handlers["incoming_request"]!({ requestId: "request-1", sectorName: "UTI" });

    await waitFor(() => expect(screen.getByText("Setor: UTI")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Aceitar" })).toBeInTheDocument();
  });

  it("emits accept_request and shows PeerChatRoom once matched fires", async () => {
    const user = userEvent.setup();
    renderPage();
    handlers["incoming_request"]!({ requestId: "request-1", sectorName: "UTI" });
    await waitFor(() => screen.getByRole("button", { name: "Aceitar" }));

    await user.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(emitSpy).toHaveBeenCalledWith("accept_request", { requestId: "request-1" });

    handlers["matched"]!({ requestId: "request-1" });
    await waitFor(() => expect(screen.getByLabelText("Mensagem")).toBeInTheDocument());
  });

  it("emits decline_request and returns to the idle state", async () => {
    const user = userEvent.setup();
    renderPage();
    handlers["incoming_request"]!({ requestId: "request-1" });
    await waitFor(() => screen.getByRole("button", { name: "Recusar" }));

    await user.click(screen.getByRole("button", { name: "Recusar" }));

    expect(emitSpy).toHaveBeenCalledWith("decline_request", { requestId: "request-1" });
    await waitFor(() => expect(screen.getByText("Conectado, aguardando solicitações.")).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Run the test to verify it fails, then create `PeerPartnerInboxPage`**

Run: `pnpm --filter web test PeerPartnerInboxPage -- --run` — expected FAIL (component doesn't exist).

Create `apps/web/src/presentation/pages/PeerPartnerInboxPage.tsx`:

```tsx
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { PeerChatRoom } from "@/presentation/components/PeerChatRoom";
import { routes } from "@/presentation/lib/routes";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";
import { usePeerPartnerConnection } from "@/presentation/hooks/usePeerPartnerConnection";

export function PeerPartnerInboxPage() {
  const navigate = useNavigate();
  const token = usePeerPartnerSessionStore((state) => state.token);
  const clearSession = usePeerPartnerSessionStore((state) => state.clearSession);
  const { state, incomingRequest, secondsRemaining, messages, peerLeft, accept, decline, sendMessage, leave } = usePeerPartnerConnection(token);

  const handleLogout = () => {
    clearSession();
    navigate(routes.peerPartnerLogin);
  };

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <div className="flex items-center justify-between">
          <h1 className="text-h1 text-ink">Pares anônimos</h1>
          <Button variant="outline" full={false} onClick={handleLogout}>
            Sair
          </Button>
        </div>

        {state === "connecting" && <p className="mt-4 text-label text-muted">Conectando...</p>}
        {state === "idle" && <p className="mt-4 text-label text-muted">Conectado, aguardando solicitações.</p>}

        {state === "incoming_request" && incomingRequest && (
          <Card className="mt-4">
            <p className="text-body font-extrabold text-ink">Novo pedido de conversa</p>
            {incomingRequest.sectorName && <p className="mt-1 text-caption text-muted">Setor: {incomingRequest.sectorName}</p>}
            <p className="mt-1 font-mono text-[12px] text-muted-2">{secondsRemaining}s para responder</p>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" full={false} onClick={accept}>
                Aceitar
              </Button>
              <Button variant="outline" full={false} onClick={decline}>
                Recusar
              </Button>
            </div>
          </Card>
        )}

        {state === "matched" && (
          <div className="mt-4">
            <PeerChatRoom messages={messages} onSend={sendMessage} onLeave={leave} peerLeft={peerLeft} />
          </div>
        )}
      </div>
    </PhoneShell>
  );
}
```

Run: `pnpm --filter web test PeerPartnerInboxPage -- --run` — expected PASS.

- [ ] **Step 4: Wire the routes**

In `apps/web/src/app/router.tsx`, add imports for `PeerPartnerLoginPage`, `PeerPartnerInboxPage`, and `usePeerPartnerSessionStore`, and two entries to `routeChildren`:

```tsx
  { path: "peer/login", Component: PeerPartnerLoginPage },
  {
    path: "peer",
    Component: PeerPartnerInboxPage,
    loader: () => (usePeerPartnerSessionStore.getState().isValid() ? null : redirect(routes.peerPartnerLogin)),
  },
```

- [ ] **Step 5: Run the full web test suite**

Run: `pnpm --filter web test -- --run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/presentation/hooks/usePeerPartnerConnection.ts apps/web/src/presentation/pages/PeerPartnerInboxPage.tsx apps/web/src/presentation/pages/PeerPartnerInboxPage.test.tsx apps/web/src/app/router.tsx
git commit -m "feat(web): add peer-partner inbox page (connect, accept/decline, chat)"
```

---

### Task 11: Frontend — admin panel's "Pares Anônimos" tab

**Files:**

- Modify: `apps/web/src/ports/manager-admin.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-manager-admin.adapter.ts`
- Create: `apps/web/src/use-cases/list-peer-partners.usecase.ts`
- Create: `apps/web/src/use-cases/create-peer-partner.usecase.ts`
- Create: `apps/web/src/use-cases/update-peer-partner.usecase.ts`
- Create: `apps/web/src/use-cases/reset-peer-partner-password.usecase.ts`
- Create: `apps/web/src/presentation/hooks/useAdminPeerPartners.ts`
- Create: `apps/web/src/presentation/hooks/useCreatePeerPartner.ts`
- Create: `apps/web/src/presentation/hooks/useUpdatePeerPartner.ts`
- Create: `apps/web/src/presentation/hooks/useResetPeerPartnerPassword.ts`
- Modify: `apps/web/src/presentation/pages/ManagerAdminPage.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerAdminPage.test.tsx`
- Modify: `apps/web/src/app/container.ts`

**Interfaces:**

- Consumes: `GET/POST/PATCH /manager/admin/peer-partners[/:id]`, `POST /manager/admin/peer-partners/:id/reset-password` (Task 3).
- Produces: nothing consumed by later tasks — this is the last surface for hospital-admin-side peer-partner management.

This task extends the sibling admin/sectors/permissions plan's `manager-admin.port.ts` (which already bundles sector and manager CRUD into one `ManagerAdminPort` interface), `http-manager-admin.adapter.ts`, and `ManagerAdminPage.tsx` (which already renders a Sectors tab and a Managers tab) — add to these files, don't replace the sections this task doesn't mention.

- [ ] **Step 1: Extend the port**

Add to `apps/web/src/ports/manager-admin.port.ts` (alongside the existing schemas/types):

```ts
export const PeerPartnerSummarySchema = z.object({ id: z.string(), name: z.string(), specialty: z.string(), isActive: z.boolean() });
export type PeerPartnerSummary = z.infer<typeof PeerPartnerSummarySchema>;

export const CreatePeerPartnerResultSchema = z.object({
  peerPartner: z.object({ id: z.string(), name: z.string() }),
  temporaryPassword: z.string(),
});
export type CreatePeerPartnerResult = z.infer<typeof CreatePeerPartnerResultSchema>;

export interface CreatePeerPartnerParams {
  name: string;
  specialty: string;
}

export interface UpdatePeerPartnerParams {
  isActive?: boolean;
  specialty?: string;
}
```

Add these four methods to the existing `ManagerAdminPort` interface:

```ts
  listPeerPartners(token: string): Promise<PeerPartnerSummary[]>;
  createPeerPartner(token: string, params: CreatePeerPartnerParams): Promise<CreatePeerPartnerResult>;
  updatePeerPartner(token: string, id: string, patch: UpdatePeerPartnerParams): Promise<void>;
  resetPeerPartnerPassword(token: string, id: string): Promise<{ temporaryPassword: string }>;
```

- [ ] **Step 2: Extend the HTTP adapter**

Add these four methods to `HttpManagerAdminAdapter` in `apps/web/src/infrastructure/http/http-manager-admin.adapter.ts` (same `authHeaders(token)` helper the existing methods already use):

```ts
  async listPeerPartners(token: string): Promise<PeerPartnerSummary[]> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/peer-partners`, { headers: authHeaders(token) });
    if (!response.ok) throw new Error(`list peer partners failed with status ${response.status}`);
    return z.array(PeerPartnerSummarySchema).parse(await response.json());
  }

  async createPeerPartner(token: string, params: CreatePeerPartnerParams): Promise<CreatePeerPartnerResult> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/peer-partners`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(params),
    });
    if (response.status === 400) throw new InvalidManagerAdminRequestError();
    if (!response.ok) throw new Error(`create peer partner failed with status ${response.status}`);
    return CreatePeerPartnerResultSchema.parse(await response.json());
  }

  async updatePeerPartner(token: string, id: string, patch: UpdatePeerPartnerParams): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/peer-partners/${id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(patch),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (!response.ok) throw new Error(`update peer partner failed with status ${response.status}`);
  }

  async resetPeerPartnerPassword(token: string, id: string): Promise<{ temporaryPassword: string }> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/peer-partners/${id}/reset-password`, {
      method: "POST",
      headers: authHeaders(token),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (!response.ok) throw new Error(`reset peer partner password failed with status ${response.status}`);
    return ResetPasswordResultSchema.parse(await response.json());
  }
```

Add `PeerPartnerSummary`, `PeerPartnerSummarySchema`, `CreatePeerPartnerParams`, `CreatePeerPartnerResultSchema`, `UpdatePeerPartnerParams` to this file's existing import line from `@/ports/manager-admin.port`.

- [ ] **Step 3: Frontend use-cases**

Create `apps/web/src/use-cases/list-peer-partners.usecase.ts`:

```ts
import type { ManagerAdminPort, PeerPartnerSummary } from "@/ports/manager-admin.port";

export class ListPeerPartnersUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string): Promise<PeerPartnerSummary[]> {
    return this.port.listPeerPartners(token);
  }
}
```

Create `apps/web/src/use-cases/create-peer-partner.usecase.ts`:

```ts
import type { CreatePeerPartnerParams, CreatePeerPartnerResult, ManagerAdminPort } from "@/ports/manager-admin.port";

export class CreatePeerPartnerUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string, params: CreatePeerPartnerParams): Promise<CreatePeerPartnerResult> {
    return this.port.createPeerPartner(token, params);
  }
}
```

Create `apps/web/src/use-cases/update-peer-partner.usecase.ts`:

```ts
import type { ManagerAdminPort, UpdatePeerPartnerParams } from "@/ports/manager-admin.port";

export class UpdatePeerPartnerUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string, id: string, patch: UpdatePeerPartnerParams): Promise<void> {
    return this.port.updatePeerPartner(token, id, patch);
  }
}
```

Create `apps/web/src/use-cases/reset-peer-partner-password.usecase.ts`:

```ts
import type { ManagerAdminPort } from "@/ports/manager-admin.port";

export class ResetPeerPartnerPasswordUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string, id: string): Promise<{ temporaryPassword: string }> {
    return this.port.resetPeerPartnerPassword(token, id);
  }
}
```

- [ ] **Step 4: Wire the container and hooks**

Add to `apps/web/src/app/container.ts` (reusing the same `managerAdminAdapter` instance the sibling plan already declared):

```ts
import { ListPeerPartnersUseCase } from "@/use-cases/list-peer-partners.usecase";
import { CreatePeerPartnerUseCase } from "@/use-cases/create-peer-partner.usecase";
import { UpdatePeerPartnerUseCase } from "@/use-cases/update-peer-partner.usecase";
import { ResetPeerPartnerPasswordUseCase } from "@/use-cases/reset-peer-partner-password.usecase";

export const listPeerPartnersUseCase = new ListPeerPartnersUseCase(managerAdminAdapter);
export const createPeerPartnerUseCase = new CreatePeerPartnerUseCase(managerAdminAdapter);
export const updatePeerPartnerUseCase = new UpdatePeerPartnerUseCase(managerAdminAdapter);
export const resetPeerPartnerPasswordUseCase = new ResetPeerPartnerPasswordUseCase(managerAdminAdapter);
```

Create `apps/web/src/presentation/hooks/useAdminPeerPartners.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { listPeerPartnersUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useAdminPeerPartners() {
  const token = useManagerSessionStore((state) => state.token);
  return useQuery({
    queryKey: ["admin-peer-partners", token],
    queryFn: () => listPeerPartnersUseCase.execute(token!),
    enabled: token !== null,
  });
}
```

Create `apps/web/src/presentation/hooks/useCreatePeerPartner.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPeerPartnerUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import type { CreatePeerPartnerParams } from "@/ports/manager-admin.port";

export function useCreatePeerPartner() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: CreatePeerPartnerParams) => createPeerPartnerUseCase.execute(token!, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-peer-partners"] }),
  });
}
```

Create `apps/web/src/presentation/hooks/useUpdatePeerPartner.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updatePeerPartnerUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import type { UpdatePeerPartnerParams } from "@/ports/manager-admin.port";

export function useUpdatePeerPartner() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdatePeerPartnerParams }) => updatePeerPartnerUseCase.execute(token!, id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-peer-partners"] }),
  });
}
```

Create `apps/web/src/presentation/hooks/useResetPeerPartnerPassword.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import { resetPeerPartnerPasswordUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useResetPeerPartnerPassword() {
  const token = useManagerSessionStore((state) => state.token);
  return useMutation({
    mutationFn: (id: string) => resetPeerPartnerPasswordUseCase.execute(token!, id),
  });
}
```

- [ ] **Step 5: Write the failing test for the new tab**

Add to `apps/web/src/presentation/pages/ManagerAdminPage.test.tsx` (new mocks alongside the existing sector/manager ones, keep every existing test as-is):

```tsx
it("switches to the peer-partners tab and creates one", async () => {
  vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
  vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
  vi.spyOn(container.listPeerPartnersUseCase, "execute").mockResolvedValue([]);
  vi.spyOn(container.createPeerPartnerUseCase, "execute").mockResolvedValue({
    peerPartner: { id: "peer-1", name: "Dra. Ana" },
    temporaryPassword: "temp-pass-456",
  });
  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByRole("button", { name: "Pares Anônimos" }));
  await user.type(screen.getByLabelText("Nome do par"), "Dra. Ana");
  await user.type(screen.getByLabelText("Especialidade"), "Clínica médica");
  await user.click(screen.getByRole("button", { name: "Adicionar par" }));

  await waitFor(() => expect(screen.getByText("temp-pass-456")).toBeInTheDocument());
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter web test ManagerAdminPage -- --run` — expected FAIL (no "Pares Anônimos" tab yet).

- [ ] **Step 7: Add the tab to `ManagerAdminPage`**

Add these imports to `apps/web/src/presentation/pages/ManagerAdminPage.tsx`:

```tsx
import { useAdminPeerPartners } from "@/presentation/hooks/useAdminPeerPartners";
import { useCreatePeerPartner } from "@/presentation/hooks/useCreatePeerPartner";
import { useUpdatePeerPartner } from "@/presentation/hooks/useUpdatePeerPartner";
import type { CreatePeerPartnerResult } from "@/ports/manager-admin.port";
```

Add this component (alongside the existing `SectorsTab`/`ManagersTab` functions, before the exported `ManagerAdminPage`):

```tsx
function PeerPartnersTab() {
  const peerPartners = useAdminPeerPartners();
  const createPeerPartner = useCreatePeerPartner();
  const updatePeerPartner = useUpdatePeerPartner();
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [lastCreated, setLastCreated] = useState<CreatePeerPartnerResult | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createPeerPartner.mutate(
      { name, specialty },
      {
        onSuccess: (result) => {
          setLastCreated(result);
          setName("");
          setSpecialty("");
        },
      },
    );
  };

  return (
    <div>
      {lastCreated && (
        <Card tone="brand-tint" className="mt-4" role="status">
          <p className="text-label font-semibold text-ink-2">
            Senha temporária de {lastCreated.peerPartner.name}: <span className="font-mono">{lastCreated.temporaryPassword}</span>
          </p>
        </Card>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mt-4">
          <label htmlFor="peer-partner-name-input" className="text-label font-semibold text-ink-2">
            Nome do par
          </label>
          <input
            id="peer-partner-name-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
          />

          <label htmlFor="peer-partner-specialty-input" className="mt-4 block text-label font-semibold text-ink-2">
            Especialidade
          </label>
          <input
            id="peer-partner-specialty-input"
            value={specialty}
            onChange={(event) => setSpecialty(event.target.value)}
            placeholder="Ex: Clínica médica"
            className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
          />
        </Card>
        <div className="mt-3">
          <Button type="submit" variant="primary" loading={createPeerPartner.isPending} disabled={name.trim().length === 0 || specialty.trim().length === 0}>
            Adicionar par
          </Button>
        </div>
      </form>

      <div className="mt-5 flex flex-col gap-3">
        {(peerPartners.data ?? []).map((peerPartner) => (
          <Card key={peerPartner.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body font-extrabold text-ink">{peerPartner.name}</p>
                <p className="text-caption text-muted">
                  {peerPartner.specialty} · {peerPartner.isActive ? "Ativo" : "Inativo"}
                </p>
              </div>
              <Button
                variant="outline"
                full={false}
                onClick={() => updatePeerPartner.mutate({ id: peerPartner.id, patch: { isActive: !peerPartner.isActive } })}
              >
                {peerPartner.isActive ? "Desativar" : "Ativar"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

Change the `tab` state type from `useState<"sectors" | "managers">("sectors")` to `useState<"sectors" | "managers" | "peer-partners">("sectors")`, add a third tab button next to the existing two:

```tsx
          <button
            type="button"
            onClick={() => setTab("peer-partners")}
            className={["rounded-pill px-4 py-2 text-label font-semibold", tab === "peer-partners" ? "bg-brand text-white" : "bg-surface text-ink"].join(" ")}
          >
            Pares Anônimos
          </button>
```

Change the render line from `{tab === "sectors" ? <SectorsTab /> : <ManagersTab />}` to:

```tsx
        {tab === "sectors" && <SectorsTab />}
        {tab === "managers" && <ManagersTab />}
        {tab === "peer-partners" && <PeerPartnersTab />}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter web test ManagerAdminPage -- --run` — expected PASS.

- [ ] **Step 9: Run the full web test suite**

Run: `pnpm --filter web test -- --run`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/ports/manager-admin.port.ts apps/web/src/infrastructure/http/http-manager-admin.adapter.ts \
        apps/web/src/use-cases/list-peer-partners.usecase.ts apps/web/src/use-cases/create-peer-partner.usecase.ts \
        apps/web/src/use-cases/update-peer-partner.usecase.ts apps/web/src/use-cases/reset-peer-partner-password.usecase.ts \
        apps/web/src/presentation/hooks/useAdminPeerPartners.ts apps/web/src/presentation/hooks/useCreatePeerPartner.ts \
        apps/web/src/presentation/hooks/useUpdatePeerPartner.ts apps/web/src/presentation/hooks/useResetPeerPartnerPassword.ts \
        apps/web/src/presentation/pages/ManagerAdminPage.tsx apps/web/src/presentation/pages/ManagerAdminPage.test.tsx apps/web/src/app/container.ts
git commit -m "feat(web): add Pares Anônimos tab to the hospital-admin panel"
```

---

### Task 12: Seed data + docs

**Files:**

- Modify: `apps/api/prisma/seed-data.ts`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/prisma/README.md`

**Interfaces:**

- Consumes: `PeerPartnerPasswordService` (Task 2), `PeerPartner` Prisma model (Task 1).
- Produces: nothing consumed elsewhere — this is the plan's final task.

- [ ] **Step 1: Add a demo peer-partner roster to `seed-data.ts`**

In `apps/api/prisma/seed-data.ts`, add:

```ts
export interface PeerPartnerSeedRow {
  name: string;
  password: string;
  passwordEnvVar: string;
  institutionName: string;
  specialty: string;
}

export const PEER_PARTNER_SEED_ROSTER: PeerPartnerSeedRow[] = [
  { name: "Dra. Camila Rocha", password: "zelo-camila-2026", passwordEnvVar: "PEER_PARTNER_SEED_PASSWORD_CAMILA", institutionName: "Zelo Demo", specialty: "Clínica médica" },
];
```

- [ ] **Step 2: Seed it in `seed.ts`**

In `apps/api/prisma/seed.ts`, add the import (alongside the existing `seed-data.ts` imports):

```ts
import { PEER_PARTNER_SEED_ROSTER } from "./seed-data.ts";
```

Add, after the existing manager-seeding loop and before the `SuperAdmin` loop (or after it — order relative to `SuperAdmin` doesn't matter, only relative to the institutions loop, which must run first):

```ts
  for (const peerPartner of PEER_PARTNER_SEED_ROSTER) {
    const institution = institutionsByName.get(peerPartner.institutionName);
    if (!institution) {
      throw new Error(`PEER_PARTNER_SEED_ROSTER entry "${peerPartner.name}" references unknown institution "${peerPartner.institutionName}"`);
    }
    const password = process.env[peerPartner.passwordEnvVar] ?? peerPartner.password;
    const passwordHash = await managerPasswordService.hash(password);
    await prisma.peerPartner.upsert({
      where: { name: peerPartner.name },
      update: {},
      create: { name: peerPartner.name, passwordHash, institutionId: institution.id, specialty: peerPartner.specialty },
    });
  }
```

(Reuses `managerPasswordService` — a plain scrypt hasher with no manager-specific behavior, already instantiated in this script; introducing a fourth password-service instance just for one seed row would be needless.)

Update the final `console.log` summary line to mention the new roster:

```ts
  console.log(
    `Seeded ${INSTITUTION_SEED_ROSTER.length} Institution rows, ${SECTOR_SEED_ROSTER.length} Sector rows, Signal rows for each institution, ${followUpRows.length} SimulatedFollowUp rows, ${MANAGER_SEED_ROSTER.length} Manager accounts, ${PEER_PARTNER_SEED_ROSTER.length} PeerPartner account(s), and ${SUPER_ADMIN_SEED_ROSTER.length} SuperAdmin account(s).`,
  );
```

- [ ] **Step 3: Run the API test suite and seed locally**

Run: `pnpm --filter @zelo/api test -- --run` — expected PASS.

```bash
DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
DIRECT_DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
pnpm --filter @zelo/api exec tsx prisma/seed.ts
```

```bash
docker exec zelo-postgres psql -U zelo -d zelo -c "SELECT name, specialty FROM peer_partners;"
```

Expected: one row, `Dra. Camila Rocha | Clínica médica`.

- [ ] **Step 4: Update `apps/api/prisma/README.md`**

Add a new section after the existing "Seeding manager accounts" section:

```markdown
## Seeding a demo peer partner

The same `prisma:seed` run upserts `PEER_PARTNER_SEED_ROSTER` (in `seed-data.ts`) into the
`peer_partners` table — one demo peer partner, tied to the "Zelo Demo" institution, so the
anonymous peer-chat flow has someone to match against when running the app locally. New peer
partners are added by adding an entry to that array and re-running the seed; there is no
self-service signup, same as the manager and super-admin rosters above.

| Name | Institution | Specialty | Password | Override env var |
|---|---|---|---|---|
| Dra. Camila Rocha | Zelo Demo | Clínica médica | zelo-camila-2026 | `PEER_PARTNER_SEED_PASSWORD_CAMILA` |

To try the flow end to end locally: log in at `/peer/login` with the credentials above in one
browser tab (leave it open so the peer partner shows as available), then in another tab/device,
link to "Zelo Demo" (`zelo-demo-2026`) via `/you/link`, and tap "Falar com um colega" on
`/peers`.
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/seed-data.ts apps/api/prisma/seed.ts apps/api/prisma/README.md
git commit -m "feat(api): seed a demo peer partner for local end-to-end testing"
```

---

## Plan complete

At this point: a hospital admin can register peer-partner doctors from the "Pares Anônimos" tab; a peer partner can log in and see their status go "available" the moment they connect; a médico linked to that same institution can tap "Falar com um colega" on `PeersPage`, get auto-matched, and have a live, mutually-anonymous, unpersisted conversation relayed over a websocket — accepted or declined by the peer partner, torn down cleanly by either side leaving or disconnecting. WhatsApp notification delivery remains a deliberately deferred follow-on, per the spec.
