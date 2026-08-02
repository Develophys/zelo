# WhatsApp Link Flow (US-010, Plan A of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a médica link her WhatsApp number to her Zelo device by verifying she owns it (OTP round-trip), satisfying US-010 AC-1 end to end — this is Plan A of a 4-plan sequence for US-010 (see `docs/superpowers/specs/2026-07-28-whatsapp-channel-design.md`). Plans B (inbound conversation + persistence), C (crisis direction via WhatsApp), and D (follow-up scheduler) build on top of this once it ships.

**Architecture:** New backend module `apps/api/src/modules/whatsapp-channel/` follows the same Clean Architecture 3-layer split (`application/` → `infrastructure/` → `*.module.ts`) already used by `chat/`, `assessment/`, `manager/`. New frontend surface follows the same `ports/` → `use-cases/` → `infrastructure/` → `presentation/` split already used throughout `apps/web`. The OTP round-trip is: médica enters phone number → backend generates a 6-digit OTP, encrypts+blind-indexes the phone number, holds it in an in-memory pending-request store, sends the OTP via WhatsApp Cloud API template message → médica reads the OTP off WhatsApp and types it back into the app → backend validates it (constant-time compare) and persists a `WhatsappLink` row keyed by a device-generated `deviceLinkToken` (never a login/session — a bare device identifier, stored in IndexedDB, same idea as the existing assessment-history storage).

**Tech Stack:** NestJS (Nest testing module + supertest for controller tests), Prisma (Postgres), Zod (request validation), Node `crypto` (AES-256-GCM encryption, HMAC-SHA256 blind index, `timingSafeEqual`), Vitest everywhere, React + react-router v8 + TanStack Query + Zustand-free IndexedDB storage on the frontend, Tailwind v4 design tokens.

## Global Constraints

- OTP is 6 digits, zero-padded, generated with `crypto.randomInt(0, 1_000_000)` — never `Math.random()`.
- Pending OTP requests expire after **10 minutes** (`OTP_TTL_MINUTES = 10`).
- A device may request a new OTP at most once per **60 seconds** (`OTP_REQUEST_COOLDOWN_SECONDS = 60`) — anti-abuse per spec §4.
- Phone numbers are normalized to E.164 Brazilian format (`+55` + 10 or 11 digits) before any hashing, encryption, or WhatsApp API call. Reject anything that doesn't normalize cleanly.
- Phone number encryption at rest is **new server-held-key AES-256-GCM** (`PHONE_ENCRYPTION_KEY` env var, 64 hex chars = 32 bytes) — this is **not** a reuse of the client-side WebCrypto pattern used for assessments (that pattern's key never leaves the device, which is architecturally incompatible with a value the server itself must decrypt to call the WhatsApp API). State this explicitly in code comments where relevant; do not claim reuse.
- The phone number blind index is **new** HMAC-SHA256 (`PHONE_BLIND_INDEX_SECRET` env var) — no existing blind-index utility exists in this codebase to import. The closest precedent (`ManagerTokenService`'s HMAC signing) is a different use (signing, not deterministic lookup) and is not itself reused, only its idiom (Node `crypto.createHmac`, secret via `ConfigService.getOrThrow`) is copied.
- WhatsApp Cloud API is Meta's own API, not a third-party BSP (spec §2) — provider is swappable locally via `WHATSAPP_PROVIDER=mock` env var, mirroring the existing `AI_PROVIDER=mock` switch in `chat.module.ts`.
- `deviceLinkToken` is a `crypto.randomUUID()` generated once per device, persisted in IndexedDB, never a login/session token — it must not use the `manager-session.store.ts` (sessionStorage, dies with the tab) pattern.
- Backend module path: `apps/api/src/modules/whatsapp-channel/`. Frontend page: `apps/web/src/presentation/pages/WhatsappLinkPage.tsx`, reachable at route `/you/whatsapp` from `YouPage`.
- Every new file/class/port follows the exact naming conventions already in use: kebab-case files with role suffixes (`*.use-case.ts`, `*.port.ts`, `*.adapter.ts`, `*.repository.ts`, `*.controller.ts`, `*.service.ts` on the backend; `*.usecase.ts`, `*.port.ts`, `http-*.adapter.ts` on the frontend), PascalCase classes, DI tokens as `Symbol("SCREAMING_SNAKE_NAME")` exported alongside the port interface, tests co-located as `*.test.ts` next to the file they cover, explicit `.ts` import extensions on the backend (ESM), no extension on the frontend (`@/...` alias, bundler-resolved).
- Backend controllers validate request bodies with Zod `safeParse` → `BadRequestException`, never `class-validator`.
- Backend use-case tests construct the class directly (`new UseCase(fakeDependency)`), bypassing Nest's DI container; fakes for single-implementation ports (repositories) are small classes declared inline in the `*.test.ts` file, not separate files. Fakes for env-swappable ports (the messaging port, mirroring `AI_CHAT_PORT`) get a real standalone `fake-*.adapter.ts` file because local dev also needs them.

---

## Task 1: Prisma `WhatsappLink` model + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_whatsapp_link/migration.sql` (generated, not hand-written)

**Interfaces:**
- Produces: Prisma model `WhatsappLink { id, deviceLinkToken (unique), encryptedPhoneNumber (Bytes), phoneNumberBlindIndex (unique), verifiedAt, createdAt }`, mapped table `whatsapp_links`. Later tasks' Prisma repository depends on this exact shape.

- [ ] **Step 1: Add the model to `schema.prisma`**

Append to `apps/api/prisma/schema.prisma`:

```prisma
model WhatsappLink {
  id                    String   @id @default(cuid())
  deviceLinkToken       String   @unique
  encryptedPhoneNumber  Bytes
  phoneNumberBlindIndex String   @unique
  verifiedAt            DateTime
  createdAt             DateTime @default(now())

  @@map("whatsapp_links")
}
```

- [ ] **Step 2: Generate and run the migration**

Run from repo root: `pnpm --filter @zelo/api exec prisma migrate dev --name add_whatsapp_link`

Expected: a new folder under `apps/api/prisma/migrations/` containing `migration.sql` that creates `whatsapp_links` with a unique index on `device_link_token` and `phone_number_blind_index`; the command exits 0 and regenerates the Prisma client (`apps/api/generated/prisma`).

- [ ] **Step 3: Verify the client picked up the new model**

Run: `pnpm --filter @zelo/api exec tsc --noEmit`
Expected: no type errors (confirms `prisma.whatsappLink` exists on the generated client type).

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add WhatsappLink Prisma model and migration"
```

---

## Task 2: `PhoneEncryptionService` (server-side AES-256-GCM)

**Files:**
- Create: `apps/api/src/modules/whatsapp-channel/application/services/phone-encryption.service.ts`
- Test: `apps/api/src/modules/whatsapp-channel/application/services/phone-encryption.service.test.ts`

**Interfaces:**
- Produces: `class PhoneEncryptionService { constructor(keyHex: string); encrypt(plaintext: string): Buffer; decrypt(encrypted: Buffer): string }`. Task 8/9's use-cases depend on this exact constructor shape (raw key string, not `ConfigService` — keeps unit tests free of Nest mocking).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/whatsapp-channel/application/services/phone-encryption.service.test.ts
import { describe, expect, it } from "vitest";
import { PhoneEncryptionService } from "./phone-encryption.service.ts";

const TEST_KEY_HEX = "a".repeat(64); // 32 bytes

describe("PhoneEncryptionService", () => {
  it("round-trips plaintext through encrypt/decrypt", () => {
    const service = new PhoneEncryptionService(TEST_KEY_HEX);

    const encrypted = service.encrypt("+5548999999999");
    const decrypted = service.decrypt(encrypted);

    expect(decrypted).toBe("+5548999999999");
  });

  it("produces different ciphertext for the same plaintext on each call (random IV)", () => {
    const service = new PhoneEncryptionService(TEST_KEY_HEX);

    const first = service.encrypt("+5548999999999");
    const second = service.encrypt("+5548999999999");

    expect(first.equals(second)).toBe(false);
  });

  it("throws if the key is not 32 bytes", () => {
    expect(() => new PhoneEncryptionService("too-short")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/application/services/phone-encryption.service.test.ts`
Expected: FAIL — `phone-encryption.service.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/modules/whatsapp-channel/application/services/phone-encryption.service.ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * New server-held-key AES-256-GCM encryption — NOT a reuse of the client-side
 * WebCrypto pattern used for assessments (that key never leaves the device).
 * The server must decrypt this value itself to call the WhatsApp Cloud API
 * and to resolve inbound webhooks, which the device-only key model can't support.
 */
export class PhoneEncryptionService {
  private readonly key: Buffer;

  constructor(keyHex: string) {
    this.key = Buffer.from(keyHex, "hex");
    if (this.key.length !== 32) {
      throw new Error("PHONE_ENCRYPTION_KEY must be a 32-byte (64 hex char) AES-256 key");
    }
  }

  encrypt(plaintext: string): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]);
  }

  decrypt(encrypted: Buffer): string {
    const iv = encrypted.subarray(0, IV_LENGTH);
    const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = encrypted.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/application/services/phone-encryption.service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp-channel/application/services/phone-encryption.service.ts apps/api/src/modules/whatsapp-channel/application/services/phone-encryption.service.test.ts
git commit -m "feat(api): add server-side AES-256-GCM phone encryption service"
```

---

## Task 3: `PhoneBlindIndexService` (HMAC-SHA256)

**Files:**
- Create: `apps/api/src/modules/whatsapp-channel/application/services/phone-blind-index.service.ts`
- Test: `apps/api/src/modules/whatsapp-channel/application/services/phone-blind-index.service.test.ts`

**Interfaces:**
- Produces: `class PhoneBlindIndexService { constructor(secret: string); compute(normalizedPhoneNumber: string): string }`. Deterministic — same input always yields the same output, which is the whole point (DB lookup by blind index).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/whatsapp-channel/application/services/phone-blind-index.service.test.ts
import { describe, expect, it } from "vitest";
import { PhoneBlindIndexService } from "./phone-blind-index.service.ts";

describe("PhoneBlindIndexService", () => {
  it("is deterministic for the same input and secret", () => {
    const service = new PhoneBlindIndexService("test-secret");

    expect(service.compute("+5548999999999")).toBe(service.compute("+5548999999999"));
  });

  it("differs for different phone numbers", () => {
    const service = new PhoneBlindIndexService("test-secret");

    expect(service.compute("+5548999999999")).not.toBe(service.compute("+5548988888888"));
  });

  it("differs for different secrets given the same phone number", () => {
    const a = new PhoneBlindIndexService("secret-a");
    const b = new PhoneBlindIndexService("secret-b");

    expect(a.compute("+5548999999999")).not.toBe(b.compute("+5548999999999"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/application/services/phone-blind-index.service.test.ts`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/modules/whatsapp-channel/application/services/phone-blind-index.service.ts
import { createHmac } from "node:crypto";

/**
 * Deterministic HMAC-SHA256 over the normalized phone number — lets the
 * webhook handler find a WhatsappLink by sender number without ever
 * comparing phone numbers in plaintext in a query. No existing blind-index
 * utility exists elsewhere in this codebase to import; only the idiom
 * (Node crypto.createHmac, secret from config) is copied from
 * ManagerTokenService, which uses HMAC for signing, not lookup.
 */
export class PhoneBlindIndexService {
  constructor(private readonly secret: string) {}

  compute(normalizedPhoneNumber: string): string {
    return createHmac("sha256", this.secret).update(normalizedPhoneNumber).digest("hex");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/application/services/phone-blind-index.service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp-channel/application/services/phone-blind-index.service.ts apps/api/src/modules/whatsapp-channel/application/services/phone-blind-index.service.test.ts
git commit -m "feat(api): add phone number blind index service"
```

---

## Task 4: `normalizeBrazilianPhoneNumber` util + `InvalidPhoneNumberError`

**Files:**
- Create: `apps/api/src/modules/whatsapp-channel/application/services/normalize-phone-number.ts`
- Test: `apps/api/src/modules/whatsapp-channel/application/services/normalize-phone-number.test.ts`

**Interfaces:**
- Produces: `function normalizeBrazilianPhoneNumber(raw: string): string` (throws `InvalidPhoneNumberError`), and the `InvalidPhoneNumberError` class itself — Task 8 imports both.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/whatsapp-channel/application/services/normalize-phone-number.test.ts
import { describe, expect, it } from "vitest";
import { normalizeBrazilianPhoneNumber, InvalidPhoneNumberError } from "./normalize-phone-number.ts";

describe("normalizeBrazilianPhoneNumber", () => {
  it("normalizes a formatted 11-digit mobile number without country code", () => {
    expect(normalizeBrazilianPhoneNumber("(48) 99999-9999")).toBe("+5548999999999");
  });

  it("normalizes a bare-digits number without country code", () => {
    expect(normalizeBrazilianPhoneNumber("48999999999")).toBe("+5548999999999");
  });

  it("normalizes a number that already carries the country code", () => {
    expect(normalizeBrazilianPhoneNumber("+55 48 99999-9999")).toBe("+5548999999999");
  });

  it("normalizes a 10-digit landline-style number", () => {
    expect(normalizeBrazilianPhoneNumber("48 3333-4444")).toBe("+554833334444");
  });

  it("throws InvalidPhoneNumberError for too few digits", () => {
    expect(() => normalizeBrazilianPhoneNumber("123")).toThrow(InvalidPhoneNumberError);
  });

  it("throws InvalidPhoneNumberError for too many digits", () => {
    expect(() => normalizeBrazilianPhoneNumber("55489999999999999")).toThrow(InvalidPhoneNumberError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/application/services/normalize-phone-number.test.ts`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/modules/whatsapp-channel/application/services/normalize-phone-number.ts
export class InvalidPhoneNumberError extends Error {
  constructor() {
    super("Phone number does not normalize to a valid Brazilian number");
    this.name = "InvalidPhoneNumberError";
  }
}

export function normalizeBrazilianPhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const withoutCountryCode = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;

  if (withoutCountryCode.length !== 10 && withoutCountryCode.length !== 11) {
    throw new InvalidPhoneNumberError();
  }

  return `+55${withoutCountryCode}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/application/services/normalize-phone-number.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp-channel/application/services/normalize-phone-number.ts apps/api/src/modules/whatsapp-channel/application/services/normalize-phone-number.test.ts
git commit -m "feat(api): add Brazilian phone number normalization util"
```

---

## Task 5: `PendingLinkRequestStore` (in-memory, single implementation)

**Files:**
- Create: `apps/api/src/modules/whatsapp-channel/application/services/pending-link-request.store.ts`
- Test: `apps/api/src/modules/whatsapp-channel/application/services/pending-link-request.store.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const OTP_TTL_MINUTES = 10;
  export const OTP_REQUEST_COOLDOWN_SECONDS = 60;

  export interface PendingLinkRequest {
    deviceLinkToken: string;
    otp: string;
    encryptedPhoneNumber: Buffer;
    phoneNumberBlindIndex: string;
    expiresAt: Date;
    lastRequestedAt: Date;
  }

  export class PendingLinkRequestStore {
    save(request: PendingLinkRequest): void;
    find(deviceLinkToken: string): PendingLinkRequest | undefined;
    delete(deviceLinkToken: string): void;
  }
  ```
  Tasks 8/9 depend on this exact shape. This is a plain injectable service (not a port with multiple adapters) because there is exactly one implementation — an in-memory `Map`, process-local, acceptable for a single-instance deployment. Note in a code comment that horizontal scaling would need this moved to Redis, but do not build that now (YAGNI).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/whatsapp-channel/application/services/pending-link-request.store.test.ts
import { describe, expect, it } from "vitest";
import { PendingLinkRequestStore } from "./pending-link-request.store.ts";
import type { PendingLinkRequest } from "./pending-link-request.store.ts";

function buildRequest(overrides: Partial<PendingLinkRequest> = {}): PendingLinkRequest {
  return {
    deviceLinkToken: "device-1",
    otp: "123456",
    encryptedPhoneNumber: Buffer.from("cipher"),
    phoneNumberBlindIndex: "blind-index-1",
    expiresAt: new Date(Date.now() + 60_000),
    lastRequestedAt: new Date(),
    ...overrides,
  };
}

describe("PendingLinkRequestStore", () => {
  it("returns undefined for a device with no pending request", () => {
    const store = new PendingLinkRequestStore();
    expect(store.find("unknown-device")).toBeUndefined();
  });

  it("saves and finds a pending request by deviceLinkToken", () => {
    const store = new PendingLinkRequestStore();
    const request = buildRequest();

    store.save(request);

    expect(store.find("device-1")).toEqual(request);
  });

  it("overwrites an existing pending request for the same device", () => {
    const store = new PendingLinkRequestStore();
    store.save(buildRequest({ otp: "111111" }));
    store.save(buildRequest({ otp: "222222" }));

    expect(store.find("device-1")?.otp).toBe("222222");
  });

  it("deletes a pending request", () => {
    const store = new PendingLinkRequestStore();
    store.save(buildRequest());

    store.delete("device-1");

    expect(store.find("device-1")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/application/services/pending-link-request.store.test.ts`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/modules/whatsapp-channel/application/services/pending-link-request.store.ts
import { Injectable } from "@nestjs/common";

export const OTP_TTL_MINUTES = 10;
export const OTP_REQUEST_COOLDOWN_SECONDS = 60;

export interface PendingLinkRequest {
  deviceLinkToken: string;
  otp: string;
  encryptedPhoneNumber: Buffer;
  phoneNumberBlindIndex: string;
  expiresAt: Date;
  lastRequestedAt: Date;
}

/**
 * Process-local in-memory store — fine for a single backend instance.
 * Horizontally scaling the API would need this moved to Redis; not built
 * now, no current deployment need for it (YAGNI).
 */
@Injectable()
export class PendingLinkRequestStore {
  private readonly requestsByDeviceToken = new Map<string, PendingLinkRequest>();

  save(request: PendingLinkRequest): void {
    this.requestsByDeviceToken.set(request.deviceLinkToken, request);
  }

  find(deviceLinkToken: string): PendingLinkRequest | undefined {
    return this.requestsByDeviceToken.get(deviceLinkToken);
  }

  delete(deviceLinkToken: string): void {
    this.requestsByDeviceToken.delete(deviceLinkToken);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/application/services/pending-link-request.store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp-channel/application/services/pending-link-request.store.ts apps/api/src/modules/whatsapp-channel/application/services/pending-link-request.store.test.ts
git commit -m "feat(api): add in-memory pending WhatsApp link request store"
```

---

## Task 6: `WhatsappLinkRepository` port + Prisma adapter

**Files:**
- Create: `apps/api/src/modules/whatsapp-channel/application/ports/whatsapp-link-repository.port.ts`
- Create: `apps/api/src/modules/whatsapp-channel/infrastructure/persistence/prisma-whatsapp-link.repository.ts`
- Test: `apps/api/src/modules/whatsapp-channel/infrastructure/persistence/prisma-whatsapp-link.repository.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface WhatsappLinkRecord {
    deviceLinkToken: string;
    encryptedPhoneNumber: Buffer;
    phoneNumberBlindIndex: string;
    verifiedAt: Date;
  }
  export interface WhatsappLinkRepository { save(record: WhatsappLinkRecord): Promise<void>; }
  export const WHATSAPP_LINK_REPOSITORY = Symbol("WHATSAPP_LINK_REPOSITORY");
  ```
  Task 9 (`ConfirmWhatsappLinkUseCase`) depends on `WhatsappLinkRepository`/`WhatsappLinkRecord`. `save()` is an upsert keyed by `deviceLinkToken` — re-linking a device (new phone number) overwrites the old link rather than erroring, avoiding an extra error branch for a case the spec doesn't call out as needing rejection.

- [ ] **Step 1: Write the port (no test needed — it's a type-only interface plus a Symbol)**

```ts
// apps/api/src/modules/whatsapp-channel/application/ports/whatsapp-link-repository.port.ts
export interface WhatsappLinkRecord {
  deviceLinkToken: string;
  encryptedPhoneNumber: Buffer;
  phoneNumberBlindIndex: string;
  verifiedAt: Date;
}

export interface WhatsappLinkRepository {
  save(record: WhatsappLinkRecord): Promise<void>;
}

export const WHATSAPP_LINK_REPOSITORY = Symbol("WHATSAPP_LINK_REPOSITORY");
```

- [ ] **Step 2: Write the failing repository test**

This test hits a real (local dev/CI) Postgres via `PrismaService`, same as other persistence tests in this repo — requires `DATABASE_URL` pointed at the docker-compose Postgres.

```ts
// apps/api/src/modules/whatsapp-channel/infrastructure/persistence/prisma-whatsapp-link.repository.test.ts
import { describe, expect, it, afterEach, afterAll } from "vitest";
import { PrismaWhatsappLinkRepository } from "./prisma-whatsapp-link.repository.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

const prisma = new PrismaService();
const repository = new PrismaWhatsappLinkRepository(prisma);

afterEach(async () => {
  await prisma.whatsappLink.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("PrismaWhatsappLinkRepository", () => {
  it("creates a new WhatsappLink row", async () => {
    await repository.save({
      deviceLinkToken: "device-1",
      encryptedPhoneNumber: Buffer.from("cipher"),
      phoneNumberBlindIndex: "blind-1",
      verifiedAt: new Date("2026-07-30T12:00:00.000Z"),
    });

    const row = await prisma.whatsappLink.findUnique({ where: { deviceLinkToken: "device-1" } });
    expect(row?.phoneNumberBlindIndex).toBe("blind-1");
  });

  it("upserts (overwrites) an existing row for the same deviceLinkToken", async () => {
    await repository.save({
      deviceLinkToken: "device-1",
      encryptedPhoneNumber: Buffer.from("cipher-a"),
      phoneNumberBlindIndex: "blind-a",
      verifiedAt: new Date("2026-07-30T12:00:00.000Z"),
    });
    await repository.save({
      deviceLinkToken: "device-1",
      encryptedPhoneNumber: Buffer.from("cipher-b"),
      phoneNumberBlindIndex: "blind-b",
      verifiedAt: new Date("2026-07-30T13:00:00.000Z"),
    });

    const rows = await prisma.whatsappLink.findMany({ where: { deviceLinkToken: "device-1" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.phoneNumberBlindIndex).toBe("blind-b");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/infrastructure/persistence/prisma-whatsapp-link.repository.test.ts`
Expected: FAIL — `prisma-whatsapp-link.repository.ts` does not exist.

- [ ] **Step 4: Write the implementation**

```ts
// apps/api/src/modules/whatsapp-channel/infrastructure/persistence/prisma-whatsapp-link.repository.ts
import { Inject, Injectable } from "@nestjs/common";
import type { WhatsappLinkRecord, WhatsappLinkRepository } from "../../application/ports/whatsapp-link-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaWhatsappLinkRepository implements WhatsappLinkRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async save(record: WhatsappLinkRecord): Promise<void> {
    await this.prisma.whatsappLink.upsert({
      where: { deviceLinkToken: record.deviceLinkToken },
      create: {
        deviceLinkToken: record.deviceLinkToken,
        encryptedPhoneNumber: record.encryptedPhoneNumber,
        phoneNumberBlindIndex: record.phoneNumberBlindIndex,
        verifiedAt: record.verifiedAt,
      },
      update: {
        encryptedPhoneNumber: record.encryptedPhoneNumber,
        phoneNumberBlindIndex: record.phoneNumberBlindIndex,
        verifiedAt: record.verifiedAt,
      },
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/infrastructure/persistence/prisma-whatsapp-link.repository.test.ts`
Expected: PASS (2 tests). Requires the local Postgres (`docker compose up -d` per repo README) to be running.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/whatsapp-channel/application/ports/whatsapp-link-repository.port.ts apps/api/src/modules/whatsapp-channel/infrastructure/persistence/prisma-whatsapp-link.repository.ts apps/api/src/modules/whatsapp-channel/infrastructure/persistence/prisma-whatsapp-link.repository.test.ts
git commit -m "feat(api): add WhatsappLinkRepository port and Prisma adapter"
```

---

## Task 7: `WhatsappMessagingPort` + fake + real Cloud API adapter

**Files:**
- Create: `apps/api/src/modules/whatsapp-channel/application/ports/whatsapp-messaging.port.ts`
- Create: `apps/api/src/modules/whatsapp-channel/infrastructure/whatsapp-providers/fake-whatsapp-messaging.adapter.ts`
- Test: `apps/api/src/modules/whatsapp-channel/infrastructure/whatsapp-providers/fake-whatsapp-messaging.adapter.test.ts`
- Create: `apps/api/src/modules/whatsapp-channel/infrastructure/whatsapp-providers/whatsapp-cloud-api.adapter.ts`
- Test: `apps/api/src/modules/whatsapp-channel/infrastructure/whatsapp-providers/whatsapp-cloud-api.adapter.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface WhatsappMessagingPort {
    sendOtpTemplate(params: { phoneNumber: string; otp: string }): Promise<void>;
  }
  export const WHATSAPP_MESSAGING_PORT = Symbol("WHATSAPP_MESSAGING_PORT");
  export class WhatsappMessagingFailedError extends Error {}
  ```
  Task 8 (`RequestWhatsappLinkUseCase`) depends on `WhatsappMessagingPort`. `FakeWhatsappMessagingAdapter` gets its own file (unlike the repository fake) because, mirroring `AI_CHAT_PORT`/`FakeChatAdapter`, it's also used for local dev via a `WHATSAPP_PROVIDER=mock` env switch, not only in unit tests.

- [ ] **Step 1: Write the port and error type**

```ts
// apps/api/src/modules/whatsapp-channel/application/ports/whatsapp-messaging.port.ts
export interface WhatsappMessagingPort {
  sendOtpTemplate(params: { phoneNumber: string; otp: string }): Promise<void>;
}

export const WHATSAPP_MESSAGING_PORT = Symbol("WHATSAPP_MESSAGING_PORT");

export class WhatsappMessagingFailedError extends Error {
  constructor(details: string) {
    super(`WhatsApp Cloud API request failed: ${details}`);
    this.name = "WhatsappMessagingFailedError";
  }
}
```

- [ ] **Step 2: Write the failing fake adapter test**

```ts
// apps/api/src/modules/whatsapp-channel/infrastructure/whatsapp-providers/fake-whatsapp-messaging.adapter.test.ts
import { describe, expect, it } from "vitest";
import { FakeWhatsappMessagingAdapter } from "./fake-whatsapp-messaging.adapter.ts";

describe("FakeWhatsappMessagingAdapter", () => {
  it("records every sent OTP template call", async () => {
    const adapter = new FakeWhatsappMessagingAdapter();

    await adapter.sendOtpTemplate({ phoneNumber: "+5548999999999", otp: "123456" });

    expect(adapter.sentMessages).toEqual([{ phoneNumber: "+5548999999999", otp: "123456" }]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/infrastructure/whatsapp-providers/fake-whatsapp-messaging.adapter.test.ts`
Expected: FAIL — file does not exist.

- [ ] **Step 4: Write the fake adapter**

```ts
// apps/api/src/modules/whatsapp-channel/infrastructure/whatsapp-providers/fake-whatsapp-messaging.adapter.ts
import { Injectable } from "@nestjs/common";
import type { WhatsappMessagingPort } from "../../application/ports/whatsapp-messaging.port.ts";

/**
 * WHATSAPP_MESSAGING_PORT implementation for local/dev testing without a
 * Meta Business verification — see WHATSAPP_PROVIDER=mock in
 * whatsapp-channel.module.ts.
 */
@Injectable()
export class FakeWhatsappMessagingAdapter implements WhatsappMessagingPort {
  public sentMessages: { phoneNumber: string; otp: string }[] = [];

  async sendOtpTemplate(params: { phoneNumber: string; otp: string }): Promise<void> {
    this.sentMessages.push(params);
  }
}
```

- [ ] **Step 5: Run fake adapter test to verify it passes**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/infrastructure/whatsapp-providers/fake-whatsapp-messaging.adapter.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Write the failing real adapter test (mocks `fetch`)**

```ts
// apps/api/src/modules/whatsapp-channel/infrastructure/whatsapp-providers/whatsapp-cloud-api.adapter.test.ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { WhatsappCloudApiAdapter } from "./whatsapp-cloud-api.adapter.ts";
import { WhatsappMessagingFailedError } from "../../application/ports/whatsapp-messaging.port.ts";

const config = {
  getOrThrow: (key: string) =>
    key === "WHATSAPP_CLOUD_API_TOKEN" ? "test-token" : "test-phone-number-id",
} as unknown as import("@nestjs/config").ConfigService;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WhatsappCloudApiAdapter", () => {
  it("POSTs a template message to the Graph API with the OTP and returns on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new WhatsappCloudApiAdapter(config);

    await adapter.sendOtpTemplate({ phoneNumber: "+5548999999999", otp: "123456" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/test-phone-number-id/messages",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1].body);
    expect(body.to).toBe("+5548999999999");
    expect(body.template.components[0].parameters[0].text).toBe("123456");
  });

  it("throws WhatsappMessagingFailedError when the Graph API responds with a non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, text: async () => "bad request" }));
    const adapter = new WhatsappCloudApiAdapter(config);

    await expect(adapter.sendOtpTemplate({ phoneNumber: "+5548999999999", otp: "123456" })).rejects.toBeInstanceOf(
      WhatsappMessagingFailedError,
    );
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/infrastructure/whatsapp-providers/whatsapp-cloud-api.adapter.test.ts`
Expected: FAIL — `whatsapp-cloud-api.adapter.ts` does not exist.

- [ ] **Step 8: Write the real adapter**

```ts
// apps/api/src/modules/whatsapp-channel/infrastructure/whatsapp-providers/whatsapp-cloud-api.adapter.ts
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { WhatsappMessagingPort } from "../../application/ports/whatsapp-messaging.port.ts";
import { WhatsappMessagingFailedError } from "../../application/ports/whatsapp-messaging.port.ts";

const GRAPH_API_VERSION = "v21.0";
const OTP_TEMPLATE_NAME = "zelo_otp_verification";

@Injectable()
export class WhatsappCloudApiAdapter implements WhatsappMessagingPort {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async sendOtpTemplate({ phoneNumber, otp }: { phoneNumber: string; otp: string }): Promise<void> {
    const token = this.config.getOrThrow<string>("WHATSAPP_CLOUD_API_TOKEN");
    const phoneNumberId = this.config.getOrThrow<string>("WHATSAPP_PHONE_NUMBER_ID");

    const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "template",
        template: {
          name: OTP_TEMPLATE_NAME,
          language: { code: "pt_BR" },
          components: [{ type: "body", parameters: [{ type: "text", text: otp }] }],
        },
      }),
    });

    if (!response.ok) {
      throw new WhatsappMessagingFailedError(await response.text());
    }
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/infrastructure/whatsapp-providers/whatsapp-cloud-api.adapter.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/whatsapp-channel/application/ports/whatsapp-messaging.port.ts apps/api/src/modules/whatsapp-channel/infrastructure/whatsapp-providers
git commit -m "feat(api): add WhatsApp Cloud API messaging port, fake, and real adapter"
```

---

## Task 8: `RequestWhatsappLinkUseCase`

**Files:**
- Create: `apps/api/src/modules/whatsapp-channel/application/use-cases/request-whatsapp-link.use-case.ts`
- Test: `apps/api/src/modules/whatsapp-channel/application/use-cases/request-whatsapp-link.use-case.test.ts`

**Interfaces:**
- Consumes: `WhatsappMessagingPort` (Task 7), `PendingLinkRequestStore` (Task 5), `PhoneEncryptionService` (Task 2), `PhoneBlindIndexService` (Task 3), `normalizeBrazilianPhoneNumber`/`InvalidPhoneNumberError` (Task 4).
- Produces: `class RequestWhatsappLinkUseCase { execute(params: { deviceLinkToken: string; phoneNumber: string }): Promise<void> }`, `class RateLimitedError extends Error`. Task 10's controller depends on both.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/whatsapp-channel/application/use-cases/request-whatsapp-link.use-case.test.ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { RequestWhatsappLinkUseCase, RateLimitedError } from "./request-whatsapp-link.use-case.ts";
import { FakeWhatsappMessagingAdapter } from "../../infrastructure/whatsapp-providers/fake-whatsapp-messaging.adapter.ts";
import { PendingLinkRequestStore } from "../services/pending-link-request.store.ts";
import { PhoneEncryptionService } from "../services/phone-encryption.service.ts";
import { PhoneBlindIndexService } from "../services/phone-blind-index.service.ts";
import { InvalidPhoneNumberError } from "../services/normalize-phone-number.ts";

function buildUseCase() {
  const messaging = new FakeWhatsappMessagingAdapter();
  const pendingStore = new PendingLinkRequestStore();
  const encryption = new PhoneEncryptionService("a".repeat(64));
  const blindIndex = new PhoneBlindIndexService("test-secret");
  const useCase = new RequestWhatsappLinkUseCase(messaging, pendingStore, encryption, blindIndex);
  return { useCase, messaging, pendingStore };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("RequestWhatsappLinkUseCase", () => {
  it("normalizes the phone number, saves a pending request, and sends the OTP via WhatsApp", async () => {
    const { useCase, messaging, pendingStore } = buildUseCase();

    await useCase.execute({ deviceLinkToken: "device-1", phoneNumber: "(48) 99999-9999" });

    expect(messaging.sentMessages).toHaveLength(1);
    expect(messaging.sentMessages[0]?.phoneNumber).toBe("+5548999999999");
    expect(messaging.sentMessages[0]?.otp).toMatch(/^\d{6}$/);

    const pending = pendingStore.find("device-1");
    expect(pending?.otp).toBe(messaging.sentMessages[0]?.otp);
  });

  it("throws InvalidPhoneNumberError for a malformed number, without sending anything", async () => {
    const { useCase, messaging } = buildUseCase();

    await expect(useCase.execute({ deviceLinkToken: "device-1", phoneNumber: "123" })).rejects.toBeInstanceOf(
      InvalidPhoneNumberError,
    );
    expect(messaging.sentMessages).toHaveLength(0);
  });

  it("throws RateLimitedError on a second request within the cooldown window", async () => {
    const { useCase, messaging } = buildUseCase();

    await useCase.execute({ deviceLinkToken: "device-1", phoneNumber: "48999999999" });
    await expect(
      useCase.execute({ deviceLinkToken: "device-1", phoneNumber: "48999999999" }),
    ).rejects.toBeInstanceOf(RateLimitedError);
    expect(messaging.sentMessages).toHaveLength(1);
  });

  it("allows a new request once the cooldown window has passed", async () => {
    vi.useFakeTimers();
    const { useCase, messaging } = buildUseCase();

    await useCase.execute({ deviceLinkToken: "device-1", phoneNumber: "48999999999" });
    vi.advanceTimersByTime(61_000);
    await useCase.execute({ deviceLinkToken: "device-1", phoneNumber: "48999999999" });

    expect(messaging.sentMessages).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/application/use-cases/request-whatsapp-link.use-case.test.ts`
Expected: FAIL — `request-whatsapp-link.use-case.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/modules/whatsapp-channel/application/use-cases/request-whatsapp-link.use-case.ts
import { randomInt } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { WHATSAPP_MESSAGING_PORT, type WhatsappMessagingPort } from "../ports/whatsapp-messaging.port.ts";
import { PendingLinkRequestStore, OTP_TTL_MINUTES, OTP_REQUEST_COOLDOWN_SECONDS } from "../services/pending-link-request.store.ts";
import { PhoneEncryptionService } from "../services/phone-encryption.service.ts";
import { PhoneBlindIndexService } from "../services/phone-blind-index.service.ts";
import { normalizeBrazilianPhoneNumber } from "../services/normalize-phone-number.ts";

export class RateLimitedError extends Error {
  constructor() {
    super("A WhatsApp link OTP was already requested recently for this device");
    this.name = "RateLimitedError";
  }
}

export interface RequestWhatsappLinkParams {
  deviceLinkToken: string;
  phoneNumber: string;
}

function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

@Injectable()
export class RequestWhatsappLinkUseCase {
  constructor(
    @Inject(WHATSAPP_MESSAGING_PORT) private readonly messaging: WhatsappMessagingPort,
    @Inject(PendingLinkRequestStore) private readonly pendingStore: PendingLinkRequestStore,
    @Inject(PhoneEncryptionService) private readonly phoneEncryption: PhoneEncryptionService,
    @Inject(PhoneBlindIndexService) private readonly phoneBlindIndex: PhoneBlindIndexService,
  ) {}

  async execute(params: RequestWhatsappLinkParams): Promise<void> {
    const normalizedPhoneNumber = normalizeBrazilianPhoneNumber(params.phoneNumber);

    const existing = this.pendingStore.find(params.deviceLinkToken);
    if (existing) {
      const elapsedSeconds = (Date.now() - existing.lastRequestedAt.getTime()) / 1000;
      if (elapsedSeconds < OTP_REQUEST_COOLDOWN_SECONDS) {
        throw new RateLimitedError();
      }
    }

    const otp = generateOtp();
    const now = new Date();

    this.pendingStore.save({
      deviceLinkToken: params.deviceLinkToken,
      otp,
      encryptedPhoneNumber: this.phoneEncryption.encrypt(normalizedPhoneNumber),
      phoneNumberBlindIndex: this.phoneBlindIndex.compute(normalizedPhoneNumber),
      expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60_000),
      lastRequestedAt: now,
    });

    await this.messaging.sendOtpTemplate({ phoneNumber: normalizedPhoneNumber, otp });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/application/use-cases/request-whatsapp-link.use-case.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp-channel/application/use-cases/request-whatsapp-link.use-case.ts apps/api/src/modules/whatsapp-channel/application/use-cases/request-whatsapp-link.use-case.test.ts
git commit -m "feat(api): add RequestWhatsappLinkUseCase"
```

---

## Task 9: `ConfirmWhatsappLinkUseCase`

**Files:**
- Create: `apps/api/src/modules/whatsapp-channel/application/use-cases/confirm-whatsapp-link.use-case.ts`
- Test: `apps/api/src/modules/whatsapp-channel/application/use-cases/confirm-whatsapp-link.use-case.test.ts`

**Interfaces:**
- Consumes: `PendingLinkRequestStore` (Task 5), `WhatsappLinkRepository` (Task 6).
- Produces: `class ConfirmWhatsappLinkUseCase { execute(params: { deviceLinkToken: string; otp: string }): Promise<void> }`, `class NoPendingLinkRequestError`, `class OtpExpiredError`, `class InvalidOtpError`. Task 10's controller depends on all four.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/whatsapp-channel/application/use-cases/confirm-whatsapp-link.use-case.test.ts
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  ConfirmWhatsappLinkUseCase,
  NoPendingLinkRequestError,
  OtpExpiredError,
  InvalidOtpError,
} from "./confirm-whatsapp-link.use-case.ts";
import { PendingLinkRequestStore } from "../services/pending-link-request.store.ts";
import type { WhatsappLinkRepository, WhatsappLinkRecord } from "../ports/whatsapp-link-repository.port.ts";

class FakeWhatsappLinkRepository implements WhatsappLinkRepository {
  public saved: WhatsappLinkRecord[] = [];
  async save(record: WhatsappLinkRecord): Promise<void> {
    this.saved.push(record);
  }
}

function seedPending(store: PendingLinkRequestStore, overrides: { expiresAt?: Date } = {}) {
  store.save({
    deviceLinkToken: "device-1",
    otp: "123456",
    encryptedPhoneNumber: Buffer.from("cipher"),
    phoneNumberBlindIndex: "blind-1",
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
    lastRequestedAt: new Date(),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ConfirmWhatsappLinkUseCase", () => {
  it("persists a WhatsappLink and clears the pending request on a correct OTP", async () => {
    const pendingStore = new PendingLinkRequestStore();
    seedPending(pendingStore);
    const repository = new FakeWhatsappLinkRepository();
    const useCase = new ConfirmWhatsappLinkUseCase(pendingStore, repository);

    await useCase.execute({ deviceLinkToken: "device-1", otp: "123456" });

    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]?.deviceLinkToken).toBe("device-1");
    expect(pendingStore.find("device-1")).toBeUndefined();
  });

  it("throws NoPendingLinkRequestError when no OTP was ever requested for the device", async () => {
    const useCase = new ConfirmWhatsappLinkUseCase(new PendingLinkRequestStore(), new FakeWhatsappLinkRepository());

    await expect(useCase.execute({ deviceLinkToken: "unknown-device", otp: "123456" })).rejects.toBeInstanceOf(
      NoPendingLinkRequestError,
    );
  });

  it("throws OtpExpiredError once the pending request's expiry has passed", async () => {
    const pendingStore = new PendingLinkRequestStore();
    seedPending(pendingStore, { expiresAt: new Date(Date.now() - 1_000) });
    const useCase = new ConfirmWhatsappLinkUseCase(pendingStore, new FakeWhatsappLinkRepository());

    await expect(useCase.execute({ deviceLinkToken: "device-1", otp: "123456" })).rejects.toBeInstanceOf(
      OtpExpiredError,
    );
  });

  it("throws InvalidOtpError for a wrong code and keeps the pending request intact", async () => {
    const pendingStore = new PendingLinkRequestStore();
    seedPending(pendingStore);
    const repository = new FakeWhatsappLinkRepository();
    const useCase = new ConfirmWhatsappLinkUseCase(pendingStore, repository);

    await expect(useCase.execute({ deviceLinkToken: "device-1", otp: "000000" })).rejects.toBeInstanceOf(
      InvalidOtpError,
    );
    expect(repository.saved).toHaveLength(0);
    expect(pendingStore.find("device-1")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/application/use-cases/confirm-whatsapp-link.use-case.test.ts`
Expected: FAIL — `confirm-whatsapp-link.use-case.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/modules/whatsapp-channel/application/use-cases/confirm-whatsapp-link.use-case.ts
import { timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PendingLinkRequestStore } from "../services/pending-link-request.store.ts";
import { WHATSAPP_LINK_REPOSITORY, type WhatsappLinkRepository } from "../ports/whatsapp-link-repository.port.ts";

export class NoPendingLinkRequestError extends Error {
  constructor() {
    super("No pending WhatsApp link request for this device");
    this.name = "NoPendingLinkRequestError";
  }
}

export class OtpExpiredError extends Error {
  constructor() {
    super("The WhatsApp link OTP has expired");
    this.name = "OtpExpiredError";
  }
}

export class InvalidOtpError extends Error {
  constructor() {
    super("The WhatsApp link OTP does not match");
    this.name = "InvalidOtpError";
  }
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export interface ConfirmWhatsappLinkParams {
  deviceLinkToken: string;
  otp: string;
}

@Injectable()
export class ConfirmWhatsappLinkUseCase {
  constructor(
    @Inject(PendingLinkRequestStore) private readonly pendingStore: PendingLinkRequestStore,
    @Inject(WHATSAPP_LINK_REPOSITORY) private readonly repository: WhatsappLinkRepository,
  ) {}

  async execute(params: ConfirmWhatsappLinkParams): Promise<void> {
    const pending = this.pendingStore.find(params.deviceLinkToken);
    if (!pending) {
      throw new NoPendingLinkRequestError();
    }

    if (pending.expiresAt.getTime() < Date.now()) {
      throw new OtpExpiredError();
    }

    if (!timingSafeStringEqual(pending.otp, params.otp)) {
      throw new InvalidOtpError();
    }

    await this.repository.save({
      deviceLinkToken: pending.deviceLinkToken,
      encryptedPhoneNumber: pending.encryptedPhoneNumber,
      phoneNumberBlindIndex: pending.phoneNumberBlindIndex,
      verifiedAt: new Date(),
    });

    this.pendingStore.delete(params.deviceLinkToken);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/application/use-cases/confirm-whatsapp-link.use-case.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp-channel/application/use-cases/confirm-whatsapp-link.use-case.ts apps/api/src/modules/whatsapp-channel/application/use-cases/confirm-whatsapp-link.use-case.test.ts
git commit -m "feat(api): add ConfirmWhatsappLinkUseCase"
```

---

## Task 10: `WhatsappLinkController` + `WhatsappChannelModule` + app wiring + env vars

**Files:**
- Create: `apps/api/src/modules/whatsapp-channel/infrastructure/whatsapp-link.controller.ts`
- Test: `apps/api/src/modules/whatsapp-channel/infrastructure/whatsapp-link.controller.test.ts`
- Create: `apps/api/src/modules/whatsapp-channel/whatsapp-channel.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Consumes: `RequestWhatsappLinkUseCase`/`RateLimitedError` (Task 8), `ConfirmWhatsappLinkUseCase`/`NoPendingLinkRequestError`/`OtpExpiredError`/`InvalidOtpError` (Task 9).
- Produces: `POST /whatsapp/link/request` and `POST /whatsapp/link/confirm`, returning `{ success: true }` on 200, or `{ error: "<code>" }` on 4xx — Plan A's frontend adapter (Task 12) depends on this exact response shape and these exact error codes: `invalid_phone_number`, `rate_limited` (429), `no_pending_link_request`, `otp_expired`, `invalid_otp`.

- [ ] **Step 1: Write the failing controller test**

```ts
// apps/api/src/modules/whatsapp-channel/infrastructure/whatsapp-link.controller.test.ts
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { WhatsappLinkController } from "./whatsapp-link.controller.ts";
import { RequestWhatsappLinkUseCase } from "../application/use-cases/request-whatsapp-link.use-case.ts";
import { ConfirmWhatsappLinkUseCase } from "../application/use-cases/confirm-whatsapp-link.use-case.ts";
import { WHATSAPP_MESSAGING_PORT } from "../application/ports/whatsapp-messaging.port.ts";
import { WHATSAPP_LINK_REPOSITORY } from "../application/ports/whatsapp-link-repository.port.ts";
import { PendingLinkRequestStore } from "../application/services/pending-link-request.store.ts";
import { PhoneEncryptionService } from "../application/services/phone-encryption.service.ts";
import { PhoneBlindIndexService } from "../application/services/phone-blind-index.service.ts";
import { FakeWhatsappMessagingAdapter } from "./whatsapp-providers/fake-whatsapp-messaging.adapter.ts";
import type { WhatsappLinkRepository, WhatsappLinkRecord } from "../application/ports/whatsapp-link-repository.port.ts";

class FakeWhatsappLinkRepository implements WhatsappLinkRepository {
  public saved: WhatsappLinkRecord[] = [];
  async save(record: WhatsappLinkRecord): Promise<void> {
    this.saved.push(record);
  }
}

describe("WhatsappLinkController", () => {
  let app: INestApplication;
  let messaging: FakeWhatsappMessagingAdapter;

  beforeAll(async () => {
    messaging = new FakeWhatsappMessagingAdapter();
    const moduleRef = await Test.createTestingModule({
      controllers: [WhatsappLinkController],
      providers: [
        RequestWhatsappLinkUseCase,
        ConfirmWhatsappLinkUseCase,
        { provide: WHATSAPP_MESSAGING_PORT, useValue: messaging },
        { provide: WHATSAPP_LINK_REPOSITORY, useClass: FakeWhatsappLinkRepository },
        PendingLinkRequestStore,
        { provide: PhoneEncryptionService, useValue: new PhoneEncryptionService("a".repeat(64)) },
        { provide: PhoneBlindIndexService, useValue: new PhoneBlindIndexService("test-secret") },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /whatsapp/link/request sends an OTP and returns success", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/link/request")
      .send({ deviceLinkToken: "11111111-1111-4111-8111-111111111111", phoneNumber: "48999999999" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(messaging.sentMessages).toHaveLength(1);
  });

  it("POST /whatsapp/link/request rejects a malformed phone number with error code invalid_phone_number", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/link/request")
      .send({ deviceLinkToken: "22222222-2222-4222-8222-222222222222", phoneNumber: "123" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid_phone_number" });
  });

  it("POST /whatsapp/link/request returns 429 with error code rate_limited on an immediate repeat", async () => {
    const deviceLinkToken = "33333333-3333-4333-8333-333333333333";
    await request(app.getHttpServer()).post("/whatsapp/link/request").send({ deviceLinkToken, phoneNumber: "48999999999" });

    const response = await request(app.getHttpServer())
      .post("/whatsapp/link/request")
      .send({ deviceLinkToken, phoneNumber: "48999999999" });

    expect(response.status).toBe(429);
    expect(response.body).toEqual({ error: "rate_limited" });
  });

  it("POST /whatsapp/link/confirm links the device on the correct OTP", async () => {
    const deviceLinkToken = "44444444-4444-4444-8444-444444444444";
    await request(app.getHttpServer()).post("/whatsapp/link/request").send({ deviceLinkToken, phoneNumber: "48999999999" });
    const otp = messaging.sentMessages[messaging.sentMessages.length - 1]?.otp;

    const response = await request(app.getHttpServer()).post("/whatsapp/link/confirm").send({ deviceLinkToken, otp });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
  });

  it("POST /whatsapp/link/confirm returns 400 with error code invalid_otp on a wrong code", async () => {
    const deviceLinkToken = "55555555-5555-4555-8555-555555555555";
    await request(app.getHttpServer()).post("/whatsapp/link/request").send({ deviceLinkToken, phoneNumber: "48999999999" });

    const response = await request(app.getHttpServer())
      .post("/whatsapp/link/confirm")
      .send({ deviceLinkToken, otp: "000000" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid_otp" });
  });

  it("POST /whatsapp/link/confirm returns 400 with error code no_pending_link_request when nothing was requested", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/link/confirm")
      .send({ deviceLinkToken: "66666666-6666-4666-8666-666666666666", otp: "123456" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "no_pending_link_request" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/infrastructure/whatsapp-link.controller.test.ts`
Expected: FAIL — `whatsapp-link.controller.ts` does not exist.

- [ ] **Step 3: Write the controller**

```ts
// apps/api/src/modules/whatsapp-channel/infrastructure/whatsapp-link.controller.ts
import { BadRequestException, Body, Controller, HttpCode, HttpException, HttpStatus, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import { RequestWhatsappLinkUseCase, RateLimitedError } from "../application/use-cases/request-whatsapp-link.use-case.ts";
import {
  ConfirmWhatsappLinkUseCase,
  NoPendingLinkRequestError,
  OtpExpiredError,
  InvalidOtpError,
} from "../application/use-cases/confirm-whatsapp-link.use-case.ts";
import { InvalidPhoneNumberError } from "../application/services/normalize-phone-number.ts";

const RequestLinkSchema = z.object({
  deviceLinkToken: z.string().uuid(),
  phoneNumber: z.string().min(8),
});

const ConfirmLinkSchema = z.object({
  deviceLinkToken: z.string().uuid(),
  otp: z.string().length(6),
});

@Controller("whatsapp/link")
export class WhatsappLinkController {
  constructor(
    @Inject(RequestWhatsappLinkUseCase) private readonly requestLink: RequestWhatsappLinkUseCase,
    @Inject(ConfirmWhatsappLinkUseCase) private readonly confirmLink: ConfirmWhatsappLinkUseCase,
  ) {}

  @Post("request")
  @HttpCode(200)
  async request(@Body() body: unknown): Promise<{ success: true }> {
    const parsed = RequestLinkSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      await this.requestLink.execute(parsed.data);
      return { success: true };
    } catch (error) {
      if (error instanceof InvalidPhoneNumberError) {
        throw new BadRequestException({ error: "invalid_phone_number" });
      }
      if (error instanceof RateLimitedError) {
        throw new HttpException({ error: "rate_limited" }, HttpStatus.TOO_MANY_REQUESTS);
      }
      throw error;
    }
  }

  @Post("confirm")
  @HttpCode(200)
  async confirm(@Body() body: unknown): Promise<{ success: true }> {
    const parsed = ConfirmLinkSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      await this.confirmLink.execute(parsed.data);
      return { success: true };
    } catch (error) {
      if (error instanceof NoPendingLinkRequestError) {
        throw new BadRequestException({ error: "no_pending_link_request" });
      }
      if (error instanceof OtpExpiredError) {
        throw new BadRequestException({ error: "otp_expired" });
      }
      if (error instanceof InvalidOtpError) {
        throw new BadRequestException({ error: "invalid_otp" });
      }
      throw error;
    }
  }
}
```

- [ ] **Step 4: Run controller test to verify it passes**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/whatsapp-channel/infrastructure/whatsapp-link.controller.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write `whatsapp-channel.module.ts`**

```ts
// apps/api/src/modules/whatsapp-channel/whatsapp-channel.module.ts
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { WhatsappLinkController } from "./infrastructure/whatsapp-link.controller.ts";
import { RequestWhatsappLinkUseCase } from "./application/use-cases/request-whatsapp-link.use-case.ts";
import { ConfirmWhatsappLinkUseCase } from "./application/use-cases/confirm-whatsapp-link.use-case.ts";
import { WHATSAPP_MESSAGING_PORT } from "./application/ports/whatsapp-messaging.port.ts";
import { WHATSAPP_LINK_REPOSITORY } from "./application/ports/whatsapp-link-repository.port.ts";
import { WhatsappCloudApiAdapter } from "./infrastructure/whatsapp-providers/whatsapp-cloud-api.adapter.ts";
import { FakeWhatsappMessagingAdapter } from "./infrastructure/whatsapp-providers/fake-whatsapp-messaging.adapter.ts";
import { PrismaWhatsappLinkRepository } from "./infrastructure/persistence/prisma-whatsapp-link.repository.ts";
import { PendingLinkRequestStore } from "./application/services/pending-link-request.store.ts";
import { PhoneEncryptionService } from "./application/services/phone-encryption.service.ts";
import { PhoneBlindIndexService } from "./application/services/phone-blind-index.service.ts";

// Mirrors AI_PROVIDER=mock in chat.module.ts — only the selected adapter is
// ever instantiated, so WHATSAPP_PROVIDER=mock doesn't require Meta credentials.
const whatsappMessagingPortProvider =
  process.env.WHATSAPP_PROVIDER === "mock"
    ? { provide: WHATSAPP_MESSAGING_PORT, useClass: FakeWhatsappMessagingAdapter }
    : { provide: WHATSAPP_MESSAGING_PORT, useClass: WhatsappCloudApiAdapter };

@Module({
  imports: [ConfigModule],
  controllers: [WhatsappLinkController],
  providers: [
    RequestWhatsappLinkUseCase,
    ConfirmWhatsappLinkUseCase,
    whatsappMessagingPortProvider,
    { provide: WHATSAPP_LINK_REPOSITORY, useClass: PrismaWhatsappLinkRepository },
    PendingLinkRequestStore,
    {
      provide: PhoneEncryptionService,
      useFactory: (config: ConfigService) => new PhoneEncryptionService(config.getOrThrow<string>("PHONE_ENCRYPTION_KEY")),
      inject: [ConfigService],
    },
    {
      provide: PhoneBlindIndexService,
      useFactory: (config: ConfigService) => new PhoneBlindIndexService(config.getOrThrow<string>("PHONE_BLIND_INDEX_SECRET")),
      inject: [ConfigService],
    },
  ],
})
export class WhatsappChannelModule {}
```

- [ ] **Step 6: Wire into `app.module.ts`**

In `apps/api/src/app.module.ts`, add the import and register it alongside the other feature modules:

```ts
import { WhatsappChannelModule } from "./modules/whatsapp-channel/whatsapp-channel.module.ts";
```

Add `WhatsappChannelModule` to the `imports` array, after `ManagerModule`.

- [ ] **Step 7: Add new env vars to `.env.example`**

Append to `apps/api/.env.example`:

```
# "meta" (default) sends real WhatsApp Cloud API calls and requires the four
# WHATSAPP_* credentials below. "mock" swaps in a fake adapter for local
# dev/testing — no Meta Business verification needed.
WHATSAPP_PROVIDER=meta
WHATSAPP_CLOUD_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
PHONE_ENCRYPTION_KEY=
PHONE_BLIND_INDEX_SECRET=change-me-in-production
```

- [ ] **Step 8: Run the full backend test suite**

Run: `pnpm --filter @zelo/api test`
Expected: all tests pass, including the new `whatsapp-channel` module's tests and the existing ones (no regressions).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/whatsapp-channel apps/api/src/app.module.ts apps/api/.env.example
git commit -m "feat(api): add WhatsappLinkController and wire WhatsappChannelModule into the app"
```

---

## Task 11: Frontend `DeviceLinkTokenStorePort` + IndexedDB adapter + `GetOrCreateDeviceLinkTokenUseCase`

**Files:**
- Create: `apps/web/src/ports/device-link-token-store.port.ts`
- Create: `apps/web/src/infrastructure/storage/indexeddb-device-link-token-store.adapter.ts`
- Test: `apps/web/src/infrastructure/storage/indexeddb-device-link-token-store.adapter.test.ts`
- Create: `apps/web/src/use-cases/get-or-create-device-link-token.usecase.ts`
- Test: `apps/web/src/use-cases/get-or-create-device-link-token.usecase.test.ts`

**Interfaces:**
- Produces: `interface DeviceLinkTokenStorePort { get(): Promise<string | null>; save(token: string): Promise<void>; }`, `class GetOrCreateDeviceLinkTokenUseCase { execute(): Promise<string> }`. Tasks 13/14 depend on the use-case.
- Note: uses a **dedicated** IndexedDB database (`zelo-device-identity`), not a bumped version of the existing `zelo-assessments` database — avoids any migration risk to working assessment-history data for an unrelated concern. This deliberately reads the design spec's "same storage already used for assessment history" as "same technology/pattern (IndexedDB)", not literally the same database.

- [ ] **Step 1: Write the failing adapter test**

```ts
// apps/web/src/infrastructure/storage/indexeddb-device-link-token-store.adapter.test.ts
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IndexedDbDeviceLinkTokenStoreAdapter } from "./indexeddb-device-link-token-store.adapter";

describe("IndexedDbDeviceLinkTokenStoreAdapter", () => {
  it("returns null when no token has been saved yet", async () => {
    const adapter = new IndexedDbDeviceLinkTokenStoreAdapter();
    expect(await adapter.get()).toBeNull();
  });

  it("saves a token and returns it from get()", async () => {
    const adapter = new IndexedDbDeviceLinkTokenStoreAdapter();

    await adapter.save("11111111-1111-4111-8111-111111111111");

    expect(await adapter.get()).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("overwrites a previously saved token", async () => {
    const adapter = new IndexedDbDeviceLinkTokenStoreAdapter();
    await adapter.save("aaaaaaaa-1111-4111-8111-111111111111");

    await adapter.save("bbbbbbbb-2222-4222-8222-222222222222");

    expect(await adapter.get()).toBe("bbbbbbbb-2222-4222-8222-222222222222");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zelo/web exec vitest run src/infrastructure/storage/indexeddb-device-link-token-store.adapter.test.ts`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Write the port and adapter**

```ts
// apps/web/src/ports/device-link-token-store.port.ts
export interface DeviceLinkTokenStorePort {
  get(): Promise<string | null>;
  save(token: string): Promise<void>;
}
```

```ts
// apps/web/src/infrastructure/storage/indexeddb-device-link-token-store.adapter.ts
import type { DeviceLinkTokenStorePort } from "@/ports/device-link-token-store.port";

const DB_NAME = "zelo-device-identity";
const STORE_NAME = "tokens";
const RECORD_KEY = "device-link-token";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDbDeviceLinkTokenStoreAdapter implements DeviceLinkTokenStorePort {
  async get(): Promise<string | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async save(token: string): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(token, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zelo/web exec vitest run src/infrastructure/storage/indexeddb-device-link-token-store.adapter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing use-case test**

```ts
// apps/web/src/use-cases/get-or-create-device-link-token.usecase.test.ts
import { describe, expect, it, vi } from "vitest";
import { GetOrCreateDeviceLinkTokenUseCase } from "./get-or-create-device-link-token.usecase";
import type { DeviceLinkTokenStorePort } from "@/ports/device-link-token-store.port";

class FakeDeviceLinkTokenStore implements DeviceLinkTokenStorePort {
  public token: string | null = null;
  async get(): Promise<string | null> {
    return this.token;
  }
  async save(token: string): Promise<void> {
    this.token = token;
  }
}

describe("GetOrCreateDeviceLinkTokenUseCase", () => {
  it("returns the existing token without creating a new one", async () => {
    const store = new FakeDeviceLinkTokenStore();
    store.token = "existing-token";
    const useCase = new GetOrCreateDeviceLinkTokenUseCase(store);

    const result = await useCase.execute();

    expect(result).toBe("existing-token");
  });

  it("generates and saves a new UUID token when none exists", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
    const store = new FakeDeviceLinkTokenStore();
    const useCase = new GetOrCreateDeviceLinkTokenUseCase(store);

    const result = await useCase.execute();

    expect(result).toBe("11111111-1111-4111-8111-111111111111");
    expect(store.token).toBe("11111111-1111-4111-8111-111111111111");
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @zelo/web exec vitest run src/use-cases/get-or-create-device-link-token.usecase.test.ts`
Expected: FAIL — file does not exist.

- [ ] **Step 7: Write the use-case**

```ts
// apps/web/src/use-cases/get-or-create-device-link-token.usecase.ts
import type { DeviceLinkTokenStorePort } from "@/ports/device-link-token-store.port";

export class GetOrCreateDeviceLinkTokenUseCase {
  constructor(private readonly store: DeviceLinkTokenStorePort) {}

  async execute(): Promise<string> {
    const existing = await this.store.get();
    if (existing) return existing;

    const token = crypto.randomUUID();
    await this.store.save(token);
    return token;
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @zelo/web exec vitest run src/use-cases/get-or-create-device-link-token.usecase.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/ports/device-link-token-store.port.ts apps/web/src/infrastructure/storage/indexeddb-device-link-token-store.adapter.ts apps/web/src/infrastructure/storage/indexeddb-device-link-token-store.adapter.test.ts apps/web/src/use-cases/get-or-create-device-link-token.usecase.ts apps/web/src/use-cases/get-or-create-device-link-token.usecase.test.ts
git commit -m "feat(web): add device link token storage and get-or-create use-case"
```

---

## Task 12: Frontend `WhatsappLinkPort` + `HttpWhatsappLinkAdapter`

**Files:**
- Create: `apps/web/src/ports/whatsapp-link.port.ts`
- Create: `apps/web/src/infrastructure/http/http-whatsapp-link.adapter.ts`
- Test: `apps/web/src/infrastructure/http/http-whatsapp-link.adapter.test.ts`

**Interfaces:**
- Produces: `interface WhatsappLinkPort { requestLink(params): Promise<void>; confirmLink(params): Promise<void>; }` plus error classes `RateLimitedError`, `InvalidPhoneNumberError`, `InvalidOtpError`, `OtpExpiredError`, `NoPendingLinkRequestError`. Task 13 depends on all of these. Error-code strings must match Task 10's controller exactly: `invalid_phone_number`, `rate_limited` (429 status), `no_pending_link_request`, `otp_expired`, `invalid_otp`.

- [ ] **Step 1: Write the port and errors**

```ts
// apps/web/src/ports/whatsapp-link.port.ts
export class RateLimitedError extends Error {}
export class InvalidPhoneNumberError extends Error {}
export class InvalidOtpError extends Error {}
export class OtpExpiredError extends Error {}
export class NoPendingLinkRequestError extends Error {}

export interface WhatsappLinkPort {
  requestLink(params: { deviceLinkToken: string; phoneNumber: string }): Promise<void>;
  confirmLink(params: { deviceLinkToken: string; otp: string }): Promise<void>;
}
```

- [ ] **Step 2: Write the failing adapter test**

```ts
// apps/web/src/infrastructure/http/http-whatsapp-link.adapter.test.ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { HttpWhatsappLinkAdapter } from "./http-whatsapp-link.adapter";
import {
  RateLimitedError,
  InvalidPhoneNumberError,
  InvalidOtpError,
  OtpExpiredError,
  NoPendingLinkRequestError,
} from "@/ports/whatsapp-link.port";

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpWhatsappLinkAdapter", () => {
  it("resolves on a successful requestLink call", async () => {
    mockFetchOnce(200, { success: true });
    const adapter = new HttpWhatsappLinkAdapter();

    await expect(
      adapter.requestLink({ deviceLinkToken: "device-1", phoneNumber: "+5548999999999" }),
    ).resolves.toBeUndefined();
  });

  it("throws InvalidPhoneNumberError for error code invalid_phone_number", async () => {
    mockFetchOnce(400, { error: "invalid_phone_number" });
    const adapter = new HttpWhatsappLinkAdapter();

    await expect(
      adapter.requestLink({ deviceLinkToken: "device-1", phoneNumber: "123" }),
    ).rejects.toBeInstanceOf(InvalidPhoneNumberError);
  });

  it("throws RateLimitedError for a 429 response", async () => {
    mockFetchOnce(429, { error: "rate_limited" });
    const adapter = new HttpWhatsappLinkAdapter();

    await expect(
      adapter.requestLink({ deviceLinkToken: "device-1", phoneNumber: "+5548999999999" }),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("resolves on a successful confirmLink call", async () => {
    mockFetchOnce(200, { success: true });
    const adapter = new HttpWhatsappLinkAdapter();

    await expect(adapter.confirmLink({ deviceLinkToken: "device-1", otp: "123456" })).resolves.toBeUndefined();
  });

  it("throws InvalidOtpError for error code invalid_otp", async () => {
    mockFetchOnce(400, { error: "invalid_otp" });
    const adapter = new HttpWhatsappLinkAdapter();

    await expect(adapter.confirmLink({ deviceLinkToken: "device-1", otp: "000000" })).rejects.toBeInstanceOf(
      InvalidOtpError,
    );
  });

  it("throws OtpExpiredError for error code otp_expired", async () => {
    mockFetchOnce(400, { error: "otp_expired" });
    const adapter = new HttpWhatsappLinkAdapter();

    await expect(adapter.confirmLink({ deviceLinkToken: "device-1", otp: "123456" })).rejects.toBeInstanceOf(
      OtpExpiredError,
    );
  });

  it("throws NoPendingLinkRequestError for error code no_pending_link_request", async () => {
    mockFetchOnce(400, { error: "no_pending_link_request" });
    const adapter = new HttpWhatsappLinkAdapter();

    await expect(adapter.confirmLink({ deviceLinkToken: "device-1", otp: "123456" })).rejects.toBeInstanceOf(
      NoPendingLinkRequestError,
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @zelo/web exec vitest run src/infrastructure/http/http-whatsapp-link.adapter.test.ts`
Expected: FAIL — `http-whatsapp-link.adapter.ts` does not exist.

- [ ] **Step 4: Write the adapter**

```ts
// apps/web/src/infrastructure/http/http-whatsapp-link.adapter.ts
import type { WhatsappLinkPort } from "@/ports/whatsapp-link.port";
import {
  RateLimitedError,
  InvalidPhoneNumberError,
  InvalidOtpError,
  OtpExpiredError,
  NoPendingLinkRequestError,
} from "@/ports/whatsapp-link.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

async function throwForResponse(response: Response): Promise<never> {
  if (response.status === 429) throw new RateLimitedError();

  const body = (await response.json()) as { error?: string };
  if (body.error === "invalid_phone_number") throw new InvalidPhoneNumberError();
  if (body.error === "invalid_otp") throw new InvalidOtpError();
  if (body.error === "otp_expired") throw new OtpExpiredError();
  if (body.error === "no_pending_link_request") throw new NoPendingLinkRequestError();
  throw new Error(`WhatsApp link request failed with status ${response.status}`);
}

export class HttpWhatsappLinkAdapter implements WhatsappLinkPort {
  async requestLink(params: { deviceLinkToken: string; phoneNumber: string }): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/whatsapp/link/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok) await throwForResponse(response);
  }

  async confirmLink(params: { deviceLinkToken: string; otp: string }): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/whatsapp/link/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok) await throwForResponse(response);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @zelo/web exec vitest run src/infrastructure/http/http-whatsapp-link.adapter.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ports/whatsapp-link.port.ts apps/web/src/infrastructure/http/http-whatsapp-link.adapter.ts apps/web/src/infrastructure/http/http-whatsapp-link.adapter.test.ts
git commit -m "feat(web): add WhatsappLinkPort and HTTP adapter"
```

---

## Task 13: `RequestWhatsappLinkUseCase` + `ConfirmWhatsappLinkUseCase` (frontend)

**Files:**
- Create: `apps/web/src/use-cases/request-whatsapp-link.usecase.ts`
- Test: `apps/web/src/use-cases/request-whatsapp-link.usecase.test.ts`
- Create: `apps/web/src/use-cases/confirm-whatsapp-link.usecase.ts`
- Test: `apps/web/src/use-cases/confirm-whatsapp-link.usecase.test.ts`

**Interfaces:**
- Consumes: `WhatsappLinkPort` (Task 12), `GetOrCreateDeviceLinkTokenUseCase` (Task 11).
- Produces: `class RequestWhatsappLinkUseCase { execute(phoneNumber: string): Promise<void> }`, `class ConfirmWhatsappLinkUseCase { execute(otp: string): Promise<void> }`. Task 14's hooks depend on both.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/use-cases/request-whatsapp-link.usecase.test.ts
import { describe, expect, it } from "vitest";
import { RequestWhatsappLinkUseCase } from "./request-whatsapp-link.usecase";
import { GetOrCreateDeviceLinkTokenUseCase } from "./get-or-create-device-link-token.usecase";
import type { WhatsappLinkPort } from "@/ports/whatsapp-link.port";
import type { DeviceLinkTokenStorePort } from "@/ports/device-link-token-store.port";

class FakeWhatsappLinkPort implements WhatsappLinkPort {
  public lastRequest: { deviceLinkToken: string; phoneNumber: string } | undefined;
  async requestLink(params: { deviceLinkToken: string; phoneNumber: string }): Promise<void> {
    this.lastRequest = params;
  }
  async confirmLink(): Promise<void> {}
}

class FakeDeviceLinkTokenStore implements DeviceLinkTokenStorePort {
  public token: string | null = "device-1";
  async get(): Promise<string | null> {
    return this.token;
  }
  async save(token: string): Promise<void> {
    this.token = token;
  }
}

describe("RequestWhatsappLinkUseCase", () => {
  it("gets (or creates) the device link token and requests a link for the given phone number", async () => {
    const port = new FakeWhatsappLinkPort();
    const useCase = new RequestWhatsappLinkUseCase(port, new GetOrCreateDeviceLinkTokenUseCase(new FakeDeviceLinkTokenStore()));

    await useCase.execute("+5548999999999");

    expect(port.lastRequest).toEqual({ deviceLinkToken: "device-1", phoneNumber: "+5548999999999" });
  });
});
```

```ts
// apps/web/src/use-cases/confirm-whatsapp-link.usecase.test.ts
import { describe, expect, it } from "vitest";
import { ConfirmWhatsappLinkUseCase } from "./confirm-whatsapp-link.usecase";
import { GetOrCreateDeviceLinkTokenUseCase } from "./get-or-create-device-link-token.usecase";
import type { WhatsappLinkPort } from "@/ports/whatsapp-link.port";
import type { DeviceLinkTokenStorePort } from "@/ports/device-link-token-store.port";

class FakeWhatsappLinkPort implements WhatsappLinkPort {
  public lastConfirm: { deviceLinkToken: string; otp: string } | undefined;
  async requestLink(): Promise<void> {}
  async confirmLink(params: { deviceLinkToken: string; otp: string }): Promise<void> {
    this.lastConfirm = params;
  }
}

class FakeDeviceLinkTokenStore implements DeviceLinkTokenStorePort {
  public token: string | null = "device-1";
  async get(): Promise<string | null> {
    return this.token;
  }
  async save(token: string): Promise<void> {
    this.token = token;
  }
}

describe("ConfirmWhatsappLinkUseCase", () => {
  it("gets the device link token and confirms the link with the given OTP", async () => {
    const port = new FakeWhatsappLinkPort();
    const useCase = new ConfirmWhatsappLinkUseCase(port, new GetOrCreateDeviceLinkTokenUseCase(new FakeDeviceLinkTokenStore()));

    await useCase.execute("123456");

    expect(port.lastConfirm).toEqual({ deviceLinkToken: "device-1", otp: "123456" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zelo/web exec vitest run src/use-cases/request-whatsapp-link.usecase.test.ts src/use-cases/confirm-whatsapp-link.usecase.test.ts`
Expected: FAIL — neither implementation file exists.

- [ ] **Step 3: Write the implementations**

```ts
// apps/web/src/use-cases/request-whatsapp-link.usecase.ts
import type { WhatsappLinkPort } from "@/ports/whatsapp-link.port";
import type { GetOrCreateDeviceLinkTokenUseCase } from "./get-or-create-device-link-token.usecase";

export class RequestWhatsappLinkUseCase {
  constructor(
    private readonly whatsappLink: WhatsappLinkPort,
    private readonly getOrCreateDeviceLinkToken: GetOrCreateDeviceLinkTokenUseCase,
  ) {}

  async execute(phoneNumber: string): Promise<void> {
    const deviceLinkToken = await this.getOrCreateDeviceLinkToken.execute();
    await this.whatsappLink.requestLink({ deviceLinkToken, phoneNumber });
  }
}
```

```ts
// apps/web/src/use-cases/confirm-whatsapp-link.usecase.ts
import type { WhatsappLinkPort } from "@/ports/whatsapp-link.port";
import type { GetOrCreateDeviceLinkTokenUseCase } from "./get-or-create-device-link-token.usecase";

export class ConfirmWhatsappLinkUseCase {
  constructor(
    private readonly whatsappLink: WhatsappLinkPort,
    private readonly getOrCreateDeviceLinkToken: GetOrCreateDeviceLinkTokenUseCase,
  ) {}

  async execute(otp: string): Promise<void> {
    const deviceLinkToken = await this.getOrCreateDeviceLinkToken.execute();
    await this.whatsappLink.confirmLink({ deviceLinkToken, otp });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @zelo/web exec vitest run src/use-cases/request-whatsapp-link.usecase.test.ts src/use-cases/confirm-whatsapp-link.usecase.test.ts`
Expected: PASS (2 tests total).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/use-cases/request-whatsapp-link.usecase.ts apps/web/src/use-cases/request-whatsapp-link.usecase.test.ts apps/web/src/use-cases/confirm-whatsapp-link.usecase.ts apps/web/src/use-cases/confirm-whatsapp-link.usecase.test.ts
git commit -m "feat(web): add RequestWhatsappLinkUseCase and ConfirmWhatsappLinkUseCase"
```

---

## Task 14: `useRequestWhatsappLink` + `useConfirmWhatsappLink` hooks + container wiring

**Files:**
- Create: `apps/web/src/presentation/hooks/useRequestWhatsappLink.ts`
- Create: `apps/web/src/presentation/hooks/useConfirmWhatsappLink.ts`
- Modify: `apps/web/src/app/container.ts`

**Interfaces:**
- Consumes: `requestWhatsappLinkUseCase`/`confirmWhatsappLinkUseCase` singletons (registered on `container.ts` in this task).
- Produces: `useRequestWhatsappLink()` → TanStack Query `useMutation` over `(phoneNumber: string) => Promise<void>`; `useConfirmWhatsappLink()` → `useMutation` over `(otp: string) => Promise<void>`. Task 15's page depends on both hooks.

No dedicated test file for this task — hooks that are thin `useMutation` wrappers (like `useManagerLogin`) are exercised indirectly through the page test in Task 15, matching the existing convention (there is no `useManagerLogin.test.ts` in the codebase either).

- [ ] **Step 1: Register the new use-cases in `container.ts`**

In `apps/web/src/app/container.ts`, add these imports near the other use-case/adapter imports:

```ts
import { RequestWhatsappLinkUseCase } from "@/use-cases/request-whatsapp-link.usecase";
import { ConfirmWhatsappLinkUseCase } from "@/use-cases/confirm-whatsapp-link.usecase";
import { GetOrCreateDeviceLinkTokenUseCase } from "@/use-cases/get-or-create-device-link-token.usecase";
import { HttpWhatsappLinkAdapter } from "@/infrastructure/http/http-whatsapp-link.adapter";
import { IndexedDbDeviceLinkTokenStoreAdapter } from "@/infrastructure/storage/indexeddb-device-link-token-store.adapter";
```

Add these singleton exports at the end of the file:

```ts
const getOrCreateDeviceLinkTokenUseCase = new GetOrCreateDeviceLinkTokenUseCase(
  new IndexedDbDeviceLinkTokenStoreAdapter(),
);
export const requestWhatsappLinkUseCase = new RequestWhatsappLinkUseCase(
  new HttpWhatsappLinkAdapter(),
  getOrCreateDeviceLinkTokenUseCase,
);
export const confirmWhatsappLinkUseCase = new ConfirmWhatsappLinkUseCase(
  new HttpWhatsappLinkAdapter(),
  getOrCreateDeviceLinkTokenUseCase,
);
```

- [ ] **Step 2: Write `useRequestWhatsappLink`**

```ts
// apps/web/src/presentation/hooks/useRequestWhatsappLink.ts
import { useMutation } from "@tanstack/react-query";
import { requestWhatsappLinkUseCase } from "@/app/container";

export function useRequestWhatsappLink() {
  return useMutation({
    mutationFn: (phoneNumber: string) => requestWhatsappLinkUseCase.execute(phoneNumber),
  });
}
```

- [ ] **Step 3: Write `useConfirmWhatsappLink`**

```ts
// apps/web/src/presentation/hooks/useConfirmWhatsappLink.ts
import { useMutation } from "@tanstack/react-query";
import { confirmWhatsappLinkUseCase } from "@/app/container";

export function useConfirmWhatsappLink() {
  return useMutation({
    mutationFn: (otp: string) => confirmWhatsappLinkUseCase.execute(otp),
  });
}
```

- [ ] **Step 4: Verify the project still type-checks**

Run: `pnpm --filter @zelo/web exec tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/container.ts apps/web/src/presentation/hooks/useRequestWhatsappLink.ts apps/web/src/presentation/hooks/useConfirmWhatsappLink.ts
git commit -m "feat(web): wire WhatsApp link use-cases into container and add mutation hooks"
```

---

## Task 15: `WhatsappLinkPage` + route + `YouPage` entry point + a11y sweep

**Files:**
- Create: `apps/web/src/presentation/pages/WhatsappLinkPage.tsx`
- Test: `apps/web/src/presentation/pages/WhatsappLinkPage.test.tsx`
- Modify: `apps/web/src/presentation/lib/routes.ts`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/presentation/pages/YouPage.tsx`
- Modify: `apps/web/src/presentation/pages/a11y.test.tsx`

**Interfaces:**
- Consumes: `useRequestWhatsappLink`, `useConfirmWhatsappLink` (Task 14); errors `InvalidPhoneNumberError`, `RateLimitedError`, `InvalidOtpError`, `OtpExpiredError`, `NoPendingLinkRequestError` (Task 12, for copy branching).

- [ ] **Step 1: Add the route constant**

In `apps/web/src/presentation/lib/routes.ts`, add `whatsappLink: "/you/whatsapp"` to the `routes` object (alongside `you`).

- [ ] **Step 2: Register the route**

In `apps/web/src/app/router.tsx`, add the import `import { WhatsappLinkPage } from "@/presentation/pages/WhatsappLinkPage";` and add `{ path: "you/whatsapp", Component: WhatsappLinkPage }` to `routeChildren`, after the `"you"` entry.

- [ ] **Step 3: Write the failing page test**

```tsx
// apps/web/src/presentation/pages/WhatsappLinkPage.test.tsx
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WhatsappLinkPage } from "./WhatsappLinkPage";
import * as container from "@/app/container";
import { InvalidPhoneNumberError, InvalidOtpError } from "@/ports/whatsapp-link.port";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/you/whatsapp"]}>
        <Routes>
          <Route path="/you/whatsapp" element={<WhatsappLinkPage />} />
          <Route path="/you" element={<div>You screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WhatsappLinkPage", () => {
  it("submits a phone number and advances to the OTP step on success", async () => {
    vi.spyOn(container.requestWhatsappLinkUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/número de whatsapp/i), "48999999999");
    await user.click(screen.getByRole("button", { name: /enviar código/i }));

    expect(await screen.findByLabelText(/código recebido/i)).toBeInTheDocument();
  });

  it("shows an inline error for an invalid phone number and stays on the phone step", async () => {
    vi.spyOn(container.requestWhatsappLinkUseCase, "execute").mockRejectedValue(new InvalidPhoneNumberError());
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/número de whatsapp/i), "123");
    await user.click(screen.getByRole("button", { name: /enviar código/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/número de whatsapp inválido/i);
  });

  it("confirms the OTP and shows a success state", async () => {
    vi.spyOn(container.requestWhatsappLinkUseCase, "execute").mockResolvedValue(undefined);
    vi.spyOn(container.confirmWhatsappLinkUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/número de whatsapp/i), "48999999999");
    await user.click(screen.getByRole("button", { name: /enviar código/i }));
    await user.type(await screen.findByLabelText(/código recebido/i), "123456");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(await screen.findByText(/whatsapp vinculado/i)).toBeInTheDocument();
  });

  it("shows an inline error for a wrong OTP and stays on the OTP step", async () => {
    vi.spyOn(container.requestWhatsappLinkUseCase, "execute").mockResolvedValue(undefined);
    vi.spyOn(container.confirmWhatsappLinkUseCase, "execute").mockRejectedValue(new InvalidOtpError());
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/número de whatsapp/i), "48999999999");
    await user.click(screen.getByRole("button", { name: /enviar código/i }));
    await user.type(await screen.findByLabelText(/código recebido/i), "000000");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/código incorreto/i);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/WhatsappLinkPage.test.tsx`
Expected: FAIL — `WhatsappLinkPage.tsx` does not exist.

- [ ] **Step 5: Write the page**

```tsx
// apps/web/src/presentation/pages/WhatsappLinkPage.tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { useRequestWhatsappLink } from "@/presentation/hooks/useRequestWhatsappLink";
import { useConfirmWhatsappLink } from "@/presentation/hooks/useConfirmWhatsappLink";
import {
  InvalidPhoneNumberError,
  RateLimitedError,
  InvalidOtpError,
  OtpExpiredError,
  NoPendingLinkRequestError,
} from "@/ports/whatsapp-link.port";

type Step = "phone" | "otp" | "success";

function requestErrorMessage(error: unknown): string {
  if (error instanceof InvalidPhoneNumberError) return "Número de WhatsApp inválido.";
  if (error instanceof RateLimitedError) return "Aguarde um pouco antes de pedir um novo código.";
  return "Não foi possível enviar o código agora. Tente novamente.";
}

function confirmErrorMessage(error: unknown): string {
  if (error instanceof InvalidOtpError) return "Código incorreto.";
  if (error instanceof OtpExpiredError) return "Esse código expirou. Peça um novo.";
  if (error instanceof NoPendingLinkRequestError) return "Peça um novo código antes de confirmar.";
  return "Não foi possível confirmar agora. Tente novamente.";
}

export function WhatsappLinkPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const requestLink = useRequestWhatsappLink();
  const confirmLink = useConfirmWhatsappLink();

  const handleRequestSubmit = (event: FormEvent) => {
    event.preventDefault();
    requestLink.mutate(phoneNumber, { onSuccess: () => setStep("otp") });
  };

  const handleConfirmSubmit = (event: FormEvent) => {
    event.preventDefault();
    confirmLink.mutate(otp, { onSuccess: () => setStep("success") });
  };

  return (
    <PhoneShell centered>
      <div className="pt-[30px]">
        <BackButton label="Você" onClick={() => navigate(routes.you)} />
        <h1 className="mb-[6px] mt-4 text-h1 text-ink">Vincular WhatsApp</h1>

        {step === "phone" && (
          <form onSubmit={handleRequestSubmit}>
            <p className="text-caption text-muted">
              Vamos enviar um código por WhatsApp para confirmar que o número é seu.
            </p>
            <Card className="mt-5">
              <label htmlFor="phone-number" className="text-label font-semibold text-ink-2">
                Número de WhatsApp
              </label>
              <input
                id="phone-number"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="(48) 99999-9999"
                className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
              {requestLink.isError && (
                <p role="alert" className="mt-2 text-label text-danger">
                  {requestErrorMessage(requestLink.error)}
                </p>
              )}
            </Card>
            <div className="mt-[24px]">
              <Button type="submit" variant="primary" loading={requestLink.isPending} disabled={phoneNumber.trim().length === 0}>
                Enviar código
              </Button>
            </div>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleConfirmSubmit}>
            <p className="text-caption text-muted">Digite o código de 6 dígitos que chegou no seu WhatsApp.</p>
            <Card className="mt-5">
              <label htmlFor="otp-code" className="text-label font-semibold text-ink-2">
                Código recebido
              </label>
              <input
                id="otp-code"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                placeholder="000000"
                inputMode="numeric"
                className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
              {confirmLink.isError && (
                <p role="alert" className="mt-2 text-label text-danger">
                  {confirmErrorMessage(confirmLink.error)}
                </p>
              )}
            </Card>
            <div className="mt-[24px]">
              <Button type="submit" variant="primary" loading={confirmLink.isPending} disabled={otp.trim().length !== 6}>
                Confirmar
              </Button>
            </div>
          </form>
        )}

        {step === "success" && (
          <Card tone="brand-tint" className="mt-5">
            <p className="text-body font-extrabold text-ink">WhatsApp vinculado!</p>
            <p className="mt-1 text-label text-ink-2">
              Agora você também pode conversar com o Zelo e receber o acompanhamento por lá.
            </p>
            <div className="mt-4">
              <Button variant="primary" onClick={() => navigate(routes.you)}>
                Voltar
              </Button>
            </div>
          </Card>
        )}
      </div>
    </PhoneShell>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/WhatsappLinkPage.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Add an entry point from `YouPage`**

In `apps/web/src/presentation/pages/YouPage.tsx`, add a new `Card` (or `Button`) between the "Consentimento ativo" card and the "Revogar" section, navigating to `routes.whatsappLink`:

```tsx
<Card size="md" className="mt-[14px]">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-body font-extrabold text-ink">Vincular WhatsApp</p>
      <p className="text-caption text-muted">Converse com o Zelo também pelo WhatsApp.</p>
    </div>
    <Button variant="outline" full={false} onClick={() => navigate(routes.whatsappLink)}>
      Vincular
    </Button>
  </div>
</Card>
```

- [ ] **Step 8: Add `WhatsappLinkPage` to the a11y sweep**

In `apps/web/src/presentation/pages/a11y.test.tsx`, add the import `import { WhatsappLinkPage } from "./WhatsappLinkPage";` and add `{ name: "WhatsappLink", Component: WhatsappLinkPage, path: "/you/whatsapp" }` to the `SCREENS` array, after the `"You"` entry.

- [ ] **Step 9: Run the full frontend test suite**

Run: `pnpm --filter @zelo/web test`
Expected: all tests pass, including the a11y sweep (no axe violations on `WhatsappLinkPage`) and `router.test.tsx` (confirm it doesn't hard-code a route count that would now be stale — if it does, update it).

- [ ] **Step 10: Manually verify in the browser**

Run: `pnpm --filter @zelo/web dev`, open `/you`, click "Vincular", submit a phone number with `WHATSAPP_PROVIDER=mock` set on the API — confirm the OTP step appears, and check the API logs/`FakeWhatsappMessagingAdapter` for the generated OTP to complete the flow manually.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/presentation/pages/WhatsappLinkPage.tsx apps/web/src/presentation/pages/WhatsappLinkPage.test.tsx apps/web/src/presentation/lib/routes.ts apps/web/src/app/router.tsx apps/web/src/presentation/pages/YouPage.tsx apps/web/src/presentation/pages/a11y.test.tsx
git commit -m "feat(web): add WhatsappLinkPage, route, and YouPage entry point"
```

---

## Self-Review Notes

- **Spec coverage**: This plan covers spec §3 (new module structure, `WhatsappLink` model, encryption/blind-index), §4 (linking flow) in full. Spec §5 (webhook conversation), §6 (follow-up job), and §2's crisis-direction reuse are explicitly out of scope — Plans B, C, D.
- **Deviations from the spec's literal wording, called out explicitly**: (1) phone encryption is a *new* server-held-key mechanism, not a reuse of the client-side WebCrypto pattern the spec's prose implies; (2) the pending OTP request is held in-memory, not in a Prisma table, since it's short-lived and this is a single-instance deployment; (3) `deviceLinkToken` gets its own dedicated IndexedDB database rather than sharing the assessment-history database's object store, to avoid any migration risk to unrelated existing data.
- **Type consistency check**: `WhatsappLinkRecord`/`WhatsappLinkRepository.save()` (Task 6) is the exact type `ConfirmWhatsappLinkUseCase` (Task 9) constructs and passes; `PendingLinkRequest` (Task 5) is the exact type both `RequestWhatsappLinkUseCase` (Task 8, producer) and `ConfirmWhatsappLinkUseCase` (Task 9, consumer) share; frontend error class names and controller error-code strings were cross-checked between Task 10 and Task 12.
