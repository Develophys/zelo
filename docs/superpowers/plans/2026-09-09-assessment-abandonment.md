# Modal de confirmação ao abandonar o questionário Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warn a médico who tries to leave a questionnaire mid-fill, and let gestores see how many médicos started but didn't finish, with the same k-anonymity guarantees the rest of the dashboard already has.

**Architecture:** Reuses the existing `signal-checkin` backend module end to end (same `Signal` table, same dedup mechanism, same controller) by adding an `abandoned` counter column alongside `checkIns`/`concerning`. The frontend gains a `useBlocker`-driven confirmation modal on `ScaleAssessmentPage`, wired through a new use case that mirrors the existing check-in-recording one. The gestor side reuses `GetManagerSignalsUseCase`'s existing k-anonymity/reference-week machinery unmodified in its visibility logic — `abandoned` is summed only for sectors that logic already marks visible.

**Tech Stack:** NestJS + Prisma (api), React + React Router (data router) + Zustand + TanStack Query (web), Vitest for both.

**Spec:** `docs/superpowers/specs/2026-09-09-assessment-abandonment-design.md`

## Global Constraints

- Só navegação **dentro do app** dispara o modal — sem `beforeunload`, sem interceptar fechar aba/refresh.
- "Iniciado" = pelo menos 1 resposta dada (`answers.some((a) => a !== undefined)`), não a abertura da tela.
- `abandoned` mora na mesma linha semanal do `Signal` que já guarda `checkIns`/`concerning`. A visibilidade continua decidida **só** por `checkIns >= K_ANONYMITY_THRESHOLD` na semana de referência — `abandoned` nunca entra nesse cálculo, só é somado depois para setores já visíveis.
- v1 é só o agregado da instituição (`abandonedLast4Weeks`) — sem detalhamento por setor no dashboard.
- Registro de abandono é sempre fire-and-forget: uma falha nunca aparece pro médico, nunca bloqueia navegação, nunca é re-tentada.
- TDD para toda mudança de comportamento observável. Plumbing sem teste próprio no resto do projeto (wiring de módulo NestJS, provider registration) segue essa mesma convenção — não é regressão introduzir plumbing sem teste dedicado onde o padrão existente também não tem.

---

## File Structure

**Backend (`apps/api`):**
- `prisma/migrations/<timestamp>_add_signal_abandoned/migration.sql` — nova coluna.
- `prisma/schema.prisma` — `Signal.abandoned`.
- `src/modules/signal-checkin/application/ports/signal-checkin-repository.port.ts` — `RecordAbandonmentParams` + `recordAbandonment` no `SignalCheckinRepository`.
- `src/modules/signal-checkin/infrastructure/persistence/prisma-signal-checkin.repository.ts` — implementação.
- `src/modules/signal-checkin/application/use-cases/record-assessment-abandonment.use-case.ts` (novo) + `.test.ts`.
- `src/modules/signal-checkin/infrastructure/signal-checkin.controller.ts` — novo endpoint `POST /signals/abandon`.
- `src/modules/signal-checkin/infrastructure/signal-checkin.controller.test.ts` — novos casos.
- `src/modules/signal-checkin/signal-checkin.module.ts` — wiring do novo use case.
- `src/modules/manager/application/ports/signal-repository.port.ts` — `SignalRow.abandoned`.
- `src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts` — `findAll` seleciona `abandoned`.
- `src/modules/manager/application/use-cases/get-manager-signals.use-case.ts` — `abandonedLast4Weeks`.
- `src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts` — novos casos.
- Backfill mecânico guiado por `tsc` em todo arquivo que hoje constrói um `SignalRow` literal.

**Domain compartilhado (`packages/domain`):**
- `src/manager/metric-glossary.ts` — métrica `abandoned`, `abandonedReading`, versão da metodologia.

**Frontend (`apps/web`):**
- `src/ports/signal-checkin.port.ts` — `SignalAbandonmentParams` + método `abandon` no `SignalCheckinPort`.
- `src/infrastructure/http/http-signal-checkin.adapter.ts` — implementação.
- `src/infrastructure/http/http-signal-checkin.adapter.test.ts` (novo).
- `src/use-cases/record-assessment-abandonment.usecase.ts` (novo) + `.test.ts`.
- `src/app/container/signal-checkin.ts` — wiring.
- `src/presentation/components/AbandonAssessmentModal.tsx` (novo) + `.test.tsx`.
- `src/presentation/pages/ScaleAssessmentPage.tsx` — `useBlocker` + modal + registro.
- `src/presentation/pages/ScaleAssessmentPage.test.tsx` — migração do harness de router + novos casos.
- `src/ports/manager-signals.port.ts` — `abandonedLast4Weeks` no schema.
- `src/presentation/pages/ManagerDashboardPage.tsx` — novo `KpiCard`.
- `src/presentation/pages/ManagerDashboardPage.test.tsx` — novos casos.
- `src/presentation/lib/download-manager-pgr-report.ts` — linha nova no CSV/PDF.
- `src/presentation/lib/download-manager-pgr-report.test.ts` — novo caso.
- Backfill mecânico guiado por `tsc` em todo arquivo que hoje constrói um `ManagerSignalsResponse` literal.

---

### Task 1: Migration — `Signal.abandoned`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_signal_abandoned/migration.sql`

**Interfaces:**
- Produces: coluna `abandoned Int @default(0)` na tabela `signals`, consumida por todas as tasks seguintes.

- [ ] **Step 1: Adicionar o campo ao schema**

Em `apps/api/prisma/schema.prisma`, no `model Signal`:

```prisma
model Signal {
  id            String      @id @default(cuid())
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  sectorId      String
  sector        Sector      @relation(fields: [sectorId], references: [id])
  weekStart     DateTime
  checkIns      Int         @default(0)
  concerning    Int         @default(0)
  abandoned     Int         @default(0)
  createdAt     DateTime    @default(now())

  @@unique([institutionId, sectorId, weekStart])
  @@map("signals")
}
```

- [ ] **Step 2: Gerar e rodar a migration**

Rodar (de `apps/api`): `npx prisma migrate dev --name add_signal_abandoned`

Isso cria `apps/api/prisma/migrations/<timestamp>_add_signal_abandoned/migration.sql` com o conteúdo:

```sql
-- AlterTable
ALTER TABLE "signals" ADD COLUMN     "abandoned" INTEGER NOT NULL DEFAULT 0;
```

Expected: comando termina sem erro, `npx prisma generate` roda automaticamente como parte do `migrate dev`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add Signal.abandoned column"
```

---

### Task 2: Backend — camada de repositório para `recordAbandonment`

**Files:**
- Modify: `apps/api/src/modules/signal-checkin/application/ports/signal-checkin-repository.port.ts`
- Modify: `apps/api/src/modules/signal-checkin/infrastructure/persistence/prisma-signal-checkin.repository.ts`

**Interfaces:**
- Consumes: `Signal.abandoned` (Task 1), `SignalDedupKey` (já existente).
- Produces: `SignalCheckinRepository.recordAbandonment(params: RecordAbandonmentParams): Promise<{ abandoned: number } | null>`, consumido pela Task 3.

Sem teste próprio nesta task — assim como `recordCheckin`, este repositório não tem teste de integração dedicado no projeto hoje (`PrismaSignalCheckinRepository` como um todo não tem `.test.ts`); a cobertura vem das Tasks 3 (use case, repositório fake) e da suíte de smoke test manual da Task 14.

- [ ] **Step 1: Adicionar o método à porta**

Em `apps/api/src/modules/signal-checkin/application/ports/signal-checkin-repository.port.ts`, o arquivo inteiro passa a ser:

```ts
export interface RecordCheckinParams {
  institutionId: string;
  sectorId: string;
  weekStart: Date;
  concerning: boolean;
  dedupKey: string;
}

export interface RecordAbandonmentParams {
  institutionId: string;
  sectorId: string;
  weekStart: Date;
  dedupKey: string;
}

export interface SignalCheckinRepository {
  /** The row's check-in count after the increment, or null when deduplicated. */
  recordCheckin(params: RecordCheckinParams): Promise<{ checkIns: number } | null>;
  /** The row's abandoned count after the increment, or null when deduplicated. */
  recordAbandonment(params: RecordAbandonmentParams): Promise<{ abandoned: number } | null>;
}

export const SIGNAL_CHECKIN_REPOSITORY = Symbol("SIGNAL_CHECKIN_REPOSITORY");

// Thrown by the repository when institutionId or sectorId don't match a real
// Institution/Sector (a foreign-key violation on the Signal insert/update) —
// mapped to a 400 by the controller.
export class UnknownInstitutionOrSectorError extends Error {}
```

- [ ] **Step 2: Implementar em `PrismaSignalCheckinRepository`**

Em `apps/api/src/modules/signal-checkin/infrastructure/persistence/prisma-signal-checkin.repository.ts`, adicionar o import do novo tipo e o método, ao lado de `recordCheckin`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../../../../../generated/prisma/client.ts";
import type {
  RecordAbandonmentParams,
  RecordCheckinParams,
  SignalCheckinRepository,
} from "@/modules/signal-checkin/application/ports/signal-checkin-repository.port.js";
import { UnknownInstitutionOrSectorError } from "@/modules/signal-checkin/application/ports/signal-checkin-repository.port.js";
import { PrismaService } from "@/shared/prisma/prisma.service.js";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";
const FOREIGN_KEY_VIOLATION = "P2003";

@Injectable()
export class PrismaSignalCheckinRepository implements SignalCheckinRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async recordCheckin(params: RecordCheckinParams): Promise<{ checkIns: number } | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.signalDedupKey.create({ data: { dedupKey: params.dedupKey } });
        const signal = await tx.signal.upsert({
          where: {
            institutionId_sectorId_weekStart: {
              institutionId: params.institutionId,
              sectorId: params.sectorId,
              weekStart: params.weekStart,
            },
          },
          update: { checkIns: { increment: 1 }, concerning: { increment: params.concerning ? 1 : 0 } },
          create: {
            institutionId: params.institutionId,
            sectorId: params.sectorId,
            weekStart: params.weekStart,
            checkIns: 1,
            concerning: params.concerning ? 1 : 0,
          },
          select: { checkIns: true },
        });
        return { checkIns: signal.checkIns };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        return null;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === FOREIGN_KEY_VIOLATION) {
        throw new UnknownInstitutionOrSectorError();
      }
      throw error;
    }
  }

  async recordAbandonment(params: RecordAbandonmentParams): Promise<{ abandoned: number } | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.signalDedupKey.create({ data: { dedupKey: params.dedupKey } });
        const signal = await tx.signal.upsert({
          where: {
            institutionId_sectorId_weekStart: {
              institutionId: params.institutionId,
              sectorId: params.sectorId,
              weekStart: params.weekStart,
            },
          },
          update: { abandoned: { increment: 1 } },
          create: {
            institutionId: params.institutionId,
            sectorId: params.sectorId,
            weekStart: params.weekStart,
            abandoned: 1,
          },
          select: { abandoned: true },
        });
        return { abandoned: signal.abandoned };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        return null;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === FOREIGN_KEY_VIOLATION) {
        throw new UnknownInstitutionOrSectorError();
      }
      throw error;
    }
  }
}
```

- [ ] **Step 3: Typecheck**

Run (de `apps/api`): `npx tsc --noEmit -p tsconfig.json`
Expected: sem erro novo relacionado a este arquivo (o erro em `PrismaSignalCheckinRepository` não implementar `recordAbandonment` desaparece; outros erros pré-existentes de tipos ainda não ajustados nas próximas tasks são esperados até a Task 4 terminar — veja lá).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/signal-checkin/application/ports/signal-checkin-repository.port.ts apps/api/src/modules/signal-checkin/infrastructure/persistence/prisma-signal-checkin.repository.ts
git commit -m "feat(api): add SignalCheckinRepository.recordAbandonment"
```

---

### Task 3: Backend — `RecordAssessmentAbandonmentUseCase` + `POST /signals/abandon`

**Files:**
- Create: `apps/api/src/modules/signal-checkin/application/use-cases/record-assessment-abandonment.use-case.ts`
- Create: `apps/api/src/modules/signal-checkin/application/use-cases/record-assessment-abandonment.use-case.test.ts`
- Modify: `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.ts`
- Modify: `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.test.ts`
- Modify: `apps/api/src/modules/signal-checkin/signal-checkin.module.ts`

**Interfaces:**
- Consumes: `SignalCheckinRepository.recordAbandonment` (Task 2), `startOfIsoWeek` de `@/shared/date/start-of-iso-week.js` (já existente).
- Produces: `RecordAssessmentAbandonmentUseCase.execute(input: RecordAssessmentAbandonmentInput, now?: Date): Promise<void>`, endpoint `POST /signals/abandon` (204, sem auth — mesmo padrão de `/signals/checkin`), consumidos pela Task 8 (frontend).

- [ ] **Step 1: Escrever o teste do use case (falhando)**

Create `apps/api/src/modules/signal-checkin/application/use-cases/record-assessment-abandonment.use-case.test.ts`:

```ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RecordAssessmentAbandonmentUseCase } from "./record-assessment-abandonment.use-case.ts";
import type { RecordAbandonmentParams, SignalCheckinRepository } from "../ports/signal-checkin-repository.port.ts";

class FakeSignalCheckinRepository implements SignalCheckinRepository {
  public abandonCalls: RecordAbandonmentParams[] = [];
  async recordCheckin(): Promise<{ checkIns: number } | null> {
    throw new Error("not used in this test");
  }
  async recordAbandonment(params: RecordAbandonmentParams): Promise<{ abandoned: number } | null> {
    this.abandonCalls.push(params);
    return { abandoned: 1 };
  }
}

describe("RecordAssessmentAbandonmentUseCase", () => {
  it("computes weekStart and an 'abandon:'-prefixed dedupKey, and forwards to the repository", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordAssessmentAbandonmentUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z"); // a Wednesday

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", deviceSignalId: "device-1" },
      now,
    );

    expect(repository.abandonCalls[0]).toEqual({
      institutionId: "institution-1",
      sectorId: "sector-1",
      weekStart: new Date("2026-06-15T00:00:00.000Z"), // Monday of that week
      dedupKey: expect.any(String),
    });
  });

  it("produces a dedupKey different from a check-in's, for the same device/institution/sector/week", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordAssessmentAbandonmentUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z");

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-1", deviceSignalId: "device-1" }, now);

    const checkinStyleDedupKey = createHash("sha256")
      .update("device-1:institution-1:sector-1:2026-06-15T00:00:00.000Z")
      .digest("hex");

    expect(repository.abandonCalls[0]!.dedupKey).not.toBe(checkinStyleDedupKey);
  });

  it("produces a different dedupKey for a different sectorId, same device/institution/week", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordAssessmentAbandonmentUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z");

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-1", deviceSignalId: "device-1" }, now);
    const first = repository.abandonCalls[0]!.dedupKey;

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-2", deviceSignalId: "device-1" }, now);
    const second = repository.abandonCalls[1]!.dedupKey;

    expect(first).not.toBe(second);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run (de `apps/api`): `npx vitest run src/modules/signal-checkin/application/use-cases/record-assessment-abandonment.use-case.test.ts`
Expected: FAIL — `record-assessment-abandonment.use-case.ts` não existe.

- [ ] **Step 3: Implementação mínima**

Create `apps/api/src/modules/signal-checkin/application/use-cases/record-assessment-abandonment.use-case.ts`:

```ts
import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { startOfIsoWeek } from "@/shared/date/start-of-iso-week.js";
import {
  SIGNAL_CHECKIN_REPOSITORY,
  type SignalCheckinRepository,
} from "../ports/signal-checkin-repository.port.ts";

export interface RecordAssessmentAbandonmentInput {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
}

@Injectable()
export class RecordAssessmentAbandonmentUseCase {
  constructor(@Inject(SIGNAL_CHECKIN_REPOSITORY) private readonly repository: SignalCheckinRepository) {}

  async execute(input: RecordAssessmentAbandonmentInput, now: Date = new Date()): Promise<void> {
    const weekStart = startOfIsoWeek(now);
    // Prefixo "abandon:" garante um namespace de dedup independente do
    // check-in de conclusão: o mesmo médico pode contar uma vez em cada
    // contador, no mesmo setor, na mesma semana — são eventos diferentes.
    const dedupKey = createHash("sha256")
      .update(`abandon:${input.deviceSignalId}:${input.institutionId}:${input.sectorId}:${weekStart.toISOString()}`)
      .digest("hex");

    await this.repository.recordAbandonment({
      institutionId: input.institutionId,
      sectorId: input.sectorId,
      weekStart,
      dedupKey,
    });
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/modules/signal-checkin/application/use-cases/record-assessment-abandonment.use-case.test.ts`
Expected: PASS, 3 testes.

- [ ] **Step 5: Escrever os testes do endpoint (falhando)**

Modify `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.test.ts` — arquivo inteiro passa a ser:

```ts
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SignalCheckinController } from "./signal-checkin.controller.ts";
import { RecordSignalCheckinUseCase } from "../application/use-cases/record-signal-checkin.use-case.ts";
import { RecordAssessmentAbandonmentUseCase } from "../application/use-cases/record-assessment-abandonment.use-case.ts";
import {
  SIGNAL_CHECKIN_REPOSITORY,
  UnknownInstitutionOrSectorError,
} from "../application/ports/signal-checkin-repository.port.ts";
import type {
  RecordAbandonmentParams,
  RecordCheckinParams,
  SignalCheckinRepository,
} from "../application/ports/signal-checkin-repository.port.ts";
import { NOTIFICATION_PUBLISHER, type NotificationEvent, type NotificationPublisher } from "@/modules/notification/application/ports/notification.port.js";

class FakeSignalCheckinRepository implements SignalCheckinRepository {
  public checkinCalls: RecordCheckinParams[] = [];
  public abandonCalls: RecordAbandonmentParams[] = [];
  public shouldThrowUnknownInstitution = false;
  async recordCheckin(params: RecordCheckinParams): Promise<{ checkIns: number } | null> {
    if (this.shouldThrowUnknownInstitution) {
      throw new UnknownInstitutionOrSectorError();
    }
    this.checkinCalls.push(params);
    return { checkIns: 1 };
  }
  async recordAbandonment(params: RecordAbandonmentParams): Promise<{ abandoned: number } | null> {
    if (this.shouldThrowUnknownInstitution) {
      throw new UnknownInstitutionOrSectorError();
    }
    this.abandonCalls.push(params);
    return { abandoned: 1 };
  }
}

const fakeNotificationPublisher: NotificationPublisher = {
  async publish(_event: NotificationEvent): Promise<void> {},
};

describe("signal-checkin controller", () => {
  let app: INestApplication;
  let repository: FakeSignalCheckinRepository;

  beforeAll(async () => {
    repository = new FakeSignalCheckinRepository();
    const moduleRef = await Test.createTestingModule({
      controllers: [SignalCheckinController],
      providers: [
        RecordSignalCheckinUseCase,
        RecordAssessmentAbandonmentUseCase,
        { provide: SIGNAL_CHECKIN_REPOSITORY, useValue: repository },
        { provide: NOTIFICATION_PUBLISHER, useValue: fakeNotificationPublisher },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /signals/checkin returns 204 for a valid body and forwards it to the repository", async () => {
    const response = await request(app.getHttpServer()).post("/signals/checkin").send({
      institutionId: "inst-1",
      sectorId: "UTI",
      concerning: true,
      deviceSignalId: "device-1",
    });

    expect(response.status).toBe(204);
    expect(repository.checkinCalls).toHaveLength(1);
    expect(repository.checkinCalls[0]).toMatchObject({ institutionId: "inst-1", sectorId: "UTI", concerning: true });
  });

  it("POST /signals/checkin returns 400 for a malformed body", async () => {
    const response = await request(app.getHttpServer()).post("/signals/checkin").send({ institutionId: "inst-1" });

    expect(response.status).toBe(400);
  });

  it("POST /signals/checkin returns 400 when the institution is unknown", async () => {
    repository.shouldThrowUnknownInstitution = true;
    const response = await request(app.getHttpServer()).post("/signals/checkin").send({
      institutionId: "does-not-exist",
      sectorId: "UTI",
      concerning: false,
      deviceSignalId: "device-1",
    });

    expect(response.status).toBe(400);
    repository.shouldThrowUnknownInstitution = false;
  });

  it("POST /signals/checkin requires no authentication", async () => {
    const response = await request(app.getHttpServer()).post("/signals/checkin").send({
      institutionId: "inst-1",
      sectorId: "UTI",
      concerning: false,
      deviceSignalId: "device-2",
    });

    expect(response.status).not.toBe(401);
  });

  it("POST /signals/abandon returns 204 for a valid body and forwards it to the repository", async () => {
    const response = await request(app.getHttpServer()).post("/signals/abandon").send({
      institutionId: "inst-1",
      sectorId: "UTI",
      deviceSignalId: "device-3",
    });

    expect(response.status).toBe(204);
    expect(repository.abandonCalls).toHaveLength(1);
    expect(repository.abandonCalls[0]).toMatchObject({ institutionId: "inst-1", sectorId: "UTI" });
  });

  it("POST /signals/abandon returns 400 for a malformed body", async () => {
    const response = await request(app.getHttpServer()).post("/signals/abandon").send({ institutionId: "inst-1" });

    expect(response.status).toBe(400);
  });

  it("POST /signals/abandon returns 400 when the institution is unknown", async () => {
    repository.shouldThrowUnknownInstitution = true;
    const response = await request(app.getHttpServer()).post("/signals/abandon").send({
      institutionId: "does-not-exist",
      sectorId: "UTI",
      deviceSignalId: "device-4",
    });

    expect(response.status).toBe(400);
    repository.shouldThrowUnknownInstitution = false;
  });

  it("POST /signals/abandon requires no authentication", async () => {
    const response = await request(app.getHttpServer()).post("/signals/abandon").send({
      institutionId: "inst-1",
      sectorId: "UTI",
      deviceSignalId: "device-5",
    });

    expect(response.status).not.toBe(401);
  });
});
```

- [ ] **Step 6: Rodar os testes e confirmar que os novos falham**

Run: `npx vitest run src/modules/signal-checkin/infrastructure/signal-checkin.controller.test.ts`
Expected: os 4 testes de `/signals/checkin` continuam passando; os 4 novos de `/signals/abandon` falham (endpoint não existe — 404).

- [ ] **Step 7: Implementar o endpoint**

Modify `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.ts` — arquivo inteiro passa a ser:

```ts
import { BadRequestException, Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import { RecordSignalCheckinUseCase } from "../application/use-cases/record-signal-checkin.use-case.ts";
import { RecordAssessmentAbandonmentUseCase } from "../application/use-cases/record-assessment-abandonment.use-case.ts";
import { UnknownInstitutionOrSectorError } from "../application/ports/signal-checkin-repository.port.ts";

const SignalCheckinSchema = z.object({
  institutionId: z.string().min(1),
  sectorId: z.string().min(1),
  concerning: z.boolean(),
  deviceSignalId: z.string().min(1),
});

const SignalAbandonSchema = z.object({
  institutionId: z.string().min(1),
  sectorId: z.string().min(1),
  deviceSignalId: z.string().min(1),
});

@Controller("signals")
export class SignalCheckinController {
  constructor(
    @Inject(RecordSignalCheckinUseCase) private readonly recordSignalCheckin: RecordSignalCheckinUseCase,
    @Inject(RecordAssessmentAbandonmentUseCase) private readonly recordAbandonment: RecordAssessmentAbandonmentUseCase,
  ) {}

  @Post("checkin")
  @HttpCode(204)
  async checkin(@Body() body: unknown): Promise<void> {
    const parsed = SignalCheckinSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      await this.recordSignalCheckin.execute(parsed.data);
    } catch (error) {
      if (error instanceof UnknownInstitutionOrSectorError) {
        throw new BadRequestException("Unknown institutionId or sectorId");
      }
      throw error;
    }
  }

  @Post("abandon")
  @HttpCode(204)
  async abandon(@Body() body: unknown): Promise<void> {
    const parsed = SignalAbandonSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      await this.recordAbandonment.execute(parsed.data);
    } catch (error) {
      if (error instanceof UnknownInstitutionOrSectorError) {
        throw new BadRequestException("Unknown institutionId or sectorId");
      }
      throw error;
    }
  }
}
```

- [ ] **Step 8: Wire no módulo**

Modify `apps/api/src/modules/signal-checkin/signal-checkin.module.ts` — arquivo inteiro passa a ser:

```ts
import { Module } from "@nestjs/common";
import { SignalCheckinController } from "./infrastructure/signal-checkin.controller.ts";
import { RecordSignalCheckinUseCase } from "./application/use-cases/record-signal-checkin.use-case.ts";
import { RecordAssessmentAbandonmentUseCase } from "./application/use-cases/record-assessment-abandonment.use-case.ts";
import { PrismaSignalCheckinRepository } from "./infrastructure/persistence/prisma-signal-checkin.repository.ts";
import { SIGNAL_CHECKIN_REPOSITORY } from "./application/ports/signal-checkin-repository.port.ts";
import { NotificationModule } from "../notification/notification.module.ts";

@Module({
  imports: [NotificationModule],
  controllers: [SignalCheckinController],
  providers: [
    RecordSignalCheckinUseCase,
    RecordAssessmentAbandonmentUseCase,
    { provide: SIGNAL_CHECKIN_REPOSITORY, useClass: PrismaSignalCheckinRepository },
  ],
})
export class SignalCheckinModule {}
```

- [ ] **Step 9: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/modules/signal-checkin`
Expected: PASS, todos os testes do módulo (use case de check-in, use case de abandono, controller).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/signal-checkin
git commit -m "feat(api): add RecordAssessmentAbandonmentUseCase and POST /signals/abandon"
```

---

### Task 4: Backend — `SignalRow.abandoned` + `PrismaSignalRepository.findAll`

**Files:**
- Modify: `apps/api/src/modules/manager/application/ports/signal-repository.port.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts`
- Modify (backfill mecânico, guiado por `tsc`): todo arquivo que hoje constrói um `SignalRow` literal — no mínimo `get-manager-signals.use-case.test.ts`, `manager-admin.controller.test.ts`, `manager.controller.test.ts`, `generate-manager-insight.use-case.test.ts` (confirmar a lista completa no Step 3, não confiar só nesta lista).

**Interfaces:**
- Consumes: `Signal.abandoned` (Task 1).
- Produces: `SignalRow.abandoned: number`, consumido pela Task 5.

Sem teste próprio novo para `PrismaSignalRepository.findAll` — o arquivo não tem `.test.ts` hoje (mesmo padrão de `PrismaSignalCheckinRepository`); a cobertura de `abandoned` vem da Task 5 via `SignalRow` fake.

- [ ] **Step 1: Adicionar o campo à porta**

Em `apps/api/src/modules/manager/application/ports/signal-repository.port.ts`, `SignalRow` passa a ser:

```ts
export interface SignalRow {
  sectorId: string;
  sectorName: string;
  weekStart: Date;
  checkIns: number;
  concerning: number;
  abandoned: number;
}
```

(`WeeklySignalRow` não muda — a varredura de risco semanal não usa `abandoned`.)

- [ ] **Step 2: Selecionar e mapear em `PrismaSignalRepository.findAll`**

Em `apps/api/src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts`, o método `findAll` passa a ser:

```ts
  async findAll(institutionId: string, sectorIds: string[]): Promise<SignalRow[]> {
    const rows = await this.prisma.signal.findMany({
      where: { institutionId, sectorId: { in: sectorIds } },
      select: {
        sectorId: true,
        weekStart: true,
        checkIns: true,
        concerning: true,
        abandoned: true,
        sector: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      sectorId: row.sectorId,
      sectorName: row.sector.name,
      weekStart: row.weekStart,
      checkIns: row.checkIns,
      concerning: row.concerning,
      abandoned: row.abandoned,
    }));
  }
```

(`findAllForWeek` e `countBySector` não mudam.)

- [ ] **Step 3: Rodar o typecheck e listar todo site quebrado**

Run (de `apps/api`): `npx tsc --noEmit -p tsconfig.json`
Expected: uma lista de erros "Property 'abandoned' is missing in type..." — um por objeto `SignalRow` literal que ainda não tem o campo. Anotar todos os arquivos/linhas listados (a lista pode ter mais entradas do que as citadas acima em **Files** — use a saída do compilador, não essa lista, como fonte da verdade).

- [ ] **Step 4: Adicionar `abandoned: 0` em cada site quebrado**

Para cada erro listado no Step 3: abrir o arquivo, achar o objeto `SignalRow` literal na linha indicada, adicionar `abandoned: 0` (o teste em questão não é sobre abandono — os testes que exercitam `abandoned` de verdade são escritos do zero na Task 5, não aqui). Não alterar nenhuma outra asserção nesses arquivos.

- [ ] **Step 5: Rodar o typecheck de novo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erro.

- [ ] **Step 6: Rodar a suíte inteira da api**

Run (de `apps/api`): `npx vitest run`
Expected: PASS — os testes que só ganharam `abandoned: 0` continuam com o mesmo comportamento de antes (nenhuma asserção existente lia esse campo).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/manager/application/ports/signal-repository.port.ts apps/api/src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts
git add -u apps/api/src
git commit -m "feat(api): thread Signal.abandoned through SignalRepository"
```

---

### Task 5: Backend — `GetManagerSignalsUseCase.abandonedLast4Weeks`

**Files:**
- Modify: `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`

**Interfaces:**
- Consumes: `SignalRow.abandoned` (Task 4).
- Produces: `ManagerSignalsResponse.abandonedLast4Weeks: number`, consumido pelas Tasks 11 (dashboard) e 12 (PGR export).

- [ ] **Step 1: Escrever os testes (falhando)**

Em `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`, adicionar (o arquivo já existe com `FakeSignalRepository`/`WEEK_1`/`WEEK_2`/`makeUseCase` — reaproveitar; só os literais `SignalRow` precisam ganhar `abandoned` conforme a Task 4 já fez):

```ts
  it("sums abandoned only across the visible sectors' last 4 weeks, mirroring checkInsLast4Weeks", async () => {
    const rows: SignalRow[] = [
      // sector "visible": clears k=5 in WEEK_2 (the reference week) — counts.
      { sectorId: "visible", sectorName: "UTI", weekStart: WEEK_1, checkIns: 6, concerning: 1, abandoned: 2 },
      { sectorId: "visible", sectorName: "UTI", weekStart: WEEK_2, checkIns: 6, concerning: 2, abandoned: 3 },
      // sector "hidden": never reaches 5 check-ins — its abandoned count must not leak through.
      { sectorId: "hidden", sectorName: "Pronto-Socorro", weekStart: WEEK_1, checkIns: 2, concerning: 0, abandoned: 9 },
      { sectorId: "hidden", sectorName: "Pronto-Socorro", weekStart: WEEK_2, checkIns: 2, concerning: 0, abandoned: 9 },
    ];
    const useCase = makeUseCase(rows);

    const result = await useCase.execute("institution-1", ["visible", "hidden"]);

    expect(result.abandonedLast4Weeks).toBe(5); // 2 + 3, from "visible" only
  });

  it("returns abandonedLast4Weeks: 0 when no sector clears the k-anonymity threshold", async () => {
    const rows: SignalRow[] = [
      { sectorId: "hidden", sectorName: "Pronto-Socorro", weekStart: WEEK_1, checkIns: 1, concerning: 0, abandoned: 4 },
    ];
    const useCase = makeUseCase(rows);

    const result = await useCase.execute("institution-1", ["hidden"]);

    expect(result.abandonedLast4Weeks).toBe(0);
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run (de `apps/api`): `npx vitest run src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`
Expected: FAIL nos 2 novos testes — `result.abandonedLast4Weeks` é `undefined`.

- [ ] **Step 3: Implementar**

Em `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts`:

A interface `ManagerSignalsResponse` ganha o campo:

```ts
export interface ManagerSignalsResponse {
  overallConcerningRate: number;
  checkInsLast4Weeks: number;
  abandonedLast4Weeks: number;
  weeklyTrend: { weekStart: string; concerningRate: number; checkIns: number; concerning: number }[];
  segments: { label: string; value: number; n: number }[];
  followUpResponseRate: number;
  sectorCoverage: { visible: number; total: number };
  referenceWeekStart: string | null;
}
```

`EMPTY_RESPONSE` ganha o default:

```ts
const EMPTY_RESPONSE: Omit<ManagerSignalsResponse, "followUpResponseRate"> = {
  overallConcerningRate: 0,
  checkInsLast4Weeks: 0,
  abandonedLast4Weeks: 0,
  weeklyTrend: [],
  segments: [],
  sectorCoverage: { visible: 0, total: 0 },
  referenceWeekStart: null,
};
```

E, no corpo de `execute`, logo depois de onde `checkInsLast4Weeks` é calculado (reaproveita exatamente `visibleRows`/`recentWeekTimes`, já computados ali):

```ts
    const checkInsLast4Weeks = visibleRows
      .filter((r) => recentWeekTimes.has(r.weekStart.getTime()))
      .reduce((sum, r) => sum + r.checkIns, 0);

    // Mesmo filtro de visibilidade e mesma janela do checkInsLast4Weeks — nunca
    // um critério próprio. Um setor não fica visível por abandono sozinho: só
    // soma aqui depois que checkIns >= K_ANONYMITY_THRESHOLD já o liberou.
    const abandonedLast4Weeks = visibleRows
      .filter((r) => recentWeekTimes.has(r.weekStart.getTime()))
      .reduce((sum, r) => sum + r.abandoned, 0);
```

E no `return` final do bloco principal:

```ts
    return {
      overallConcerningRate,
      checkInsLast4Weeks,
      abandonedLast4Weeks,
      weeklyTrend,
      segments,
      followUpResponseRate,
      sectorCoverage: { visible: visibleSectorIds.size, total: sectorIds.length },
      referenceWeekStart: new Date(mostRecentWeek).toISOString(),
    };
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`
Expected: PASS, todos os testes (os pré-existentes e os 2 novos).

- [ ] **Step 5: Typecheck e suíte completa**

Run: `npx tsc --noEmit -p tsconfig.json` (esperado: sem erro — todo consumidor de `ManagerSignalsResponse` no backend, como `manager.controller.ts` e `generate-manager-insight.use-case.ts`, só lê campos que já existiam, então não quebra)
Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts
git commit -m "feat(api): compute abandonedLast4Weeks in GetManagerSignalsUseCase"
```

---

### Task 6: Domain compartilhado — métrica `abandoned` no glossário

**Files:**
- Modify: `packages/domain/src/manager/metric-glossary.ts`

**Interfaces:**
- Produces: `MANAGER_METRICS.abandoned: MetricDefinition`, `abandonedReading(total: number): string`, consumidos pelas Tasks 11 e 12.

Sem teste próprio nesta task — `metric-glossary.ts` não tem `.test.ts` hoje; a leitura correta do rótulo/tooltip é verificada pelos testes de `ManagerDashboardPage` (Task 11) e `download-manager-pgr-report` (Task 12), como já acontece para as métricas existentes.

- [ ] **Step 1: Adicionar o id, a métrica e a função de leitura**

Em `packages/domain/src/manager/metric-glossary.ts`:

`ManagerMetricId` passa a ser:

```ts
export type ManagerMetricId = "concerningRate" | "checkIns" | "abandoned" | "followUpRate" | "sectorCoverage";
```

`MANAGER_METHODOLOGY_VERSION` sobe (nova regra de supressão documentada):

```ts
export const MANAGER_METHODOLOGY_VERSION = "1.1 — 9 de setembro de 2026";
```

`MANAGER_METRICS` ganha a entrada `abandoned`, entre `checkIns` e `followUpRate`:

```ts
  abandoned: {
    id: "abandoned",
    label: "Questionários abandonados",
    method:
      "Quantas vezes alguém começou a responder um questionário (PHQ-9 ou GAD-7) e confirmou que queria sair antes de terminar, na tela de aviso que aparece nesse momento. Uma pessoa que abandona e depois volta e conclui o mesmo questionário conta nos dois indicadores — não há tentativa de reconciliar um com o outro.",
    window: "As 4 semanas mais recentes que têm dados — mesma janela de \"Respostas\".",
    suppression:
      "Conta apenas os setores que já têm 5 respostas ou mais na semana de referência — o mesmo critério de \"Respostas\", nunca um critério próprio. Um setor não fica visível por abandono sozinho.",
  },
```

E, ao fim do arquivo, ao lado de `checkInsReading`:

```ts
function questionariosAbandonados(count: number): string {
  return count === 1 ? "1 questionário abandonado" : `${count} questionários abandonados`;
}

export function abandonedReading(total: number): string {
  return `${questionariosAbandonados(total)}, nas últimas 4 semanas`;
}
```

- [ ] **Step 2: Typecheck**

Run (de `packages/domain`): `npx tsc --noEmit -p tsconfig.json`
Expected: sem erro (o `Record<ManagerMetricId, MetricDefinition>` exige a nova chave, e ela já foi adicionada).

- [ ] **Step 3: Commit**

```bash
git add packages/domain/src/manager/metric-glossary.ts
git commit -m "feat(domain): add the 'abandoned' metric to the manager glossary"
```

---

### Task 7: Frontend — camada de porta/adapter para `abandon`

**Files:**
- Modify: `apps/web/src/ports/signal-checkin.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-signal-checkin.adapter.ts`
- Create: `apps/web/src/infrastructure/http/http-signal-checkin.adapter.test.ts`

**Interfaces:**
- Produces: `SignalCheckinPort.abandon(params: SignalAbandonmentParams): Promise<void>`, consumido pela Task 8.

**Refinamento sobre o spec:** o spec descreve `signal-abandonment.port.ts`/`http-signal-abandonment.adapter.ts` como arquivos próprios, espelhando `signal-checkin` ponta a ponta. Esta task estende `SignalCheckinPort`/`HttpSignalCheckinAdapter` em vez disso — mesmo raciocínio do backend (Task 3), que também manteve tudo num único controller/módulo: as duas operações batem no mesmo módulo conceitual (`signals`), e um segundo arquivo de porta/adapter para um único método a mais duplicaria a estrutura sem ganhar isolamento real.

- [ ] **Step 1: Escrever o teste do adapter (falhando)**

Create `apps/web/src/infrastructure/http/http-signal-checkin.adapter.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpSignalCheckinAdapter } from "./http-signal-checkin.adapter";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpSignalCheckinAdapter abandon", () => {
  it("posts to /signals/abandon with the given params", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    const adapter = new HttpSignalCheckinAdapter();
    await adapter.abandon({ institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/signals/abandon");
    expect(init!.method).toBe("POST");
    expect(JSON.parse(init!.body as string)).toEqual({
      institutionId: "inst-1",
      sectorId: "UTI",
      deviceSignalId: "device-1",
    });
  });

  it("throws when the response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

    const adapter = new HttpSignalCheckinAdapter();
    await expect(
      adapter.abandon({ institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run (de `apps/web`): `npx vitest run src/infrastructure/http/http-signal-checkin.adapter.test.ts`
Expected: FAIL — `adapter.abandon` não existe.

- [ ] **Step 3: Adicionar o método à porta**

Em `apps/web/src/ports/signal-checkin.port.ts`, arquivo inteiro passa a ser:

```ts
export interface SignalCheckinParams {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
  concerning: boolean;
}

export interface SignalAbandonmentParams {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
}

export interface SignalCheckinPort {
  checkin(params: SignalCheckinParams): Promise<void>;
  abandon(params: SignalAbandonmentParams): Promise<void>;
}
```

- [ ] **Step 4: Implementar no adapter**

Em `apps/web/src/infrastructure/http/http-signal-checkin.adapter.ts`, arquivo inteiro passa a ser:

```ts
import type { SignalAbandonmentParams, SignalCheckinParams, SignalCheckinPort } from "@/ports/signal-checkin.port";
import { API_BASE_URL } from './api-base-url';

export class HttpSignalCheckinAdapter implements SignalCheckinPort {
  async checkin(params: SignalCheckinParams): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/signals/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`signal checkin failed with status ${response.status}`);
    }
  }

  async abandon(params: SignalAbandonmentParams): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/signals/abandon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`signal abandonment failed with status ${response.status}`);
    }
  }
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/infrastructure/http/http-signal-checkin.adapter.test.ts`
Expected: PASS, 2 testes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ports/signal-checkin.port.ts apps/web/src/infrastructure/http/http-signal-checkin.adapter.ts apps/web/src/infrastructure/http/http-signal-checkin.adapter.test.ts
git commit -m "feat(web): add SignalCheckinPort.abandon"
```

---

### Task 8: Frontend — `RecordAssessmentAbandonmentUseCase` + wiring

**Files:**
- Create: `apps/web/src/use-cases/record-assessment-abandonment.usecase.ts`
- Create: `apps/web/src/use-cases/record-assessment-abandonment.usecase.test.ts`
- Modify: `apps/web/src/app/container/signal-checkin.ts`

**Interfaces:**
- Consumes: `SignalCheckinPort.abandon` (Task 7).
- Produces: `recordAssessmentAbandonmentUseCase` (instância exportada do container), `RecordAssessmentAbandonmentUseCase.execute({ link, }): Promise<void>`, consumido pela Task 10.

- [ ] **Step 1: Escrever o teste (falhando)**

Create `apps/web/src/use-cases/record-assessment-abandonment.usecase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RecordAssessmentAbandonmentUseCase } from "./record-assessment-abandonment.usecase";
import type { SignalAbandonmentParams, SignalCheckinPort } from "@/ports/signal-checkin.port";

class FakeSignalCheckinPort implements SignalCheckinPort {
  public abandonCalls: SignalAbandonmentParams[] = [];
  async checkin(): Promise<void> {
    throw new Error("not used in this test");
  }
  async abandon(params: SignalAbandonmentParams): Promise<void> {
    this.abandonCalls.push(params);
  }
}

describe("RecordAssessmentAbandonmentUseCase", () => {
  it("does nothing when there is no institution link", async () => {
    const port = new FakeSignalCheckinPort();
    const useCase = new RecordAssessmentAbandonmentUseCase(port);

    await useCase.execute({ link: null });

    expect(port.abandonCalls).toHaveLength(0);
  });

  it("calls the port with the link's fields, when a link exists", async () => {
    const port = new FakeSignalCheckinPort();
    const useCase = new RecordAssessmentAbandonmentUseCase(port);

    await useCase.execute({
      link: { institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" },
    });

    expect(port.abandonCalls).toEqual([{ institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" }]);
  });

  it("propagates a port failure (the caller decides whether to swallow it)", async () => {
    class ThrowingPort implements SignalCheckinPort {
      async checkin(): Promise<void> {
        throw new Error("not used in this test");
      }
      async abandon(): Promise<void> {
        throw new Error("network down");
      }
    }
    const useCase = new RecordAssessmentAbandonmentUseCase(new ThrowingPort());

    await expect(
      useCase.execute({ link: { institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" } }),
    ).rejects.toThrow("network down");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run (de `apps/web`): `npx vitest run src/use-cases/record-assessment-abandonment.usecase.test.ts`
Expected: FAIL — arquivo de implementação não existe.

- [ ] **Step 3: Implementação mínima**

Create `apps/web/src/use-cases/record-assessment-abandonment.usecase.ts`:

```ts
import type { SignalCheckinPort } from "@/ports/signal-checkin.port";

export interface InstitutionLinkSnapshot {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
}

export interface RecordAssessmentAbandonmentInput {
  link: InstitutionLinkSnapshot | null;
}

export class RecordAssessmentAbandonmentUseCase {
  constructor(private readonly checkinPort: SignalCheckinPort) {}

  async execute({ link }: RecordAssessmentAbandonmentInput): Promise<void> {
    if (link === null) return;

    await this.checkinPort.abandon({
      institutionId: link.institutionId,
      sectorId: link.sectorId,
      deviceSignalId: link.deviceSignalId,
    });
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/use-cases/record-assessment-abandonment.usecase.test.ts`
Expected: PASS, 3 testes.

- [ ] **Step 5: Registrar no container**

Modify `apps/web/src/app/container/signal-checkin.ts` — arquivo inteiro passa a ser:

```ts
import { RecordSignalCheckinUseCase } from "@/use-cases/record-signal-checkin.usecase";
import { RecordAssessmentAbandonmentUseCase } from "@/use-cases/record-assessment-abandonment.usecase";
import { HttpSignalCheckinAdapter } from "@/infrastructure/http/http-signal-checkin.adapter";

const signalCheckinAdapter = new HttpSignalCheckinAdapter();

export const recordSignalCheckinUseCase = new RecordSignalCheckinUseCase(signalCheckinAdapter);
export const recordAssessmentAbandonmentUseCase = new RecordAssessmentAbandonmentUseCase(signalCheckinAdapter);
```

- [ ] **Step 6: Typecheck**

Run (de `apps/web`): `npx tsc --noEmit -p tsconfig.json`
Expected: sem erro.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/use-cases/record-assessment-abandonment.usecase.ts apps/web/src/use-cases/record-assessment-abandonment.usecase.test.ts apps/web/src/app/container/signal-checkin.ts
git commit -m "feat(web): add RecordAssessmentAbandonmentUseCase"
```

---

### Task 9: Frontend — `AbandonAssessmentModal`

**Files:**
- Create: `apps/web/src/presentation/components/AbandonAssessmentModal.tsx`
- Create: `apps/web/src/presentation/components/AbandonAssessmentModal.test.tsx`

**Interfaces:**
- Consumes: `Modal`/`Button` de `@/presentation/ui`, `Blocker` de `react-router`.
- Produces: `AbandonAssessmentModal({ blocker, onConfirmLeave }: AbandonAssessmentModalProps)`, consumido pela Task 11.

- [ ] **Step 1: Escrever o teste (falhando)**

Create `apps/web/src/presentation/components/AbandonAssessmentModal.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Blocker } from "react-router";
import { AbandonAssessmentModal } from "./AbandonAssessmentModal";

function unblockedBlocker(): Blocker {
  return { state: "unblocked", proceed: undefined, reset: undefined, location: undefined } as Blocker;
}

function blockedBlocker(overrides: { proceed: () => void; reset: () => void }): Blocker {
  return {
    state: "blocked",
    proceed: overrides.proceed,
    reset: overrides.reset,
    location: { pathname: "/home", search: "", hash: "", state: null, key: "default" },
  } as Blocker;
}

describe("AbandonAssessmentModal", () => {
  it("renders nothing visible when the blocker is unblocked", () => {
    render(<AbandonAssessmentModal blocker={unblockedBlocker()} onConfirmLeave={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the confirmation dialog when the blocker is blocked", () => {
    render(
      <AbandonAssessmentModal blocker={blockedBlocker({ proceed: vi.fn(), reset: vi.fn() })} onConfirmLeave={vi.fn()} />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Sair sem terminar?")).toBeInTheDocument();
  });

  it("'Continuar respondendo' calls blocker.reset(), not onConfirmLeave", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    const proceed = vi.fn();
    const onConfirmLeave = vi.fn();
    render(<AbandonAssessmentModal blocker={blockedBlocker({ proceed, reset })} onConfirmLeave={onConfirmLeave} />);

    await user.click(screen.getByRole("button", { name: "Continuar respondendo" }));

    expect(reset).toHaveBeenCalledOnce();
    expect(proceed).not.toHaveBeenCalled();
    expect(onConfirmLeave).not.toHaveBeenCalled();
  });

  it("'Sair mesmo assim' calls onConfirmLeave then blocker.proceed()", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    const proceed = vi.fn();
    const onConfirmLeave = vi.fn();
    render(<AbandonAssessmentModal blocker={blockedBlocker({ proceed, reset })} onConfirmLeave={onConfirmLeave} />);

    await user.click(screen.getByRole("button", { name: "Sair mesmo assim" }));

    expect(onConfirmLeave).toHaveBeenCalledOnce();
    expect(proceed).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run (de `apps/web`): `npx vitest run src/presentation/components/AbandonAssessmentModal.test.tsx`
Expected: FAIL — arquivo de implementação não existe.

- [ ] **Step 3: Implementação mínima**

Create `apps/web/src/presentation/components/AbandonAssessmentModal.tsx`:

```tsx
import type { Blocker } from 'react-router';
import { Button } from '@/presentation/ui/Button';
import { Modal } from '@/presentation/ui/Modal';

interface AbandonAssessmentModalProps {
  blocker: Blocker;
  onConfirmLeave: () => void;
}

export function AbandonAssessmentModal({ blocker, onConfirmLeave }: AbandonAssessmentModalProps) {
  const isOpen = blocker.state === 'blocked';

  const handleStay = () => {
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  };

  const handleLeave = () => {
    onConfirmLeave();
    if (blocker.state === 'blocked') {
      blocker.proceed();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleStay}
      title="Sair sem terminar?"
      size="sm"
      footer={
        <>
          <Button variant="outline" full={false} onClick={handleStay}>
            Continuar respondendo
          </Button>
          <Button variant="danger" full={false} onClick={handleLeave}>
            Sair mesmo assim
          </Button>
        </>
      }
    >
      <p className="text-label text-ink">
        Suas respostas ainda não foram enviadas. Você pode retomar de onde parou a qualquer momento.
      </p>
    </Modal>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/presentation/components/AbandonAssessmentModal.test.tsx`
Expected: PASS, 4 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/components/AbandonAssessmentModal.tsx apps/web/src/presentation/components/AbandonAssessmentModal.test.tsx
git commit -m "feat(web): add AbandonAssessmentModal"
```

---

### Task 10: Frontend — migrar o harness de teste de `ScaleAssessmentPage` para um data router

**Files:**
- Modify: `apps/web/src/presentation/pages/ScaleAssessmentPage.test.tsx`

**Interfaces:**
- Nenhuma nova — esta task só troca a infraestrutura de renderização do teste, sem mudar `ScaleAssessmentPage.tsx` ainda. É pré-requisito da Task 11: `useBlocker` só funciona dentro de um data router (`createBrowserRouter`/`createMemoryRouter` + `RouterProvider`), e o app real já usa `createBrowserRouter` (`apps/web/src/app/router.tsx`) — só o harness deste teste ainda usa o `<MemoryRouter>`/`<Routes>` antigo.

- [ ] **Step 1: Trocar `renderScale` para `createMemoryRouter`**

Em `apps/web/src/presentation/pages/ScaleAssessmentPage.test.tsx`, o import e a função `renderScale` passam a ser:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScaleAssessmentPage } from './ScaleAssessmentPage';
import { PHQ9_SCALE, GAD7_SCALE, type AssessmentScale } from '@/domain/assessment-scales/scales';
import { PHQ9_RISK_ITEM_INDEX } from '@/domain/assessment-scales/phq9';
import * as container from '@/app/container';
import { routes } from '@/presentation/lib/routes';
import { useInstitutionLinkStore } from '@/stores/institution-link.store';

function ResultProbe() {
  const { state } = useLocation() as {
    state: { max: number; totalScore: number; pendingSync?: boolean };
  };
  return (
    <>
      <div>{`Result screen max=${state.max} score=${state.totalScore}`}</div>
      <div>{`pendingSync=${state.pendingSync === true}`}</div>
    </>
  );
}

function renderScale(scale: AssessmentScale, path: string) {
  const queryClient = new QueryClient();
  const router = createMemoryRouter(
    [
      { path, element: <ScaleAssessmentPage scale={scale} /> },
      { path: routes.assessment, element: <div>Assessment select screen</div> },
      { path: routes.home, element: <div>Home screen</div> },
      { path: routes.result, element: <ResultProbe /> },
    ],
    { initialEntries: [path] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
```

(O resto do arquivo — `pendingSubmit`, `SCALES`, o `describe.each` e todos os `it` — não muda nesta task.)

- [ ] **Step 2: Rodar a suíte inteira do arquivo**

Run (de `apps/web`): `npx vitest run src/presentation/pages/ScaleAssessmentPage.test.tsx`
Expected: PASS — todos os testes já existentes continuam passando, exatamente como antes (a troca de harness não muda nenhum comportamento observável ainda).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/presentation/pages/ScaleAssessmentPage.test.tsx
git commit -m "test(web): migrate ScaleAssessmentPage's test harness to a data router"
```

---

### Task 11: Frontend — `useBlocker` + `AbandonAssessmentModal` em `ScaleAssessmentPage`

**Files:**
- Modify: `apps/web/src/presentation/pages/ScaleAssessmentPage.tsx`
- Modify: `apps/web/src/presentation/pages/ScaleAssessmentPage.test.tsx`

**Interfaces:**
- Consumes: `AbandonAssessmentModal` (Task 9), `recordAssessmentAbandonmentUseCase` (Task 8), `useInstitutionLinkStore`/`useConsentStore` (já existentes).

- [ ] **Step 1: Escrever os testes (falhando)**

No mesmo `describe.each(SCALES)` de `apps/web/src/presentation/pages/ScaleAssessmentPage.test.tsx`, adicionar um probe de navegação e os novos testes. Primeiro, junto de `ResultProbe`:

```tsx
function NavigateAwayProbe() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(routes.home)}>
      Ir para Home (probe)
    </button>
  );
}
```

(adicionar `useNavigate` ao import de `'react-router'` no topo do arquivo)

Em `renderScale`, a primeira rota passa a renderizar os dois juntos:

```tsx
      { path, element: (<><ScaleAssessmentPage scale={scale} /><NavigateAwayProbe /></>) },
```

E, dentro do `describe.each`, junto do resto dos `beforeEach`/`it`, adicionar (usar um `sectorId`/`institutionId`/`deviceSignalId` fixos e `aggregateOptIn: true` para o caminho "com vínculo"; os testes que não mexem no link herdam o `institutionId: null` já setado no `beforeEach` existente):

```tsx
  it('does not block navigating away before any question is answered', async () => {
    const user = userEvent.setup();
    renderScale(scale, path);

    await user.click(screen.getByRole('button', { name: 'Ir para Home (probe)' }));

    expect(screen.getByText('Home screen')).toBeInTheDocument();
    expect(screen.queryByText('Sair sem terminar?')).not.toBeInTheDocument();
  });

  it('blocks navigating away after answering at least one question, and lets the médico stay', async () => {
    const user = userEvent.setup();
    renderScale(scale, path);

    await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));
    await user.click(screen.getByRole('button', { name: 'Ir para Home (probe)' }));

    expect(screen.getByText('Sair sem terminar?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuar respondendo' }));

    expect(screen.queryByText('Sair sem terminar?')).not.toBeInTheDocument();
    // Still on the questionnaire (not navigated to Home) — the click landed on
    // question[1], since answering question[0] already auto-advanced to it.
    expect(screen.getByText(scale.questions[1]!)).toBeInTheDocument();
  });

  it('lets the médico confirm leaving, and navigates away', async () => {
    const user = userEvent.setup();
    renderScale(scale, path);

    await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));
    await user.click(screen.getByRole('button', { name: 'Ir para Home (probe)' }));
    await user.click(screen.getByRole('button', { name: 'Sair mesmo assim' }));

    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('records the abandonment when the médico is linked and opted in, on confirming leave', async () => {
    const user = userEvent.setup();
    useInstitutionLinkStore.setState({
      institutionId: 'inst-1',
      institutionName: 'Hospital X',
      sectorId: 'UTI',
      sectorName: 'UTI',
      deviceSignalId: 'device-1',
    });
    vi.spyOn(container.recordAssessmentAbandonmentUseCase, 'execute').mockResolvedValue(undefined);
    renderScale(scale, path);

    await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));
    await user.click(screen.getByRole('button', { name: 'Ir para Home (probe)' }));
    await user.click(screen.getByRole('button', { name: 'Sair mesmo assim' }));

    expect(container.recordAssessmentAbandonmentUseCase.execute).toHaveBeenCalledWith({
      link: { institutionId: 'inst-1', sectorId: 'UTI', deviceSignalId: 'device-1' },
    });
  });

  it('does not record the abandonment when there is no institution link', async () => {
    const user = userEvent.setup();
    const executeSpy = vi.spyOn(container.recordAssessmentAbandonmentUseCase, 'execute');
    renderScale(scale, path);

    await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));
    await user.click(screen.getByRole('button', { name: 'Ir para Home (probe)' }));
    await user.click(screen.getByRole('button', { name: 'Sair mesmo assim' }));

    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('does not block the programmatic navigation to the result screen after a successful submit', async () => {
    const user = userEvent.setup();
    renderScale(scale, path);

    for (let i = 0; i < total; i++) {
      await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));
    }
    await user.click(screen.getByRole('button', { name: 'Enviar respostas' }));

    expect(await screen.findByText(`Result screen max=${maxScore} score=5`)).toBeInTheDocument();
    expect(screen.queryByText('Sair sem terminar?')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que os novos falham**

Run (de `apps/web`): `npx vitest run src/presentation/pages/ScaleAssessmentPage.test.tsx`
Expected: os testes pré-existentes continuam passando; os 6 novos falham (nada bloqueia navegação hoje).

- [ ] **Step 3: Implementar**

Em `apps/web/src/presentation/pages/ScaleAssessmentPage.tsx`:

Os imports ganham:

```tsx
import { useBlocker, useNavigate } from 'react-router';
import { recordAssessmentAbandonmentUseCase } from '@/app/container';
import { useInstitutionLinkStore } from '@/stores/institution-link.store';
import { useConsentStore } from '@/stores/consent.store';
import { AbandonAssessmentModal } from '@/presentation/components/AbandonAssessmentModal';
```

(`useNavigate` já estava importado — só junta `useBlocker` na mesma linha do `'react-router'`.)

Logo depois da declaração de `answers`, adicionar:

```tsx
  // "Iniciado" = pelo menos 1 resposta dada. A navegação para a tela de
  // resultado após um envio bem-sucedido nunca é bloqueada — answers ainda
  // tem os valores enviados nesse momento, então o filtro é pelo destino, não
  // por zerar o estado antes de navegar.
  const hasProgress = answers.some((value) => value !== undefined);
  const blocker = useBlocker(
    ({ nextLocation }) => hasProgress && nextLocation.pathname !== routes.result,
  );

  const handleConfirmLeave = () => {
    const { institutionId, sectorId, deviceSignalId } = useInstitutionLinkStore.getState();
    const { aggregateOptIn } = useConsentStore.getState();
    if (institutionId !== null && sectorId !== null && deviceSignalId !== null && aggregateOptIn) {
      void recordAssessmentAbandonmentUseCase
        .execute({ link: { institutionId, sectorId, deviceSignalId } })
        .catch(() => {});
    }
  };
```

E, no JSX, `<AbandonAssessmentModal blocker={blocker} onConfirmLeave={handleConfirmLeave} />` como um segundo filho de `<PhoneShell>`, irmão (não descendente) do `<div className="md:pt-4">...</div>` existente — ou seja, o fim do arquivo passa a ser:

```tsx
        )}
      </div>
      <AbandonAssessmentModal blocker={blocker} onConfirmLeave={handleConfirmLeave} />
    </PhoneShell>
  );
}
```

(`PhoneShell.children` é `ReactNode` e só faz `{children}` — aceita os dois irmãos sem mudança nenhuma no componente.)

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/presentation/pages/ScaleAssessmentPage.test.tsx`
Expected: PASS, todos os testes (pré-existentes + os 6 novos).

- [ ] **Step 5: Typecheck e suíte completa do web**

Run (de `apps/web`): `npx tsc --noEmit -p tsconfig.json`
Expected: sem erro.
Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/presentation/pages/ScaleAssessmentPage.tsx apps/web/src/presentation/pages/ScaleAssessmentPage.test.tsx
git commit -m "feat(web): confirm before leaving a started questionnaire, record abandonment"
```

---

### Task 12: Frontend — `abandonedLast4Weeks` no schema + KPI no dashboard

**Files:**
- Modify: `apps/web/src/ports/manager-signals.port.ts`
- Modify (backfill mecânico, guiado por `tsc`): todo arquivo que hoje constrói um `ManagerSignalsResponse` literal — no mínimo `ManagerDashboardPage.test.tsx`, `router.test.tsx`, `http-manager-signals.adapter.test.ts`, `manager-signals.port.test.ts`, `get-manager-signals.usecase.test.ts` (confirmar a lista completa no Step 2, não confiar só nesta lista).
- Modify: `apps/web/src/presentation/pages/ManagerDashboardPage.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx`

**Interfaces:**
- Consumes: `MANAGER_METRICS.abandoned`/`abandonedReading` (Task 6).

- [ ] **Step 1: Adicionar o campo ao schema**

Em `apps/web/src/ports/manager-signals.port.ts`, `ManagerSignalsResponseSchema` ganha:

```ts
export const ManagerSignalsResponseSchema = z.object({
  overallConcerningRate: z.number(),
  checkInsLast4Weeks: z.number(),
  abandonedLast4Weeks: z.number(),
  weeklyTrend: z.array(
    z.object({
      weekStart: z.string(),
      concerningRate: z.number(),
      checkIns: z.number(),
      concerning: z.number(),
    }),
  ),
  segments: z.array(z.object({ label: z.string(), value: z.number(), n: z.number() })),
  followUpResponseRate: z.number(),
  sectorCoverage: z.object({ visible: z.number(), total: z.number() }),
  referenceWeekStart: z.string().nullable(),
});
```

- [ ] **Step 2: Rodar o typecheck e listar todo site quebrado**

Run (de `apps/web`): `npx tsc --noEmit -p tsconfig.json`
Expected: uma lista de erros "Property 'abandonedLast4Weeks' is missing in type..." — um por objeto `ManagerSignalsResponse` literal que ainda não tem o campo. Anotar todos os arquivos/linhas listados (a lista pode ter mais entradas do que as citadas acima em **Files** — use a saída do compilador como fonte da verdade).

- [ ] **Step 3: Adicionar `abandonedLast4Weeks: 0` em cada site quebrado, exceto o fixture principal do dashboard**

Para cada erro listado no Step 2 **exceto** o `SIGNALS_RESPONSE` de `ManagerDashboardPage.test.tsx`: adicionar `abandonedLast4Weeks: 0` (nenhum desses testes é sobre abandono). Não alterar nenhuma outra asserção.

Em `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx`, o fixture principal ganha um valor não-zero, para o novo teste do Step 6 poder afirmar algo que não seja o estado vazio:

```ts
const SIGNALS_RESPONSE = {
  overallConcerningRate: 0.41,
  checkInsLast4Weeks: 111,
  abandonedLast4Weeks: 23,
  weeklyTrend: [
    { weekStart: "2026-06-01T00:00:00.000Z", concerningRate: 0.3, checkIns: 20, concerning: 6 },
    { weekStart: "2026-06-08T00:00:00.000Z", concerningRate: 0.5, checkIns: 24, concerning: 12 },
  ],
  segments: [
    { label: "Plantão noturno", value: 52, n: 18 },
    { label: "Pronto-socorro", value: 38, n: 24 },
    { label: "UTI", value: 44, n: 9 },
  ],
  followUpResponseRate: 0.7,
  sectorCoverage: { visible: 3, total: 4 },
  referenceWeekStart: "2026-06-08T00:00:00.000Z",
};
```

(O fixture de estado vazio, em torno da linha 186 do arquivo hoje — o de `checkInsLast4Weeks: 0` — ganha `abandonedLast4Weeks: 0`, como todos os outros do Step 3.)

- [ ] **Step 4: Rodar o typecheck de novo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erro.

- [ ] **Step 5: Rodar a suíte inteira do web**

Run (de `apps/web`): `npx vitest run`
Expected: PASS — nenhuma asserção pré-existente lia `abandonedLast4Weeks`, então o comportamento observado não muda.

- [ ] **Step 6: Escrever o teste do novo KPI (falhando)**

Em `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx`, adicionar (junto dos outros testes de KPI que já usam `SIGNALS_RESPONSE`):

```tsx
  it("shows the abandoned-questionnaires KPI", async () => {
    renderManager();

    expect(await screen.findByText("Questionários abandonados")).toBeInTheDocument();
    const grid = screen.getByTestId("kpi-grid");
    expect(within(grid).getByText("23")).toBeInTheDocument();
  });
```

- [ ] **Step 7: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/presentation/pages/ManagerDashboardPage.test.tsx`
Expected: FAIL no teste novo — o KPI não existe ainda.

- [ ] **Step 8: Implementar**

Em `apps/web/src/presentation/pages/ManagerDashboardPage.tsx`:

O import de `@zelo/domain` ganha `abandonedReading`:

```tsx
import {
  MANAGER_METRICS,
  abandonedReading,
  checkInsReading,
  concerningRateReading,
  followUpBandFor,
  followUpReading,
  sectorCoverageReading,
  type MetricDefinition,
} from "@zelo/domain";
```

Logo depois de `const checkInsLast4Weeks = data?.checkInsLast4Weeks ?? 0;`:

```tsx
  const abandonedLast4Weeks = data?.abandonedLast4Weeks ?? 0;
```

E, no grid de KPIs, um novo `<KpiCard>` logo depois do de `MANAGER_METRICS.checkIns` (antes do de `followUpRate`):

```tsx
              <KpiCard
                metric={MANAGER_METRICS.abandoned}
                value={String(abandonedLast4Weeks)}
                valueClass="text-ink"
                reading={abandonedReading(abandonedLast4Weeks)}
              />
```

- [ ] **Step 9: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/presentation/pages/ManagerDashboardPage.test.tsx`
Expected: PASS, todos os testes do arquivo.

- [ ] **Step 10: Typecheck e suíte completa**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erro.
Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/ports/manager-signals.port.ts apps/web/src/presentation/pages/ManagerDashboardPage.tsx apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx
git add -u apps/web/src
git commit -m "feat(web): show the abandoned-questionnaires KPI on the manager dashboard"
```

---

### Task 13: Frontend — linha nova no export PGR

**Files:**
- Modify: `apps/web/src/presentation/lib/download-manager-pgr-report.ts`
- Modify: `apps/web/src/presentation/lib/download-manager-pgr-report.test.ts`

**Interfaces:**
- Consumes: `ManagerSignalsResponse.abandonedLast4Weeks` (Task 12), `MANAGER_METRICS.abandoned` (Task 6).

- [ ] **Step 1: Escrever os testes (falhando)**

Em `apps/web/src/presentation/lib/download-manager-pgr-report.test.ts`, o fixture `DATA` ganha o campo (segue o padrão dos outros testes deste arquivo — este é o único lugar que precisa de um valor não-zero explícito para exercitar a linha nova):

```ts
const DATA: ManagerSignalsResponse = {
  overallConcerningRate: 0.41,
  checkInsLast4Weeks: 111,
  abandonedLast4Weeks: 9,
  weeklyTrend: [],
  segments: [
    { label: "Plantão noturno", value: 52, n: 18 },
    { label: "Pronto-socorro", value: 38, n: 24 },
    { label: "UTI", value: 44, n: 9 },
  ],
  followUpResponseRate: 0.7,
  sectorCoverage: { visible: 4, total: 7 },
  referenceWeekStart: null,
};
```

E, no `describe("buildPgrCsvLines", ...)` existente, adicionar uma asserção à linha 51 (`it("includes the disclaimer, summary metrics, and one row per segment", ...)`, junto das outras `expect(lines).toContain(...)`):

```ts
    expect(lines).toContain(`${MANAGER_METRICS.abandoned.label} (4 semanas),9`);
```

E, no describe do PDF (`downloadPgrReportAsPdf`), adicionar um teste novo (mesmo padrão dos testes de `textMock` já existentes nesse describe):

```ts
  it("includes the abandoned-questionnaires line", async () => {
    await downloadPgrReportAsPdf(DATA, GENERATED_AT);

    expect(textMock).toHaveBeenCalledWith(`${MANAGER_METRICS.abandoned.label} (4 semanas): 9`, 14, expect.any(Number));
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run (de `apps/web`): `npx vitest run src/presentation/lib/download-manager-pgr-report.test.ts`
Expected: FAIL nos 2 novos asserts/teste — a linha não existe no CSV nem no PDF ainda.

- [ ] **Step 3: Implementar**

Em `apps/web/src/presentation/lib/download-manager-pgr-report.ts`, `buildPgrCsvLines` ganha a linha, logo depois da de `checkIns`:

```ts
export function buildPgrCsvLines(data: ManagerSignalsResponse, generatedAt: Date): string[] {
  return [
    csvQuote("Insumo para o PGR - Zelo"),
    csvQuote(formatDate(generatedAt)),
    csvQuote(DISCLAIMER),
    csvQuote(sectorCoverageReading(data.sectorCoverage)),
    "",
    "Métrica,Valor",
    `${MANAGER_METRICS.concerningRate.label},${Math.round(data.overallConcerningRate * 100)}%`,
    `${MANAGER_METRICS.checkIns.label} (4 semanas),${data.checkInsLast4Weeks}`,
    `${MANAGER_METRICS.abandoned.label} (4 semanas),${data.abandonedLast4Weeks}`,
    `${MANAGER_METRICS.followUpRate.label}${DEMONSTRATION_SUFFIX},${Math.round(data.followUpResponseRate * 100)}%`,
    "",
    "Setor,Sinais (%),n",
    ...data.segments.map((segment) => `${segment.label},${segment.value}%,${segment.n}`),
    "",
    csvQuote(`Metodologia: /manager/methodology — versão ${MANAGER_METHODOLOGY_VERSION}`),
  ];
}
```

E `downloadPgrReportAsPdf` ganha a mesma linha, logo depois da de `checkIns`:

```ts
  doc.text(`${MANAGER_METRICS.checkIns.label} (4 semanas): ${data.checkInsLast4Weeks}`, 14, y);
  y += LINE_HEIGHT;
  doc.text(`${MANAGER_METRICS.abandoned.label} (4 semanas): ${data.abandonedLast4Weeks}`, 14, y);
  y += LINE_HEIGHT;
  const followUpLines = doc.splitTextToSize(
```

(o resto da função — `followUpLines` em diante — não muda.)

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/presentation/lib/download-manager-pgr-report.test.ts`
Expected: PASS, todos os testes do arquivo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/lib/download-manager-pgr-report.ts apps/web/src/presentation/lib/download-manager-pgr-report.test.ts
git commit -m "feat(web): include abandoned questionnaires in the PGR export"
```

---

### Task 14: Verificação full-suite

**Files:** nenhum (só verificação).

- [ ] **Step 1: Rodar a suíte completa da api**

Run (de `apps/api`): `npx vitest run`
Expected: PASS, sem regressão em nenhum teste.

- [ ] **Step 2: Rodar a suíte completa do web**

Run (de `apps/web`): `npx vitest run`
Expected: PASS, sem regressão em nenhum teste.

- [ ] **Step 3: Typecheck dos dois apps e do pacote de domínio**

Run (de `apps/api`): `npx tsc --noEmit -p tsconfig.json`
Run (de `apps/web`): `npx tsc --noEmit -p tsconfig.json`
Run (de `packages/domain`): `npx tsc --noEmit -p tsconfig.json`
Expected: sem output (limpo) nos três.

- [ ] **Step 4: Lint dos arquivos tocados**

Run (de `apps/web`):
```bash
npx eslint src/presentation/pages/ScaleAssessmentPage.tsx src/presentation/pages/ScaleAssessmentPage.test.tsx \
  src/presentation/pages/ManagerDashboardPage.tsx src/presentation/pages/ManagerDashboardPage.test.tsx \
  src/presentation/components/AbandonAssessmentModal.tsx src/presentation/components/AbandonAssessmentModal.test.tsx \
  src/presentation/lib/download-manager-pgr-report.ts src/presentation/lib/download-manager-pgr-report.test.ts \
  src/ports/signal-checkin.port.ts src/ports/manager-signals.port.ts \
  src/infrastructure/http/http-signal-checkin.adapter.ts src/infrastructure/http/http-signal-checkin.adapter.test.ts \
  src/use-cases/record-assessment-abandonment.usecase.ts src/use-cases/record-assessment-abandonment.usecase.test.ts \
  src/app/container/signal-checkin.ts
```
Expected: sem output (limpo).

Run (de `apps/api`):
```bash
npx eslint src/modules/signal-checkin src/modules/manager/application/ports/signal-repository.port.ts \
  src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts \
  src/modules/manager/application/use-cases/get-manager-signals.use-case.ts
```
Expected: sem output (limpo).

Run (de `packages/domain`):
```bash
npx eslint src/manager/metric-glossary.ts
```
Expected: sem output (limpo).

- [ ] **Step 5: Smoke test manual**

Rodar `pnpm dev` na raiz (ou por app, conforme a skill/README de `run` deste projeto). Como médico vinculado a uma instituição/setor com opt-in agregado ativo: iniciar um questionário PHQ-9, responder 1 pergunta, tentar navegar para Home pelo bottom-nav, confirmar que o modal "Sair sem terminar?" aparece; clicar "Continuar respondendo" e confirmar que volta pra pergunta 1; tentar sair de novo e clicar "Sair mesmo assim", confirmar que navega pra Home. Repetir sem responder nenhuma pergunta e confirmar que sair não mostra nada. Como gestor (do mesmo setor, com pelo menos 5 respostas já registradas naquele setor/semana): confirmar que o card "Questionários abandonados" aparece no dashboard com um número, e que o export do PGR (CSV e PDF) traz a mesma linha. Este passo não tem asserção automatizada — é a checagem humana final de que a fiação funciona num navegador real, contra um banco (local ou seed) de verdade.

- [ ] **Step 6: Relatório**

Sem commit para esta task — é só verificação. Se algum passo revelar uma regressão, corrigir como parte da task que a introduziu (um commit pequeno de correção, nunca amend) e rodar de novo os Steps 1–4.
