# Email-Based Login and Account Invites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `Manager`, `PeerPartner`, and `SuperAdmin` login from `name` to `email`, and replace the "admin sees a generated temporary password" account-creation/reset flow with an emailed set-password link the person completes themselves.

**Architecture:** `Manager` and `PeerPartner` each gain `email` (unique, login key), a nullable `passwordHash` (null until the person sets their own password), and a `setPasswordToken`/`setPasswordTokenExpiresAt` pair. One action — "send a set-password email" — covers both inviting a new account and resetting an existing one; only the email copy differs, chosen by whether the account currently has a password. A new shared `EmailPort` (Resend adapter + a console-logging mock adapter for local dev, selected via `EMAIL_PROVIDER`) sends the emails. `SuperAdmin` only gains `email` as its login key — it stays seed-only bootstrap, no invite flow.

**Tech Stack:** NestJS + Prisma (backend), React 18 + Vite + TanStack Query + Zustand + react-router (frontend), Resend (`resend` npm package) for real email delivery, Vitest, Node `crypto` (`randomBytes` for opaque set-password tokens).

## Global Constraints

- Every new file follows the exact conventions already in this codebase: kebab-case files with role suffixes (`*.use-case.ts`, `*.port.ts`, `*.repository.ts`, `*.service.ts`, `*.controller.ts`, `*.adapter.ts`, `*.module.ts`), PascalCase classes, DI tokens as `Symbol("SCREAMING_SNAKE_NAME")` exported alongside the port interface, tests co-located as `*.test.ts`, explicit `.ts` import extensions (ESM) on the backend, no extension on the frontend (`@/...` alias).
- **Every NestJS constructor parameter needs an explicit `@Inject(ClassName)` or `@Inject(SYMBOL_TOKEN)` decorator, even for concrete (non-interface) classes** — a bare parameter fails NestJS DI at runtime under this repo's esbuild-based test transform, which doesn't reliably emit `design:paramtypes` metadata. Every task below already includes `@Inject` on every constructor parameter in its code samples — copy them exactly, don't drop the decorators.
- **Login security:** every login use-case must reject on unknown email, wrong password, inactive account, AND an account with no password set (pending invite) with the exact same `InvalidXCredentialsError`, paying the same password-verification cost in every case (the existing `DUMMY_PASSWORD_HASH` constant-time pattern, unchanged). Never let a response distinguish "no such email" from "email exists but is pending" from "wrong password."
- **Set-password token:** a random opaque token via `randomBytes(32).toString("hex")` (not a signed/stateless token — it's looked up directly in the database and invalidated after use), 48-hour expiry.
- **Clean-cutover migration, no backfill:** `managers`, `peer_partners`, `super_admins` are demo-only local data with no real end users. The migration in Task 1 drops and recreates these three tables rather than backfilling existing rows — matching this project's established precedent for schema changes over existing dev data (the earlier `Signal.department` → `sectorId` cutover).
- **`name` is no longer globally unique** on `Manager`, `PeerPartner`, or `SuperAdmin` — `email` takes over as the unique login identity; `name` becomes a plain display field.
- No templating engine for emails — two short server-rendered HTML strings (`invite`, `password-reset`) are enough.
- No invite/reset flow for `SuperAdmin` — it has no creation UI today and none is added; it stays seed-only bootstrap, now seeded with an `email` field too.
- Full spec: `docs/superpowers/specs/2026-08-03-email-based-login-and-account-invites-design.md`.

---

### Task 1: Prisma schema + clean-cutover migration

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260803120000_email_login_and_invites/migration.sql`

**Interfaces:**

- Produces (used by every later task): `Manager { id, name, email (unique), passwordHash (nullable), setPasswordToken (nullable, unique), setPasswordTokenExpiresAt (nullable), institutionId, role, isActive, createdAt }`; `PeerPartner { id, name, email (unique), passwordHash (nullable), setPasswordToken (nullable, unique), setPasswordTokenExpiresAt (nullable), institutionId, specialty, isActive, createdAt }`; `SuperAdmin { id, name, email (unique), passwordHash, createdAt }`.

- [ ] **Step 1: Update the schema**

In `apps/api/prisma/schema.prisma`, replace the `Manager` model with:

```prisma
model Manager {
  id                        String      @id @default(cuid())
  name                      String
  email                     String      @unique
  passwordHash              String?
  setPasswordToken          String?     @unique
  setPasswordTokenExpiresAt DateTime?
  institutionId             String
  institution               Institution @relation(fields: [institutionId], references: [id])
  role                       ManagerRole @default(HOSPITAL_ADMIN)
  isActive                  Boolean     @default(true)
  createdAt                 DateTime    @default(now())

  sectors       Sector[]

  @@map("managers")
}
```

Replace the `PeerPartner` model with:

```prisma
model PeerPartner {
  id                        String      @id @default(cuid())
  name                      String
  email                     String      @unique
  passwordHash              String?
  setPasswordToken          String?     @unique
  setPasswordTokenExpiresAt DateTime?
  institutionId             String
  institution               Institution @relation(fields: [institutionId], references: [id])
  specialty                 String
  isActive                  Boolean     @default(true)
  createdAt                 DateTime    @default(now())

  @@map("peer_partners")
}
```

Replace the `SuperAdmin` model with:

```prisma
model SuperAdmin {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())

  @@map("super_admins")
}
```

- [ ] **Step 2: Write the migration by hand**

Local Postgres must be running: `docker compose -f docker/docker-compose.yml up -d postgres` (or confirm the `zelo-postgres` container is already up).

Create `apps/api/prisma/migrations/20260803120000_email_login_and_invites/migration.sql`:

```sql
-- DropForeignKey (must drop before dropping managers — sectors.managerId FKs into it)
ALTER TABLE "sectors" DROP CONSTRAINT "sectors_managerId_fkey";

-- DropTable managers, peer_partners, super_admins (demo-only, disposable data — clean cutover, no backfill, re-seeded after this migration)
DROP TABLE "managers";
DROP TABLE "peer_partners";
DROP TABLE "super_admins";

-- CreateTable managers (name no longer unique — display field only; email is the login identity; passwordHash nullable until invite/reset is completed)
CREATE TABLE "managers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "setPasswordToken" TEXT,
    "setPasswordTokenExpiresAt" TIMESTAMP(3),
    "institutionId" TEXT NOT NULL,
    "role" "ManagerRole" NOT NULL DEFAULT 'HOSPITAL_ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "managers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "managers_email_key" ON "managers"("email");
CREATE UNIQUE INDEX "managers_setPasswordToken_key" ON "managers"("setPasswordToken");
ALTER TABLE "managers" ADD CONSTRAINT "managers_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable peer_partners (name no longer unique; email is the login identity; passwordHash nullable until invite/reset is completed)
CREATE TABLE "peer_partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "setPasswordToken" TEXT,
    "setPasswordTokenExpiresAt" TIMESTAMP(3),
    "institutionId" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "peer_partners_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "peer_partners_email_key" ON "peer_partners"("email");
CREATE UNIQUE INDEX "peer_partners_setPasswordToken_key" ON "peer_partners"("setPasswordToken");
ALTER TABLE "peer_partners" ADD CONSTRAINT "peer_partners_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable super_admins (name no longer unique; email is the login identity — seed-only bootstrap, no invite flow, passwordHash stays required)
CREATE TABLE "super_admins" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "super_admins_email_key" ON "super_admins"("email");

-- Re-add the FK sectors.managerId -> managers.id (same shape as before, pointing at the recreated table)
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

From `apps/api/`, apply it:

```bash
DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
DIRECT_DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
pnpm exec prisma migrate resolve --applied 20260803120000_email_login_and_invites || true
```

That command is a no-op safety net if the migration was already recorded; the actual apply happens via the normal dev flow:

```bash
DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
DIRECT_DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public" \
pnpm exec prisma migrate dev
```

Prisma will detect the hand-written migration directory already matches the schema and apply it (or report it as already applied if you ran it once during authoring — either way, confirm with Step 3 below).

- [ ] **Step 3: Verify**

```bash
docker exec zelo-postgres psql -U zelo -d zelo -c "\d managers"
docker exec zelo-postgres psql -U zelo -d zelo -c "\d peer_partners"
docker exec zelo-postgres psql -U zelo -d zelo -c "\d super_admins"
```

Expected: `managers`/`peer_partners` each show `email` (unique), `passwordHash` (nullable), `setPasswordToken` (unique, nullable), `setPasswordTokenExpiresAt` (nullable); `super_admins` shows `email` (unique), `passwordHash` (`NOT NULL`).

- [ ] **Step 4: Regenerate the Prisma client**

```bash
pnpm --filter @zelo/api exec prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add email/setPasswordToken columns, drop name uniqueness, clean-cutover managers/peer_partners/super_admins"
```

---

### Task 2: Shared email module (Resend + mock adapter)

**Files:**

- Create: `apps/api/src/shared/email/email.port.ts`
- Create: `apps/api/src/shared/email/mock-email.adapter.ts`
- Create: `apps/api/src/shared/email/resend-email.adapter.ts`
- Create: `apps/api/src/shared/email/email-templates.ts`
- Create: `apps/api/src/shared/email/email-templates.test.ts`
- Create: `apps/api/src/shared/email/build-set-password-url.ts`
- Create: `apps/api/src/shared/email/build-set-password-url.test.ts`
- Create: `apps/api/src/shared/email/email.module.ts`
- Modify: `apps/api/src/shared/config/env.validation.ts`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/package.json`

**Interfaces:**

- Produces (used by Task 4, Task 6, Task 7): `EmailPort.send(to: string, template: "invite" | "password-reset", params: { name: string; setPasswordUrl: string }): Promise<void>`, `EMAIL_PORT` token; `EmailModule` (exports `EMAIL_PORT`); `buildSetPasswordUrl(kind: "manager" | "peer-partner", token: string): string`.

This task mirrors the existing `AI_PROVIDER=mock`/`GroqAdapter`/`FakeChatAdapter` pattern in `apps/api/src/modules/chat/chat.module.ts` exactly, applied to email instead of AI.

- [ ] **Step 1: Add the `resend` dependency**

```bash
pnpm --filter @zelo/api add resend
```

- [ ] **Step 2: Create the port**

Create `apps/api/src/shared/email/email.port.ts`:

```ts
export type EmailTemplate = "invite" | "password-reset";

export interface SendEmailParams {
  name: string;
  setPasswordUrl: string;
}

export interface EmailPort {
  send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void>;
}

export const EMAIL_PORT = Symbol("EMAIL_PORT");
```

- [ ] **Step 3: Write the failing test for the email templates, then create them**

Create `apps/api/src/shared/email/email-templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "./email-templates.ts";

describe("renderEmailTemplate", () => {
  it("renders the invite template with the person's name and the set-password link", () => {
    const { subject, html } = renderEmailTemplate("invite", { name: "Dra. Ana", setPasswordUrl: "https://example.com/manager/finish-setup?token=abc" });

    expect(subject).toBe("Finalize seu cadastro no Zelo");
    expect(html).toContain("Dra. Ana");
    expect(html).toContain("https://example.com/manager/finish-setup?token=abc");
    expect(html).toContain("48 horas");
  });

  it("renders the password-reset template with the person's name and the set-password link", () => {
    const { subject, html } = renderEmailTemplate("password-reset", { name: "Dra. Ana", setPasswordUrl: "https://example.com/manager/finish-setup?token=xyz" });

    expect(subject).toBe("Redefinição de senha no Zelo");
    expect(html).toContain("Dra. Ana");
    expect(html).toContain("https://example.com/manager/finish-setup?token=xyz");
    expect(html).toContain("48 horas");
  });
});
```

Run: `pnpm --filter @zelo/api test email-templates -- --run` — expected FAIL (file doesn't exist).

Create `apps/api/src/shared/email/email-templates.ts`:

```ts
import type { EmailTemplate, SendEmailParams } from "./email.port.ts";

export function renderEmailTemplate(template: EmailTemplate, params: SendEmailParams): { subject: string; html: string } {
  if (template === "invite") {
    return {
      subject: "Finalize seu cadastro no Zelo",
      html: `<p>Olá, ${params.name}!</p><p>Uma conta foi criada para você no Zelo. Clique no link abaixo para definir sua senha e finalizar seu cadastro:</p><p><a href="${params.setPasswordUrl}">${params.setPasswordUrl}</a></p><p>Este link expira em 48 horas.</p>`,
    };
  }

  return {
    subject: "Redefinição de senha no Zelo",
    html: `<p>Olá, ${params.name}!</p><p>Recebemos uma solicitação para redefinir sua senha no Zelo. Clique no link abaixo para escolher uma nova senha:</p><p><a href="${params.setPasswordUrl}">${params.setPasswordUrl}</a></p><p>Este link expira em 48 horas. Se você não solicitou isso, ignore este email.</p>`,
  };
}
```

Run: `pnpm --filter @zelo/api test email-templates -- --run` — expected PASS.

- [ ] **Step 4: Write the failing test for the set-password URL builder, then create it**

Create `apps/api/src/shared/email/build-set-password-url.test.ts`:

```ts
import { describe, expect, it, afterEach } from "vitest";
import { buildSetPasswordUrl } from "./build-set-password-url.ts";

describe("buildSetPasswordUrl", () => {
  afterEach(() => {
    delete process.env.WEB_APP_BASE_URL;
  });

  it("builds a manager finish-setup URL under the default base when WEB_APP_BASE_URL is unset", () => {
    delete process.env.WEB_APP_BASE_URL;
    expect(buildSetPasswordUrl("manager", "abc123")).toBe("http://localhost:5173/manager/finish-setup?token=abc123");
  });

  it("builds a peer-partner finish-setup URL", () => {
    delete process.env.WEB_APP_BASE_URL;
    expect(buildSetPasswordUrl("peer-partner", "abc123")).toBe("http://localhost:5173/peer/finish-setup?token=abc123");
  });

  it("uses WEB_APP_BASE_URL when set", () => {
    process.env.WEB_APP_BASE_URL = "https://app.zelo.example";
    expect(buildSetPasswordUrl("manager", "abc123")).toBe("https://app.zelo.example/manager/finish-setup?token=abc123");
  });
});
```

Run: `pnpm --filter @zelo/api test build-set-password-url -- --run` — expected FAIL (file doesn't exist).

Create `apps/api/src/shared/email/build-set-password-url.ts`:

```ts
export function buildSetPasswordUrl(kind: "manager" | "peer-partner", token: string): string {
  const baseUrl = process.env.WEB_APP_BASE_URL ?? "http://localhost:5173";
  const path = kind === "manager" ? "manager/finish-setup" : "peer/finish-setup";
  return `${baseUrl}/${path}?token=${token}`;
}
```

Run: `pnpm --filter @zelo/api test build-set-password-url -- --run` — expected PASS.

- [ ] **Step 5: Create the mock adapter (no test — it only logs, exercised indirectly through the use-cases that call it in later tasks)**

Create `apps/api/src/shared/email/mock-email.adapter.ts`:

```ts
import { Injectable, Logger } from "@nestjs/common";
import type { EmailPort, EmailTemplate, SendEmailParams } from "./email.port.ts";

/**
 * EMAIL_PORT implementation for local/dev testing without a Resend API key or
 * spending real send quota — see EMAIL_PROVIDER=mock in email.module.ts.
 * Logs the recipient and (critically) the setPasswordUrl link so a developer
 * can copy it straight out of the terminal.
 */
@Injectable()
export class MockEmailAdapter implements EmailPort {
  private readonly logger = new Logger(MockEmailAdapter.name);

  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.logger.log(`[mock email] to=${to} template=${template} name="${params.name}"`);
    this.logger.log(`[mock email] setPasswordUrl=${params.setPasswordUrl}`);
  }
}
```

- [ ] **Step 6: Create the Resend adapter (no test — thin third-party API wrapper, same convention as `GroqAdapter`)**

Create `apps/api/src/shared/email/resend-email.adapter.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import type { EmailPort, EmailTemplate, SendEmailParams } from "./email.port.ts";
import { renderEmailTemplate } from "./email-templates.ts";

@Injectable()
export class ResendEmailAdapter implements EmailPort {
  private readonly client: Resend;
  private readonly from: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.client = new Resend(config.getOrThrow<string>("RESEND_API_KEY"));
    this.from = config.get<string>("EMAIL_FROM") ?? "onboarding@resend.dev";
  }

  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    const { subject, html } = renderEmailTemplate(template, params);
    await this.client.emails.send({ from: this.from, to, subject, html });
  }
}
```

- [ ] **Step 7: Create the module**

Create `apps/api/src/shared/email/email.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EMAIL_PORT } from "./email.port.ts";
import { MockEmailAdapter } from "./mock-email.adapter.ts";
import { ResendEmailAdapter } from "./resend-email.adapter.ts";

// Read directly from process.env (not ConfigService) so that only the
// selected adapter is ever instantiated — EMAIL_PROVIDER=mock (the default)
// must not require a RESEND_API_KEY, but ResendEmailAdapter's constructor
// calls config.getOrThrow for it. Mirrors chat.module.ts's AI_PROVIDER pattern.
const emailPortProvider =
  process.env.EMAIL_PROVIDER === "resend"
    ? { provide: EMAIL_PORT, useClass: ResendEmailAdapter }
    : { provide: EMAIL_PORT, useClass: MockEmailAdapter };

@Module({
  imports: [ConfigModule],
  providers: [emailPortProvider],
  exports: [EMAIL_PORT],
})
export class EmailModule {}
```

- [ ] **Step 8: Add env validation**

In `apps/api/src/shared/config/env.validation.ts`, add to the `envSchema` object (alongside the existing `AI_PROVIDER`/`GROQ_API_KEY` fields):

```ts
    EMAIL_PROVIDER: z.enum(["mock", "resend"]).default("mock"),
    // Only required when a real Resend call will actually be made — ResendEmailAdapter's
    // constructor is never instantiated when EMAIL_PROVIDER=mock (see email.module.ts).
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default("onboarding@resend.dev"),
    WEB_APP_BASE_URL: z.string().default("http://localhost:5173"),
```

Add a second `.refine(...)` to the existing schema chain (Zod supports chaining multiple `.refine()` calls after `.passthrough()`):

```ts
  .refine((env) => env.EMAIL_PROVIDER === "mock" || !!env.RESEND_API_KEY, {
    message: "RESEND_API_KEY is required when EMAIL_PROVIDER is not \"mock\"",
    path: ["RESEND_API_KEY"],
  });
```

- [ ] **Step 9: Update `.env.example`**

In `apps/api/.env.example`, add after `PEER_PARTNER_TOKEN_SECRET=change-me-in-production`:

```env
# "mock" (default) logs the email + set-password link to the console for local dev/testing —
# no API key needed. "resend" sends real emails via Resend and requires RESEND_API_KEY.
EMAIL_PROVIDER=mock
RESEND_API_KEY=
EMAIL_FROM=onboarding@resend.dev
WEB_APP_BASE_URL=http://localhost:5173
```

- [ ] **Step 10: Run the full API test suite**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/shared/email apps/api/src/shared/config/env.validation.ts apps/api/.env.example apps/api/package.json apps/api/pnpm-lock.yaml
git commit -m "feat(api): add EmailPort with Resend and mock adapters"
```

---

### Task 3: Manager — email-based login + invite-based creation

**Files:**

- Modify: `apps/api/src/modules/manager/application/ports/manager-repository.port.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/persistence/prisma-manager.repository.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/login-manager.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/login-manager.use-case.test.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/create-manager.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/create-manager.use-case.test.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager.controller.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager.controller.test.ts`
- Modify: `apps/api/src/modules/manager/manager.module.ts`

**Interfaces:**

- Consumes: `EmailPort`, `EMAIL_PORT` (Task 2), `buildSetPasswordUrl` (Task 2).
- Produces (used by Task 4, Task 10): `ManagerRepository.findByEmail(email)`, `.findBySetPasswordToken(token)`; `ManagerRow` now carries `email: string`, `passwordHash: string | null`, `setPasswordTokenExpiresAt: Date | null`; `CreateManagerUseCase.execute` returns `{ manager: { id, name, email } }` (no password).

This task assumes Tasks 1-2 are already merged (`email`/`passwordHash?`/`setPasswordToken`/`setPasswordTokenExpiresAt` columns exist; `EmailPort`/`EMAIL_PORT`/`buildSetPasswordUrl` exist).

- [ ] **Step 1: Update the repository port**

Replace `apps/api/src/modules/manager/application/ports/manager-repository.port.ts` in full:

```ts
export type ManagerRole = "HOSPITAL_ADMIN" | "SECTOR_MANAGER";

export interface ManagerRow {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  setPasswordTokenExpiresAt: Date | null;
  institutionId: string;
  role: ManagerRole;
  isActive: boolean;
}

export interface ManagerSummaryRow {
  id: string;
  name: string;
  email: string;
  role: ManagerRole;
  isActive: boolean;
  sectorNames: string[];
  hasPassword: boolean;
  setPasswordTokenExpiresAt: string | null;
}

export interface CreateManagerParams {
  name: string;
  email: string;
  institutionId: string;
  role: ManagerRole;
  setPasswordToken: string;
  setPasswordTokenExpiresAt: Date;
}

export interface UpdateManagerParams {
  isActive?: boolean;
  role?: ManagerRole;
  passwordHash?: string | null;
  setPasswordToken?: string | null;
  setPasswordTokenExpiresAt?: Date | null;
}

export interface ManagerRepository {
  findByEmail(email: string): Promise<ManagerRow | null>;
  findBySetPasswordToken(token: string): Promise<ManagerRow | null>;
  findById(id: string): Promise<ManagerRow | null>;
  findAllByInstitution(institutionId: string): Promise<ManagerSummaryRow[]>;
  create(params: CreateManagerParams): Promise<{ id: string; name: string; email: string }>;
  update(id: string, patch: UpdateManagerParams): Promise<void>;
  countActiveHospitalAdmins(institutionId: string): Promise<number>;
}

export const MANAGER_REPOSITORY = Symbol("MANAGER_REPOSITORY");
```

(`findByName` is removed entirely — nothing outside this port should ever look a manager up by name again.)

- [ ] **Step 2: Update the Prisma adapter**

Replace `apps/api/src/modules/manager/infrastructure/persistence/prisma-manager.repository.ts` in full:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateManagerParams,
  ManagerRepository,
  ManagerRow,
  ManagerSummaryRow,
  UpdateManagerParams,
} from "../../application/ports/manager-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

const SET_PASSWORD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class PrismaManagerRepository implements ManagerRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<ManagerRow | null> {
    const row = await this.prisma.manager.findUnique({ where: { email } });
    return row ? this.toRow(row) : null;
  }

  async findBySetPasswordToken(token: string): Promise<ManagerRow | null> {
    const row = await this.prisma.manager.findUnique({ where: { setPasswordToken: token } });
    return row ? this.toRow(row) : null;
  }

  async findById(id: string): Promise<ManagerRow | null> {
    const row = await this.prisma.manager.findUnique({ where: { id } });
    return row ? this.toRow(row) : null;
  }

  async findAllByInstitution(institutionId: string): Promise<ManagerSummaryRow[]> {
    const rows = await this.prisma.manager.findMany({
      where: { institutionId },
      include: { sectors: { select: { name: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      isActive: row.isActive,
      sectorNames: row.sectors.map((sector) => sector.name),
      hasPassword: row.passwordHash !== null,
      setPasswordTokenExpiresAt: row.setPasswordTokenExpiresAt?.toISOString() ?? null,
    }));
  }

  async create(params: CreateManagerParams): Promise<{ id: string; name: string; email: string }> {
    const row = await this.prisma.manager.create({
      data: {
        name: params.name,
        email: params.email,
        institutionId: params.institutionId,
        role: params.role,
        setPasswordToken: params.setPasswordToken,
        setPasswordTokenExpiresAt: params.setPasswordTokenExpiresAt,
      },
    });
    return { id: row.id, name: row.name, email: row.email };
  }

  async update(id: string, patch: UpdateManagerParams): Promise<void> {
    await this.prisma.manager.update({ where: { id }, data: patch });
  }

  async countActiveHospitalAdmins(institutionId: string): Promise<number> {
    return this.prisma.manager.count({ where: { institutionId, role: "HOSPITAL_ADMIN", isActive: true } });
  }

  private toRow(row: {
    id: string;
    name: string;
    email: string;
    passwordHash: string | null;
    setPasswordTokenExpiresAt: Date | null;
    institutionId: string;
    role: string;
    isActive: boolean;
  }): ManagerRow {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.passwordHash,
      setPasswordTokenExpiresAt: row.setPasswordTokenExpiresAt,
      institutionId: row.institutionId,
      role: row.role as ManagerRow["role"],
      isActive: row.isActive,
    };
  }
}
```

- [ ] **Step 3: Update the failing test for `LoginManagerUseCase`, then update it**

Replace `apps/api/src/modules/manager/application/use-cases/login-manager.use-case.test.ts` in full:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { LoginManagerUseCase, InvalidManagerCredentialsError } from "./login-manager.use-case.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import { ManagerTokenService } from "../services/manager-token.service.ts";
import type { ManagerRepository, ManagerRow } from "../ports/manager-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  rows: ManagerRow[] = [];
  async findByEmail(email: string): Promise<ManagerRow | null> {
    return this.rows.find((row) => row.email === email) ?? null;
  }
  async findBySetPasswordToken(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(): Promise<ManagerRow | null> {
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
  async countActiveHospitalAdmins(): Promise<number> {
    throw new Error("not used in this test");
  }
}

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("LoginManagerUseCase", () => {
  it("issues a token carrying the manager's institutionId and role when the email and password match", async () => {
    const passwordService = new ManagerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository();
    repository.rows = [
      { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash, setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true },
    ];
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    const result = await useCase.execute("ana@zelo-demo.local", "correct-password");

    expect(result.role).toBe("HOSPITAL_ADMIN");
    expect(tokenService.verify(result.token)).toEqual({
      managerId: "manager-1",
      managerName: "Ana Konder",
      institutionId: "institution-1",
      role: "HOSPITAL_ADMIN",
    });
  });

  it("throws InvalidManagerCredentialsError when the email is unknown", async () => {
    const passwordService = new ManagerPasswordService();
    const repository = new FakeManagerRepository();
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("unknown@zelo-demo.local", "any-password")).rejects.toThrow(InvalidManagerCredentialsError);
  });

  it("throws InvalidManagerCredentialsError when the password is wrong", async () => {
    const passwordService = new ManagerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository();
    repository.rows = [
      { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash, setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true },
    ];
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("ana@zelo-demo.local", "wrong-password")).rejects.toThrow(InvalidManagerCredentialsError);
  });

  it("throws InvalidManagerCredentialsError for a correct password on a deactivated manager, same as a wrong password (no disclosure of deactivation)", async () => {
    const passwordService = new ManagerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository();
    repository.rows = [
      { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash, setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: false },
    ];
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("ana@zelo-demo.local", "correct-password")).rejects.toThrow(InvalidManagerCredentialsError);
  });

  it("throws InvalidManagerCredentialsError for a manager whose invite hasn't been completed yet (passwordHash is null), same as any other failure", async () => {
    const passwordService = new ManagerPasswordService();
    const repository = new FakeManagerRepository();
    repository.rows = [
      { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: new Date(Date.now() + 60_000), institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true },
    ];
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("ana@zelo-demo.local", "any-password")).rejects.toThrow(InvalidManagerCredentialsError);
  });

  it("pays the same password-verification cost for an unknown email as for a known one", async () => {
    const passwordService = new ManagerPasswordService();
    const verifySpy = vi.spyOn(passwordService, "verify");
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeManagerRepository();
    repository.rows = [
      { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash, setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true },
    ];
    const tokenService = new ManagerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginManagerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("unknown@zelo-demo.local", "any-password")).rejects.toThrow(InvalidManagerCredentialsError);
    expect(verifySpy).toHaveBeenCalledTimes(1);

    verifySpy.mockClear();

    await expect(useCase.execute("ana@zelo-demo.local", "wrong-password")).rejects.toThrow(InvalidManagerCredentialsError);
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });
});
```

Run: `pnpm --filter @zelo/api test login-manager.use-case -- --run` — expected FAIL (repository fake no longer matches the port; `findByName` doesn't exist on the real use-case yet).

Replace `apps/api/src/modules/manager/application/use-cases/login-manager.use-case.ts` in full:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../ports/manager-repository.port.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import { ManagerTokenService, type IssuedManagerToken } from "../services/manager-token.service.ts";

export class InvalidManagerCredentialsError extends Error {}

// A syntactically valid but unusable ManagerPasswordService hash (32 hex-char salt :
// 128 hex-char derived key, matching hash()'s output shape). Used to pay the same
// scrypt cost when no manager row is found, so response latency for "unknown email",
// "pending invite" (passwordHash is null), and "wrong password" is indistinguishable.
const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

@Injectable()
export class LoginManagerUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(ManagerPasswordService) private readonly passwordService: ManagerPasswordService,
    @Inject(ManagerTokenService) private readonly tokenService: ManagerTokenService,
  ) {}

  async execute(email: string, password: string): Promise<IssuedManagerToken> {
    const manager = await this.managerRepository.findByEmail(email);

    const isValid = await this.passwordService.verify(password, manager?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!manager || !manager.passwordHash || !isValid || !manager.isActive) {
      throw new InvalidManagerCredentialsError();
    }

    return this.tokenService.issue(manager.id, manager.name, manager.institutionId, manager.role);
  }
}
```

Run: `pnpm --filter @zelo/api test login-manager.use-case -- --run` — expected PASS.

- [ ] **Step 4: Update the failing test for `CreateManagerUseCase`, then update it**

Replace `apps/api/src/modules/manager/application/use-cases/create-manager.use-case.test.ts` in full:

```ts
import { describe, expect, it } from "vitest";
import { CreateManagerUseCase } from "./create-manager.use-case.ts";
import { SectorNotInInstitutionError } from "./manager-admin-errors.ts";
import type { EmailPort, EmailTemplate, SendEmailParams } from "../../../../shared/email/email.port.ts";
import type {
  CreateManagerParams, ManagerRepository, ManagerRow, ManagerSummaryRow
} from "../ports/manager-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  public lastCreateParams: CreateManagerParams | null = null;
  async findByEmail(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findAllByInstitution(): Promise<ManagerSummaryRow[]> {
    throw new Error("not used in this test");
  }
  async create(params: CreateManagerParams): Promise<{ id: string; name: string; email: string }> {
    this.lastCreateParams = params;
    return { id: "manager-new", name: params.name, email: params.email };
  }
  async update(): Promise<void> {
    throw new Error("not used in this test");
  }
  async countActiveHospitalAdmins(): Promise<number> {
    throw new Error("not used in this test");
  }
}

class FakeSectorRepository {
  public lastReassign: { institutionId: string; managerId: string; sectorIds: string[] } | null = null;
  public knownSectorIds = new Set<string>();
  async findByIdsInInstitution(_institutionId: string, sectorIds: string[]) {
    return sectorIds.filter((id) => this.knownSectorIds.has(id)).map((id) => ({ id }));
  }
  async reassignManagerSectors(institutionId: string, managerId: string, sectorIds: string[]) {
    this.lastReassign = { institutionId, managerId, sectorIds };
  }
}

class FakeEmailPort implements EmailPort {
  public lastSend: { to: string; template: EmailTemplate; params: SendEmailParams } | null = null;
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.lastSend = { to, template, params };
  }
}

describe("CreateManagerUseCase", () => {
  it("creates a HOSPITAL_ADMIN manager with no password, generates a set-password token, and sends an invite email", async () => {
    const managerRepository = new FakeManagerRepository();
    const sectorRepository = new FakeSectorRepository();
    const emailPort = new FakeEmailPort();
    const useCase = new CreateManagerUseCase(managerRepository, sectorRepository as never, emailPort);

    const result = await useCase.execute({ institutionId: "institution-1", name: "Mauricio", email: "mauricio@zelo-demo.local", role: "HOSPITAL_ADMIN" });

    expect(result.manager).toEqual({ id: "manager-new", name: "Mauricio", email: "mauricio@zelo-demo.local" });
    expect(managerRepository.lastCreateParams).toEqual({
      name: "Mauricio",
      email: "mauricio@zelo-demo.local",
      institutionId: "institution-1",
      role: "HOSPITAL_ADMIN",
      setPasswordToken: expect.any(String),
      setPasswordTokenExpiresAt: expect.any(Date),
    });
    expect(sectorRepository.lastReassign).toBeNull();
    expect(emailPort.lastSend?.to).toBe("mauricio@zelo-demo.local");
    expect(emailPort.lastSend?.template).toBe("invite");
    expect(emailPort.lastSend?.params.name).toBe("Mauricio");
    expect(emailPort.lastSend?.params.setPasswordUrl).toContain(managerRepository.lastCreateParams!.setPasswordToken);
  });

  it("creates a SECTOR_MANAGER and assigns the given sectors, all belonging to the institution", async () => {
    const managerRepository = new FakeManagerRepository();
    const sectorRepository = new FakeSectorRepository();
    sectorRepository.knownSectorIds = new Set(["sector-a", "sector-b"]);
    const useCase = new CreateManagerUseCase(managerRepository, sectorRepository as never, new FakeEmailPort());

    await useCase.execute({ institutionId: "institution-1", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", sectorIds: ["sector-a", "sector-b"] });

    expect(sectorRepository.lastReassign).toEqual({ institutionId: "institution-1", managerId: "manager-new", sectorIds: ["sector-a", "sector-b"] });
  });

  it("throws SectorNotInInstitutionError when a sectorId doesn't belong to the institution", async () => {
    const managerRepository = new FakeManagerRepository();
    const sectorRepository = new FakeSectorRepository();
    sectorRepository.knownSectorIds = new Set(["sector-a"]);
    const useCase = new CreateManagerUseCase(managerRepository, sectorRepository as never, new FakeEmailPort());

    await expect(
      useCase.execute({ institutionId: "institution-1", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", sectorIds: ["sector-a", "sector-unknown"] }),
    ).rejects.toThrow(SectorNotInInstitutionError);
  });
});
```

Run: `pnpm --filter @zelo/api test create-manager.use-case -- --run` — expected FAIL.

Replace `apps/api/src/modules/manager/application/use-cases/create-manager.use-case.ts` in full:

```ts
import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository, type ManagerRole } from "../ports/manager-repository.port.ts";
import { SECTOR_REPOSITORY, type SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";
import { EMAIL_PORT, type EmailPort } from "../../../../shared/email/email.port.ts";
import { buildSetPasswordUrl } from "../../../../shared/email/build-set-password-url.ts";
import { SectorNotInInstitutionError } from "./manager-admin-errors.ts";

const SET_PASSWORD_TOKEN_BYTES = 32;
const SET_PASSWORD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export interface CreateManagerInput {
  institutionId: string;
  name: string;
  email: string;
  role: ManagerRole;
  sectorIds?: string[];
}

export interface CreateManagerResult {
  manager: { id: string; name: string; email: string };
}

@Injectable()
export class CreateManagerUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
  ) {}

  async execute(input: CreateManagerInput): Promise<CreateManagerResult> {
    const sectorIds = input.sectorIds ?? [];

    if (input.role === "SECTOR_MANAGER" && sectorIds.length > 0) {
      const owned = await this.sectorRepository.findByIdsInInstitution(input.institutionId, sectorIds);
      if (owned.length !== sectorIds.length) {
        throw new SectorNotInInstitutionError();
      }
    }

    const setPasswordToken = randomBytes(SET_PASSWORD_TOKEN_BYTES).toString("hex");
    const setPasswordTokenExpiresAt = new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS);

    const manager = await this.managerRepository.create({
      name: input.name,
      email: input.email,
      institutionId: input.institutionId,
      role: input.role,
      setPasswordToken,
      setPasswordTokenExpiresAt,
    });

    if (input.role === "SECTOR_MANAGER" && sectorIds.length > 0) {
      await this.sectorRepository.reassignManagerSectors(input.institutionId, manager.id, sectorIds);
    }

    await this.emailPort.send(manager.email, "invite", { name: manager.name, setPasswordUrl: buildSetPasswordUrl("manager", setPasswordToken) });

    return { manager };
  }
}
```

Run: `pnpm --filter @zelo/api test create-manager.use-case -- --run` — expected PASS.

- [ ] **Step 5: Update `ManagerController`'s login endpoint**

In `apps/api/src/modules/manager/infrastructure/manager.controller.ts`, change the schema and the call:

```ts
const LoginRequestSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });
```

```ts
      return await this.loginManager.execute(parsed.data.email, parsed.data.password);
```

(The `finish-setup` endpoint is added in Task 4, alongside `FinishManagerSetupUseCase` — don't add it here.)

- [ ] **Step 6: Update `manager.controller.test.ts`**

In `apps/api/src/modules/manager/infrastructure/manager.controller.test.ts`:

Update `FakeManagerRepository`'s `findByName` method to `findByEmail`:

```ts
  async findByEmail(email: string): Promise<ManagerRow | null> {
    return this.rows.find((row) => row.email === email) ?? null;
  }
```

Add a `findBySetPasswordToken` stub right after it (this file's tests never exercise it):

```ts
  async findBySetPasswordToken(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
```

In `beforeAll`, add `email` and `setPasswordTokenExpiresAt: null` to both seeded rows:

```ts
    managerRepository.rows = [
      {
        id: "manager-1",
        name: "Ana Konder",
        email: "ana@zelo-demo.local",
        passwordHash: await passwordService.hash("test-password"),
        setPasswordTokenExpiresAt: null,
        institutionId: "institution-a",
        role: "HOSPITAL_ADMIN",
        isActive: true,
      },
      {
        id: "manager-2",
        name: "Beatriz Lima",
        email: "beatriz@zelo-demo.local",
        passwordHash: await passwordService.hash("test-password-2"),
        setPasswordTokenExpiresAt: null,
        institutionId: "institution-b",
        role: "HOSPITAL_ADMIN",
        isActive: true,
      },
    ];
```

Rename the `getToken` helper's parameter and request body key from `name` to `email`:

```ts
  async function getToken(email: string, password: string): Promise<string> {
    const login = await request(app.getHttpServer()).post("/manager/login").send({ email, password });
    return login.body.token;
  }
```

Update the four `POST /manager/login` test bodies to send `{ email, password }` instead of `{ name, password }` (using the two seeded emails above), and their titles from "...name and password"/"unknown name" to "...email and password"/"unknown email":

```ts
  it("POST /manager/login returns a token for the correct email and password", async () => {
    const response = await request(app.getHttpServer())
      .post("/manager/login")
      .send({ email: "ana@zelo-demo.local", password: "test-password" });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.expiresAt).toEqual(expect.any(String));
  });

  it("POST /manager/login rejects an unknown email with 401", async () => {
    const response = await request(app.getHttpServer())
      .post("/manager/login")
      .send({ email: "unknown@zelo-demo.local", password: "test-password" });

    expect(response.status).toBe(401);
  });

  it("POST /manager/login rejects the wrong password with 401", async () => {
    const response = await request(app.getHttpServer())
      .post("/manager/login")
      .send({ email: "ana@zelo-demo.local", password: "wrong-password" });

    expect(response.status).toBe(401);
  });

  it("POST /manager/login rejects a malformed body with 400", async () => {
    const response = await request(app.getHttpServer()).post("/manager/login").send({});

    expect(response.status).toBe(400);
  });
```

Finally, do a project-wide find-and-replace **within this one file only**: every remaining call `getToken("Ana Konder", ...)` becomes `getToken("ana@zelo-demo.local", ...)`, and every `getToken("Beatriz Lima", ...)` becomes `getToken("beatriz@zelo-demo.local", ...)`. There are 10 such call sites further down the file (signals/insights endpoint tests) — none of their surrounding assertions change, only the first argument's literal string.

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test manager.controller -- --run`
Expected: PASS (all tests).

- [ ] **Step 8: Wire `EmailModule` into `ManagerModule`**

In `apps/api/src/modules/manager/manager.module.ts`, add `import { EmailModule } from "../../shared/email/email.module.ts";` and add `EmailModule` to the `@Module({...})`'s `imports` array (alongside `SectorModule`, `PeerPartnerModule`, `PeerChatModule`).

- [ ] **Step 9: Run the full API test suite**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: PASS (Task 4 hasn't touched `ManagerAdminController`/`ResetManagerPasswordUseCase` yet, so those files still reference the old `CreateManagerResult` shape with `temporaryPassword` — this WILL fail to typecheck/compile until Task 4 lands. If `tsc --noEmit` or the test run surfaces errors in `manager-admin.controller.ts`/`manager-admin.controller.test.ts`/`reset-manager-password.use-case.ts` at this point, that's expected and resolved by Task 4 — do not attempt to fix those files in this task.)

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/manager/application/ports/manager-repository.port.ts \
        apps/api/src/modules/manager/infrastructure/persistence/prisma-manager.repository.ts \
        apps/api/src/modules/manager/application/use-cases/login-manager.use-case.ts \
        apps/api/src/modules/manager/application/use-cases/login-manager.use-case.test.ts \
        apps/api/src/modules/manager/application/use-cases/create-manager.use-case.ts \
        apps/api/src/modules/manager/application/use-cases/create-manager.use-case.test.ts \
        apps/api/src/modules/manager/infrastructure/manager.controller.ts \
        apps/api/src/modules/manager/infrastructure/manager.controller.test.ts \
        apps/api/src/modules/manager/manager.module.ts
git commit -m "feat(api): switch manager login to email, make account creation invite-based"
```

---

### Task 4: Manager — unified send-set-password-email + finish-setup

**Files:**

- Delete: `apps/api/src/modules/manager/application/use-cases/reset-manager-password.use-case.ts`
- Delete: `apps/api/src/modules/manager/application/use-cases/reset-manager-password.use-case.test.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/send-manager-set-password-email.use-case.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/send-manager-set-password-email.use-case.test.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/finish-manager-setup.use-case.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/finish-manager-setup.use-case.test.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager.controller.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager.controller.test.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager-admin.controller.test.ts`
- Modify: `apps/api/src/modules/manager/manager.module.ts`

**Interfaces:**

- Consumes: `ManagerRepository.findBySetPasswordToken` (Task 3), `EmailPort`/`EMAIL_PORT` (Task 2), `buildSetPasswordUrl` (Task 2).
- Produces: `POST /manager/finish-setup`; `POST /manager/admin/managers/:id/send-set-password-email` (replaces `reset-password`).

- [ ] **Step 1: Delete the old reset-password use-case and its test**

```bash
rm apps/api/src/modules/manager/application/use-cases/reset-manager-password.use-case.ts
rm apps/api/src/modules/manager/application/use-cases/reset-manager-password.use-case.test.ts
```

- [ ] **Step 2: Write the failing test for `SendManagerSetPasswordEmailUseCase`, then create it**

Create `apps/api/src/modules/manager/application/use-cases/send-manager-set-password-email.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SendManagerSetPasswordEmailUseCase } from "./send-manager-set-password-email.use-case.ts";
import { ManagerNotFoundError } from "./manager-admin-errors.ts";
import type { EmailPort, EmailTemplate, SendEmailParams } from "../../../../shared/email/email.port.ts";
import type { ManagerRepository, ManagerRow, UpdateManagerParams } from "../ports/manager-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  rows: ManagerRow[] = [];
  lastUpdate: { id: string; patch: UpdateManagerParams } | null = null;
  async findByEmail(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<ManagerRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findAllByInstitution(): Promise<never> {
    throw new Error("not used in this test");
  }
  async create(): Promise<never> {
    throw new Error("not used in this test");
  }
  async update(id: string, patch: UpdateManagerParams): Promise<void> {
    this.lastUpdate = { id, patch };
  }
  async countActiveHospitalAdmins(): Promise<number> {
    throw new Error("not used in this test");
  }
}

class FakeEmailPort implements EmailPort {
  lastSend: { to: string; template: EmailTemplate; params: SendEmailParams } | null = null;
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.lastSend = { to, template, params };
  }
}

describe("SendManagerSetPasswordEmailUseCase", () => {
  it("throws ManagerNotFoundError when the manager doesn't belong to the given institution", async () => {
    const repository = new FakeManagerRepository();
    repository.rows = [{ id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: "hash", setPasswordTokenExpiresAt: null, institutionId: "institution-other", role: "HOSPITAL_ADMIN", isActive: true }];
    const useCase = new SendManagerSetPasswordEmailUseCase(repository, new FakeEmailPort());

    await expect(useCase.execute({ institutionId: "institution-1", managerId: "manager-1" })).rejects.toThrow(ManagerNotFoundError);
  });

  it("sends the invite-flavored email and a fresh token when the manager has no password yet", async () => {
    const repository = new FakeManagerRepository();
    repository.rows = [{ id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true }];
    const emailPort = new FakeEmailPort();
    const useCase = new SendManagerSetPasswordEmailUseCase(repository, emailPort);

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1" });

    expect(repository.lastUpdate?.id).toBe("manager-1");
    expect(repository.lastUpdate?.patch.setPasswordToken).toEqual(expect.any(String));
    expect(repository.lastUpdate?.patch.setPasswordTokenExpiresAt).toBeInstanceOf(Date);
    expect(emailPort.lastSend?.to).toBe("ana@zelo-demo.local");
    expect(emailPort.lastSend?.template).toBe("invite");
    expect(emailPort.lastSend?.params.setPasswordUrl).toContain(repository.lastUpdate!.patch.setPasswordToken);
  });

  it("sends the password-reset-flavored email when the manager already has a password", async () => {
    const repository = new FakeManagerRepository();
    repository.rows = [{ id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: "existing-hash", setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true }];
    const emailPort = new FakeEmailPort();
    const useCase = new SendManagerSetPasswordEmailUseCase(repository, emailPort);

    await useCase.execute({ institutionId: "institution-1", managerId: "manager-1" });

    expect(emailPort.lastSend?.template).toBe("password-reset");
  });
});
```

Run: `pnpm --filter @zelo/api test send-manager-set-password-email -- --run` — expected FAIL (file doesn't exist).

Create `apps/api/src/modules/manager/application/use-cases/send-manager-set-password-email.use-case.ts`:

```ts
import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../ports/manager-repository.port.ts";
import { EMAIL_PORT, type EmailPort } from "../../../../shared/email/email.port.ts";
import { buildSetPasswordUrl } from "../../../../shared/email/build-set-password-url.ts";
import { ManagerNotFoundError } from "./manager-admin-errors.ts";

const SET_PASSWORD_TOKEN_BYTES = 32;
const SET_PASSWORD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export interface SendManagerSetPasswordEmailInput {
  institutionId: string;
  managerId: string;
}

@Injectable()
export class SendManagerSetPasswordEmailUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
  ) {}

  async execute(input: SendManagerSetPasswordEmailInput): Promise<void> {
    const manager = await this.managerRepository.findById(input.managerId);
    if (!manager || manager.institutionId !== input.institutionId) {
      throw new ManagerNotFoundError();
    }

    const setPasswordToken = randomBytes(SET_PASSWORD_TOKEN_BYTES).toString("hex");
    const setPasswordTokenExpiresAt = new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS);
    await this.managerRepository.update(input.managerId, { setPasswordToken, setPasswordTokenExpiresAt });

    const template = manager.passwordHash ? "password-reset" : "invite";
    await this.emailPort.send(manager.email, template, { name: manager.name, setPasswordUrl: buildSetPasswordUrl("manager", setPasswordToken) });
  }
}
```

Run: `pnpm --filter @zelo/api test send-manager-set-password-email -- --run` — expected PASS.

- [ ] **Step 3: Write the failing test for `FinishManagerSetupUseCase`, then create it**

Create `apps/api/src/modules/manager/application/use-cases/finish-manager-setup.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FinishManagerSetupUseCase, InvalidOrExpiredManagerSetupTokenError } from "./finish-manager-setup.use-case.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import type { ManagerRepository, ManagerRow, UpdateManagerParams } from "../ports/manager-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  rows: ManagerRow[] = [];
  lastUpdate: { id: string; patch: UpdateManagerParams } | null = null;
  async findByEmail(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(token: string): Promise<ManagerRow | null> {
    return this.rows.find((r) => (r as unknown as { setPasswordToken?: string }).setPasswordToken === token) ?? null;
  }
  async findById(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findAllByInstitution(): Promise<never> {
    throw new Error("not used in this test");
  }
  async create(): Promise<never> {
    throw new Error("not used in this test");
  }
  async update(id: string, patch: UpdateManagerParams): Promise<void> {
    this.lastUpdate = { id, patch };
  }
  async countActiveHospitalAdmins(): Promise<number> {
    throw new Error("not used in this test");
  }
}

describe("FinishManagerSetupUseCase", () => {
  it("throws InvalidOrExpiredManagerSetupTokenError when no manager has this token", async () => {
    const repository = new FakeManagerRepository();
    const useCase = new FinishManagerSetupUseCase(repository, new ManagerPasswordService());

    await expect(useCase.execute({ token: "unknown-token", password: "new-password-123" })).rejects.toThrow(InvalidOrExpiredManagerSetupTokenError);
  });

  it("throws InvalidOrExpiredManagerSetupTokenError when the token has expired", async () => {
    const repository = new FakeManagerRepository();
    repository.rows = [
      Object.assign(
        { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: new Date(Date.now() - 1000), institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true } as ManagerRow,
        { setPasswordToken: "abc123" },
      ),
    ];
    const useCase = new FinishManagerSetupUseCase(repository, new ManagerPasswordService());

    await expect(useCase.execute({ token: "abc123", password: "new-password-123" })).rejects.toThrow(InvalidOrExpiredManagerSetupTokenError);
  });

  it("hashes and sets the new password, then clears the token", async () => {
    const repository = new FakeManagerRepository();
    repository.rows = [
      Object.assign(
        { id: "manager-1", name: "Ana Konder", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: new Date(Date.now() + 60_000), institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true } as ManagerRow,
        { setPasswordToken: "abc123" },
      ),
    ];
    const passwordService = new ManagerPasswordService();
    const useCase = new FinishManagerSetupUseCase(repository, passwordService);

    await useCase.execute({ token: "abc123", password: "new-password-123" });

    expect(repository.lastUpdate?.id).toBe("manager-1");
    expect(repository.lastUpdate?.patch.setPasswordToken).toBeNull();
    expect(repository.lastUpdate?.patch.setPasswordTokenExpiresAt).toBeNull();
    const newHash = repository.lastUpdate!.patch.passwordHash!;
    expect(await passwordService.verify("new-password-123", newHash)).toBe(true);
  });
});
```

Run: `pnpm --filter @zelo/api test finish-manager-setup -- --run` — expected FAIL (file doesn't exist).

Create `apps/api/src/modules/manager/application/use-cases/finish-manager-setup.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../ports/manager-repository.port.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";

export class InvalidOrExpiredManagerSetupTokenError extends Error {}

export interface FinishManagerSetupInput {
  token: string;
  password: string;
}

@Injectable()
export class FinishManagerSetupUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(ManagerPasswordService) private readonly passwordService: ManagerPasswordService,
  ) {}

  async execute(input: FinishManagerSetupInput): Promise<void> {
    const manager = await this.managerRepository.findBySetPasswordToken(input.token);
    if (!manager || !manager.setPasswordTokenExpiresAt || manager.setPasswordTokenExpiresAt.getTime() < Date.now()) {
      throw new InvalidOrExpiredManagerSetupTokenError();
    }

    const passwordHash = await this.passwordService.hash(input.password);
    await this.managerRepository.update(manager.id, { passwordHash, setPasswordToken: null, setPasswordTokenExpiresAt: null });
  }
}
```

Run: `pnpm --filter @zelo/api test finish-manager-setup -- --run` — expected PASS.

- [ ] **Step 4: Add the `finish-setup` endpoint to `ManagerController`**

In `apps/api/src/modules/manager/infrastructure/manager.controller.ts`, add these imports (alongside the existing ones):

```ts
import { FinishManagerSetupUseCase, InvalidOrExpiredManagerSetupTokenError } from "../application/use-cases/finish-manager-setup.use-case.ts";
```

Add this schema alongside `LoginRequestSchema`:

```ts
const FinishSetupRequestSchema = z.object({ token: z.string().min(1), password: z.string().min(8).max(200) });
```

Add a constructor parameter (alongside the existing ones):

```ts
    @Inject(FinishManagerSetupUseCase) private readonly finishManagerSetup: FinishManagerSetupUseCase,
```

Add this handler (alongside `login`):

```ts
  @Post("finish-setup")
  @HttpCode(200)
  async finishSetup(@Body() body: unknown): Promise<void> {
    const parsed = FinishSetupRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      await this.finishManagerSetup.execute(parsed.data);
    } catch (error) {
      if (error instanceof InvalidOrExpiredManagerSetupTokenError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }
```

- [ ] **Step 5: Add the failing test for `POST /manager/finish-setup`, then confirm it passes**

In `apps/api/src/modules/manager/infrastructure/manager.controller.test.ts`, add this import:

```ts
import { FinishManagerSetupUseCase } from "../application/use-cases/finish-manager-setup.use-case.ts";
```

Add `FinishManagerSetupUseCase` to the `providers` array in `beforeAll` (alongside the existing `LoginManagerUseCase`, etc.).

Add these tests (anywhere in the `describe` block, e.g. right after the existing `POST /manager/login` tests):

```ts
  it("POST /manager/finish-setup sets the password for a valid, unexpired token", async () => {
    const passwordService = new ManagerPasswordService();
    managerRepository.rows.push({
      id: "manager-pending",
      name: "Novo Gestor",
      email: "novo@zelo-demo.local",
      passwordHash: null,
      setPasswordTokenExpiresAt: new Date(Date.now() + 60_000),
      institutionId: "institution-a",
      role: "HOSPITAL_ADMIN",
      isActive: true,
    });
    (managerRepository.rows[managerRepository.rows.length - 1] as unknown as { setPasswordToken: string }).setPasswordToken = "valid-token";

    const response = await request(app.getHttpServer()).post("/manager/finish-setup").send({ token: "valid-token", password: "new-password-123" });

    expect(response.status).toBe(200);
    const updated = managerRepository.rows.find((row) => row.id === "manager-pending")!;
    expect(await passwordService.verify("new-password-123", updated.passwordHash!)).toBe(true);
  });

  it("POST /manager/finish-setup rejects an unknown token with 401", async () => {
    const response = await request(app.getHttpServer()).post("/manager/finish-setup").send({ token: "unknown-token", password: "new-password-123" });
    expect(response.status).toBe(401);
  });

  it("POST /manager/finish-setup rejects a malformed body with 400", async () => {
    const response = await request(app.getHttpServer()).post("/manager/finish-setup").send({ token: "x" });
    expect(response.status).toBe(400);
  });
```

`FakeManagerRepository.findBySetPasswordToken` in this file currently throws — change it to actually search:

```ts
  async findBySetPasswordToken(token: string): Promise<ManagerRow | null> {
    return this.rows.find((row) => (row as unknown as { setPasswordToken?: string }).setPasswordToken === token) ?? null;
  }
```

And `update` in this file's `FakeManagerRepository` currently doesn't exist as a mutator (check — if it throws "not used in this test", replace it with a real mutator matching Prisma's undefined-means-untouched semantics):

```ts
  async update(id: string, patch: Partial<ManagerRow> & { setPasswordToken?: string | null }): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) Object.assign(row, { [key]: value });
    }
  }
```

Run: `pnpm --filter @zelo/api test manager.controller -- --run`
Expected: PASS (all tests, including the pre-existing ones from Task 3).

- [ ] **Step 6: Update `ManagerAdminController`'s reset-password endpoint**

In `apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts`:

Replace the import:

```ts
import { SendManagerSetPasswordEmailUseCase } from "../application/use-cases/send-manager-set-password-email.use-case.ts";
```

Replace the constructor parameter:

```ts
    @Inject(SendManagerSetPasswordEmailUseCase) private readonly sendManagerSetPasswordEmail: SendManagerSetPasswordEmailUseCase,
```

Also add the `email` field to `CreateManagerSchema`:

```ts
const CreateManagerSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200),
    role: z.enum(["HOSPITAL_ADMIN", "SECTOR_MANAGER"]),
    sectorIds: z.array(z.string()).optional(),
  })
  .refine((data) => data.role !== "SECTOR_MANAGER" || (data.sectorIds && data.sectorIds.length > 0), {
    message: "sectorIds is required and non-empty when role is SECTOR_MANAGER",
    path: ["sectorIds"],
  });
```

Replace the `resetManagerPasswordHandler` method with:

```ts
  @Post("managers/:id/send-set-password-email")
  @HttpCode(200)
  async sendManagerSetPasswordEmailHandler(@Req() request: Request, @Param("id") id: string): Promise<void> {
    try {
      await this.sendManagerSetPasswordEmail.execute({ institutionId: request.manager!.institutionId, managerId: id });
    } catch (error) {
      if (error instanceof ManagerNotFoundError) {
        throw new NotFoundException();
      }
      throw error;
    }
  }
```

(`createManagerHandler`'s body doesn't need to change — it already spreads `parsed.data` into `this.createManager.execute({ institutionId: ..., ...parsed.data })`, and `parsed.data` now includes `email` since the schema changed; `CreateManagerUseCase.execute`'s input type already expects it from Task 3.)

- [ ] **Step 7: Update `manager-admin.controller.test.ts`**

Update these imports (replace `ResetManagerPasswordUseCase` with `SendManagerSetPasswordEmailUseCase`, add the email port types):

```ts
import { SendManagerSetPasswordEmailUseCase } from "../application/use-cases/send-manager-set-password-email.use-case.ts";
import { EMAIL_PORT } from "../../../shared/email/email.port.ts";
import type { EmailPort, EmailTemplate, SendEmailParams } from "../../../shared/email/email.port.ts";
```

Add a `FakeEmailPort` class (alongside the other fakes in this file):

```ts
class FakeEmailPort implements EmailPort {
  public lastSend: { to: string; template: EmailTemplate; params: SendEmailParams } | null = null;
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.lastSend = { to, template, params };
  }
}
```

In `FakeManagerRepository`: rename `findByName` to `findByEmail` (throws "not used in this test", same as before — this file never logs in, only uses `findById`/`findAllByInstitution`/`create`/`update`), and add a `findBySetPasswordToken` stub with the same "not used" throw. Update `findAllByInstitution`'s mapping to include the three new `ManagerSummaryRow` fields:

```ts
  async findAllByInstitution(institutionId: string): Promise<ManagerSummaryRow[]> {
    return this.rows
      .filter((r) => r.institutionId === institutionId)
      .map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        isActive: r.isActive,
        sectorNames: [],
        hasPassword: r.passwordHash !== null,
        setPasswordTokenExpiresAt: r.setPasswordTokenExpiresAt?.toISOString() ?? null,
      }));
  }
```

Update `create`'s signature and body to match the new `CreateManagerParams` shape (no more `passwordHash` in params — it's created with `null`):

```ts
  async create(params: CreateManagerParams): Promise<{ id: string; name: string; email: string }> {
    const row: ManagerRow = {
      id: `manager-${this.rows.length + 10}`,
      name: params.name,
      email: params.email,
      passwordHash: null,
      setPasswordTokenExpiresAt: params.setPasswordTokenExpiresAt,
      institutionId: params.institutionId,
      role: params.role,
      isActive: true,
    };
    this.rows.push(row);
    return { id: row.id, name: row.name, email: row.email };
  }
```

In `beforeAll`, add `emailPort = new FakeEmailPort();` and add `{ provide: EMAIL_PORT, useValue: emailPort }` to the `Test.createTestingModule({...})` providers array (declare `let emailPort: FakeEmailPort;` alongside the other `let` declarations at the top of the `describe` block). Replace `ResetManagerPasswordUseCase` with `SendManagerSetPasswordEmailUseCase` in the same providers array.

Add `email` and `setPasswordTokenExpiresAt: null` to `ACTING_ADMIN` and `ACTING_SECTOR_MANAGER`:

```ts
  const ACTING_ADMIN: ManagerRow = { id: "manager-1", name: "Mauricio", email: "mauricio@institution-1.local", passwordHash: "h", setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true };
  const ACTING_SECTOR_MANAGER: ManagerRow = { id: "manager-2", name: "Paulo", email: "paulo@institution-1.local", passwordHash: "h", setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "SECTOR_MANAGER", isActive: true };
```

Add the same two fields (with a distinct email per row) to the four other literal `ManagerRow` pushes further down the file:

- `{ id: "manager-9", name: "Paulo", ... }` (the sector-assignment test) → `email: "paulo2@institution-1.local"`
- `{ id: "foreign-manager", name: "Intruso", ... }` → `email: "intruso@institution-2.local"`
- `{ id: "manager-3", name: "Elsewhere", ... }` → `email: "elsewhere@institution-2.local"`
- `{ id: "manager-7", name: "Renata", ... }` → `email: "renata@institution-1.local"`

Each gets `setPasswordTokenExpiresAt: null` added alongside its new `email` field.

Update the `GET /manager/admin/managers` test's expected response body (it currently asserts `ManagerSummaryRow`-shaped objects without the new fields):

```ts
    expect(response.body).toEqual([
      { id: "manager-1", name: "Mauricio", email: "mauricio@institution-1.local", role: "HOSPITAL_ADMIN", isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
      { id: "manager-2", name: "Paulo", email: "paulo@institution-1.local", role: "SECTOR_MANAGER", isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
```

Update the `POST /manager/admin/managers creates a SECTOR_MANAGER...` test — send `email` in the body, and change its assertions (no more `temporaryPassword`; assert the invite email was sent):

```ts
  it("POST /manager/admin/managers creates a SECTOR_MANAGER and sends an invite email", async () => {
    sectorRepository.rows = [{ id: "sector-a", name: "UTI", isActive: true, managerId: null, managerName: null, institutionId: "institution-1" }];

    const response = await request(app.getHttpServer())
      .post("/manager/admin/managers")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`)
      .send({ name: "Paulo", email: "paulo3@institution-1.local", role: "SECTOR_MANAGER", sectorIds: ["sector-a"] });

    expect(response.status).toBe(201);
    expect(response.body.manager).toEqual({ id: expect.any(String), name: "Paulo", email: "paulo3@institution-1.local" });
    expect(emailPort.lastSend?.to).toBe("paulo3@institution-1.local");
    expect(emailPort.lastSend?.template).toBe("invite");
  });
```

Replace the `POST /manager/admin/managers/:id/reset-password returns a new temporary password` test with:

```ts
  it("POST /manager/admin/managers/:id/send-set-password-email sends the manager an email", async () => {
    managerRepository.rows.push({ id: "manager-7", name: "Renata", email: "renata@institution-1.local", passwordHash: "old", setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "SECTOR_MANAGER", isActive: true });

    const response = await request(app.getHttpServer())
      .post("/manager/admin/managers/manager-7/send-set-password-email")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`);

    expect(response.status).toBe(200);
    expect(emailPort.lastSend?.to).toBe("renata@institution-1.local");
    expect(emailPort.lastSend?.template).toBe("password-reset");
  });
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test manager-admin.controller -- --run`
Expected: PASS (all tests).

- [ ] **Step 9: Update `manager.module.ts`**

In `apps/api/src/modules/manager/manager.module.ts`, replace the `ResetManagerPasswordUseCase` import and providers-array entry with:

```ts
import { SendManagerSetPasswordEmailUseCase } from "./application/use-cases/send-manager-set-password-email.use-case.ts";
import { FinishManagerSetupUseCase } from "./application/use-cases/finish-manager-setup.use-case.ts";
```

Add both `SendManagerSetPasswordEmailUseCase` and `FinishManagerSetupUseCase` to the `providers` array (in place of the removed `ResetManagerPasswordUseCase`).

- [ ] **Step 10: Run the full API test suite**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/modules/manager
git commit -m "feat(api): unify manager invite/reset into one send-set-password-email action, add finish-setup"
```

---

### Task 5: PeerPartner — email-based login + invite-based creation

**Files:**

- Modify: `apps/api/src/modules/peer-partner/application/ports/peer-partner-repository.port.ts`
- Modify: `apps/api/src/modules/peer-partner/infrastructure/persistence/prisma-peer-partner.repository.ts`
- Modify: `apps/api/src/modules/peer-partner/application/use-cases/login-peer-partner.use-case.ts`
- Modify: `apps/api/src/modules/peer-partner/application/use-cases/login-peer-partner.use-case.test.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/create-peer-partner.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/create-peer-partner.use-case.test.ts`
- Modify: `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts`
- Modify: `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.test.ts`
- Modify: `apps/api/src/modules/peer-partner/peer-partner.module.ts`

**Interfaces:**

- Consumes: `EmailPort`/`EMAIL_PORT`, `buildSetPasswordUrl` (Task 2).
- Produces (used by Task 6, Task 10): `PeerPartnerRepository.findByEmail(email)`, `.findBySetPasswordToken(token)`; `PeerPartnerRow` carries `email: string`, `passwordHash: string | null`, `setPasswordTokenExpiresAt: Date | null`; `CreatePeerPartnerUseCase.execute` returns `{ peerPartner: { id, name, email } }` (no password).

This task mirrors Task 3 exactly, applied to `PeerPartner` instead of `Manager` (no `role`/`countActiveHospitalAdmins` — those are Manager-only concepts).

- [ ] **Step 1: Update the repository port**

Replace `apps/api/src/modules/peer-partner/application/ports/peer-partner-repository.port.ts` in full:

```ts
export interface PeerPartnerRow {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  setPasswordTokenExpiresAt: Date | null;
  institutionId: string;
  specialty: string;
  isActive: boolean;
}

export interface PeerPartnerSummaryRow {
  id: string;
  name: string;
  email: string;
  specialty: string;
  isActive: boolean;
  hasPassword: boolean;
  setPasswordTokenExpiresAt: string | null;
}

export interface CreatePeerPartnerParams {
  name: string;
  email: string;
  institutionId: string;
  specialty: string;
  setPasswordToken: string;
  setPasswordTokenExpiresAt: Date;
}

export interface UpdatePeerPartnerParams {
  isActive?: boolean;
  specialty?: string;
  passwordHash?: string | null;
  setPasswordToken?: string | null;
  setPasswordTokenExpiresAt?: Date | null;
}

export interface PeerPartnerRepository {
  findByEmail(email: string): Promise<PeerPartnerRow | null>;
  findBySetPasswordToken(token: string): Promise<PeerPartnerRow | null>;
  findById(id: string): Promise<PeerPartnerRow | null>;
  findAllByInstitution(institutionId: string): Promise<PeerPartnerSummaryRow[]>;
  create(params: CreatePeerPartnerParams): Promise<{ id: string; name: string; email: string }>;
  update(id: string, patch: UpdatePeerPartnerParams): Promise<void>;
}

export const PEER_PARTNER_REPOSITORY = Symbol("PEER_PARTNER_REPOSITORY");
```

- [ ] **Step 2: Update the Prisma adapter**

Replace `apps/api/src/modules/peer-partner/infrastructure/persistence/prisma-peer-partner.repository.ts` in full:

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

  async findByEmail(email: string): Promise<PeerPartnerRow | null> {
    const row = await this.prisma.peerPartner.findUnique({ where: { email } });
    return row ? this.toRow(row) : null;
  }

  async findBySetPasswordToken(token: string): Promise<PeerPartnerRow | null> {
    const row = await this.prisma.peerPartner.findUnique({ where: { setPasswordToken: token } });
    return row ? this.toRow(row) : null;
  }

  async findById(id: string): Promise<PeerPartnerRow | null> {
    const row = await this.prisma.peerPartner.findUnique({ where: { id } });
    return row ? this.toRow(row) : null;
  }

  async findAllByInstitution(institutionId: string): Promise<PeerPartnerSummaryRow[]> {
    const rows = await this.prisma.peerPartner.findMany({ where: { institutionId } });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      specialty: row.specialty,
      isActive: row.isActive,
      hasPassword: row.passwordHash !== null,
      setPasswordTokenExpiresAt: row.setPasswordTokenExpiresAt?.toISOString() ?? null,
    }));
  }

  async create(params: CreatePeerPartnerParams): Promise<{ id: string; name: string; email: string }> {
    const row = await this.prisma.peerPartner.create({
      data: {
        name: params.name,
        email: params.email,
        institutionId: params.institutionId,
        specialty: params.specialty,
        setPasswordToken: params.setPasswordToken,
        setPasswordTokenExpiresAt: params.setPasswordTokenExpiresAt,
      },
    });
    return { id: row.id, name: row.name, email: row.email };
  }

  async update(id: string, patch: UpdatePeerPartnerParams): Promise<void> {
    await this.prisma.peerPartner.update({ where: { id }, data: patch });
  }

  private toRow(row: {
    id: string;
    name: string;
    email: string;
    passwordHash: string | null;
    setPasswordTokenExpiresAt: Date | null;
    institutionId: string;
    specialty: string;
    isActive: boolean;
  }): PeerPartnerRow {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.passwordHash,
      setPasswordTokenExpiresAt: row.setPasswordTokenExpiresAt,
      institutionId: row.institutionId,
      specialty: row.specialty,
      isActive: row.isActive,
    };
  }
}
```

- [ ] **Step 3: Update the failing test for `LoginPeerPartnerUseCase`, then update it**

Replace `apps/api/src/modules/peer-partner/application/use-cases/login-peer-partner.use-case.test.ts` in full:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { LoginPeerPartnerUseCase, InvalidPeerPartnerCredentialsError } from "./login-peer-partner.use-case.ts";
import { PeerPartnerPasswordService } from "../services/peer-partner-password.service.ts";
import { PeerPartnerTokenService } from "../services/peer-partner-token.service.ts";
import type { PeerPartnerRepository, PeerPartnerRow } from "../ports/peer-partner-repository.port.ts";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  rows: PeerPartnerRow[] = [];
  async findByEmail(email: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((row) => row.email === email) ?? null;
  }
  async findBySetPasswordToken(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
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
  it("issues a token carrying the peer partner's institutionId when email and password match", async () => {
    const passwordService = new PeerPartnerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash, setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    const tokenService = new PeerPartnerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginPeerPartnerUseCase(repository, passwordService, tokenService);

    const result = await useCase.execute("ana@zelo-demo.local", "correct-password");

    expect(tokenService.verify(result.token)).toEqual({ peerPartnerId: "peer-1", peerPartnerName: "Dra. Ana", institutionId: "institution-1" });
  });

  it("throws InvalidPeerPartnerCredentialsError when the email is unknown", async () => {
    const passwordService = new PeerPartnerPasswordService();
    const repository = new FakePeerPartnerRepository();
    const tokenService = new PeerPartnerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginPeerPartnerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("unknown@zelo-demo.local", "any-password")).rejects.toThrow(InvalidPeerPartnerCredentialsError);
  });

  it("throws InvalidPeerPartnerCredentialsError when the password is wrong", async () => {
    const passwordService = new PeerPartnerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash, setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    const tokenService = new PeerPartnerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginPeerPartnerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("ana@zelo-demo.local", "wrong-password")).rejects.toThrow(InvalidPeerPartnerCredentialsError);
  });

  it("throws InvalidPeerPartnerCredentialsError for a correct password on a deactivated peer partner", async () => {
    const passwordService = new PeerPartnerPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash, setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: false }];
    const tokenService = new PeerPartnerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginPeerPartnerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("ana@zelo-demo.local", "correct-password")).rejects.toThrow(InvalidPeerPartnerCredentialsError);
  });

  it("throws InvalidPeerPartnerCredentialsError for a peer partner whose invite hasn't been completed yet", async () => {
    const passwordService = new PeerPartnerPasswordService();
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: new Date(Date.now() + 60_000), institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    const tokenService = new PeerPartnerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginPeerPartnerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("ana@zelo-demo.local", "any-password")).rejects.toThrow(InvalidPeerPartnerCredentialsError);
  });

  it("pays the same password-verification cost for an unknown email as for a known one", async () => {
    const passwordService = new PeerPartnerPasswordService();
    const verifySpy = vi.spyOn(passwordService, "verify");
    const repository = new FakePeerPartnerRepository();
    const tokenService = new PeerPartnerTokenService(fakeConfig("token-secret"));
    const useCase = new LoginPeerPartnerUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("unknown@zelo-demo.local", "any-password")).rejects.toThrow(InvalidPeerPartnerCredentialsError);
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });
});
```

Run: `pnpm --filter @zelo/api test login-peer-partner.use-case -- --run` — expected FAIL.

Replace `apps/api/src/modules/peer-partner/application/use-cases/login-peer-partner.use-case.ts` in full:

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

  async execute(email: string, password: string): Promise<IssuedPeerPartnerToken> {
    const peerPartner = await this.repository.findByEmail(email);

    const isValid = await this.passwordService.verify(password, peerPartner?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!peerPartner || !peerPartner.passwordHash || !isValid || !peerPartner.isActive) {
      throw new InvalidPeerPartnerCredentialsError();
    }

    return this.tokenService.issue(peerPartner.id, peerPartner.name, peerPartner.institutionId);
  }
}
```

Run: `pnpm --filter @zelo/api test login-peer-partner.use-case -- --run` — expected PASS.

- [ ] **Step 4: Update the failing test for `CreatePeerPartnerUseCase`, then update it**

Replace `apps/api/src/modules/manager/application/use-cases/create-peer-partner.use-case.test.ts` in full:

```ts
import { describe, expect, it } from "vitest";
import { CreatePeerPartnerUseCase } from "./create-peer-partner.use-case.ts";
import type { EmailPort, EmailTemplate, SendEmailParams } from "../../../../shared/email/email.port.ts";
import type {
  CreatePeerPartnerParams, PeerPartnerRepository, PeerPartnerRow, PeerPartnerSummaryRow
} from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  public lastCreateParams: CreatePeerPartnerParams | null = null;
  async findByEmail(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findAllByInstitution(): Promise<PeerPartnerSummaryRow[]> {
    throw new Error("not used in this test");
  }
  async create(params: CreatePeerPartnerParams): Promise<{ id: string; name: string; email: string }> {
    this.lastCreateParams = params;
    return { id: "peer-new", name: params.name, email: params.email };
  }
  async update(): Promise<void> {
    throw new Error("not used in this test");
  }
}

class FakeEmailPort implements EmailPort {
  public lastSend: { to: string; template: EmailTemplate; params: SendEmailParams } | null = null;
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.lastSend = { to, template, params };
  }
}

describe("CreatePeerPartnerUseCase", () => {
  it("creates a peer partner with no password, generates a set-password token, and sends an invite email", async () => {
    const repository = new FakePeerPartnerRepository();
    const emailPort = new FakeEmailPort();
    const useCase = new CreatePeerPartnerUseCase(repository, emailPort);

    const result = await useCase.execute({ institutionId: "institution-1", name: "Dra. Ana", email: "ana@zelo-demo.local", specialty: "Clínica médica" });

    expect(result.peerPartner).toEqual({ id: "peer-new", name: "Dra. Ana", email: "ana@zelo-demo.local" });
    expect(repository.lastCreateParams).toEqual({
      name: "Dra. Ana",
      email: "ana@zelo-demo.local",
      institutionId: "institution-1",
      specialty: "Clínica médica",
      setPasswordToken: expect.any(String),
      setPasswordTokenExpiresAt: expect.any(Date),
    });
    expect(emailPort.lastSend?.to).toBe("ana@zelo-demo.local");
    expect(emailPort.lastSend?.template).toBe("invite");
    expect(emailPort.lastSend?.params.setPasswordUrl).toContain(repository.lastCreateParams!.setPasswordToken);
  });
});
```

Run: `pnpm --filter @zelo/api test create-peer-partner.use-case -- --run` — expected FAIL.

Replace `apps/api/src/modules/manager/application/use-cases/create-peer-partner.use-case.ts` in full:

```ts
import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";
import { EMAIL_PORT, type EmailPort } from "../../../../shared/email/email.port.ts";
import { buildSetPasswordUrl } from "../../../../shared/email/build-set-password-url.ts";

const SET_PASSWORD_TOKEN_BYTES = 32;
const SET_PASSWORD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export interface CreatePeerPartnerInput {
  institutionId: string;
  name: string;
  email: string;
  specialty: string;
}

export interface CreatePeerPartnerResult {
  peerPartner: { id: string; name: string; email: string };
}

@Injectable()
export class CreatePeerPartnerUseCase {
  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
  ) {}

  async execute(input: CreatePeerPartnerInput): Promise<CreatePeerPartnerResult> {
    const setPasswordToken = randomBytes(SET_PASSWORD_TOKEN_BYTES).toString("hex");
    const setPasswordTokenExpiresAt = new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS);

    const peerPartner = await this.repository.create({
      name: input.name,
      email: input.email,
      institutionId: input.institutionId,
      specialty: input.specialty,
      setPasswordToken,
      setPasswordTokenExpiresAt,
    });

    await this.emailPort.send(peerPartner.email, "invite", { name: peerPartner.name, setPasswordUrl: buildSetPasswordUrl("peer-partner", setPasswordToken) });

    return { peerPartner };
  }
}
```

Run: `pnpm --filter @zelo/api test create-peer-partner.use-case -- --run` — expected PASS.

- [ ] **Step 5: Update `PeerPartnerController`**

Replace `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts` in full:

```ts
import { BadRequestException, Body, Controller, HttpCode, Inject, Post, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { LoginPeerPartnerUseCase, InvalidPeerPartnerCredentialsError } from "../application/use-cases/login-peer-partner.use-case.ts";
import type { IssuedPeerPartnerToken } from "../application/services/peer-partner-token.service.ts";

const LoginRequestSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

@Controller("peer-partner")
export class PeerPartnerController {
  constructor(@Inject(LoginPeerPartnerUseCase) private readonly loginPeerPartner: LoginPeerPartnerUseCase) {}

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
}
```

(The `finish-setup` endpoint is added in Task 6, alongside `FinishPeerPartnerSetupUseCase`.)

- [ ] **Step 6: Update `peer-partner.controller.test.ts`**

Replace `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.test.ts` in full:

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
  async findByEmail(email: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((row) => row.email === email) ?? null;
  }
  async findBySetPasswordToken(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
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
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: await passwordService.hash("test-password"), setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];

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

  it("POST /peer-partner/login returns a token for the correct email and password", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/login").send({ email: "ana@zelo-demo.local", password: "test-password" });
    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
  });

  it("POST /peer-partner/login rejects an unknown email with 401", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/login").send({ email: "unknown@zelo-demo.local", password: "test-password" });
    expect(response.status).toBe(401);
  });

  it("POST /peer-partner/login rejects a malformed body with 400", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/login").send({});
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test peer-partner.controller login-peer-partner create-peer-partner -- --run`
Expected: PASS. (`manager-admin.controller.test.ts` will still fail to compile at this point, since it references the old `PeerPartnerRow`/`CreatePeerPartnerParams` shapes — that's resolved by Task 6, don't fix it here.)

- [ ] **Step 8: Wire `EmailModule` into `PeerPartnerModule`**

In `apps/api/src/modules/peer-partner/peer-partner.module.ts`, add `import { EmailModule } from "../../shared/email/email.module.ts";` and add `EmailModule` to the `@Module({...})`'s `imports` array. (`ManagerModule` already imports `EmailModule` per Task 3 Step 8, and `CreatePeerPartnerUseCase` lives in the manager module, so this import in `PeerPartnerModule` is for `PeerPartnerModule`'s own future needs — it's harmless to add now and Task 6 needs it for `FinishPeerPartnerSetupUseCase`/`SendPeerPartnerSetPasswordEmailUseCase`. If `PeerPartnerModule` has no `imports` array yet, add one.)

- [ ] **Step 9: Run the full API test suite**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: `manager-admin.controller.test.ts` and `reset-peer-partner-password.use-case.test.ts` still fail to compile — that's expected until Task 6. Every other file passes.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/peer-partner/application/ports/peer-partner-repository.port.ts \
        apps/api/src/modules/peer-partner/infrastructure/persistence/prisma-peer-partner.repository.ts \
        apps/api/src/modules/peer-partner/application/use-cases/login-peer-partner.use-case.ts \
        apps/api/src/modules/peer-partner/application/use-cases/login-peer-partner.use-case.test.ts \
        apps/api/src/modules/manager/application/use-cases/create-peer-partner.use-case.ts \
        apps/api/src/modules/manager/application/use-cases/create-peer-partner.use-case.test.ts \
        apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts \
        apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.test.ts \
        apps/api/src/modules/peer-partner/peer-partner.module.ts
git commit -m "feat(api): switch peer-partner login to email, make account creation invite-based"
```

---

### Task 6: PeerPartner — unified send-set-password-email + finish-setup

**Files:**

- Delete: `apps/api/src/modules/manager/application/use-cases/reset-peer-partner-password.use-case.ts`
- Delete: `apps/api/src/modules/manager/application/use-cases/reset-peer-partner-password.use-case.test.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/send-peer-partner-set-password-email.use-case.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/send-peer-partner-set-password-email.use-case.test.ts`
- Create: `apps/api/src/modules/peer-partner/application/use-cases/finish-peer-partner-setup.use-case.ts`
- Create: `apps/api/src/modules/peer-partner/application/use-cases/finish-peer-partner-setup.use-case.test.ts`
- Modify: `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts`
- Modify: `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.test.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/manager-admin.controller.test.ts`
- Modify: `apps/api/src/modules/manager/manager.module.ts`
- Modify: `apps/api/src/modules/peer-partner/peer-partner.module.ts`

**Interfaces:**

- Consumes: `PeerPartnerRepository.findBySetPasswordToken` (Task 5), `EmailPort`/`EMAIL_PORT`, `buildSetPasswordUrl` (Task 2).
- Produces: `POST /peer-partner/finish-setup`; `POST /manager/admin/peer-partners/:id/send-set-password-email` (replaces `reset-password`).

This task mirrors Task 4 exactly, applied to `PeerPartner`.

- [ ] **Step 1: Delete the old reset-password use-case and its test**

```bash
rm apps/api/src/modules/manager/application/use-cases/reset-peer-partner-password.use-case.ts
rm apps/api/src/modules/manager/application/use-cases/reset-peer-partner-password.use-case.test.ts
```

- [ ] **Step 2: Write the failing test for `SendPeerPartnerSetPasswordEmailUseCase`, then create it**

Create `apps/api/src/modules/manager/application/use-cases/send-peer-partner-set-password-email.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SendPeerPartnerSetPasswordEmailUseCase } from "./send-peer-partner-set-password-email.use-case.ts";
import { PeerPartnerNotFoundError } from "./manager-admin-errors.ts";
import type { EmailPort, EmailTemplate, SendEmailParams } from "../../../../shared/email/email.port.ts";
import type { PeerPartnerRepository, PeerPartnerRow, UpdatePeerPartnerParams } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  rows: PeerPartnerRow[] = [];
  lastUpdate: { id: string; patch: UpdatePeerPartnerParams } | null = null;
  async findByEmail(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(): Promise<PeerPartnerRow | null> {
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

class FakeEmailPort implements EmailPort {
  lastSend: { to: string; template: EmailTemplate; params: SendEmailParams } | null = null;
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.lastSend = { to, template, params };
  }
}

describe("SendPeerPartnerSetPasswordEmailUseCase", () => {
  it("throws PeerPartnerNotFoundError when the peer partner doesn't belong to the given institution", async () => {
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: "hash", setPasswordTokenExpiresAt: null, institutionId: "institution-other", specialty: "Clínica médica", isActive: true }];
    const useCase = new SendPeerPartnerSetPasswordEmailUseCase(repository, new FakeEmailPort());

    await expect(useCase.execute({ institutionId: "institution-1", peerPartnerId: "peer-1" })).rejects.toThrow(PeerPartnerNotFoundError);
  });

  it("sends the invite-flavored email when the peer partner has no password yet", async () => {
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    const emailPort = new FakeEmailPort();
    const useCase = new SendPeerPartnerSetPasswordEmailUseCase(repository, emailPort);

    await useCase.execute({ institutionId: "institution-1", peerPartnerId: "peer-1" });

    expect(repository.lastUpdate?.patch.setPasswordToken).toEqual(expect.any(String));
    expect(emailPort.lastSend?.to).toBe("ana@zelo-demo.local");
    expect(emailPort.lastSend?.template).toBe("invite");
  });

  it("sends the password-reset-flavored email when the peer partner already has a password", async () => {
    const repository = new FakePeerPartnerRepository();
    repository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: "existing-hash", setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    const emailPort = new FakeEmailPort();
    const useCase = new SendPeerPartnerSetPasswordEmailUseCase(repository, emailPort);

    await useCase.execute({ institutionId: "institution-1", peerPartnerId: "peer-1" });

    expect(emailPort.lastSend?.template).toBe("password-reset");
  });
});
```

Run: `pnpm --filter @zelo/api test send-peer-partner-set-password-email -- --run` — expected FAIL.

Create `apps/api/src/modules/manager/application/use-cases/send-peer-partner-set-password-email.use-case.ts`:

```ts
import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";
import { EMAIL_PORT, type EmailPort } from "../../../../shared/email/email.port.ts";
import { buildSetPasswordUrl } from "../../../../shared/email/build-set-password-url.ts";
import { PeerPartnerNotFoundError } from "./manager-admin-errors.ts";

const SET_PASSWORD_TOKEN_BYTES = 32;
const SET_PASSWORD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export interface SendPeerPartnerSetPasswordEmailInput {
  institutionId: string;
  peerPartnerId: string;
}

@Injectable()
export class SendPeerPartnerSetPasswordEmailUseCase {
  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
  ) {}

  async execute(input: SendPeerPartnerSetPasswordEmailInput): Promise<void> {
    const peerPartner = await this.repository.findById(input.peerPartnerId);
    if (!peerPartner || peerPartner.institutionId !== input.institutionId) {
      throw new PeerPartnerNotFoundError();
    }

    const setPasswordToken = randomBytes(SET_PASSWORD_TOKEN_BYTES).toString("hex");
    const setPasswordTokenExpiresAt = new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS);
    await this.repository.update(input.peerPartnerId, { setPasswordToken, setPasswordTokenExpiresAt });

    const template = peerPartner.passwordHash ? "password-reset" : "invite";
    await this.emailPort.send(peerPartner.email, template, { name: peerPartner.name, setPasswordUrl: buildSetPasswordUrl("peer-partner", setPasswordToken) });
  }
}
```

Run: `pnpm --filter @zelo/api test send-peer-partner-set-password-email -- --run` — expected PASS.

- [ ] **Step 3: Write the failing test for `FinishPeerPartnerSetupUseCase`, then create it**

Create `apps/api/src/modules/peer-partner/application/use-cases/finish-peer-partner-setup.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FinishPeerPartnerSetupUseCase, InvalidOrExpiredPeerPartnerSetupTokenError } from "./finish-peer-partner-setup.use-case.ts";
import { PeerPartnerPasswordService } from "../services/peer-partner-password.service.ts";
import type { PeerPartnerRepository, PeerPartnerRow, UpdatePeerPartnerParams } from "../ports/peer-partner-repository.port.ts";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  rows: PeerPartnerRow[] = [];
  lastUpdate: { id: string; patch: UpdatePeerPartnerParams } | null = null;
  async findByEmail(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(token: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((r) => (r as unknown as { setPasswordToken?: string }).setPasswordToken === token) ?? null;
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
  async update(id: string, patch: UpdatePeerPartnerParams): Promise<void> {
    this.lastUpdate = { id, patch };
  }
}

describe("FinishPeerPartnerSetupUseCase", () => {
  it("throws InvalidOrExpiredPeerPartnerSetupTokenError when no peer partner has this token", async () => {
    const repository = new FakePeerPartnerRepository();
    const useCase = new FinishPeerPartnerSetupUseCase(repository, new PeerPartnerPasswordService());

    await expect(useCase.execute({ token: "unknown-token", password: "new-password-123" })).rejects.toThrow(InvalidOrExpiredPeerPartnerSetupTokenError);
  });

  it("throws InvalidOrExpiredPeerPartnerSetupTokenError when the token has expired", async () => {
    const repository = new FakePeerPartnerRepository();
    repository.rows = [
      Object.assign(
        { id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: new Date(Date.now() - 1000), institutionId: "institution-1", specialty: "Clínica médica", isActive: true } as PeerPartnerRow,
        { setPasswordToken: "abc123" },
      ),
    ];
    const useCase = new FinishPeerPartnerSetupUseCase(repository, new PeerPartnerPasswordService());

    await expect(useCase.execute({ token: "abc123", password: "new-password-123" })).rejects.toThrow(InvalidOrExpiredPeerPartnerSetupTokenError);
  });

  it("hashes and sets the new password, then clears the token", async () => {
    const repository = new FakePeerPartnerRepository();
    repository.rows = [
      Object.assign(
        { id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local", passwordHash: null, setPasswordTokenExpiresAt: new Date(Date.now() + 60_000), institutionId: "institution-1", specialty: "Clínica médica", isActive: true } as PeerPartnerRow,
        { setPasswordToken: "abc123" },
      ),
    ];
    const passwordService = new PeerPartnerPasswordService();
    const useCase = new FinishPeerPartnerSetupUseCase(repository, passwordService);

    await useCase.execute({ token: "abc123", password: "new-password-123" });

    expect(repository.lastUpdate?.id).toBe("peer-1");
    expect(repository.lastUpdate?.patch.setPasswordToken).toBeNull();
    expect(repository.lastUpdate?.patch.setPasswordTokenExpiresAt).toBeNull();
    const newHash = repository.lastUpdate!.patch.passwordHash!;
    expect(await passwordService.verify("new-password-123", newHash)).toBe(true);
  });
});
```

Run: `pnpm --filter @zelo/api test finish-peer-partner-setup -- --run` — expected FAIL.

Create `apps/api/src/modules/peer-partner/application/use-cases/finish-peer-partner-setup.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../ports/peer-partner-repository.port.ts";
import { PeerPartnerPasswordService } from "../services/peer-partner-password.service.ts";

export class InvalidOrExpiredPeerPartnerSetupTokenError extends Error {}

export interface FinishPeerPartnerSetupInput {
  token: string;
  password: string;
}

@Injectable()
export class FinishPeerPartnerSetupUseCase {
  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
    @Inject(PeerPartnerPasswordService) private readonly passwordService: PeerPartnerPasswordService,
  ) {}

  async execute(input: FinishPeerPartnerSetupInput): Promise<void> {
    const peerPartner = await this.repository.findBySetPasswordToken(input.token);
    if (!peerPartner || !peerPartner.setPasswordTokenExpiresAt || peerPartner.setPasswordTokenExpiresAt.getTime() < Date.now()) {
      throw new InvalidOrExpiredPeerPartnerSetupTokenError();
    }

    const passwordHash = await this.passwordService.hash(input.password);
    await this.repository.update(peerPartner.id, { passwordHash, setPasswordToken: null, setPasswordTokenExpiresAt: null });
  }
}
```

Run: `pnpm --filter @zelo/api test finish-peer-partner-setup -- --run` — expected PASS.

- [ ] **Step 4: Add the `finish-setup` endpoint to `PeerPartnerController`**

In `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts`, add these imports:

```ts
import { FinishPeerPartnerSetupUseCase, InvalidOrExpiredPeerPartnerSetupTokenError } from "../application/use-cases/finish-peer-partner-setup.use-case.ts";
```

Add this schema alongside `LoginRequestSchema`:

```ts
const FinishSetupRequestSchema = z.object({ token: z.string().min(1), password: z.string().min(8).max(200) });
```

Add a constructor parameter:

```ts
    @Inject(FinishPeerPartnerSetupUseCase) private readonly finishPeerPartnerSetup: FinishPeerPartnerSetupUseCase,
```

Add this handler:

```ts
  @Post("finish-setup")
  @HttpCode(200)
  async finishSetup(@Body() body: unknown): Promise<void> {
    const parsed = FinishSetupRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      await this.finishPeerPartnerSetup.execute(parsed.data);
    } catch (error) {
      if (error instanceof InvalidOrExpiredPeerPartnerSetupTokenError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }
```

- [ ] **Step 5: Add the failing test for `POST /peer-partner/finish-setup`, then confirm it passes**

In `apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.test.ts` (the file Task 5 rewrote in full), add this import:

```ts
import { FinishPeerPartnerSetupUseCase } from "../application/use-cases/finish-peer-partner-setup.use-case.ts";
```

Add `FinishPeerPartnerSetupUseCase` to the `providers` array in `beforeAll`.

Change `FakePeerPartnerRepository`'s `findBySetPasswordToken` and `update` methods from "not used in this test" throws to real implementations:

```ts
  async findBySetPasswordToken(token: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((row) => (row as unknown as { setPasswordToken?: string }).setPasswordToken === token) ?? null;
  }
```

```ts
  async update(id: string, patch: Partial<PeerPartnerRow> & { setPasswordToken?: string | null }): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) Object.assign(row, { [key]: value });
    }
  }
```

Add these tests:

```ts
  it("POST /peer-partner/finish-setup sets the password for a valid, unexpired token", async () => {
    const passwordService = new PeerPartnerPasswordService();
    repository.rows.push({
      id: "peer-pending",
      name: "Dr. Novo",
      email: "novo@zelo-demo.local",
      passwordHash: null,
      setPasswordTokenExpiresAt: new Date(Date.now() + 60_000),
      institutionId: "institution-1",
      specialty: "Psiquiatria",
      isActive: true,
    });
    (repository.rows[repository.rows.length - 1] as unknown as { setPasswordToken: string }).setPasswordToken = "valid-token";

    const response = await request(app.getHttpServer()).post("/peer-partner/finish-setup").send({ token: "valid-token", password: "new-password-123" });

    expect(response.status).toBe(200);
    const updated = repository.rows.find((row) => row.id === "peer-pending")!;
    expect(await passwordService.verify("new-password-123", updated.passwordHash!)).toBe(true);
  });

  it("POST /peer-partner/finish-setup rejects an unknown token with 401", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/finish-setup").send({ token: "unknown-token", password: "new-password-123" });
    expect(response.status).toBe(401);
  });

  it("POST /peer-partner/finish-setup rejects a malformed body with 400", async () => {
    const response = await request(app.getHttpServer()).post("/peer-partner/finish-setup").send({ token: "x" });
    expect(response.status).toBe(400);
  });
```

Run: `pnpm --filter @zelo/api test peer-partner.controller -- --run`
Expected: PASS (all tests).

- [ ] **Step 6: Update `ManagerAdminController`'s peer-partner reset-password endpoint**

In `apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts`:

Replace the import:

```ts
import { SendPeerPartnerSetPasswordEmailUseCase } from "../application/use-cases/send-peer-partner-set-password-email.use-case.ts";
```

Replace the constructor parameter:

```ts
    @Inject(SendPeerPartnerSetPasswordEmailUseCase) private readonly sendPeerPartnerSetPasswordEmail: SendPeerPartnerSetPasswordEmailUseCase,
```

Add `email` to `CreatePeerPartnerSchema`:

```ts
const CreatePeerPartnerSchema = z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(200), specialty: z.string().trim().min(1).max(200) });
```

Replace the `resetPeerPartnerPasswordHandler` method with:

```ts
  @Post("peer-partners/:id/send-set-password-email")
  @HttpCode(200)
  async sendPeerPartnerSetPasswordEmailHandler(@Req() request: Request, @Param("id") id: string): Promise<void> {
    try {
      await this.sendPeerPartnerSetPasswordEmail.execute({ institutionId: request.manager!.institutionId, peerPartnerId: id });
    } catch (error) {
      if (error instanceof PeerPartnerNotFoundError) {
        throw new NotFoundException();
      }
      throw error;
    }
  }
```

- [ ] **Step 7: Update `manager-admin.controller.test.ts`**

Replace the import:

```ts
import { SendPeerPartnerSetPasswordEmailUseCase } from "../application/use-cases/send-peer-partner-set-password-email.use-case.ts";
```

In `FakePeerPartnerRepository`: rename `findByName` to `findByEmail` (same "not used" throw), add a `findBySetPasswordToken` stub (same throw). Update `findAllByInstitution`'s mapping and `create`'s signature to match the new port shape (mirroring exactly what Step 7 of Task 4 did for `FakeManagerRepository`):

```ts
  async findAllByInstitution(institutionId: string): Promise<PeerPartnerSummaryRow[]> {
    return this.rows
      .filter((r) => r.institutionId === institutionId)
      .map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        specialty: r.specialty,
        isActive: r.isActive,
        hasPassword: r.passwordHash !== null,
        setPasswordTokenExpiresAt: r.setPasswordTokenExpiresAt?.toISOString() ?? null,
      }));
  }
  async create(params: CreatePeerPartnerParams): Promise<{ id: string; name: string; email: string }> {
    const row: PeerPartnerRow = {
      id: `peer-${this.rows.length + 10}`,
      name: params.name,
      email: params.email,
      passwordHash: null,
      setPasswordTokenExpiresAt: params.setPasswordTokenExpiresAt,
      institutionId: params.institutionId,
      specialty: params.specialty,
      isActive: true,
    };
    this.rows.push(row);
    return { id: row.id, name: row.name, email: row.email };
  }
```

Replace `ResetPeerPartnerPasswordUseCase` with `SendPeerPartnerSetPasswordEmailUseCase` in the `Test.createTestingModule({...})` providers array. (`emailPort`/`FakeEmailPort` already exist in this file from Task 4 Step 7 — reuse the same instance, don't create a second one.)

Add `email: "dra-ana@institution-1.local"` and `setPasswordTokenExpiresAt: null` to every literal `PeerPartnerRow` in this file (the `GET`/`PATCH`/`POST` peer-partner test bodies use `{ id: "peer-1", name: "Dra. Ana", ... }` and `{ id: "peer-other", name: "Outro", ... }` — give the second one `email: "outro@institution-2.local"`).

Update the `POST /manager/admin/peer-partners creates a peer partner...` test — send `email` in the body and assert the invite email instead of `temporaryPassword`:

```ts
  it("POST /manager/admin/peer-partners creates a peer partner and sends an invite email", async () => {
    const response = await request(app.getHttpServer())
      .post("/manager/admin/peer-partners")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`)
      .send({ name: "Dra. Ana", email: "ana2@institution-1.local", specialty: "Clínica médica" });

    expect(response.status).toBe(201);
    expect(response.body.peerPartner).toEqual({ id: expect.any(String), name: "Dra. Ana", email: "ana2@institution-1.local" });
    expect(emailPort.lastSend?.to).toBe("ana2@institution-1.local");
    expect(emailPort.lastSend?.template).toBe("invite");
  });
```

Replace the `POST /manager/admin/peer-partners/:id/reset-password returns a new temporary password` test with:

```ts
  it("POST /manager/admin/peer-partners/:id/send-set-password-email sends the peer partner an email", async () => {
    peerPartnerRepository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "dra-ana@institution-1.local", passwordHash: "old", setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];

    const response = await request(app.getHttpServer())
      .post("/manager/admin/peer-partners/peer-1/send-set-password-email")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`);

    expect(response.status).toBe(200);
    expect(emailPort.lastSend?.to).toBe("dra-ana@institution-1.local");
    expect(emailPort.lastSend?.template).toBe("password-reset");
  });
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test manager-admin.controller -- --run`
Expected: PASS (all tests).

- [ ] **Step 9: Update `manager.module.ts` and `peer-partner.module.ts`**

In `apps/api/src/modules/manager/manager.module.ts`, replace the `ResetPeerPartnerPasswordUseCase` import and providers-array entry with:

```ts
import { SendPeerPartnerSetPasswordEmailUseCase } from "./application/use-cases/send-peer-partner-set-password-email.use-case.ts";
```

Add `SendPeerPartnerSetPasswordEmailUseCase` to the `providers` array in place of `ResetPeerPartnerPasswordUseCase`.

In `apps/api/src/modules/peer-partner/peer-partner.module.ts`, add:

```ts
import { FinishPeerPartnerSetupUseCase } from "./application/use-cases/finish-peer-partner-setup.use-case.ts";
```

Add `FinishPeerPartnerSetupUseCase` to the `providers` array.

- [ ] **Step 10: Run the full API test suite**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/modules/manager apps/api/src/modules/peer-partner
git commit -m "feat(api): unify peer-partner invite/reset into one send-set-password-email action, add finish-setup"
```

---

### Task 7: SuperAdmin — email-based login + invite-based first hospital admin

**Files:**

- Modify: `apps/api/src/modules/admin/application/ports/admin-repository.port.ts`
- Modify: `apps/api/src/modules/admin/infrastructure/persistence/prisma-admin.repository.ts`
- Modify: `apps/api/src/modules/admin/application/use-cases/login-admin.use-case.ts`
- Modify: `apps/api/src/modules/admin/application/use-cases/login-admin.use-case.test.ts`
- Modify: `apps/api/src/modules/admin/application/ports/admin-institution-repository.port.ts`
- Modify: `apps/api/src/modules/admin/infrastructure/persistence/prisma-admin-institution.repository.ts`
- Modify: `apps/api/src/modules/admin/application/use-cases/create-institution.use-case.ts`
- Modify: `apps/api/src/modules/admin/application/use-cases/create-institution.use-case.test.ts`
- Modify: `apps/api/src/modules/admin/infrastructure/admin.controller.ts`
- Modify: `apps/api/src/modules/admin/infrastructure/admin.controller.test.ts`
- Modify: `apps/api/src/modules/admin/admin.module.ts`

**Interfaces:**

- Consumes: `EmailPort`/`EMAIL_PORT`, `buildSetPasswordUrl` (Task 2); Manager's `setPasswordToken`/`setPasswordTokenExpiresAt` columns (Task 1).
- Produces: `LoginAdminUseCase.execute(email, password)`; `CreateInstitutionUseCase.execute` returns `{ institution, hospitalAdmin: { id, name, email } }` (no password) and sends an invite email to the new hospital admin.

`SuperAdmin` itself has no invite flow (per the spec — seed-only bootstrap), so only its login changes. `CreateInstitutionUseCase` creates a `Manager` row (the institution's first hospital admin), which DOES get the invite treatment, exactly like `CreateManagerUseCase` (Task 3).

- [ ] **Step 1: Update the `AdminRepository` port**

Replace `apps/api/src/modules/admin/application/ports/admin-repository.port.ts` in full:

```ts
export interface AdminRow {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
}

export interface AdminRepository {
  findByEmail(email: string): Promise<AdminRow | null>;
}

export const ADMIN_REPOSITORY = Symbol("ADMIN_REPOSITORY");
```

- [ ] **Step 2: Update the Prisma adapter**

Replace `apps/api/src/modules/admin/infrastructure/persistence/prisma-admin.repository.ts` in full:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { AdminRepository, AdminRow } from "../../application/ports/admin-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaAdminRepository implements AdminRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<AdminRow | null> {
    const row = await this.prisma.superAdmin.findUnique({ where: { email } });
    if (!row) return null;
    return { id: row.id, name: row.name, email: row.email, passwordHash: row.passwordHash };
  }
}
```

- [ ] **Step 3: Update the failing test for `LoginAdminUseCase`, then update it**

Replace `apps/api/src/modules/admin/application/use-cases/login-admin.use-case.test.ts` in full:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { LoginAdminUseCase, InvalidAdminCredentialsError } from "./login-admin.use-case.ts";
import { AdminPasswordService } from "../services/admin-password.service.ts";
import { AdminTokenService } from "../services/admin-token.service.ts";
import type { AdminRepository, AdminRow } from "../ports/admin-repository.port.ts";

class FakeAdminRepository implements AdminRepository {
  constructor(private readonly rows: AdminRow[]) {}
  async findByEmail(email: string): Promise<AdminRow | null> {
    return this.rows.find((row) => row.email === email) ?? null;
  }
}

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("LoginAdminUseCase", () => {
  it("issues a token when the email and password match", async () => {
    const passwordService = new AdminPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeAdminRepository([{ id: "admin-1", name: "Zelo Ops", email: "ops@zelo-demo.local", passwordHash }]);
    const tokenService = new AdminTokenService(fakeConfig("token-secret"));
    const useCase = new LoginAdminUseCase(repository, passwordService, tokenService);

    const result = await useCase.execute("ops@zelo-demo.local", "correct-password");

    expect(tokenService.verify(result.token)).toEqual({ adminId: "admin-1", adminName: "Zelo Ops" });
  });

  it("throws InvalidAdminCredentialsError when the email is unknown", async () => {
    const passwordService = new AdminPasswordService();
    const repository = new FakeAdminRepository([]);
    const tokenService = new AdminTokenService(fakeConfig("token-secret"));
    const useCase = new LoginAdminUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("unknown@zelo-demo.local", "any-password")).rejects.toThrow(InvalidAdminCredentialsError);
  });

  it("throws InvalidAdminCredentialsError when the password is wrong", async () => {
    const passwordService = new AdminPasswordService();
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeAdminRepository([{ id: "admin-1", name: "Zelo Ops", email: "ops@zelo-demo.local", passwordHash }]);
    const tokenService = new AdminTokenService(fakeConfig("token-secret"));
    const useCase = new LoginAdminUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("ops@zelo-demo.local", "wrong-password")).rejects.toThrow(InvalidAdminCredentialsError);
  });

  it("pays the same password-verification cost for an unknown email as for a known one", async () => {
    const passwordService = new AdminPasswordService();
    const verifySpy = vi.spyOn(passwordService, "verify");
    const passwordHash = await passwordService.hash("correct-password");
    const repository = new FakeAdminRepository([{ id: "admin-1", name: "Zelo Ops", email: "ops@zelo-demo.local", passwordHash }]);
    const tokenService = new AdminTokenService(fakeConfig("token-secret"));
    const useCase = new LoginAdminUseCase(repository, passwordService, tokenService);

    await expect(useCase.execute("unknown@zelo-demo.local", "any-password")).rejects.toThrow(InvalidAdminCredentialsError);
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });
});
```

Run: `pnpm --filter @zelo/api test login-admin.use-case -- --run` — expected FAIL.

Replace `apps/api/src/modules/admin/application/use-cases/login-admin.use-case.ts` in full:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { ADMIN_REPOSITORY, type AdminRepository } from "../ports/admin-repository.port.ts";
import { AdminPasswordService } from "../services/admin-password.service.ts";
import { AdminTokenService, type IssuedAdminToken } from "../services/admin-token.service.ts";

export class InvalidAdminCredentialsError extends Error {}

const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

@Injectable()
export class LoginAdminUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly adminRepository: AdminRepository,
    @Inject(AdminPasswordService) private readonly passwordService: AdminPasswordService,
    @Inject(AdminTokenService) private readonly tokenService: AdminTokenService,
  ) {}

  async execute(email: string, password: string): Promise<IssuedAdminToken> {
    const admin = await this.adminRepository.findByEmail(email);

    const isValid = await this.passwordService.verify(password, admin?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!admin || !isValid) {
      throw new InvalidAdminCredentialsError();
    }

    return this.tokenService.issue(admin.id, admin.name);
  }
}
```

Run: `pnpm --filter @zelo/api test login-admin.use-case -- --run` — expected PASS.

- [ ] **Step 4: Update the `AdminInstitutionRepository` port**

Replace `apps/api/src/modules/admin/application/ports/admin-institution-repository.port.ts` in full:

```ts
export interface AdminInstitutionRow {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: Date;
  hospitalAdminNames: string[];
}

export interface CreateInstitutionParams {
  institutionName: string;
  inviteCode: string;
  hospitalAdminName: string;
  hospitalAdminEmail: string;
  setPasswordToken: string;
  setPasswordTokenExpiresAt: Date;
}

export interface AdminInstitutionRepository {
  createWithHospitalAdmin(
    params: CreateInstitutionParams,
  ): Promise<{ institution: { id: string; name: string; inviteCode: string }; hospitalAdmin: { id: string; name: string; email: string } }>;
  findAll(): Promise<AdminInstitutionRow[]>;
}

export const ADMIN_INSTITUTION_REPOSITORY = Symbol("ADMIN_INSTITUTION_REPOSITORY");

// Thrown on a unique-constraint violation on institution name/inviteCode or manager email.
export class DuplicateInstitutionOrManagerError extends Error {}
```

- [ ] **Step 5: Update the Prisma adapter**

Replace `apps/api/src/modules/admin/infrastructure/persistence/prisma-admin-institution.repository.ts` in full:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../../../../../generated/prisma/client.ts";
import type {
  AdminInstitutionRepository,
  AdminInstitutionRow,
  CreateInstitutionParams,
} from "../../application/ports/admin-institution-repository.port.ts";
import { DuplicateInstitutionOrManagerError } from "../../application/ports/admin-institution-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

@Injectable()
export class PrismaAdminInstitutionRepository implements AdminInstitutionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createWithHospitalAdmin(
    params: CreateInstitutionParams,
  ): Promise<{ institution: { id: string; name: string; inviteCode: string }; hospitalAdmin: { id: string; name: string; email: string } }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const institution = await tx.institution.create({
          data: { name: params.institutionName, inviteCode: params.inviteCode },
        });
        const hospitalAdmin = await tx.manager.create({
          data: {
            name: params.hospitalAdminName,
            email: params.hospitalAdminEmail,
            institutionId: institution.id,
            role: "HOSPITAL_ADMIN",
            setPasswordToken: params.setPasswordToken,
            setPasswordTokenExpiresAt: params.setPasswordTokenExpiresAt,
          },
        });
        return {
          institution: { id: institution.id, name: institution.name, inviteCode: institution.inviteCode },
          hospitalAdmin: { id: hospitalAdmin.id, name: hospitalAdmin.name, email: hospitalAdmin.email },
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        throw new DuplicateInstitutionOrManagerError();
      }
      throw error;
    }
  }

  async findAll(): Promise<AdminInstitutionRow[]> {
    const institutions = await this.prisma.institution.findMany({
      include: { managers: { where: { role: "HOSPITAL_ADMIN" }, select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return institutions.map((institution) => ({
      id: institution.id,
      name: institution.name,
      inviteCode: institution.inviteCode,
      createdAt: institution.createdAt,
      hospitalAdminNames: institution.managers.map((manager) => manager.name),
    }));
  }
}
```

- [ ] **Step 6: Update the failing test for `CreateInstitutionUseCase`, then update it**

Replace `apps/api/src/modules/admin/application/use-cases/create-institution.use-case.test.ts` in full:

```ts
import { describe, expect, it } from "vitest";
import { CreateInstitutionUseCase } from "./create-institution.use-case.ts";
import type { EmailPort, EmailTemplate, SendEmailParams } from "../../../../shared/email/email.port.ts";
import {
  DuplicateInstitutionOrManagerError,
  type AdminInstitutionRepository,
  type AdminInstitutionRow,
} from "../ports/admin-institution-repository.port.ts";

class FakeAdminInstitutionRepository implements AdminInstitutionRepository {
  public lastCreateParams: Parameters<AdminInstitutionRepository["createWithHospitalAdmin"]>[0] | null = null;
  public shouldThrowDuplicate = false;

  async createWithHospitalAdmin(
    params: Parameters<AdminInstitutionRepository["createWithHospitalAdmin"]>[0],
  ): ReturnType<AdminInstitutionRepository["createWithHospitalAdmin"]> {
    this.lastCreateParams = params;
    if (this.shouldThrowDuplicate) throw new DuplicateInstitutionOrManagerError();
    return {
      institution: { id: "institution-1", name: params.institutionName, inviteCode: params.inviteCode },
      hospitalAdmin: { id: "manager-1", name: params.hospitalAdminName, email: params.hospitalAdminEmail },
    };
  }

  async findAll(): Promise<AdminInstitutionRow[]> {
    throw new Error("not used in this test");
  }
}

class FakeEmailPort implements EmailPort {
  public lastSend: { to: string; template: EmailTemplate; params: SendEmailParams } | null = null;
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.lastSend = { to, template, params };
  }
}

describe("CreateInstitutionUseCase", () => {
  it("creates the institution and its first hospital admin with a set-password token, sending an invite email", async () => {
    const repository = new FakeAdminInstitutionRepository();
    const emailPort = new FakeEmailPort();
    const useCase = new CreateInstitutionUseCase(repository, emailPort);

    const result = await useCase.execute({
      institutionName: "Hospital Teste",
      inviteCode: "teste-2026",
      hospitalAdminName: "Mauricio",
      hospitalAdminEmail: "mauricio@zelo-demo.local",
    });

    expect(result.institution).toEqual({ id: "institution-1", name: "Hospital Teste", inviteCode: "teste-2026" });
    expect(result.hospitalAdmin).toEqual({ id: "manager-1", name: "Mauricio", email: "mauricio@zelo-demo.local" });
    expect(repository.lastCreateParams!.setPasswordToken).toEqual(expect.any(String));
    expect(repository.lastCreateParams!.setPasswordTokenExpiresAt).toBeInstanceOf(Date);
    expect(emailPort.lastSend?.to).toBe("mauricio@zelo-demo.local");
    expect(emailPort.lastSend?.template).toBe("invite");
    expect(emailPort.lastSend?.params.setPasswordUrl).toContain(repository.lastCreateParams!.setPasswordToken);
  });

  it("propagates DuplicateInstitutionOrManagerError from the repository", async () => {
    const repository = new FakeAdminInstitutionRepository();
    repository.shouldThrowDuplicate = true;
    const useCase = new CreateInstitutionUseCase(repository, new FakeEmailPort());

    await expect(
      useCase.execute({ institutionName: "Hospital Teste", inviteCode: "teste-2026", hospitalAdminName: "Mauricio", hospitalAdminEmail: "mauricio@zelo-demo.local" }),
    ).rejects.toThrow(DuplicateInstitutionOrManagerError);
  });
});
```

Run: `pnpm --filter @zelo/api test create-institution.use-case -- --run` — expected FAIL.

Replace `apps/api/src/modules/admin/application/use-cases/create-institution.use-case.ts` in full:

```ts
import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  ADMIN_INSTITUTION_REPOSITORY,
  type AdminInstitutionRepository,
} from "../ports/admin-institution-repository.port.ts";
import { EMAIL_PORT, type EmailPort } from "../../../../shared/email/email.port.ts";
import { buildSetPasswordUrl } from "../../../../shared/email/build-set-password-url.ts";

const SET_PASSWORD_TOKEN_BYTES = 32;
const SET_PASSWORD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export interface CreateInstitutionInput {
  institutionName: string;
  inviteCode: string;
  hospitalAdminName: string;
  hospitalAdminEmail: string;
}

export interface CreateInstitutionResult {
  institution: { id: string; name: string; inviteCode: string };
  hospitalAdmin: { id: string; name: string; email: string };
}

@Injectable()
export class CreateInstitutionUseCase {
  constructor(
    @Inject(ADMIN_INSTITUTION_REPOSITORY) private readonly repository: AdminInstitutionRepository,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
  ) {}

  async execute(input: CreateInstitutionInput): Promise<CreateInstitutionResult> {
    const setPasswordToken = randomBytes(SET_PASSWORD_TOKEN_BYTES).toString("hex");
    const setPasswordTokenExpiresAt = new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS);

    const { institution, hospitalAdmin } = await this.repository.createWithHospitalAdmin({
      institutionName: input.institutionName,
      inviteCode: input.inviteCode,
      hospitalAdminName: input.hospitalAdminName,
      hospitalAdminEmail: input.hospitalAdminEmail,
      setPasswordToken,
      setPasswordTokenExpiresAt,
    });

    await this.emailPort.send(hospitalAdmin.email, "invite", { name: hospitalAdmin.name, setPasswordUrl: buildSetPasswordUrl("manager", setPasswordToken) });

    return { institution, hospitalAdmin };
  }
}
```

Run: `pnpm --filter @zelo/api test create-institution.use-case -- --run` — expected PASS.

- [ ] **Step 7: Update `AdminController`**

Replace `apps/api/src/modules/admin/infrastructure/admin.controller.ts` in full:

```ts
import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { LoginAdminUseCase, InvalidAdminCredentialsError } from "../application/use-cases/login-admin.use-case.ts";
import { CreateInstitutionUseCase, type CreateInstitutionResult } from "../application/use-cases/create-institution.use-case.ts";
import { ListInstitutionsUseCase } from "../application/use-cases/list-institutions.use-case.ts";
import type { AdminInstitutionRow } from "../application/ports/admin-institution-repository.port.ts";
import { DuplicateInstitutionOrManagerError } from "../application/ports/admin-institution-repository.port.ts";
import type { IssuedAdminToken } from "../application/services/admin-token.service.ts";
import { AdminAuthGuard } from "./admin-auth.guard.ts";

const LoginRequestSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });
const CreateInstitutionSchema = z.object({
  institutionName: z.string().min(1).max(200),
  inviteCode: z.string().min(1).max(100),
  hospitalAdminName: z.string().min(1).max(200),
  hospitalAdminEmail: z.string().email().max(200),
});

@Controller("admin")
export class AdminController {
  constructor(
    @Inject(LoginAdminUseCase) private readonly loginAdmin: LoginAdminUseCase,
    @Inject(CreateInstitutionUseCase) private readonly createInstitution: CreateInstitutionUseCase,
    @Inject(ListInstitutionsUseCase) private readonly listInstitutions: ListInstitutionsUseCase,
  ) {}

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

  @Post("institutions")
  @HttpCode(201)
  @UseGuards(AdminAuthGuard)
  async createInstitutionHandler(@Body() body: unknown): Promise<CreateInstitutionResult> {
    const parsed = CreateInstitutionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.createInstitution.execute(parsed.data);
    } catch (error) {
      if (error instanceof DuplicateInstitutionOrManagerError) {
        throw new ConflictException();
      }
      throw error;
    }
  }

  @Get("institutions")
  @UseGuards(AdminAuthGuard)
  async listInstitutionsHandler(): Promise<AdminInstitutionRow[]> {
    return this.listInstitutions.execute();
  }
}
```

- [ ] **Step 8: Update `admin.controller.test.ts`**

Replace `apps/api/src/modules/admin/infrastructure/admin.controller.test.ts` in full:

```ts
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { AdminController } from "./admin.controller.ts";
import { LoginAdminUseCase } from "../application/use-cases/login-admin.use-case.ts";
import { AdminTokenService } from "../application/services/admin-token.service.ts";
import { AdminPasswordService } from "../application/services/admin-password.service.ts";
import { ADMIN_REPOSITORY } from "../application/ports/admin-repository.port.ts";
import type { AdminRepository, AdminRow } from "../application/ports/admin-repository.port.ts";
import { CreateInstitutionUseCase } from "../application/use-cases/create-institution.use-case.ts";
import { ListInstitutionsUseCase } from "../application/use-cases/list-institutions.use-case.ts";
import { AdminAuthGuard } from "./admin-auth.guard.ts";
import {
  ADMIN_INSTITUTION_REPOSITORY,
  DuplicateInstitutionOrManagerError,
} from "../application/ports/admin-institution-repository.port.ts";
import type { AdminInstitutionRepository, AdminInstitutionRow } from "../application/ports/admin-institution-repository.port.ts";
import { EMAIL_PORT } from "../../../shared/email/email.port.ts";
import type { EmailPort, EmailTemplate, SendEmailParams } from "../../../shared/email/email.port.ts";

class FakeAdminRepository implements AdminRepository {
  public rows: AdminRow[] = [];
  async findByEmail(email: string): Promise<AdminRow | null> {
    return this.rows.find((row) => row.email === email) ?? null;
  }
}

class FakeAdminInstitutionRepository implements AdminInstitutionRepository {
  public rows: AdminInstitutionRow[] = [];
  public shouldThrowDuplicate = false;
  public lastCreateParams: { hospitalAdminEmail: string; setPasswordToken: string } | null = null;
  async createWithHospitalAdmin(params: {
    institutionName: string;
    inviteCode: string;
    hospitalAdminName: string;
    hospitalAdminEmail: string;
    setPasswordToken: string;
    setPasswordTokenExpiresAt: Date;
  }) {
    this.lastCreateParams = params;
    if (this.shouldThrowDuplicate) throw new DuplicateInstitutionOrManagerError();
    return {
      institution: { id: "institution-1", name: params.institutionName, inviteCode: params.inviteCode },
      hospitalAdmin: { id: "manager-1", name: params.hospitalAdminName, email: params.hospitalAdminEmail },
    };
  }
  async findAll(): Promise<AdminInstitutionRow[]> {
    return this.rows;
  }
}

class FakeEmailPort implements EmailPort {
  public lastSend: { to: string; template: EmailTemplate; params: SendEmailParams } | null = null;
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.lastSend = { to, template, params };
  }
}

function fakeConfig(): ConfigService {
  const values: Record<string, string> = { ADMIN_TOKEN_SECRET: "test-secret" };
  return { getOrThrow: (key: string) => values[key], get: () => undefined } as unknown as ConfigService;
}

describe("admin controller", () => {
  let app: INestApplication;
  let adminRepository: FakeAdminRepository;
  let institutionRepository: FakeAdminInstitutionRepository;
  let emailPort: FakeEmailPort;

  beforeAll(async () => {
    const passwordService = new AdminPasswordService();
    adminRepository = new FakeAdminRepository();
    adminRepository.rows = [{ id: "admin-1", name: "Zelo Ops", email: "ops@zelo-demo.local", passwordHash: await passwordService.hash("test-password") }];
    institutionRepository = new FakeAdminInstitutionRepository();
    emailPort = new FakeEmailPort();

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        LoginAdminUseCase,
        CreateInstitutionUseCase,
        ListInstitutionsUseCase,
        AdminTokenService,
        AdminPasswordService,
        AdminAuthGuard,
        { provide: ADMIN_REPOSITORY, useValue: adminRepository },
        { provide: ADMIN_INSTITUTION_REPOSITORY, useValue: institutionRepository },
        { provide: EMAIL_PORT, useValue: emailPort },
        { provide: ConfigService, useValue: fakeConfig() },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /admin/login returns a token for the correct email and password", async () => {
    const response = await request(app.getHttpServer()).post("/admin/login").send({ email: "ops@zelo-demo.local", password: "test-password" });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
  });

  it("POST /admin/login rejects an unknown email with 401", async () => {
    const response = await request(app.getHttpServer()).post("/admin/login").send({ email: "unknown@zelo-demo.local", password: "test-password" });
    expect(response.status).toBe(401);
  });

  it("POST /admin/login rejects a malformed body with 400", async () => {
    const response = await request(app.getHttpServer()).post("/admin/login").send({});
    expect(response.status).toBe(400);
  });

  it("POST /admin/institutions rejects a request with no token", async () => {
    const response = await request(app.getHttpServer()).post("/admin/institutions").send({});
    expect(response.status).toBe(401);
  });

  it("POST /admin/institutions creates the institution and its first hospital admin, sending an invite email", async () => {
    const login = await request(app.getHttpServer()).post("/admin/login").send({ email: "ops@zelo-demo.local", password: "test-password" });
    const token = login.body.token;

    const response = await request(app.getHttpServer())
      .post("/admin/institutions")
      .set("Authorization", `Bearer ${token}`)
      .send({ institutionName: "Hospital Teste", inviteCode: "teste-2026", hospitalAdminName: "Mauricio", hospitalAdminEmail: "mauricio@zelo-demo.local" });

    expect(response.status).toBe(201);
    expect(response.body.institution).toEqual({ id: "institution-1", name: "Hospital Teste", inviteCode: "teste-2026" });
    expect(response.body.hospitalAdmin).toEqual({ id: "manager-1", name: "Mauricio", email: "mauricio@zelo-demo.local" });
    expect(emailPort.lastSend?.to).toBe("mauricio@zelo-demo.local");
    expect(emailPort.lastSend?.template).toBe("invite");
  });

  it("POST /admin/institutions returns 409 on a duplicate institution or manager email", async () => {
    institutionRepository.shouldThrowDuplicate = true;
    const login = await request(app.getHttpServer()).post("/admin/login").send({ email: "ops@zelo-demo.local", password: "test-password" });
    const token = login.body.token;

    const response = await request(app.getHttpServer())
      .post("/admin/institutions")
      .set("Authorization", `Bearer ${token}`)
      .send({ institutionName: "Hospital Teste", inviteCode: "teste-2026", hospitalAdminName: "Mauricio", hospitalAdminEmail: "mauricio@zelo-demo.local" });

    expect(response.status).toBe(409);
    institutionRepository.shouldThrowDuplicate = false;
  });

  it("GET /admin/institutions rejects a request with no token", async () => {
    const response = await request(app.getHttpServer()).get("/admin/institutions");
    expect(response.status).toBe(401);
  });

  it("GET /admin/institutions returns the repository's rows", async () => {
    institutionRepository.rows = [
      { id: "institution-1", name: "Hospital Teste", inviteCode: "teste-2026", createdAt: new Date("2026-08-01T00:00:00.000Z"), hospitalAdminNames: ["Mauricio"] },
    ];
    const login = await request(app.getHttpServer()).post("/admin/login").send({ email: "ops@zelo-demo.local", password: "test-password" });
    const token = login.body.token;

    const response = await request(app.getHttpServer()).get("/admin/institutions").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({ id: "institution-1", name: "Hospital Teste", hospitalAdminNames: ["Mauricio"] }),
    ]);
  });
});
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test admin.controller -- --run`
Expected: PASS.

- [ ] **Step 10: Update `AdminModule`**

Replace `apps/api/src/modules/admin/admin.module.ts` in full:

```ts
import { Module } from "@nestjs/common";
import { AdminController } from "./infrastructure/admin.controller.ts";
import { AdminAuthGuard } from "./infrastructure/admin-auth.guard.ts";
import { PrismaAdminRepository } from "./infrastructure/persistence/prisma-admin.repository.ts";
import { PrismaAdminInstitutionRepository } from "./infrastructure/persistence/prisma-admin-institution.repository.ts";
import { LoginAdminUseCase } from "./application/use-cases/login-admin.use-case.ts";
import { CreateInstitutionUseCase } from "./application/use-cases/create-institution.use-case.ts";
import { ListInstitutionsUseCase } from "./application/use-cases/list-institutions.use-case.ts";
import { AdminTokenService } from "./application/services/admin-token.service.ts";
import { AdminPasswordService } from "./application/services/admin-password.service.ts";
import { ADMIN_REPOSITORY } from "./application/ports/admin-repository.port.ts";
import { ADMIN_INSTITUTION_REPOSITORY } from "./application/ports/admin-institution-repository.port.ts";
import { EmailModule } from "../../shared/email/email.module.ts";

@Module({
  imports: [EmailModule],
  controllers: [AdminController],
  providers: [
    LoginAdminUseCase,
    CreateInstitutionUseCase,
    ListInstitutionsUseCase,
    AdminTokenService,
    AdminPasswordService,
    AdminAuthGuard,
    { provide: ADMIN_REPOSITORY, useClass: PrismaAdminRepository },
    { provide: ADMIN_INSTITUTION_REPOSITORY, useClass: PrismaAdminInstitutionRepository },
  ],
})
export class AdminModule {}
```

(`ManagerPasswordService` is removed from this module entirely — `CreateInstitutionUseCase` no longer hashes a password at all, since the hospital admin now sets their own via the invite flow.)

- [ ] **Step 11: Run the full API test suite**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/modules/admin
git commit -m "feat(api): switch super-admin login to email, make first-hospital-admin creation invite-based"
```

---

### Task 8: Frontend — Manager login (email) + shared `FinishSetupPage`

**Files:**

- Modify: `apps/web/src/ports/manager-auth.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-manager-auth.adapter.ts`
- Modify: `apps/web/src/use-cases/login-manager.usecase.ts`
- Create: `apps/web/src/use-cases/finish-manager-setup.usecase.ts`
- Create: `apps/web/src/use-cases/finish-manager-setup.usecase.test.ts`
- Modify: `apps/web/src/presentation/hooks/useManagerLogin.ts`
- Create: `apps/web/src/presentation/hooks/useFinishManagerSetup.ts`
- Create: `apps/web/src/presentation/components/FinishSetupForm.tsx`
- Create: `apps/web/src/presentation/components/FinishSetupForm.test.tsx`
- Create: `apps/web/src/presentation/pages/ManagerFinishSetupPage.tsx`
- Create: `apps/web/src/presentation/pages/ManagerFinishSetupPage.test.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerLoginPage.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerLoginPage.test.tsx`
- Modify: `apps/web/src/presentation/lib/routes.ts`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/app/container.ts`

**Interfaces:**

- Produces (used by Task 9): `FinishSetupForm` component — props `{ onSubmit: (params: { token: string; password: string }) => Promise<void>; onSuccess: () => void }` (a form-only component, no routing/shell — the per-entity page wraps it); `routes.managerFinishSetup` (`/manager/finish-setup`).

This task names the shared piece `FinishSetupForm` rather than `FinishSetupPage` — it renders only the card/form, not the `PhoneShell`/title, so both the manager and peer-partner wrapper pages (Task 9) can supply their own title text and page chrome around the identical form.

- [ ] **Step 1: Update the port**

Replace `apps/web/src/ports/manager-auth.port.ts` in full:

```ts
import { z } from "zod";

export const ManagerLoginResultSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  role: z.enum(["HOSPITAL_ADMIN", "SECTOR_MANAGER"]),
});
export type ManagerLoginResult = z.infer<typeof ManagerLoginResultSchema>;

export class InvalidManagerCredentialsError extends Error {}
export class InvalidOrExpiredManagerSetupTokenError extends Error {}

export interface ManagerAuthPort {
  login(email: string, password: string): Promise<ManagerLoginResult>;
  finishSetup(token: string, password: string): Promise<void>;
}
```

- [ ] **Step 2: Update the HTTP adapter**

Replace `apps/web/src/infrastructure/http/http-manager-auth.adapter.ts` in full:

```ts
import type { ManagerAuthPort, ManagerLoginResult } from "@/ports/manager-auth.port";
import { ManagerLoginResultSchema, InvalidManagerCredentialsError, InvalidOrExpiredManagerSetupTokenError } from "@/ports/manager-auth.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpManagerAuthAdapter implements ManagerAuthPort {
  async login(email: string, password: string): Promise<ManagerLoginResult> {
    const response = await fetch(`${API_BASE_URL}/manager/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (response.status === 401) {
      throw new InvalidManagerCredentialsError();
    }
    if (!response.ok) {
      throw new Error(`manager login failed with status ${response.status}`);
    }

    return ManagerLoginResultSchema.parse(await response.json());
  }

  async finishSetup(token: string, password: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/finish-setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    if (response.status === 401) {
      throw new InvalidOrExpiredManagerSetupTokenError();
    }
    if (!response.ok) {
      throw new Error(`manager finish-setup failed with status ${response.status}`);
    }
  }
}
```

- [ ] **Step 3: Update the login use-case**

Replace `apps/web/src/use-cases/login-manager.usecase.ts` in full:

```ts
import type { ManagerAuthPort, ManagerLoginResult } from "@/ports/manager-auth.port";

export class LoginManagerUseCase {
  constructor(private readonly authPort: ManagerAuthPort) {}

  async execute(email: string, password: string): Promise<ManagerLoginResult> {
    return this.authPort.login(email, password);
  }
}
```

(Check `apps/web/src/use-cases/login-manager.usecase.test.ts` for a call like `useCase.execute("Ana Konder", "password")` — if that literal string is there, it still passes unchanged, since the fake port in that test doesn't care what the string represents. No edit needed there.)

- [ ] **Step 4: Write the failing test for `FinishManagerSetupUseCase`, then create it**

Create `apps/web/src/use-cases/finish-manager-setup.usecase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FinishManagerSetupUseCase } from "./finish-manager-setup.usecase";
import type { ManagerAuthPort, ManagerLoginResult } from "@/ports/manager-auth.port";

class FakeManagerAuthPort implements ManagerAuthPort {
  public lastArgs: { token: string; password: string } | null = null;
  async login(): Promise<ManagerLoginResult> {
    throw new Error("not used in this test");
  }
  async finishSetup(token: string, password: string): Promise<void> {
    this.lastArgs = { token, password };
  }
}

describe("FinishManagerSetupUseCase", () => {
  it("delegates to the port", async () => {
    const port = new FakeManagerAuthPort();
    const useCase = new FinishManagerSetupUseCase(port);

    await useCase.execute("some-token", "new-password-123");

    expect(port.lastArgs).toEqual({ token: "some-token", password: "new-password-123" });
  });
});
```

Run: `pnpm --filter web test finish-manager-setup.usecase -- --run` — expected FAIL (file doesn't exist).

Create `apps/web/src/use-cases/finish-manager-setup.usecase.ts`:

```ts
import type { ManagerAuthPort } from "@/ports/manager-auth.port";

export class FinishManagerSetupUseCase {
  constructor(private readonly authPort: ManagerAuthPort) {}

  async execute(token: string, password: string): Promise<void> {
    return this.authPort.finishSetup(token, password);
  }
}
```

Run: `pnpm --filter web test finish-manager-setup.usecase -- --run` — expected PASS.

- [ ] **Step 5: Update the login hook, add the finish-setup hook**

Replace `apps/web/src/presentation/hooks/useManagerLogin.ts` in full:

```ts
import { useMutation } from "@tanstack/react-query";
import { loginManagerUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

interface LoginVariables {
  email: string;
  password: string;
}

export function useManagerLogin() {
  const setSession = useManagerSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: ({ email, password }: LoginVariables) => loginManagerUseCase.execute(email, password),
    onSuccess: (result) => {
      setSession(result.token, result.expiresAt, result.role);
    },
  });
}
```

Create `apps/web/src/presentation/hooks/useFinishManagerSetup.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import { finishManagerSetupUseCase } from "@/app/container";

interface FinishSetupVariables {
  token: string;
  password: string;
}

export function useFinishManagerSetup() {
  return useMutation({
    mutationFn: ({ token, password }: FinishSetupVariables) => finishManagerSetupUseCase.execute(token, password),
  });
}
```

- [ ] **Step 6: Write the failing test for the shared `FinishSetupForm`, then create it**

Create `apps/web/src/presentation/components/FinishSetupForm.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { FinishSetupForm } from "./FinishSetupForm";

function renderWithToken(token: string, onSubmit: (params: { token: string; password: string }) => Promise<void>) {
  return render(
    <MemoryRouter initialEntries={[`/finish-setup?token=${token}`]}>
      <Routes>
        <Route path="/finish-setup" element={<FinishSetupForm onSubmit={onSubmit} onSuccess={() => {}} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FinishSetupForm", () => {
  it("calls onSubmit with the token from the URL and the entered password, then onSuccess", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/finish-setup?token=abc123"]}>
        <Routes>
          <Route path="/finish-setup" element={<FinishSetupForm onSubmit={onSubmit} onSuccess={onSuccess} />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Senha"), "new-password-123");
    await user.type(screen.getByLabelText("Confirme a senha"), "new-password-123");
    await user.click(screen.getByRole("button", { name: "Definir senha" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ token: "abc123", password: "new-password-123" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it("disables submit until both password fields match and are at least 8 characters", async () => {
    const user = userEvent.setup();
    renderWithToken("abc123", vi.fn());

    expect(screen.getByRole("button", { name: "Definir senha" })).toBeDisabled();

    await user.type(screen.getByLabelText("Senha"), "short");
    await user.type(screen.getByLabelText("Confirme a senha"), "short");
    expect(screen.getByRole("button", { name: "Definir senha" })).toBeDisabled();

    await user.clear(screen.getByLabelText("Senha"));
    await user.clear(screen.getByLabelText("Confirme a senha"));
    await user.type(screen.getByLabelText("Senha"), "long-enough-1");
    await user.type(screen.getByLabelText("Confirme a senha"), "different-password");
    expect(screen.getByRole("button", { name: "Definir senha" })).toBeDisabled();

    await user.clear(screen.getByLabelText("Confirme a senha"));
    await user.type(screen.getByLabelText("Confirme a senha"), "long-enough-1");
    expect(screen.getByRole("button", { name: "Definir senha" })).not.toBeDisabled();
  });

  it("shows an inline error when onSubmit rejects, without calling onSuccess", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("expired"));
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithToken("abc123", onSubmit);

    render(
      <MemoryRouter initialEntries={["/finish-setup?token=abc123"]}>
        <Routes>
          <Route path="/finish-setup" element={<FinishSetupForm onSubmit={onSubmit} onSuccess={onSuccess} />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.type(screen.getAllByLabelText("Senha")[1]!, "long-enough-1");
    await user.type(screen.getAllByLabelText("Confirme a senha")[1]!, "long-enough-1");
    await user.click(screen.getAllByRole("button", { name: "Definir senha" })[1]!);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível concluir"));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("shows an inline error and disables submit when the URL has no token", () => {
    render(
      <MemoryRouter initialEntries={["/finish-setup"]}>
        <Routes>
          <Route path="/finish-setup" element={<FinishSetupForm onSubmit={vi.fn()} onSuccess={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Link inválido");
    expect(screen.getByRole("button", { name: "Definir senha" })).toBeDisabled();
  });
});
```

Run: `pnpm --filter web test FinishSetupForm -- --run` — expected FAIL (component doesn't exist).

Create `apps/web/src/presentation/components/FinishSetupForm.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";

const MIN_PASSWORD_LENGTH = 8;

export interface FinishSetupFormProps {
  onSubmit: (params: { token: string; password: string }) => Promise<void>;
  onSuccess: () => void;
}

export function FinishSetupForm({ onSubmit, onSuccess }: FinishSetupFormProps) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isSubmitDisabled = !token || password.length < MIN_PASSWORD_LENGTH || !passwordsMatch || isPending;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);
    try {
      await onSubmit({ token, password });
      onSuccess();
    } catch {
      setError("Não foi possível concluir. O link pode ter expirado — peça um novo convite.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      {!token && (
        <p role="alert" className="mt-4 text-label text-danger">
          Link inválido. Verifique o link enviado por email.
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mt-5">
          <label htmlFor="finish-setup-password" className="text-label font-semibold text-ink-2">
            Senha
          </label>
          <input
            id="finish-setup-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Mínimo de 8 caracteres"
            className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />

          <label htmlFor="finish-setup-confirm-password" className="mt-4 block text-label font-semibold text-ink-2">
            Confirme a senha
          </label>
          <input
            id="finish-setup-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Digite a senha novamente"
            className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />

          {error && (
            <p role="alert" className="mt-2 text-label text-danger">
              {error}
            </p>
          )}
        </Card>

        <div className="mt-6">
          <Button type="submit" variant="primary" loading={isPending} disabled={isSubmitDisabled}>
            Definir senha
          </Button>
        </div>
      </form>
    </>
  );
}
```

Run: `pnpm --filter web test FinishSetupForm -- --run` — expected PASS.

- [ ] **Step 7: Write the failing test for `ManagerFinishSetupPage`, then create it**

Create `apps/web/src/presentation/pages/ManagerFinishSetupPage.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { ManagerFinishSetupPage } from "./ManagerFinishSetupPage";
import * as container from "@/app/container";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/manager/finish-setup?token=abc123"]}>
      <Routes>
        <Route path="/manager/finish-setup" element={<ManagerFinishSetupPage />} />
        <Route path="/manager/login" element={<div>Manager login screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ManagerFinishSetupPage", () => {
  it("navigates to the manager login page after successfully setting the password", async () => {
    vi.spyOn(container.finishManagerSetupUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Senha"), "new-password-123");
    await user.type(screen.getByLabelText("Confirme a senha"), "new-password-123");
    await user.click(screen.getByRole("button", { name: "Definir senha" }));

    expect(await screen.findByText("Manager login screen")).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter web test ManagerFinishSetupPage -- --run` — expected FAIL (component doesn't exist).

Create `apps/web/src/presentation/pages/ManagerFinishSetupPage.tsx`:

```tsx
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { FinishSetupForm } from "@/presentation/components/FinishSetupForm";
import { useFinishManagerSetup } from "@/presentation/hooks/useFinishManagerSetup";
import { routes } from "@/presentation/lib/routes";

export function ManagerFinishSetupPage() {
  const navigate = useNavigate();
  const finishSetup = useFinishManagerSetup();

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Finalize seu cadastro</h1>
        <p className="text-caption text-muted">Escolha uma senha para acessar sua conta de gestor.</p>

        <FinishSetupForm
          onSubmit={({ token, password }) => finishSetup.mutateAsync({ token, password })}
          onSuccess={() => navigate(routes.managerLogin, { replace: true })}
        />
      </div>
    </PhoneShell>
  );
}
```

Run: `pnpm --filter web test ManagerFinishSetupPage -- --run` — expected PASS.

- [ ] **Step 8: Update `ManagerLoginPage` and its test**

Replace `apps/web/src/presentation/pages/ManagerLoginPage.tsx` in full:

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { useManagerLogin } from "@/presentation/hooks/useManagerLogin";
import { InvalidManagerCredentialsError } from "@/ports/manager-auth.port";

export function ManagerLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useManagerLogin();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate(routes.manager) });
  };

  const errorMessage = login.isError
    ? login.error instanceof InvalidManagerCredentialsError
      ? "Email ou senha incorretos."
      : "Não foi possível entrar agora. Tente novamente."
    : null;

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <BackButton label="Início" onClick={() => navigate(routes.home)} />
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Acesso do gestor</h1>
        <p className="text-caption text-muted">Entre com seu email e senha de gestor.</p>

        <form onSubmit={handleSubmit}>
          <Card className="mt-5">
            <label htmlFor="manager-email" className="text-label font-semibold text-ink-2">
              Email
            </label>
            <input
              id="manager-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Digite seu email"
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />

            <label htmlFor="manager-password" className="mt-4 block text-label font-semibold text-ink-2">
              Senha
            </label>
            <input
              id="manager-password"
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
              disabled={email.trim().length === 0 || password.trim().length === 0}
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

Replace `apps/web/src/presentation/pages/ManagerLoginPage.test.tsx` in full:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerLoginPage } from "./ManagerLoginPage";
import * as container from "@/app/container";
import { InvalidManagerCredentialsError } from "@/ports/manager-auth.port";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/manager/login"]}>
        <Routes>
          <Route path="/manager/login" element={<ManagerLoginPage />} />
          <Route path="/manager" element={<div>Manager dashboard</div>} />
          <Route path="/home" element={<div>Home screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ManagerLoginPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("navigates to /manager on a correct email and password", async () => {
    vi.spyOn(container.loginManagerUseCase, "execute").mockResolvedValue({
      token: "abc.def",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      role: "HOSPITAL_ADMIN",
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "ana@zelo-demo.local");
    await user.type(screen.getByLabelText("Senha"), "senha-correta");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Manager dashboard")).toBeInTheDocument();
  });

  it("shows an inline error on incorrect credentials, without navigating", async () => {
    vi.spyOn(container.loginManagerUseCase, "execute").mockRejectedValue(new InvalidManagerCredentialsError());
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "ana@zelo-demo.local");
    await user.type(screen.getByLabelText("Senha"), "wrong");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Email ou senha incorretos.");
    });
    expect(screen.queryByText("Manager dashboard")).not.toBeInTheDocument();
  });

  it("disables the submit button until both fields are filled", async () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ana@zelo-demo.local");
    expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();

    await user.type(screen.getByLabelText("Senha"), "senha-correta");
    expect(screen.getByRole("button", { name: "Entrar" })).not.toBeDisabled();
  });
});
```

- [ ] **Step 9: Wire routes and the container**

In `apps/web/src/presentation/lib/routes.ts`, add:

```ts
  managerFinishSetup: "/manager/finish-setup",
```

In `apps/web/src/app/router.tsx`, add the import `import { ManagerFinishSetupPage } from "@/presentation/pages/ManagerFinishSetupPage";` and this entry to `routeChildren` (public, no loader — the token is the credential):

```tsx
  { path: "manager/finish-setup", Component: ManagerFinishSetupPage },
```

In `apps/web/src/app/container.ts`, replace the manager-auth section:

```ts
import { FinishManagerSetupUseCase } from "@/use-cases/finish-manager-setup.usecase";
```

```ts
const managerAuthAdapter = new HttpManagerAuthAdapter();
export const loginManagerUseCase = new LoginManagerUseCase(managerAuthAdapter);
export const finishManagerSetupUseCase = new FinishManagerSetupUseCase(managerAuthAdapter);
```

(This replaces the old single line `export const loginManagerUseCase = new LoginManagerUseCase(new HttpManagerAuthAdapter());` — both use-cases now share one adapter instance.)

- [ ] **Step 10: Run the full web test suite**

Run: `pnpm --filter web test -- --run`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/ports/manager-auth.port.ts apps/web/src/infrastructure/http/http-manager-auth.adapter.ts \
        apps/web/src/use-cases/login-manager.usecase.ts apps/web/src/use-cases/finish-manager-setup.usecase.ts apps/web/src/use-cases/finish-manager-setup.usecase.test.ts \
        apps/web/src/presentation/hooks/useManagerLogin.ts apps/web/src/presentation/hooks/useFinishManagerSetup.ts \
        apps/web/src/presentation/components/FinishSetupForm.tsx apps/web/src/presentation/components/FinishSetupForm.test.tsx \
        apps/web/src/presentation/pages/ManagerFinishSetupPage.tsx apps/web/src/presentation/pages/ManagerFinishSetupPage.test.tsx \
        apps/web/src/presentation/pages/ManagerLoginPage.tsx apps/web/src/presentation/pages/ManagerLoginPage.test.tsx \
        apps/web/src/presentation/lib/routes.ts apps/web/src/app/router.tsx apps/web/src/app/container.ts
git commit -m "feat(web): switch manager login to email, add finish-setup page"
```

---

### Task 9: Frontend — PeerPartner login (email) + finish-setup; AdminLoginPage email field

**Files:**

- Modify: `apps/web/src/ports/peer-partner-auth.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-peer-partner-auth.adapter.ts`
- Modify: `apps/web/src/use-cases/login-peer-partner.usecase.ts`
- Create: `apps/web/src/use-cases/finish-peer-partner-setup.usecase.ts`
- Create: `apps/web/src/use-cases/finish-peer-partner-setup.usecase.test.ts`
- Modify: `apps/web/src/presentation/hooks/usePeerPartnerLogin.ts`
- Create: `apps/web/src/presentation/hooks/useFinishPeerPartnerSetup.ts`
- Create: `apps/web/src/presentation/pages/PeerPartnerFinishSetupPage.tsx`
- Create: `apps/web/src/presentation/pages/PeerPartnerFinishSetupPage.test.tsx`
- Modify: `apps/web/src/presentation/pages/PeerPartnerLoginPage.tsx`
- Modify: `apps/web/src/presentation/pages/PeerPartnerLoginPage.test.tsx`
- Modify: `apps/web/src/ports/admin-auth.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-admin-auth.adapter.ts`
- Modify: `apps/web/src/use-cases/login-admin.usecase.ts`
- Modify: `apps/web/src/presentation/hooks/useAdminLogin.ts`
- Modify: `apps/web/src/presentation/pages/AdminLoginPage.tsx`
- Modify: `apps/web/src/presentation/pages/AdminLoginPage.test.tsx`
- Modify: `apps/web/src/presentation/lib/routes.ts`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/app/container.ts`

**Interfaces:**

- Consumes: `FinishSetupForm` (Task 8).
- Produces: `routes.peerPartnerFinishSetup` (`/peer/finish-setup`).

`SuperAdmin` has no finish-setup flow (per the spec) — `AdminLoginPage`'s change in this task is the email field only.

- [ ] **Step 1: Update the peer-partner port, adapter, use-case**

Replace `apps/web/src/ports/peer-partner-auth.port.ts` in full:

```ts
import { z } from "zod";

export const PeerPartnerLoginResultSchema = z.object({ token: z.string(), expiresAt: z.string() });
export type PeerPartnerLoginResult = z.infer<typeof PeerPartnerLoginResultSchema>;

export class InvalidPeerPartnerCredentialsError extends Error {}
export class InvalidOrExpiredPeerPartnerSetupTokenError extends Error {}

export interface PeerPartnerAuthPort {
  login(email: string, password: string): Promise<PeerPartnerLoginResult>;
  finishSetup(token: string, password: string): Promise<void>;
}
```

Replace `apps/web/src/infrastructure/http/http-peer-partner-auth.adapter.ts` in full:

```ts
import type { PeerPartnerAuthPort, PeerPartnerLoginResult } from "@/ports/peer-partner-auth.port";
import { PeerPartnerLoginResultSchema, InvalidPeerPartnerCredentialsError, InvalidOrExpiredPeerPartnerSetupTokenError } from "@/ports/peer-partner-auth.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpPeerPartnerAuthAdapter implements PeerPartnerAuthPort {
  async login(email: string, password: string): Promise<PeerPartnerLoginResult> {
    const response = await fetch(`${API_BASE_URL}/peer-partner/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (response.status === 401) {
      throw new InvalidPeerPartnerCredentialsError();
    }
    if (!response.ok) {
      throw new Error(`peer partner login failed with status ${response.status}`);
    }

    return PeerPartnerLoginResultSchema.parse(await response.json());
  }

  async finishSetup(token: string, password: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/peer-partner/finish-setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    if (response.status === 401) {
      throw new InvalidOrExpiredPeerPartnerSetupTokenError();
    }
    if (!response.ok) {
      throw new Error(`peer partner finish-setup failed with status ${response.status}`);
    }
  }
}
```

Replace `apps/web/src/use-cases/login-peer-partner.usecase.ts` in full:

```ts
import type { PeerPartnerAuthPort, PeerPartnerLoginResult } from "@/ports/peer-partner-auth.port";

export class LoginPeerPartnerUseCase {
  constructor(private readonly peerPartnerAuthPort: PeerPartnerAuthPort) {}

  async execute(email: string, password: string): Promise<PeerPartnerLoginResult> {
    return this.peerPartnerAuthPort.login(email, password);
  }
}
```

- [ ] **Step 2: Write the failing test for `FinishPeerPartnerSetupUseCase`, then create it**

Create `apps/web/src/use-cases/finish-peer-partner-setup.usecase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FinishPeerPartnerSetupUseCase } from "./finish-peer-partner-setup.usecase";
import type { PeerPartnerAuthPort, PeerPartnerLoginResult } from "@/ports/peer-partner-auth.port";

class FakePeerPartnerAuthPort implements PeerPartnerAuthPort {
  public lastArgs: { token: string; password: string } | null = null;
  async login(): Promise<PeerPartnerLoginResult> {
    throw new Error("not used in this test");
  }
  async finishSetup(token: string, password: string): Promise<void> {
    this.lastArgs = { token, password };
  }
}

describe("FinishPeerPartnerSetupUseCase", () => {
  it("delegates to the port", async () => {
    const port = new FakePeerPartnerAuthPort();
    const useCase = new FinishPeerPartnerSetupUseCase(port);

    await useCase.execute("some-token", "new-password-123");

    expect(port.lastArgs).toEqual({ token: "some-token", password: "new-password-123" });
  });
});
```

Run: `pnpm --filter web test finish-peer-partner-setup.usecase -- --run` — expected FAIL.

Create `apps/web/src/use-cases/finish-peer-partner-setup.usecase.ts`:

```ts
import type { PeerPartnerAuthPort } from "@/ports/peer-partner-auth.port";

export class FinishPeerPartnerSetupUseCase {
  constructor(private readonly peerPartnerAuthPort: PeerPartnerAuthPort) {}

  async execute(token: string, password: string): Promise<void> {
    return this.peerPartnerAuthPort.finishSetup(token, password);
  }
}
```

Run: `pnpm --filter web test finish-peer-partner-setup.usecase -- --run` — expected PASS.

- [ ] **Step 3: Update the login hook, add the finish-setup hook**

Replace `apps/web/src/presentation/hooks/usePeerPartnerLogin.ts` in full:

```ts
import { useMutation } from "@tanstack/react-query";
import { loginPeerPartnerUseCase } from "@/app/container";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";

interface LoginVariables {
  email: string;
  password: string;
}

export function usePeerPartnerLogin() {
  const setSession = usePeerPartnerSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: ({ email, password }: LoginVariables) => loginPeerPartnerUseCase.execute(email, password),
    onSuccess: (result) => {
      setSession(result.token, result.expiresAt);
    },
  });
}
```

Create `apps/web/src/presentation/hooks/useFinishPeerPartnerSetup.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import { finishPeerPartnerSetupUseCase } from "@/app/container";

interface FinishSetupVariables {
  token: string;
  password: string;
}

export function useFinishPeerPartnerSetup() {
  return useMutation({
    mutationFn: ({ token, password }: FinishSetupVariables) => finishPeerPartnerSetupUseCase.execute(token, password),
  });
}
```

- [ ] **Step 4: Write the failing test for `PeerPartnerFinishSetupPage`, then create it**

Create `apps/web/src/presentation/pages/PeerPartnerFinishSetupPage.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { PeerPartnerFinishSetupPage } from "./PeerPartnerFinishSetupPage";
import * as container from "@/app/container";

describe("PeerPartnerFinishSetupPage", () => {
  it("navigates to the peer-partner login page after successfully setting the password", async () => {
    vi.spyOn(container.finishPeerPartnerSetupUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/peer/finish-setup?token=abc123"]}>
        <Routes>
          <Route path="/peer/finish-setup" element={<PeerPartnerFinishSetupPage />} />
          <Route path="/peer/login" element={<div>Peer partner login screen</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Senha"), "new-password-123");
    await user.type(screen.getByLabelText("Confirme a senha"), "new-password-123");
    await user.click(screen.getByRole("button", { name: "Definir senha" }));

    expect(await screen.findByText("Peer partner login screen")).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter web test PeerPartnerFinishSetupPage -- --run` — expected FAIL.

Create `apps/web/src/presentation/pages/PeerPartnerFinishSetupPage.tsx`:

```tsx
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { FinishSetupForm } from "@/presentation/components/FinishSetupForm";
import { useFinishPeerPartnerSetup } from "@/presentation/hooks/useFinishPeerPartnerSetup";
import { routes } from "@/presentation/lib/routes";

export function PeerPartnerFinishSetupPage() {
  const navigate = useNavigate();
  const finishSetup = useFinishPeerPartnerSetup();

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Finalize seu cadastro</h1>
        <p className="text-caption text-muted">Escolha uma senha para acessar sua conta de par anônimo.</p>

        <FinishSetupForm
          onSubmit={({ token, password }) => finishSetup.mutateAsync({ token, password })}
          onSuccess={() => navigate(routes.peerPartnerLogin, { replace: true })}
        />
      </div>
    </PhoneShell>
  );
}
```

Run: `pnpm --filter web test PeerPartnerFinishSetupPage -- --run` — expected PASS.

- [ ] **Step 5: Update `PeerPartnerLoginPage` and its test**

Replace `apps/web/src/presentation/pages/PeerPartnerLoginPage.tsx` in full:

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = usePeerPartnerLogin();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate(routes.peerPartnerInbox) });
  };

  const errorMessage = login.isError
    ? login.error instanceof InvalidPeerPartnerCredentialsError
      ? "Email ou senha incorretos."
      : "Não foi possível entrar agora. Tente novamente."
    : null;

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Acesso do par anônimo</h1>
        <p className="text-caption text-muted">Entre com seu email e senha de par anônimo.</p>

        <form onSubmit={handleSubmit}>
          <Card className="mt-5">
            <label htmlFor="peer-partner-email" className="text-label font-semibold text-ink-2">
              Email
            </label>
            <input
              id="peer-partner-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Digite seu email"
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
              disabled={email.trim().length === 0 || password.trim().length === 0}
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

Replace `apps/web/src/presentation/pages/PeerPartnerLoginPage.test.tsx` in full:

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

  it("navigates to /peer on a correct email and password", async () => {
    vi.spyOn(container.loginPeerPartnerUseCase, "execute").mockResolvedValue({
      token: "abc.def",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "ana@zelo-demo.local");
    await user.type(screen.getByLabelText("Senha"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Peer partner inbox")).toBeInTheDocument();
  });

  it("shows an inline error on invalid credentials, without navigating", async () => {
    vi.spyOn(container.loginPeerPartnerUseCase, "execute").mockRejectedValue(new InvalidPeerPartnerCredentialsError());
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "ana@zelo-demo.local");
    await user.type(screen.getByLabelText("Senha"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Email ou senha incorretos."));
    expect(screen.queryByText("Peer partner inbox")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Update `admin-auth.port.ts`, its adapter, use-case, hook**

Replace `apps/web/src/ports/admin-auth.port.ts` in full:

```ts
import { z } from "zod";

export const AdminLoginResultSchema = z.object({ token: z.string(), expiresAt: z.string() });
export type AdminLoginResult = z.infer<typeof AdminLoginResultSchema>;

export class InvalidAdminCredentialsError extends Error {}

export interface AdminAuthPort {
  login(email: string, password: string): Promise<AdminLoginResult>;
}
```

Replace `apps/web/src/infrastructure/http/http-admin-auth.adapter.ts` in full:

```ts
import type { AdminAuthPort, AdminLoginResult } from "@/ports/admin-auth.port";
import { AdminLoginResultSchema, InvalidAdminCredentialsError } from "@/ports/admin-auth.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpAdminAuthAdapter implements AdminAuthPort {
  async login(email: string, password: string): Promise<AdminLoginResult> {
    const response = await fetch(`${API_BASE_URL}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (response.status === 401) {
      throw new InvalidAdminCredentialsError();
    }
    if (!response.ok) {
      throw new Error(`admin login failed with status ${response.status}`);
    }

    return AdminLoginResultSchema.parse(await response.json());
  }
}
```

Replace `apps/web/src/use-cases/login-admin.usecase.ts` in full:

```ts
import type { AdminAuthPort, AdminLoginResult } from "@/ports/admin-auth.port";

export class LoginAdminUseCase {
  constructor(private readonly authPort: AdminAuthPort) {}

  async execute(email: string, password: string): Promise<AdminLoginResult> {
    return this.authPort.login(email, password);
  }
}
```

Replace `apps/web/src/presentation/hooks/useAdminLogin.ts` in full:

```ts
import { useMutation } from "@tanstack/react-query";
import { loginAdminUseCase } from "@/app/container";
import { useAdminSessionStore } from "@/stores/admin-session.store";

interface LoginVariables {
  email: string;
  password: string;
}

export function useAdminLogin() {
  const setSession = useAdminSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: ({ email, password }: LoginVariables) => loginAdminUseCase.execute(email, password),
    onSuccess: (result) => {
      setSession(result.token, result.expiresAt);
    },
  });
}
```

- [ ] **Step 7: Update `AdminLoginPage` and its test**

Replace `apps/web/src/presentation/pages/AdminLoginPage.tsx` in full:

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { useAdminLogin } from "@/presentation/hooks/useAdminLogin";
import { InvalidAdminCredentialsError } from "@/ports/admin-auth.port";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useAdminLogin();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate(routes.admin) });
  };

  const errorMessage = login.isError
    ? login.error instanceof InvalidAdminCredentialsError
      ? "Email ou senha incorretos."
      : "Não foi possível entrar agora. Tente novamente."
    : null;

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Acesso administrativo</h1>
        <p className="text-caption text-muted">Entre com seu email e senha de administrador da plataforma.</p>

        <form onSubmit={handleSubmit}>
          <Card className="mt-5">
            <label htmlFor="admin-email" className="text-label font-semibold text-ink-2">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Digite seu email"
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />

            <label htmlFor="admin-password" className="mt-4 block text-label font-semibold text-ink-2">
              Senha
            </label>
            <input
              id="admin-password"
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
              disabled={email.trim().length === 0 || password.trim().length === 0}
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

Replace `apps/web/src/presentation/pages/AdminLoginPage.test.tsx` in full:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminLoginPage } from "./AdminLoginPage";
import * as container from "@/app/container";
import { InvalidAdminCredentialsError } from "@/ports/admin-auth.port";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin/login"]}>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<div>Admin institutions</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminLoginPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("navigates to /admin on a correct email and password", async () => {
    vi.spyOn(container.loginAdminUseCase, "execute").mockResolvedValue({
      token: "abc.def",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "ops@zelo-demo.local");
    await user.type(screen.getByLabelText("Senha"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Admin institutions")).toBeInTheDocument();
  });

  it("shows an inline error on invalid credentials, without navigating", async () => {
    vi.spyOn(container.loginAdminUseCase, "execute").mockRejectedValue(new InvalidAdminCredentialsError());
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "ops@zelo-demo.local");
    await user.type(screen.getByLabelText("Senha"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Email ou senha incorretos."));
    expect(screen.queryByText("Admin institutions")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Wire routes and the container**

In `apps/web/src/presentation/lib/routes.ts`, add:

```ts
  peerPartnerFinishSetup: "/peer/finish-setup",
```

In `apps/web/src/app/router.tsx`, add the import `import { PeerPartnerFinishSetupPage } from "@/presentation/pages/PeerPartnerFinishSetupPage";` and this entry to `routeChildren`:

```tsx
  { path: "peer/finish-setup", Component: PeerPartnerFinishSetupPage },
```

In `apps/web/src/app/container.ts`, replace the peer-partner-auth and admin-auth sections:

```ts
import { FinishPeerPartnerSetupUseCase } from "@/use-cases/finish-peer-partner-setup.usecase";
```

```ts
const peerPartnerAuthAdapter = new HttpPeerPartnerAuthAdapter();
export const loginPeerPartnerUseCase = new LoginPeerPartnerUseCase(peerPartnerAuthAdapter);
export const finishPeerPartnerSetupUseCase = new FinishPeerPartnerSetupUseCase(peerPartnerAuthAdapter);
```

(`loginAdminUseCase`'s line stays exactly as it is today — `new HttpAdminAuthAdapter()` needs no shared-instance treatment since `SuperAdmin` has no finish-setup use-case to share it with.)

- [ ] **Step 9: Run the full web test suite**

Run: `pnpm --filter web test -- --run`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/ports/peer-partner-auth.port.ts apps/web/src/infrastructure/http/http-peer-partner-auth.adapter.ts \
        apps/web/src/use-cases/login-peer-partner.usecase.ts apps/web/src/use-cases/finish-peer-partner-setup.usecase.ts apps/web/src/use-cases/finish-peer-partner-setup.usecase.test.ts \
        apps/web/src/presentation/hooks/usePeerPartnerLogin.ts apps/web/src/presentation/hooks/useFinishPeerPartnerSetup.ts \
        apps/web/src/presentation/pages/PeerPartnerFinishSetupPage.tsx apps/web/src/presentation/pages/PeerPartnerFinishSetupPage.test.tsx \
        apps/web/src/presentation/pages/PeerPartnerLoginPage.tsx apps/web/src/presentation/pages/PeerPartnerLoginPage.test.tsx \
        apps/web/src/ports/admin-auth.port.ts apps/web/src/infrastructure/http/http-admin-auth.adapter.ts \
        apps/web/src/use-cases/login-admin.usecase.ts apps/web/src/presentation/hooks/useAdminLogin.ts \
        apps/web/src/presentation/pages/AdminLoginPage.tsx apps/web/src/presentation/pages/AdminLoginPage.test.tsx \
        apps/web/src/presentation/lib/routes.ts apps/web/src/app/router.tsx apps/web/src/app/container.ts
git commit -m "feat(web): switch peer-partner and admin login to email, add peer-partner finish-setup page"
```

---

### Task 10: Frontend — admin panel email fields, invite-status badges, unified send-set-password-email button

**Files:**

- Modify: `apps/web/src/ports/manager-admin.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-manager-admin.adapter.ts`
- Delete: `apps/web/src/presentation/hooks/useResetManagerPassword.ts`
- Delete: `apps/web/src/presentation/hooks/useResetPeerPartnerPassword.ts`
- Delete: `apps/web/src/use-cases/reset-manager-password.usecase.ts`
- Delete: `apps/web/src/use-cases/reset-peer-partner-password.usecase.ts`
- Create: `apps/web/src/use-cases/send-manager-set-password-email.usecase.ts`
- Create: `apps/web/src/use-cases/send-peer-partner-set-password-email.usecase.ts`
- Create: `apps/web/src/presentation/hooks/useSendManagerSetPasswordEmail.ts`
- Create: `apps/web/src/presentation/hooks/useSendPeerPartnerSetPasswordEmail.ts`
- Modify: `apps/web/src/presentation/pages/ManagerAdminPage.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerAdminPage.test.tsx`
- Modify: `apps/web/src/ports/admin-institution.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-admin-institution.adapter.ts`
- Modify: `apps/web/src/presentation/pages/AdminInstitutionsPage.tsx`
- Modify: `apps/web/src/presentation/pages/AdminInstitutionsPage.test.tsx`
- Modify: `apps/web/src/app/container.ts`

**Interfaces:**

- Consumes: `ManagerSummaryRow`/`PeerPartnerSummaryRow`'s new `email`/`hasPassword`/`setPasswordTokenExpiresAt` fields, and `POST /manager/admin/{managers,peer-partners}/:id/send-set-password-email`, `hospitalAdminEmail` (Tasks 3-7).

- [ ] **Step 1: Update the port**

Replace `apps/web/src/ports/manager-admin.port.ts` in full:

```ts
import { z } from "zod";

export const AdminSectorSchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  managerId: z.string().nullable(),
  managerName: z.string().nullable(),
});
export type AdminSector = z.infer<typeof AdminSectorSchema>;

export const ManagerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(["HOSPITAL_ADMIN", "SECTOR_MANAGER"]),
  isActive: z.boolean(),
  sectorNames: z.array(z.string()),
  hasPassword: z.boolean(),
  setPasswordTokenExpiresAt: z.string().nullable(),
});
export type ManagerSummary = z.infer<typeof ManagerSummarySchema>;

export const CreateManagerResultSchema = z.object({
  manager: z.object({ id: z.string(), name: z.string(), email: z.string() }),
});
export type CreateManagerResult = z.infer<typeof CreateManagerResultSchema>;

export const PeerPartnerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  specialty: z.string(),
  isActive: z.boolean(),
  hasPassword: z.boolean(),
  setPasswordTokenExpiresAt: z.string().nullable(),
});
export type PeerPartnerSummary = z.infer<typeof PeerPartnerSummarySchema>;

export const CreatePeerPartnerResultSchema = z.object({
  peerPartner: z.object({ id: z.string(), name: z.string(), email: z.string() }),
});
export type CreatePeerPartnerResult = z.infer<typeof CreatePeerPartnerResultSchema>;

export interface CreatePeerPartnerParams {
  name: string;
  email: string;
  specialty: string;
}

export interface UpdatePeerPartnerParams {
  isActive?: boolean;
  specialty?: string;
}

export class SectorNameConflictError extends Error {}
export class InvalidManagerAdminRequestError extends Error {}
export class LastActiveHospitalAdminError extends Error {}
export class ManagerAdminNotFoundError extends Error {}

export interface UpdateSectorParams {
  isActive?: boolean;
  managerId?: string | null;
}

export interface CreateManagerParams {
  name: string;
  email: string;
  role: "HOSPITAL_ADMIN" | "SECTOR_MANAGER";
  sectorIds?: string[];
}

export interface UpdateManagerParams {
  isActive?: boolean;
  role?: "HOSPITAL_ADMIN" | "SECTOR_MANAGER";
  sectorIds?: string[];
}

export interface ManagerAdminPort {
  listSectors(token: string): Promise<AdminSector[]>;
  createSector(token: string, name: string): Promise<{ id: string; name: string }>;
  updateSector(token: string, id: string, patch: UpdateSectorParams): Promise<void>;
  listManagers(token: string): Promise<ManagerSummary[]>;
  createManager(token: string, params: CreateManagerParams): Promise<CreateManagerResult>;
  updateManager(token: string, id: string, patch: UpdateManagerParams): Promise<void>;
  sendManagerSetPasswordEmail(token: string, id: string): Promise<void>;
  listPeerPartners(token: string): Promise<PeerPartnerSummary[]>;
  createPeerPartner(token: string, params: CreatePeerPartnerParams): Promise<CreatePeerPartnerResult>;
  updatePeerPartner(token: string, id: string, patch: UpdatePeerPartnerParams): Promise<void>;
  sendPeerPartnerSetPasswordEmail(token: string, id: string): Promise<void>;
}
```

- [ ] **Step 2: Update the HTTP adapter**

Replace `apps/web/src/infrastructure/http/http-manager-admin.adapter.ts` in full:

```ts
import { z } from "zod";
import type {
  AdminSector,
  CreateManagerParams,
  CreateManagerResult,
  CreatePeerPartnerParams,
  CreatePeerPartnerResult,
  ManagerAdminPort,
  ManagerSummary,
  PeerPartnerSummary,
  UpdateManagerParams,
  UpdatePeerPartnerParams,
  UpdateSectorParams,
} from "@/ports/manager-admin.port";
import {
  AdminSectorSchema,
  CreateManagerResultSchema,
  CreatePeerPartnerResultSchema,
  InvalidManagerAdminRequestError,
  LastActiveHospitalAdminError,
  ManagerAdminNotFoundError,
  ManagerSummarySchema,
  PeerPartnerSummarySchema,
  SectorNameConflictError,
} from "@/ports/manager-admin.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

function authHeaders(token: string): HeadersInit {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export class HttpManagerAdminAdapter implements ManagerAdminPort {
  async listSectors(token: string): Promise<AdminSector[]> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/sectors`, { headers: authHeaders(token) });
    if (!response.ok) throw new Error(`list sectors failed with status ${response.status}`);
    return z.array(AdminSectorSchema).parse(await response.json());
  }

  async createSector(token: string, name: string): Promise<{ id: string; name: string }> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/sectors`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ name }),
    });
    if (response.status === 409) throw new SectorNameConflictError();
    if (!response.ok) throw new Error(`create sector failed with status ${response.status}`);
    return response.json();
  }

  async updateSector(token: string, id: string, patch: UpdateSectorParams): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/sectors/${id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(patch),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (!response.ok) throw new Error(`update sector failed with status ${response.status}`);
  }

  async listManagers(token: string): Promise<ManagerSummary[]> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/managers`, { headers: authHeaders(token) });
    if (!response.ok) throw new Error(`list managers failed with status ${response.status}`);
    return z.array(ManagerSummarySchema).parse(await response.json());
  }

  async createManager(token: string, params: CreateManagerParams): Promise<CreateManagerResult> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/managers`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(params),
    });
    if (response.status === 400) throw new InvalidManagerAdminRequestError();
    if (!response.ok) throw new Error(`create manager failed with status ${response.status}`);
    return CreateManagerResultSchema.parse(await response.json());
  }

  async updateManager(token: string, id: string, patch: UpdateManagerParams): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/managers/${id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(patch),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (response.status === 409) throw new LastActiveHospitalAdminError();
    if (response.status === 400) throw new InvalidManagerAdminRequestError();
    if (!response.ok) throw new Error(`update manager failed with status ${response.status}`);
  }

  async sendManagerSetPasswordEmail(token: string, id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/managers/${id}/send-set-password-email`, {
      method: "POST",
      headers: authHeaders(token),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (!response.ok) throw new Error(`send manager set-password email failed with status ${response.status}`);
  }

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

  async sendPeerPartnerSetPasswordEmail(token: string, id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/peer-partners/${id}/send-set-password-email`, {
      method: "POST",
      headers: authHeaders(token),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (!response.ok) throw new Error(`send peer partner set-password email failed with status ${response.status}`);
  }
}
```

- [ ] **Step 3: Replace the reset-password hooks/use-cases with send-set-password-email ones**

The old use-cases below call `port.resetManagerPassword`/`port.resetPeerPartnerPassword` —
methods Step 1 just removed from `ManagerAdminPort` — so they no longer typecheck and must go:

```bash
rm apps/web/src/presentation/hooks/useResetManagerPassword.ts
rm apps/web/src/presentation/hooks/useResetPeerPartnerPassword.ts
rm apps/web/src/use-cases/reset-manager-password.usecase.ts
rm apps/web/src/use-cases/reset-peer-partner-password.usecase.ts
```

Create `apps/web/src/use-cases/send-manager-set-password-email.usecase.ts`:

```ts
import type { ManagerAdminPort } from "@/ports/manager-admin.port";

export class SendManagerSetPasswordEmailUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string, id: string): Promise<void> {
    return this.port.sendManagerSetPasswordEmail(token, id);
  }
}
```

Create `apps/web/src/use-cases/send-peer-partner-set-password-email.usecase.ts`:

```ts
import type { ManagerAdminPort } from "@/ports/manager-admin.port";

export class SendPeerPartnerSetPasswordEmailUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string, id: string): Promise<void> {
    return this.port.sendPeerPartnerSetPasswordEmail(token, id);
  }
}
```

Create `apps/web/src/presentation/hooks/useSendManagerSetPasswordEmail.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import { sendManagerSetPasswordEmailUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useSendManagerSetPasswordEmail() {
  const token = useManagerSessionStore((state) => state.token);
  return useMutation({
    mutationFn: (id: string) => sendManagerSetPasswordEmailUseCase.execute(token!, id),
  });
}
```

Create `apps/web/src/presentation/hooks/useSendPeerPartnerSetPasswordEmail.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import { sendPeerPartnerSetPasswordEmailUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useSendPeerPartnerSetPasswordEmail() {
  const token = useManagerSessionStore((state) => state.token);
  return useMutation({
    mutationFn: (id: string) => sendPeerPartnerSetPasswordEmailUseCase.execute(token!, id),
  });
}
```

- [ ] **Step 4: Rewrite `ManagerAdminPage`**

Replace `apps/web/src/presentation/pages/ManagerAdminPage.tsx` in full:

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { useAdminSectors } from "@/presentation/hooks/useAdminSectors";
import { useCreateSector } from "@/presentation/hooks/useCreateSector";
import { useUpdateSector } from "@/presentation/hooks/useUpdateSector";
import { useAdminManagers } from "@/presentation/hooks/useAdminManagers";
import { useCreateManager } from "@/presentation/hooks/useCreateManager";
import { useUpdateManager } from "@/presentation/hooks/useUpdateManager";
import { useSendManagerSetPasswordEmail } from "@/presentation/hooks/useSendManagerSetPasswordEmail";
import { useAdminPeerPartners } from "@/presentation/hooks/useAdminPeerPartners";
import { useCreatePeerPartner } from "@/presentation/hooks/useCreatePeerPartner";
import { useUpdatePeerPartner } from "@/presentation/hooks/useUpdatePeerPartner";
import { useSendPeerPartnerSetPasswordEmail } from "@/presentation/hooks/useSendPeerPartnerSetPasswordEmail";
import type { AdminSector, ManagerSummary, PeerPartnerSummary } from "@/ports/manager-admin.port";

const SUGGESTED_SECTOR_NAMES = ["UTI", "Pronto-Socorro", "Clínica Médica", "Centro Cirúrgico", "Pediatria", "Ambulatório", "Plantão Noturno"];

type ManagerRole = "HOSPITAL_ADMIN" | "SECTOR_MANAGER";

// "Ativo" once a password has been set; otherwise "Convite pendente" while the
// set-password token is still valid, or "Convite expirado" once it lapses.
function accountStatusLabel(hasPassword: boolean, setPasswordTokenExpiresAt: string | null): string {
  if (hasPassword) return "Ativo";
  if (setPasswordTokenExpiresAt && new Date(setPasswordTokenExpiresAt).getTime() > Date.now()) return "Convite pendente";
  return "Convite expirado";
}

// Shared by the create form and each row's inline edit form. The idPrefix keeps
// the two sets of inputs from colliding when both are on screen at once.
function RoleAndSectorFields({
  idPrefix,
  role,
  onRoleChange,
  sectors,
  selectedSectorIds,
  onToggleSector,
}: {
  idPrefix: string;
  role: ManagerRole;
  onRoleChange: (role: ManagerRole) => void;
  sectors: AdminSector[];
  selectedSectorIds: string[];
  onToggleSector: (id: string) => void;
}) {
  return (
    <>
      <fieldset className="mt-3">
        <legend className="text-label font-semibold text-ink-2">Tipo de gestor</legend>
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id={`${idPrefix}-role-hospital-admin`}
              name={`${idPrefix}-manager-role`}
              checked={role === "HOSPITAL_ADMIN"}
              onChange={() => onRoleChange("HOSPITAL_ADMIN")}
            />
            <label htmlFor={`${idPrefix}-role-hospital-admin`} className="text-label text-ink-2">
              Gestor do hospital
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id={`${idPrefix}-role-sector-manager`}
              name={`${idPrefix}-manager-role`}
              checked={role === "SECTOR_MANAGER"}
              onChange={() => onRoleChange("SECTOR_MANAGER")}
            />
            <label htmlFor={`${idPrefix}-role-sector-manager`} className="text-label text-ink-2">
              Gestor de setor
            </label>
          </div>
        </div>
      </fieldset>

      {role === "SECTOR_MANAGER" && (
        <div className="mt-3">
          <p className="text-label font-semibold text-ink-2">Setores</p>
          <div className="mt-2 flex flex-col gap-2">
            {sectors.map((sector) => (
              <div key={sector.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`${idPrefix}-sector-checkbox-${sector.id}`}
                  checked={selectedSectorIds.includes(sector.id)}
                  onChange={() => onToggleSector(sector.id)}
                />
                <label htmlFor={`${idPrefix}-sector-checkbox-${sector.id}`} className="text-label text-ink-2">
                  {sector.name}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function SectorsTab() {
  const sectors = useAdminSectors();
  const managers = useAdminManagers();
  const createSector = useCreateSector();
  const updateSector = useUpdateSector();
  const [name, setName] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createSector.mutate(name, { onSuccess: () => setName("") });
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <Card className="mt-4">
          <label htmlFor="sector-name" className="text-label font-semibold text-ink-2">
            Nome do setor
          </label>
          <input
            id="sector-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTED_SECTOR_NAMES.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setName(suggestion)}
                className="rounded-pill border border-line px-3 py-1 text-label text-muted"
              >
                {suggestion}
              </button>
            ))}
          </div>
          {createSector.isError && (
            <p role="alert" className="mt-2 text-label text-danger">
              Já existe um setor com esse nome.
            </p>
          )}
        </Card>
        <div className="mt-3">
          <Button type="submit" variant="primary" loading={createSector.isPending} disabled={name.trim().length === 0}>
            Adicionar setor
          </Button>
        </div>
      </form>

      <div className="mt-5 flex flex-col gap-3">
        {(sectors.data ?? []).map((sector) => (
          <Card key={sector.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body font-extrabold text-ink">{sector.name}</p>
                <p className="text-caption text-muted">
                  {sector.managerName ?? "Sem gestor"} · {sector.isActive ? "Ativo" : "Inativo"}
                </p>
              </div>
              <Button
                variant="outline"
                full={false}
                onClick={() => updateSector.mutate({ id: sector.id, patch: { isActive: !sector.isActive } })}
              >
                {sector.isActive ? "Desativar" : "Ativar"}
              </Button>
            </div>

            <select
              aria-label={`Gestor de ${sector.name}`}
              value={sector.managerId ?? ""}
              onChange={(event) => updateSector.mutate({ id: sector.id, patch: { managerId: event.target.value || null } })}
              className="mt-3 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
            >
              <option value="">Sem gestor</option>
              {(managers.data ?? []).map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.name}
                </option>
              ))}
            </select>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ManagersTab() {
  const sectors = useAdminSectors();
  const managers = useAdminManagers();
  const createManager = useCreateManager();
  const updateManager = useUpdateManager();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const sendSetPasswordEmail = useSendManagerSetPasswordEmail();
  const [role, setRole] = useState<ManagerRole>("HOSPITAL_ADMIN");
  const [selectedSectorIds, setSelectedSectorIds] = useState<string[]>([]);
  const [inviteSentTo, setInviteSentTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<ManagerRole>("SECTOR_MANAGER");
  const [editSectorIds, setEditSectorIds] = useState<string[]>([]);

  const sectorList = sectors.data ?? [];

  const toggleSector = (id: string) => {
    setSelectedSectorIds((current) => (current.includes(id) ? current.filter((sectorId) => sectorId !== id) : [...current, id]));
  };

  const toggleEditSector = (id: string) => {
    setEditSectorIds((current) => (current.includes(id) ? current.filter((sectorId) => sectorId !== id) : [...current, id]));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createManager.mutate(
      { name, email, role, sectorIds: role === "SECTOR_MANAGER" ? selectedSectorIds : undefined },
      {
        onSuccess: (result) => {
          setInviteSentTo(result.manager.email);
          setName("");
          setEmail("");
          setRole("HOSPITAL_ADMIN");
          setSelectedSectorIds([]);
        },
      },
    );
  };

  const handleSendSetPasswordEmail = (manager: ManagerSummary) => {
    sendSetPasswordEmail.mutate(manager.id);
  };

  const handleStartEdit = (manager: ManagerSummary) => {
    setEditingId(manager.id);
    setEditRole(manager.role);
    // ManagerSummary carries sector NAMES; map them back to ids via the sector list.
    setEditSectorIds(sectorList.filter((sector) => manager.sectorNames.includes(sector.name)).map((sector) => sector.id));
  };

  const handleSaveEdit = (manager: ManagerSummary) => {
    updateManager.mutate(
      { id: manager.id, patch: { role: editRole, sectorIds: editRole === "SECTOR_MANAGER" ? editSectorIds : undefined } },
      { onSuccess: () => setEditingId(null) },
    );
  };

  const isSubmitDisabled =
    name.trim().length === 0 || email.trim().length === 0 || (role === "SECTOR_MANAGER" && selectedSectorIds.length === 0);

  return (
    <div>
      {inviteSentTo && (
        <div role="status">
          <Card tone="brand-tint" className="mt-4">
            <p className="text-label font-semibold text-ink-2">Convite enviado para {inviteSentTo}.</p>
          </Card>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mt-4">
          <label htmlFor="manager-name-input" className="text-label font-semibold text-ink-2">
            Nome do gestor
          </label>
          <input
            id="manager-name-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
          />

          <label htmlFor="manager-email-input" className="mt-4 block text-label font-semibold text-ink-2">
            Email do gestor
          </label>
          <input
            id="manager-email-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
          />

          <RoleAndSectorFields
            idPrefix="create"
            role={role}
            onRoleChange={setRole}
            sectors={sectorList}
            selectedSectorIds={selectedSectorIds}
            onToggleSector={toggleSector}
          />
        </Card>
        <div className="mt-3">
          <Button type="submit" variant="primary" loading={createManager.isPending} disabled={isSubmitDisabled}>
            Adicionar gestor
          </Button>
        </div>
      </form>

      <div className="mt-5 flex flex-col gap-3">
        {(managers.data ?? []).map((manager) => (
          <Card key={manager.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body font-extrabold text-ink">{manager.name}</p>
                <p className="text-caption text-muted">
                  {manager.role === "HOSPITAL_ADMIN" ? "Gestor do hospital" : `Gestor de setor · ${manager.sectorNames.join(", ") || "sem setor"}`}
                  {" · "}
                  {accountStatusLabel(manager.hasPassword, manager.setPasswordTokenExpiresAt)}
                  {!manager.isActive && " · Inativo"}
                </p>
              </div>
              <Button
                variant="outline"
                full={false}
                onClick={() => updateManager.mutate({ id: manager.id, patch: { isActive: !manager.isActive } })}
              >
                {manager.isActive ? "Desativar" : "Ativar"}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" full={false} aria-label={`Editar ${manager.name}`} onClick={() => handleStartEdit(manager)}>
                Editar
              </Button>
              <Button
                variant="outline"
                full={false}
                aria-label={manager.hasPassword ? `Redefinir senha de ${manager.name}` : `Reenviar convite de ${manager.name}`}
                loading={sendSetPasswordEmail.isPending && sendSetPasswordEmail.variables === manager.id}
                onClick={() => handleSendSetPasswordEmail(manager)}
              >
                {manager.hasPassword ? "Redefinir senha" : "Reenviar convite"}
              </Button>
            </div>

            {editingId === manager.id && (
              <div role="group" aria-label={`Editando ${manager.name}`} className="mt-3 border-t border-line pt-3">
                <RoleAndSectorFields
                  idPrefix={`edit-${manager.id}`}
                  role={editRole}
                  onRoleChange={setEditRole}
                  sectors={sectorList}
                  selectedSectorIds={editSectorIds}
                  onToggleSector={toggleEditSector}
                />
                <div className="mt-3 flex gap-2">
                  <Button variant="primary" full={false} loading={updateManager.isPending} onClick={() => handleSaveEdit(manager)}>
                    Salvar
                  </Button>
                  <Button variant="outline" full={false} onClick={() => setEditingId(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function PeerPartnersTab() {
  const peerPartners = useAdminPeerPartners();
  const createPeerPartner = useCreatePeerPartner();
  const updatePeerPartner = useUpdatePeerPartner();
  const sendSetPasswordEmail = useSendPeerPartnerSetPasswordEmail();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [inviteSentTo, setInviteSentTo] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createPeerPartner.mutate(
      { name, email, specialty },
      {
        onSuccess: (result) => {
          setInviteSentTo(result.peerPartner.email);
          setName("");
          setEmail("");
          setSpecialty("");
        },
      },
    );
  };

  const handleSendSetPasswordEmail = (peerPartner: PeerPartnerSummary) => {
    sendSetPasswordEmail.mutate(peerPartner.id);
  };

  return (
    <div>
      {inviteSentTo && (
        <div role="status">
          <Card tone="brand-tint" className="mt-4">
            <p className="text-label font-semibold text-ink-2">Convite enviado para {inviteSentTo}.</p>
          </Card>
        </div>
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

          <label htmlFor="peer-partner-email-input" className="mt-4 block text-label font-semibold text-ink-2">
            Email do par
          </label>
          <input
            id="peer-partner-email-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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
          <Button
            type="submit"
            variant="primary"
            loading={createPeerPartner.isPending}
            disabled={name.trim().length === 0 || email.trim().length === 0 || specialty.trim().length === 0}
          >
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
                  {peerPartner.specialty} · {accountStatusLabel(peerPartner.hasPassword, peerPartner.setPasswordTokenExpiresAt)}
                  {!peerPartner.isActive && " · Inativo"}
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

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                full={false}
                aria-label={peerPartner.hasPassword ? `Redefinir senha de ${peerPartner.name}` : `Reenviar convite de ${peerPartner.name}`}
                loading={sendSetPasswordEmail.isPending && sendSetPasswordEmail.variables === peerPartner.id}
                onClick={() => handleSendSetPasswordEmail(peerPartner)}
              >
                {peerPartner.hasPassword ? "Redefinir senha" : "Reenviar convite"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function ManagerAdminPage() {
  const navigate = useNavigate();
  const clearSession = useManagerSessionStore((state) => state.clearSession);
  const [tab, setTab] = useState<"sectors" | "managers" | "peer-partners">("sectors");

  return (
    <PhoneShell bg="canvas-alt">
      <div className="pt-6.5">
        <div className="flex items-center justify-between">
          <BackButton label="Painel" onClick={() => navigate(routes.manager)} />
          <button
            type="button"
            onClick={() => {
              clearSession();
              navigate(routes.managerLogin, { replace: true });
            }}
            className="text-label font-bold text-danger"
          >
            Sair
          </button>
        </div>
        <h1 className="mt-4 text-h2 text-ink">Administração</h1>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("sectors")}
            className={["rounded-pill px-4 py-2 text-label font-semibold", tab === "sectors" ? "bg-brand text-white" : "bg-surface text-ink"].join(" ")}
          >
            Setores
          </button>
          <button
            type="button"
            onClick={() => setTab("managers")}
            className={["rounded-pill px-4 py-2 text-label font-semibold", tab === "managers" ? "bg-brand text-white" : "bg-surface text-ink"].join(" ")}
          >
            Gestores
          </button>
          <button
            type="button"
            onClick={() => setTab("peer-partners")}
            className={["rounded-pill px-4 py-2 text-label font-semibold", tab === "peer-partners" ? "bg-brand text-white" : "bg-surface text-ink"].join(" ")}
          >
            Pares Anônimos
          </button>
        </div>

        {tab === "sectors" && <SectorsTab />}
        {tab === "managers" && <ManagersTab />}
        {tab === "peer-partners" && <PeerPartnersTab />}
      </div>
    </PhoneShell>
  );
}
```

- [ ] **Step 5: Rewrite `ManagerAdminPage.test.tsx`**

Replace `apps/web/src/presentation/pages/ManagerAdminPage.test.tsx` in full:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerAdminPage } from "./ManagerAdminPage";
import * as container from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/manager/admin"]}>
        <Routes>
          <Route path="/manager/admin" element={<ManagerAdminPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ManagerAdminPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useManagerSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString(), "HOSPITAL_ADMIN");
  });

  it("shows sectors by default and lets an admin create one", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createSectorUseCase, "execute").mockResolvedValue({ id: "sector-1", name: "UTI" });
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText("Nome do setor"), "UTI");
    await user.click(screen.getByRole("button", { name: "Adicionar setor" }));

    await waitFor(() => expect(container.createSectorUseCase.execute).toHaveBeenCalledWith("token", "UTI"));
  });

  it("switches to the managers tab and creates a SECTOR_MANAGER with the selected sectors", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createManagerAdminUseCase, "execute").mockResolvedValue({
      manager: { id: "manager-2", name: "Paulo", email: "paulo@zelo-demo.local" },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Gestores" }));
    await user.type(screen.getByLabelText("Nome do gestor"), "Paulo");
    await user.type(screen.getByLabelText("Email do gestor"), "paulo@zelo-demo.local");
    await user.click(screen.getByLabelText("Gestor de setor"));
    await user.click(await screen.findByLabelText("UTI"));
    await user.click(screen.getByRole("button", { name: "Adicionar gestor" }));

    await waitFor(() =>
      expect(container.createManagerAdminUseCase.execute).toHaveBeenCalledWith("token", {
        name: "Paulo",
        email: "paulo@zelo-demo.local",
        role: "SECTOR_MANAGER",
        sectorIds: ["sector-1"],
      }),
    );
    await waitFor(() => expect(screen.getByText("Convite enviado para paulo@zelo-demo.local.")).toBeInTheDocument());
  });

  it("creates a HOSPITAL_ADMIN by default, without a role change", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createManagerAdminUseCase, "execute").mockResolvedValue({
      manager: { id: "manager-3", name: "Ana", email: "ana@zelo-demo.local" },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Gestores" }));
    await user.type(screen.getByLabelText("Nome do gestor"), "Ana");
    await user.type(screen.getByLabelText("Email do gestor"), "ana@zelo-demo.local");
    await user.click(screen.getByRole("button", { name: "Adicionar gestor" }));

    await waitFor(() =>
      expect(container.createManagerAdminUseCase.execute).toHaveBeenCalledWith("token", {
        name: "Ana",
        email: "ana@zelo-demo.local",
        role: "HOSPITAL_ADMIN",
        sectorIds: undefined,
      }),
    );
  });

  it("shows account status and lets an admin resend a set-password email for an active manager", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", isActive: true, sectorNames: ["UTI"], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    vi.spyOn(container.sendManagerSetPasswordEmailUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Gestores" }));
    expect(screen.getByText(/Ativo/)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Redefinir senha de Paulo" }));

    await waitFor(() => expect(container.sendManagerSetPasswordEmailUseCase.execute).toHaveBeenCalledWith("token", "manager-5"));
  });

  it("shows a pending-invite status and a reenviar-convite button for a manager with no password yet", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-6", name: "Renata", email: "renata@zelo-demo.local", role: "SECTOR_MANAGER", isActive: true, sectorNames: [], hasPassword: false, setPasswordTokenExpiresAt: new Date(Date.now() + 60_000).toISOString() },
    ]);
    vi.spyOn(container.sendManagerSetPasswordEmailUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Gestores" }));
    expect(screen.getByText(/Convite pendente/)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Reenviar convite de Renata" }));

    await waitFor(() => expect(container.sendManagerSetPasswordEmailUseCase.execute).toHaveBeenCalledWith("token", "manager-6"));
  });

  it("assigns a manager to a sector from the sector row's selector", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    vi.spyOn(container.updateSectorUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Gestor de UTI"), "manager-5");

    await waitFor(() =>
      expect(container.updateSectorUseCase.execute).toHaveBeenCalledWith("token", "sector-1", { managerId: "manager-5" }),
    );
  });

  it("clears a sector's manager assignment through the same selector", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: "manager-5", managerName: "Paulo" },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", isActive: true, sectorNames: ["UTI"], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    vi.spyOn(container.updateSectorUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Gestor de UTI"), "");

    await waitFor(() =>
      expect(container.updateSectorUseCase.execute).toHaveBeenCalledWith("token", "sector-1", { managerId: null }),
    );
  });

  it("edits an existing manager's role and sectors inline, pre-filled from their current assignment", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null },
      { id: "sector-2", name: "Pronto-Socorro", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", isActive: true, sectorNames: ["UTI"], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    vi.spyOn(container.updateManagerAdminUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Gestores" }));
    await user.click(await screen.findByRole("button", { name: "Editar Paulo" }));

    const editForm = within(screen.getByRole("group", { name: "Editando Paulo" }));
    expect(editForm.getByLabelText("Gestor de setor")).toBeChecked();
    expect(editForm.getByLabelText("UTI")).toBeChecked();
    expect(editForm.getByLabelText("Pronto-Socorro")).not.toBeChecked();

    await user.click(editForm.getByLabelText("Pronto-Socorro"));
    await user.click(editForm.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(container.updateManagerAdminUseCase.execute).toHaveBeenCalledWith("token", "manager-5", {
        role: "SECTOR_MANAGER",
        sectorIds: ["sector-1", "sector-2"],
      }),
    );
    await waitFor(() => expect(screen.queryByRole("group", { name: "Editando Paulo" })).not.toBeInTheDocument());
  });

  it("promotes an existing manager to hospital admin from the inline edit form", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", isActive: true, sectorNames: ["UTI"], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    vi.spyOn(container.updateManagerAdminUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Gestores" }));
    await user.click(await screen.findByRole("button", { name: "Editar Paulo" }));

    const editForm = within(screen.getByRole("group", { name: "Editando Paulo" }));
    await user.click(editForm.getByLabelText("Gestor do hospital"));
    await user.click(editForm.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(container.updateManagerAdminUseCase.execute).toHaveBeenCalledWith("token", "manager-5", {
        role: "HOSPITAL_ADMIN",
        sectorIds: undefined,
      }),
    );
  });

  it("discards inline edits on Cancelar without calling the update mutation", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", isActive: true, sectorNames: ["UTI"], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const updateSpy = vi.spyOn(container.updateManagerAdminUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Gestores" }));
    await user.click(await screen.findByRole("button", { name: "Editar Paulo" }));
    await user.click(within(screen.getByRole("group", { name: "Editando Paulo" })).getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("group", { name: "Editando Paulo" })).not.toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("switches to the peer-partners tab and creates one", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listPeerPartnersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createPeerPartnerUseCase, "execute").mockResolvedValue({
      peerPartner: { id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local" },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Pares Anônimos" }));
    await user.type(screen.getByLabelText("Nome do par"), "Dra. Ana");
    await user.type(screen.getByLabelText("Email do par"), "ana@zelo-demo.local");
    await user.type(screen.getByLabelText("Especialidade"), "Clínica médica");
    await user.click(screen.getByRole("button", { name: "Adicionar par" }));

    await waitFor(() => expect(screen.getByText("Convite enviado para ana@zelo-demo.local.")).toBeInTheDocument());
  });

  it("resends a set-password email for an active peer partner", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listPeerPartnersUseCase, "execute").mockResolvedValue([
      { id: "peer-5", name: "Dr. Paulo", email: "paulo@zelo-demo.local", specialty: "Clínica médica", isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    vi.spyOn(container.sendPeerPartnerSetPasswordEmailUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Pares Anônimos" }));
    expect(screen.getByText(/Ativo/)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Redefinir senha de Dr. Paulo" }));

    await waitFor(() => expect(container.sendPeerPartnerSetPasswordEmailUseCase.execute).toHaveBeenCalledWith("token", "peer-5"));
  });
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter web test ManagerAdminPage -- --run`
Expected: PASS (all tests).

- [ ] **Step 7: Update the institution port, adapter, page, and test**

Replace `apps/web/src/ports/admin-institution.port.ts` in full:

```ts
import { z } from "zod";

export const CreateInstitutionResultSchema = z.object({
  institution: z.object({ id: z.string(), name: z.string(), inviteCode: z.string() }),
  hospitalAdmin: z.object({ id: z.string(), name: z.string(), email: z.string() }),
});
export type CreateInstitutionResult = z.infer<typeof CreateInstitutionResultSchema>;

export const AdminInstitutionListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  inviteCode: z.string(),
  createdAt: z.string(),
  hospitalAdminNames: z.array(z.string()),
});
export type AdminInstitutionListItem = z.infer<typeof AdminInstitutionListItemSchema>;

export class DuplicateInstitutionError extends Error {}
export class UnauthorizedAdminError extends Error {}

export interface CreateInstitutionParams {
  institutionName: string;
  inviteCode: string;
  hospitalAdminName: string;
  hospitalAdminEmail: string;
}

export interface AdminInstitutionPort {
  create(token: string, params: CreateInstitutionParams): Promise<CreateInstitutionResult>;
  list(token: string): Promise<AdminInstitutionListItem[]>;
}
```

Replace `apps/web/src/infrastructure/http/http-admin-institution.adapter.ts` in full:

```ts
import type { AdminInstitutionPort, AdminInstitutionListItem, CreateInstitutionParams, CreateInstitutionResult } from "@/ports/admin-institution.port";
import {
  AdminInstitutionListItemSchema,
  CreateInstitutionResultSchema,
  DuplicateInstitutionError,
  UnauthorizedAdminError,
} from "@/ports/admin-institution.port";
import { z } from "zod";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpAdminInstitutionAdapter implements AdminInstitutionPort {
  async create(token: string, params: CreateInstitutionParams): Promise<CreateInstitutionResult> {
    const response = await fetch(`${API_BASE_URL}/admin/institutions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    });

    if (response.status === 401) throw new UnauthorizedAdminError();
    if (response.status === 409) throw new DuplicateInstitutionError();
    if (!response.ok) throw new Error(`create institution failed with status ${response.status}`);

    return CreateInstitutionResultSchema.parse(await response.json());
  }

  async list(token: string): Promise<AdminInstitutionListItem[]> {
    const response = await fetch(`${API_BASE_URL}/admin/institutions`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) throw new UnauthorizedAdminError();
    if (!response.ok) throw new Error(`list institutions failed with status ${response.status}`);

    return z.array(AdminInstitutionListItemSchema).parse(await response.json());
  }
}
```

Replace `apps/web/src/presentation/pages/AdminInstitutionsPage.tsx` in full:

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { useAdminInstitutions } from "@/presentation/hooks/useAdminInstitutions";
import { useCreateInstitution } from "@/presentation/hooks/useCreateInstitution";
import { useAdminSessionStore } from "@/stores/admin-session.store";
import type { CreateInstitutionResult } from "@/ports/admin-institution.port";

export function AdminInstitutionsPage() {
  const navigate = useNavigate();
  const clearSession = useAdminSessionStore((state) => state.clearSession);
  const institutions = useAdminInstitutions();
  const createInstitution = useCreateInstitution();
  const [institutionName, setInstitutionName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [hospitalAdminName, setHospitalAdminName] = useState("");
  const [hospitalAdminEmail, setHospitalAdminEmail] = useState("");
  const [lastCreated, setLastCreated] = useState<CreateInstitutionResult | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createInstitution.mutate(
      { institutionName, inviteCode, hospitalAdminName, hospitalAdminEmail },
      {
        onSuccess: (result) => {
          setLastCreated(result);
          setInstitutionName("");
          setInviteCode("");
          setHospitalAdminName("");
          setHospitalAdminEmail("");
        },
      },
    );
  };

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <div className="mt-4 flex items-center justify-between">
          <h1 className="text-h1 text-ink">Instituições</h1>
          <button
            type="button"
            onClick={() => {
              clearSession();
              navigate(routes.adminLogin, { replace: true });
            }}
            className="text-label font-bold text-danger"
          >
            Sair
          </button>
        </div>
        <p className="mt-1.5 text-caption text-muted">Cadastre um novo hospital e seu primeiro gestor.</p>

        {lastCreated && (
          <div role="status">
            <Card tone="brand-tint" className="mt-4">
              <p className="text-label font-semibold text-ink-2">
                Convite enviado para {lastCreated.hospitalAdmin.email}.
              </p>
            </Card>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Card className="mt-4">
            <label htmlFor="institution-name" className="text-label font-semibold text-ink-2">
              Nome do hospital
            </label>
            <input
              id="institution-name"
              value={institutionName}
              onChange={(event) => setInstitutionName(event.target.value)}
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
            />

            <label htmlFor="invite-code-input" className="mt-4 block text-label font-semibold text-ink-2">
              Código de convite
            </label>
            <input
              id="invite-code-input"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
            />

            <label htmlFor="hospital-admin-name" className="mt-4 block text-label font-semibold text-ink-2">
              Nome do gestor do hospital
            </label>
            <input
              id="hospital-admin-name"
              value={hospitalAdminName}
              onChange={(event) => setHospitalAdminName(event.target.value)}
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
            />

            <label htmlFor="hospital-admin-email" className="mt-4 block text-label font-semibold text-ink-2">
              Email do gestor do hospital
            </label>
            <input
              id="hospital-admin-email"
              type="email"
              value={hospitalAdminEmail}
              onChange={(event) => setHospitalAdminEmail(event.target.value)}
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
            />

            {createInstitution.isError && (
              <p role="alert" className="mt-2 text-label text-danger">
                Não foi possível criar a instituição agora. Tente novamente.
              </p>
            )}
          </Card>

          <div className="mt-4">
            <Button
              type="submit"
              variant="primary"
              loading={createInstitution.isPending}
              disabled={
                institutionName.trim().length === 0 ||
                inviteCode.trim().length === 0 ||
                hospitalAdminName.trim().length === 0 ||
                hospitalAdminEmail.trim().length === 0
              }
            >
              Criar instituição
            </Button>
          </div>
        </form>

        <div className="mt-6">
          <p className="text-body font-extrabold text-ink">Instituições cadastradas</p>
          <div className="mt-3 flex flex-col gap-3">
            {(institutions.data ?? []).map((institution) => (
              <Card key={institution.id}>
                <p className="text-body font-extrabold text-ink">{institution.name}</p>
                <p className="text-caption text-muted">Código: {institution.inviteCode}</p>
                <p className="text-caption text-muted">Gestores: {institution.hospitalAdminNames.join(", ") || "—"}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}
```

Replace `apps/web/src/presentation/pages/AdminInstitutionsPage.test.tsx` in full:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminInstitutionsPage } from "./AdminInstitutionsPage";
import * as container from "@/app/container";
import { useAdminSessionStore } from "@/stores/admin-session.store";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin" element={<AdminInstitutionsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminInstitutionsPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useAdminSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString());
  });

  it("lists existing institutions", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Hospital Teste", inviteCode: "teste-2026", createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: ["Mauricio"] },
    ]);
    renderPage();

    expect(await screen.findByText("Hospital Teste")).toBeInTheDocument();
  });

  it("creates an institution and shows the invite confirmation", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createInstitutionUseCase, "execute").mockResolvedValue({
      institution: { id: "1", name: "Hospital Teste", inviteCode: "teste-2026" },
      hospitalAdmin: { id: "m1", name: "Mauricio", email: "mauricio@zelo-demo.local" },
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Nome do hospital"), "Hospital Teste");
    await user.type(screen.getByLabelText("Código de convite"), "teste-2026");
    await user.type(screen.getByLabelText("Nome do gestor do hospital"), "Mauricio");
    await user.type(screen.getByLabelText("Email do gestor do hospital"), "mauricio@zelo-demo.local");
    await user.click(screen.getByRole("button", { name: "Criar instituição" }));

    await waitFor(() => expect(screen.getByText("Convite enviado para mauricio@zelo-demo.local.")).toBeInTheDocument());
  });
});
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter web test AdminInstitutionsPage -- --run`
Expected: PASS.

- [ ] **Step 9: Wire the container**

In `apps/web/src/app/container.ts`, add these imports:

```ts
import { SendManagerSetPasswordEmailUseCase } from "@/use-cases/send-manager-set-password-email.usecase";
import { SendPeerPartnerSetPasswordEmailUseCase } from "@/use-cases/send-peer-partner-set-password-email.usecase";
```

Remove the old lines `export const resetManagerPasswordUseCase = new ResetManagerPasswordUseCase(managerAdminAdapter);` and `export const resetPeerPartnerPasswordUseCase = new ResetPeerPartnerPasswordUseCase(managerAdminAdapter);` (and their now-unused imports `ResetManagerPasswordUseCase`/`ResetPeerPartnerPasswordUseCase`), replacing them with:

```ts
export const sendManagerSetPasswordEmailUseCase = new SendManagerSetPasswordEmailUseCase(managerAdminAdapter);
export const sendPeerPartnerSetPasswordEmailUseCase = new SendPeerPartnerSetPasswordEmailUseCase(managerAdminAdapter);
```

- [ ] **Step 10: Run the full web test suite**

Run: `pnpm --filter web test -- --run`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/ports/manager-admin.port.ts apps/web/src/infrastructure/http/http-manager-admin.adapter.ts \
        apps/web/src/use-cases/send-manager-set-password-email.usecase.ts apps/web/src/use-cases/send-peer-partner-set-password-email.usecase.ts \
        apps/web/src/presentation/hooks/useSendManagerSetPasswordEmail.ts apps/web/src/presentation/hooks/useSendPeerPartnerSetPasswordEmail.ts \
        apps/web/src/presentation/pages/ManagerAdminPage.tsx apps/web/src/presentation/pages/ManagerAdminPage.test.tsx \
        apps/web/src/ports/admin-institution.port.ts apps/web/src/infrastructure/http/http-admin-institution.adapter.ts \
        apps/web/src/presentation/pages/AdminInstitutionsPage.tsx apps/web/src/presentation/pages/AdminInstitutionsPage.test.tsx \
        apps/web/src/app/container.ts
git rm apps/web/src/presentation/hooks/useResetManagerPassword.ts apps/web/src/presentation/hooks/useResetPeerPartnerPassword.ts \
       apps/web/src/use-cases/reset-manager-password.usecase.ts apps/web/src/use-cases/reset-peer-partner-password.usecase.ts
git commit -m "feat(web): add email fields and invite-status badges to the hospital-admin and platform-admin panels"
```

---

### Task 11: Seed data, env vars, docs, and dead-code removal

**Files:**

- Modify: `apps/api/prisma/seed-data.ts`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/.env` (Neon dev database — gitignored, real local file)
- Modify: `apps/api/.env.development.local` (Docker Postgres — gitignored, real local file)
- Modify: `apps/api/prisma/README.md`
- Delete: `apps/api/src/shared/generate-temporary-password.ts`
- Delete: `apps/api/src/shared/generate-temporary-password.test.ts`

**Interfaces:**

- Consumes: nothing new — this task only adds `email` fields to existing seed rosters and rewires their upsert keys from `name` to `email`, since `name` is no longer `@unique` after Task 1's migration.
- Produces: seeded email addresses that Task 12's manual verification logs into.

- [ ] **Step 1: Add `email` to every seed roster entry**

In `apps/api/prisma/seed-data.ts`, update the `ManagerSeedRow` interface and `MANAGER_SEED_ROSTER`:

```ts
export interface ManagerSeedRow {
  name: string;
  email: string;
  password: string;
  passwordEnvVar: string;
  institutionName: string;
  role: ManagerRole;
  sectorNames?: string[]; // required in practice when role is SECTOR_MANAGER; ignored for HOSPITAL_ADMIN
}

// Demo roster — plaintext passwords here are intentional (local/demo data,
// same transparency MANAGER_ACCESS_CODE=zelo-demo-2026 had in .env.example
// before this migration). Hashed at seed time by ManagerPasswordService,
// never stored in plaintext in the database. `passwordEnvVar` names an
// environment variable that, if set, overrides `password` at seed time —
// use it anywhere a real, non-committed password is needed (e.g.
// production), so the committed plaintext values here are never the actual
// live credential. `institutionName` must match a `name` in
// INSTITUTION_SEED_ROSTER. See seed.ts and prisma/README.md.
export const MANAGER_SEED_ROSTER: ManagerSeedRow[] = [
  { name: "Ana Konder", email: "ana@zelo-demo.local", password: "zelo-ana-2026", passwordEnvVar: "MANAGER_SEED_PASSWORD_ANA", institutionName: "Zelo Demo", role: "HOSPITAL_ADMIN" },
  { name: "Carlos Mendes", email: "carlos@zelo-demo.local", password: "zelo-carlos-2026", passwordEnvVar: "MANAGER_SEED_PASSWORD_CARLOS", institutionName: "Zelo Demo", role: "HOSPITAL_ADMIN" },
  { name: "Paulo Reis", email: "paulo@zelo-demo.local", password: "zelo-paulo-2026", passwordEnvVar: "MANAGER_SEED_PASSWORD_PAULO", institutionName: "Zelo Demo", role: "SECTOR_MANAGER", sectorNames: ["UTI"] },
  { name: "Beatriz Lima", email: "beatriz@sao-lucas-demo.local", password: "zelo-beatriz-2026", passwordEnvVar: "MANAGER_SEED_PASSWORD_BEATRIZ", institutionName: "Hospital São Lucas (Demo)", role: "HOSPITAL_ADMIN" },
];
```

Update `SuperAdminSeedRow` and `SUPER_ADMIN_SEED_ROSTER`:

```ts
export interface SuperAdminSeedRow {
  name: string;
  email: string;
  password: string;
  passwordEnvVar: string;
}

// Bootstraps the one seed-created platform super-admin account. Like MANAGER_SEED_ROSTER,
// passwordEnvVar overrides the committed plaintext password when set — see seed.ts.
export const SUPER_ADMIN_SEED_ROSTER: SuperAdminSeedRow[] = [
  { name: "Zelo Ops", email: "ops@zelo-demo.local", password: "zelo-ops-2026", passwordEnvVar: "SUPER_ADMIN_SEED_PASSWORD" },
];
```

Update `PeerPartnerSeedRow` and `PEER_PARTNER_SEED_ROSTER`:

```ts
export interface PeerPartnerSeedRow {
  name: string;
  email: string;
  password: string;
  passwordEnvVar: string;
  institutionName: string;
  specialty: string;
}

export const PEER_PARTNER_SEED_ROSTER: PeerPartnerSeedRow[] = [
  { name: "Dra. Camila Rocha", email: "camila@zelo-demo.local", password: "zelo-camila-2026", passwordEnvVar: "PEER_PARTNER_SEED_PASSWORD_CAMILA", institutionName: "Zelo Demo", specialty: "Clínica médica" },
];
```

- [ ] **Step 2: Rewire `seed.ts`'s upserts from `name` to `email`**

In `apps/api/prisma/seed.ts`, replace the manager upsert loop:

```ts
  const managersByName = new Map<string, { id: string; name: string }>();
  for (const manager of MANAGER_SEED_ROSTER) {
    const institution = institutionsByName.get(manager.institutionName);
    if (!institution) {
      throw new Error(`MANAGER_SEED_ROSTER entry "${manager.name}" references unknown institution "${manager.institutionName}"`);
    }
    const password = process.env[manager.passwordEnvVar] ?? manager.password;
    const passwordHash = await managerPasswordService.hash(password);
    const row = await prisma.manager.upsert({
      where: { email: manager.email },
      update: {},
      create: { name: manager.name, email: manager.email, passwordHash, institutionId: institution.id, role: manager.role },
    });
    managersByName.set(row.name, { id: row.id, name: row.name });
  }
```

Replace the peer-partner upsert:

```ts
  for (const peerPartner of PEER_PARTNER_SEED_ROSTER) {
    const institution = institutionsByName.get(peerPartner.institutionName);
    if (!institution) {
      throw new Error(`PEER_PARTNER_SEED_ROSTER entry "${peerPartner.name}" references unknown institution "${peerPartner.institutionName}"`);
    }
    const password = process.env[peerPartner.passwordEnvVar] ?? peerPartner.password;
    const passwordHash = await managerPasswordService.hash(password);
    await prisma.peerPartner.upsert({
      where: { email: peerPartner.email },
      update: {},
      create: { name: peerPartner.name, email: peerPartner.email, passwordHash, institutionId: institution.id, specialty: peerPartner.specialty },
    });
  }
```

Replace the super-admin upsert:

```ts
  for (const admin of SUPER_ADMIN_SEED_ROSTER) {
    const password = process.env[admin.passwordEnvVar] ?? admin.password;
    const passwordHash = await adminPasswordService.hash(password);
    await prisma.superAdmin.upsert({
      where: { email: admin.email },
      update: {},
      create: { name: admin.name, email: admin.email, passwordHash },
    });
  }
```

- [ ] **Step 3: Add the new env vars to all three env files**

Append to `apps/api/.env.example` (after `CORS_ALLOWED_ORIGINS`):

```env
# "mock" (default) logs the invite/reset link to the console instead of sending an email —
# no API key, no cost, use this for local dev. "resend" sends through the Resend API and
# requires RESEND_API_KEY.
EMAIL_PROVIDER=mock
RESEND_API_KEY=
# Resend's shared sandbox sender — works without a verified domain. Swap in a verified
# domain's address later; no code change needed.
EMAIL_FROM=onboarding@resend.dev
# Base URL the API embeds in invite/reset emails to build the set-password link. Must match
# wherever the web app is actually reachable from the recipient's browser.
WEB_APP_BASE_URL=http://localhost:5173
```

Append to `apps/api/.env.development.local` (Docker Postgres — local dev, mock email so no real emails are sent and links are read from the API's console output):

```env
EMAIL_PROVIDER=mock
RESEND_API_KEY=
EMAIL_FROM=onboarding@resend.dev
WEB_APP_BASE_URL=http://localhost:5173
```

Append to `apps/api/.env` (Neon dev database — also mock for now, since no Resend account is configured yet; flip to `resend` once `RESEND_API_KEY` is available):

```env
EMAIL_PROVIDER=mock
RESEND_API_KEY=
EMAIL_FROM=onboarding@resend.dev
WEB_APP_BASE_URL=http://localhost:5173
```

- [ ] **Step 4: Delete the now-fully-dead temporary-password generator**

Confirm no remaining references first:

```bash
grep -rn "generateTemporaryPassword" apps/api/src
```

Expected: no output (Tasks 3, 4, 5, 6, and 7 rewrote or deleted every call site — `create-manager.use-case.ts`, `create-peer-partner.use-case.ts`, `create-institution.use-case.ts`, `reset-manager-password.use-case.ts`, `reset-peer-partner-password.use-case.ts`).

```bash
rm apps/api/src/shared/generate-temporary-password.ts apps/api/src/shared/generate-temporary-password.test.ts
```

- [ ] **Step 5: Update `prisma/README.md`**

In the "Seeding manager accounts" section, replace the table and its surrounding column list to include `Email`:

```markdown
| Name | Email | Institution | Role | Password | Override env var |
|---|---|---|---|---|---|
| Ana Konder | ana@zelo-demo.local | Zelo Demo | Gestora do hospital | zelo-ana-2026 | `MANAGER_SEED_PASSWORD_ANA` |
| Carlos Mendes | carlos@zelo-demo.local | Zelo Demo | Gestor do hospital | zelo-carlos-2026 | `MANAGER_SEED_PASSWORD_CARLOS` |
| Paulo Reis | paulo@zelo-demo.local | Zelo Demo | Gestor de setor (UTI) | zelo-paulo-2026 | `MANAGER_SEED_PASSWORD_PAULO` |
| Beatriz Lima | beatriz@sao-lucas-demo.local | Hospital São Lucas (Demo) | Gestora do hospital | zelo-beatriz-2026 | `MANAGER_SEED_PASSWORD_BEATRIZ` |
```

Immediately below that table, add a new subsection explaining the login/invite change (insert before "The upsert is keyed on `name`..." — update that sentence too since the key changed):

```markdown
**Login is now by email, not name.** `email` is the unique login key (`Manager.email`); `name`
stays a display-only field and is no longer unique. New managers created through the admin
panel (not the seed script) never get a system-generated password — they receive a "set your
password" email instead (see the design spec
`docs/superpowers/specs/2026-08-03-email-based-login-and-account-invites-design.md`). Seeded
accounts bypass that invite flow entirely: the seed script hashes and sets a real password
directly, so every account in the table above can log in immediately with the listed password.

The upsert is keyed on `email` and **only ever sets a password when creating a brand-new
manager row** (`update: {}` — a re-seed never touches `passwordHash` for a manager that
already exists). This means re-running the seed never duplicates managers, never changes an
existing manager's password (even if the roster's committed/env-sourced password value
differs from what's live — e.g. someone rotated the password out-of-band), and only a truly
new email in `MANAGER_SEED_ROSTER` ever gets a password set from seed data.
```

Delete the old "The upsert is keyed on `name`..." paragraph that this replaces (it duplicates the same explanation with the stale `name` key).

In the "Seeding a demo peer partner" section, replace the table:

```markdown
| Name | Email | Institution | Specialty | Password | Override env var |
|---|---|---|---|---|---|
| Dra. Camila Rocha | camila@zelo-demo.local | Zelo Demo | Clínica médica | zelo-camila-2026 | `PEER_PARTNER_SEED_PASSWORD_CAMILA` |
```

And update the login instruction below it:

```markdown
To try the flow end to end locally: log in at `/peer/login` with `camila@zelo-demo.local` /
`zelo-camila-2026` in one browser tab (leave it open so the peer partner shows as available),
then in another tab/device, link to "Zelo Demo" (`zelo-demo-2026`) via `/you/link`, and tap
"Falar com um colega" on `/peers`.
```

In the "Seeding the platform super-admin account" section, replace the table:

```markdown
| Name | Email | Password | Override env var |
|---|---|---|---|
| Zelo Ops | ops@zelo-demo.local | zelo-ops-2026 | `SUPER_ADMIN_SEED_PASSWORD` |
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/seed-data.ts apps/api/prisma/seed.ts apps/api/prisma/README.md \
        apps/api/.env.example apps/api/.env apps/api/.env.development.local
git rm apps/api/src/shared/generate-temporary-password.ts apps/api/src/shared/generate-temporary-password.test.ts
git commit -m "feat(api): seed email addresses for every demo account, add EMAIL_PROVIDER config, drop the dead temp-password generator"
```

---

### Task 12: Rollout — migrate and reseed both the local Docker Postgres and the Neon dev database

**Files:** none (no code changes — this task runs commands against both database environments the developer uses locally, per the design spec's explicit "Rollout requirement", and records the result).

**Interfaces:**

- Consumes: `apps/api/prisma/migrations/20260803120000_email_login_and_invites/migration.sql` (Task 1), the reseeded rosters from Task 11.
- Produces: nothing later tasks consume — this is the final delivery step.

- [ ] **Step 1: Apply the migration and reseed the local Docker Postgres database**

`apps/api/.env.development.local` points at the Docker-hosted Postgres. Confirm the container is running, then apply the migration and seed using that env file:

```bash
docker ps --filter "name=zelo" --format "{{.Names}}: {{.Status}}"
```

Expected: a running Postgres container. If none is running, start it per the project's existing Docker setup before continuing.

```bash
cd apps/api
pnpm exec dotenv -e .env.development.local -- prisma migrate deploy
pnpm exec dotenv -e .env.development.local -- prisma db seed
```

Expected: `prisma migrate deploy` reports the new `20260803120000_email_login_and_invites` migration applied; the seed command's final `console.log` line reports the same roster counts as before (2 institutions, 5 sectors, 4 manager accounts, 1 peer partner, 1 super admin).

- [ ] **Step 2: Verify email login works locally against the seeded Docker database**

With the API running against `.env.development.local` (`pnpm --filter @zelo/api dev`), confirm a seeded manager can log in by email:

```bash
curl -s -X POST http://localhost:3000/manager/login -H "Content-Type: application/json" -d '{"email":"ana@zelo-demo.local","password":"zelo-ana-2026"}'
```

Expected: a `200` response containing a token (not a `401`). Stop the dev server after confirming.

- [ ] **Step 3: Apply the migration and reseed the Neon dev database**

`apps/api/.env` points at the Neon-hosted dev database. Apply the same migration and seed using that env file:

```bash
pnpm exec dotenv -e .env -- prisma migrate deploy
pnpm exec dotenv -e .env -- prisma db seed
```

Expected: same migration-applied confirmation and the same roster-count summary line as Step 1.

- [ ] **Step 4: Verify email login works against the seeded Neon database**

With the API running against `.env` (`NODE_ENV=production pnpm --filter @zelo/api dev` is not appropriate here — instead run `pnpm exec dotenv -e .env -- tsx watch src/main.ts` from `apps/api` so it loads the Neon env file specifically), repeat the same login check:

```bash
curl -s -X POST http://localhost:3000/manager/login -H "Content-Type: application/json" -d '{"email":"ana@zelo-demo.local","password":"zelo-ana-2026"}'
```

Expected: a `200` response containing a token. Stop the dev server after confirming.

- [ ] **Step 5: Report rollout status to the user**

No commit — this task changes database state, not files. Summarize for the user: both databases migrated and reseeded, the new roster's email addresses (from Task 11's tables), and that email login was confirmed against both. Remind them `EMAIL_PROVIDER=mock` is set in both env files, so invite/reset emails during testing are logged to the API's console (not actually sent) until a real `RESEND_API_KEY` is configured.

---
