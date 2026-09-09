# Registrar rascunho de chat não enviado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar, de forma silenciosa e anônima, quando um médico digita algo no chat com a IA e sai sem enviar — reaproveitando toda a infraestrutura de sinal/k-anonimato já construída para o abandono de questionário.

**Architecture:** Generaliza `SignalCheckinRepository` (hoje `recordCheckin` + `recordAbandonment`, quase idênticos) num único método parametrizado `recordIncrement`, então adiciona um terceiro "kind" de sinal (`unsentChatDrafts`) por cima dessa base já compartilhada. No frontend, `ChatComposer` detecta a saída via um `useEffect` de cleanup (desmontagem), sem `useBlocker` e sem modal — puramente silencioso, e nunca persiste o conteúdo do rascunho em lugar nenhum.

**Tech Stack:** NestJS + Prisma (api), React + Zustand + TanStack Query (web), Vitest para ambos.

**Spec:** `docs/superpowers/specs/2026-09-09-unsent-chat-draft-design.md`

## Global Constraints

- **Sem modal, sem `useBlocker`** — o médico sai livremente do chat; o registro é sempre silencioso.
- **Nunca persiste o conteúdo do rascunho** — nem local (sessionStorage), nem no servidor. Só um contador incrementa.
- `unsentChatDrafts` mora na mesma linha semanal do `Signal` que já tem `checkIns`/`concerning`/`abandoned`. Visibilidade continua decidida **só** por `checkIns >= K_ANONYMITY_THRESHOLD` — nunca por `unsentChatDrafts`.
- Registro é sempre fire-and-forget: `.catch(() => {})`, nunca aparece pro médico.
- v1 é só o agregado da instituição no dashboard — sem detalhamento por setor.
- Repositório generalizado num único `recordIncrement` parametrizado — `recordCheckin`/`recordAbandonment` deixam de existir como métodos próprios da interface.
- TDD para toda mudança de comportamento observável.

---

## File Structure

**Backend (`apps/api`):**
- `prisma/migrations/<timestamp>_add_signal_unsent_chat_drafts/migration.sql` — nova coluna.
- `prisma/schema.prisma` — `Signal.unsentChatDrafts`.
- `src/modules/signal-checkin/application/ports/signal-checkin-repository.port.ts` — interface generalizada (`recordIncrement`).
- `src/modules/signal-checkin/infrastructure/persistence/prisma-signal-checkin.repository.ts` — implementação generalizada.
- `src/modules/signal-checkin/application/use-cases/record-signal-checkin.use-case.ts` (+ test) — passa a chamar `recordIncrement`.
- `src/modules/signal-checkin/application/use-cases/record-assessment-abandonment.use-case.ts` (+ test) — passa a chamar `recordIncrement`.
- `src/modules/signal-checkin/application/use-cases/record-unsent-chat-draft.use-case.ts` (novo) + `.test.ts`.
- `src/modules/signal-checkin/infrastructure/signal-checkin.controller.ts` — novo endpoint `POST /signals/chat-draft`.
- `src/modules/signal-checkin/infrastructure/signal-checkin.controller.test.ts` — fake repo generalizado + novos casos.
- `src/modules/signal-checkin/signal-checkin.module.ts` — wiring do novo use case.
- `src/modules/manager/application/ports/signal-repository.port.ts` — `SignalRow.unsentChatDrafts`.
- `src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts` — `findAll` seleciona `unsentChatDrafts`.
- `src/modules/manager/application/use-cases/get-manager-signals.use-case.ts` (+ test) — `unsentChatDraftsLast4Weeks`.
- Backfill mecânico guiado por `tsc` em todo arquivo que constrói um `SignalRow` literal.

**Domain compartilhado (`packages/domain`):**
- `src/manager/metric-glossary.ts` — métrica `unsentChatDrafts`, `unsentChatDraftsReading`, versão da metodologia.

**Frontend (`apps/web`):**
- `src/ports/signal-checkin.port.ts` — `SignalChatDraftParams` + método `chatDraft`.
- `src/infrastructure/http/http-signal-checkin.adapter.ts` — implementação.
- `src/infrastructure/http/http-signal-checkin.adapter.test.ts` — novos casos.
- `src/use-cases/record-unsent-chat-draft.usecase.ts` (novo) + `.test.ts`.
- `src/app/container/signal-checkin.ts` — wiring.
- `src/presentation/pages/ChatPage/ChatComposer.tsx` — ref + cleanup na desmontagem.
- `src/presentation/pages/ChatPage/ChatPage.test.tsx` — novos casos (arquivo existente, `MemoryRouter` clássico — sem migração de harness necessária, já que não usamos `useBlocker`).
- `src/ports/manager-signals.port.ts` — `unsentChatDraftsLast4Weeks` no schema.
- `src/presentation/pages/ManagerDashboardPage.tsx` (+ test) — novo `KpiCard`.
- `src/presentation/lib/download-manager-pgr-report.ts` (+ test) — linha nova no CSV/PDF.
- `src/presentation/pages/ConsentPage.tsx` e `src/presentation/pages/YouPage/AggregateOptInSection.tsx` (+ testes) — texto de consentimento.
- Backfill mecânico guiado por `tsc` em todo arquivo que constrói um `ManagerSignalsResponse` literal.

---

### Task 1: Migration — `Signal.unsentChatDrafts`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_signal_unsent_chat_drafts/migration.sql`

**Interfaces:**
- Produces: coluna `unsentChatDrafts Int @default(0)` na tabela `signals`, consumida por todas as tasks seguintes.

- [ ] **Step 1: Adicionar o campo ao schema**

Em `apps/api/prisma/schema.prisma`, no `model Signal`:

```prisma
model Signal {
  id               String      @id @default(cuid())
  institutionId    String
  institution      Institution @relation(fields: [institutionId], references: [id])
  sectorId         String
  sector           Sector      @relation(fields: [sectorId], references: [id])
  weekStart        DateTime
  checkIns         Int         @default(0)
  concerning       Int         @default(0)
  abandoned        Int         @default(0)
  unsentChatDrafts Int         @default(0)
  createdAt        DateTime    @default(now())

  @@unique([institutionId, sectorId, weekStart])
  @@map("signals")
}
```

- [ ] **Step 2: Gerar e rodar a migration**

Rodar (de `apps/api`): `npx prisma migrate dev --name add_signal_unsent_chat_drafts`

Expected: cria `apps/api/prisma/migrations/<timestamp>_add_signal_unsent_chat_drafts/migration.sql` com:

```sql
-- AlterTable
ALTER TABLE "signals" ADD COLUMN     "unsentChatDrafts" INTEGER NOT NULL DEFAULT 0;
```

Comando termina sem erro; `prisma generate` roda automaticamente como parte do `migrate dev`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add Signal.unsentChatDrafts column"
```

---

### Task 2: Backend — generalizar `SignalCheckinRepository` em `recordIncrement`

**Files:**
- Modify: `apps/api/src/modules/signal-checkin/application/ports/signal-checkin-repository.port.ts`
- Modify: `apps/api/src/modules/signal-checkin/infrastructure/persistence/prisma-signal-checkin.repository.ts`
- Modify: `apps/api/src/modules/signal-checkin/application/use-cases/record-signal-checkin.use-case.ts`
- Modify: `apps/api/src/modules/signal-checkin/application/use-cases/record-signal-checkin.use-case.test.ts`
- Modify: `apps/api/src/modules/signal-checkin/application/use-cases/record-assessment-abandonment.use-case.ts`
- Modify: `apps/api/src/modules/signal-checkin/application/use-cases/record-assessment-abandonment.use-case.test.ts`
- Modify: `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.test.ts`

**Interfaces:**
- Consumes: `Signal.unsentChatDrafts` (Task 1).
- Produces: `SignalCheckinRepository.recordIncrement(params: RecordSignalIncrementParams): Promise<SignalCounters | null>`, `SignalCounters = { checkIns, concerning, abandoned, unsentChatDrafts }`, consumido pela Task 3.

**Sem mudança de comportamento observável** — este task só generaliza a camada de repositório. Todo teste pré-existente continua verificando exatamente o que verificava antes; só a forma do fake repository muda.

- [ ] **Step 1: Generalizar a porta**

Em `apps/api/src/modules/signal-checkin/application/ports/signal-checkin-repository.port.ts`, arquivo inteiro passa a ser:

```ts
export interface RecordSignalIncrementParams {
  institutionId: string;
  sectorId: string;
  weekStart: Date;
  dedupKey: string;
  increments: Partial<{ checkIns: number; concerning: number; abandoned: number; unsentChatDrafts: number }>;
}

export interface SignalCounters {
  checkIns: number;
  concerning: number;
  abandoned: number;
  unsentChatDrafts: number;
}

export interface SignalCheckinRepository {
  /** The row's counters after the increment, or null when deduplicated. */
  recordIncrement(params: RecordSignalIncrementParams): Promise<SignalCounters | null>;
}

export const SIGNAL_CHECKIN_REPOSITORY = Symbol("SIGNAL_CHECKIN_REPOSITORY");

// Thrown by the repository when institutionId or sectorId don't match a real
// Institution/Sector (a foreign-key violation on the Signal insert/update) —
// mapped to a 400 by the controller.
export class UnknownInstitutionOrSectorError extends Error {}
```

- [ ] **Step 2: Generalizar `PrismaSignalCheckinRepository`**

Em `apps/api/src/modules/signal-checkin/infrastructure/persistence/prisma-signal-checkin.repository.ts`, arquivo inteiro passa a ser:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../../../../../generated/prisma/client.ts";
import type {
  RecordSignalIncrementParams,
  SignalCheckinRepository,
  SignalCounters,
} from "@/modules/signal-checkin/application/ports/signal-checkin-repository.port.js";
import { UnknownInstitutionOrSectorError } from "@/modules/signal-checkin/application/ports/signal-checkin-repository.port.js";
import { PrismaService } from "@/shared/prisma/prisma.service.js";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";
const FOREIGN_KEY_VIOLATION = "P2003";

@Injectable()
export class PrismaSignalCheckinRepository implements SignalCheckinRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async recordIncrement(params: RecordSignalIncrementParams): Promise<SignalCounters | null> {
    const { checkIns = 0, concerning = 0, abandoned = 0, unsentChatDrafts = 0 } = params.increments;

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
          update: {
            checkIns: { increment: checkIns },
            concerning: { increment: concerning },
            abandoned: { increment: abandoned },
            unsentChatDrafts: { increment: unsentChatDrafts },
          },
          create: {
            institutionId: params.institutionId,
            sectorId: params.sectorId,
            weekStart: params.weekStart,
            checkIns,
            concerning,
            abandoned,
            unsentChatDrafts,
          },
          select: { checkIns: true, concerning: true, abandoned: true, unsentChatDrafts: true },
        });
        return signal;
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

(`increment: 0` num campo numérico do Prisma é um no-op inofensivo — sempre passar os 4 campos, incrementando só os que vieram em `increments`, é mais simples do que montar o objeto `update`/`create` condicionalmente.)

- [ ] **Step 3: Atualizar `RecordSignalCheckinUseCase`**

Em `apps/api/src/modules/signal-checkin/application/use-cases/record-signal-checkin.use-case.ts`, o corpo de `execute` passa a ser:

```ts
  async execute(input: RecordSignalCheckinInput, now: Date = new Date()): Promise<void> {
    const weekStart = startOfIsoWeek(now);
    const dedupKey = createHash("sha256")
      .update(`${input.deviceSignalId}:${input.institutionId}:${input.sectorId}:${weekStart.toISOString()}`)
      .digest("hex");

    const result = await this.repository.recordIncrement({
      institutionId: input.institutionId,
      sectorId: input.sectorId,
      weekStart,
      dedupKey,
      increments: { checkIns: 1, concerning: input.concerning ? 1 : 0 },
    });

    // Within one week this counter only increases, so exactly one increment can
    // land on the threshold — an equality check is the whole crossing detector,
    // with no stored "already notified" flag to keep in sync.
    if (result?.checkIns === K_ANONYMITY_THRESHOLD) {
      await this.notifications.publish({
        institutionId: input.institutionId,
        type: "SECTOR_BECAME_VISIBLE",
        sectorId: input.sectorId,
        payload: { weekStart: weekStart.toISOString(), checkIns: result.checkIns },
        dedupKey: `sector-visible:${input.sectorId}:${weekStart.toISOString()}`,
      });
    }
  }
```

(O resto do arquivo — imports, `RecordSignalCheckinInput`, a classe/construtor — não muda.)

- [ ] **Step 4: Atualizar o teste de `RecordSignalCheckinUseCase`**

Em `apps/api/src/modules/signal-checkin/application/use-cases/record-signal-checkin.use-case.test.ts`, arquivo inteiro passa a ser:

```ts
import { describe, expect, it } from "vitest";
import { RecordSignalCheckinUseCase } from "./record-signal-checkin.use-case.ts";
import type {
  RecordSignalIncrementParams,
  SignalCheckinRepository,
  SignalCounters,
} from "../ports/signal-checkin-repository.port.ts";
import type { NotificationEvent, NotificationPublisher } from "@/modules/notification/application/ports/notification.port.js";
import { K_ANONYMITY_THRESHOLD } from "@/modules/manager/application/constants.js";

const ZERO_COUNTERS: SignalCounters = { checkIns: 0, concerning: 0, abandoned: 0, unsentChatDrafts: 0 };

class FakeSignalCheckinRepository implements SignalCheckinRepository {
  public calls: RecordSignalIncrementParams[] = [];
  public nextResult: SignalCounters | null = { ...ZERO_COUNTERS, checkIns: 1 };
  async recordIncrement(params: RecordSignalIncrementParams): Promise<SignalCounters | null> {
    this.calls.push(params);
    return this.nextResult;
  }
}

class FakeNotificationPublisher implements NotificationPublisher {
  events: NotificationEvent[] = [];
  async publish(event: NotificationEvent): Promise<void> {
    this.events.push(event);
  }
}

describe("RecordSignalCheckinUseCase", () => {
  it("computes weekStart and a dedupKey hashing in sectorId, and forwards a checkIns+concerning increment to the repository", async () => {
    const repository = new FakeSignalCheckinRepository();
    const notifications = new FakeNotificationPublisher();
    const useCase = new RecordSignalCheckinUseCase(repository, notifications);
    const now = new Date("2026-06-17T10:00:00.000Z"); // a Wednesday

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", concerning: true, deviceSignalId: "device-1" },
      now,
    );

    expect(repository.calls[0]).toEqual({
      institutionId: "institution-1",
      sectorId: "sector-1",
      weekStart: new Date("2026-06-15T00:00:00.000Z"), // Monday of that week
      dedupKey: expect.any(String),
      increments: { checkIns: 1, concerning: 1 },
    });
  });

  it("produces a different dedupKey for a different sectorId, same device/institution/week", async () => {
    const repository = new FakeSignalCheckinRepository();
    const notifications = new FakeNotificationPublisher();
    const useCase = new RecordSignalCheckinUseCase(repository, notifications);
    const now = new Date("2026-06-17T10:00:00.000Z");

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-1", concerning: false, deviceSignalId: "device-1" }, now);
    const first = repository.calls[0].dedupKey;

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-2", concerning: false, deviceSignalId: "device-1" }, now);
    const second = repository.calls[1].dedupKey;

    expect(first).not.toBe(second);
  });

  it("announces the sector becoming visible on the increment that reaches the threshold", async () => {
    const repository = new FakeSignalCheckinRepository();
    repository.nextResult = { ...ZERO_COUNTERS, checkIns: K_ANONYMITY_THRESHOLD };
    const notifications = new FakeNotificationPublisher();
    const useCase = new RecordSignalCheckinUseCase(repository, notifications);

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", concerning: false, deviceSignalId: "device-1" },
      new Date("2026-07-08T15:00:00.000Z"),
    );

    expect(notifications.events).toEqual([
      {
        institutionId: "institution-1",
        type: "SECTOR_BECAME_VISIBLE",
        sectorId: "sector-1",
        payload: { weekStart: "2026-07-06T00:00:00.000Z", checkIns: K_ANONYMITY_THRESHOLD },
        dedupKey: "sector-visible:sector-1:2026-07-06T00:00:00.000Z",
      },
    ]);
  });

  // checkIns only ever increases within a week, so exactly one increment can
  // equal the threshold — this is what makes the event fire once with no state.
  it.each([1, 2, 3, 4, 6, 7, 12])("stays quiet at %i check-ins", async (checkIns) => {
    const repository = new FakeSignalCheckinRepository();
    repository.nextResult = { ...ZERO_COUNTERS, checkIns };
    const notifications = new FakeNotificationPublisher();
    const useCase = new RecordSignalCheckinUseCase(repository, notifications);

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", concerning: false, deviceSignalId: "device-1" },
      new Date("2026-07-08T15:00:00.000Z"),
    );

    expect(notifications.events).toEqual([]);
  });

  it("fires exactly once across a whole week of check-ins", async () => {
    const repository = new FakeSignalCheckinRepository();
    const notifications = new FakeNotificationPublisher();
    const useCase = new RecordSignalCheckinUseCase(repository, notifications);

    for (let checkIns = 1; checkIns <= 12; checkIns += 1) {
      repository.nextResult = { ...ZERO_COUNTERS, checkIns };
      await useCase.execute(
        { institutionId: "institution-1", sectorId: "sector-1", concerning: false, deviceSignalId: `device-${checkIns}` },
        new Date("2026-07-08T15:00:00.000Z"),
      );
    }

    expect(notifications.events).toHaveLength(1);
  });

  it("stays quiet when the check-in was deduplicated", async () => {
    const repository = new FakeSignalCheckinRepository();
    repository.nextResult = null;
    const notifications = new FakeNotificationPublisher();
    const useCase = new RecordSignalCheckinUseCase(repository, notifications);

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", concerning: false, deviceSignalId: "device-1" },
      new Date("2026-07-08T15:00:00.000Z"),
    );

    expect(notifications.events).toEqual([]);
  });
});
```

- [ ] **Step 5: Atualizar `RecordAssessmentAbandonmentUseCase`**

Em `apps/api/src/modules/signal-checkin/application/use-cases/record-assessment-abandonment.use-case.ts`, arquivo inteiro passa a ser:

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
    const dedupKey = createHash("sha256")
      .update(`abandon:${input.deviceSignalId}:${input.institutionId}:${input.sectorId}:${weekStart.toISOString()}`)
      .digest("hex");

    await this.repository.recordIncrement({
      institutionId: input.institutionId,
      sectorId: input.sectorId,
      weekStart,
      dedupKey,
      increments: { abandoned: 1 },
    });
  }
}
```

- [ ] **Step 6: Atualizar o teste de `RecordAssessmentAbandonmentUseCase`**

Em `apps/api/src/modules/signal-checkin/application/use-cases/record-assessment-abandonment.use-case.test.ts`, arquivo inteiro passa a ser:

```ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RecordAssessmentAbandonmentUseCase } from "./record-assessment-abandonment.use-case.ts";
import type {
  RecordSignalIncrementParams,
  SignalCheckinRepository,
  SignalCounters,
} from "../ports/signal-checkin-repository.port.ts";

const ZERO_COUNTERS: SignalCounters = { checkIns: 0, concerning: 0, abandoned: 0, unsentChatDrafts: 0 };

class FakeSignalCheckinRepository implements SignalCheckinRepository {
  public calls: RecordSignalIncrementParams[] = [];
  async recordIncrement(params: RecordSignalIncrementParams): Promise<SignalCounters | null> {
    this.calls.push(params);
    return { ...ZERO_COUNTERS, abandoned: 1 };
  }
}

describe("RecordAssessmentAbandonmentUseCase", () => {
  it("computes weekStart and an 'abandon:'-prefixed dedupKey, and forwards an abandoned increment to the repository", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordAssessmentAbandonmentUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z"); // a Wednesday

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", deviceSignalId: "device-1" },
      now,
    );

    expect(repository.calls[0]).toEqual({
      institutionId: "institution-1",
      sectorId: "sector-1",
      weekStart: new Date("2026-06-15T00:00:00.000Z"), // Monday of that week
      dedupKey: expect.any(String),
      increments: { abandoned: 1 },
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

    expect(repository.calls[0]!.dedupKey).not.toBe(checkinStyleDedupKey);
  });

  it("produces a different dedupKey for a different sectorId, same device/institution/week", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordAssessmentAbandonmentUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z");

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-1", deviceSignalId: "device-1" }, now);
    const first = repository.calls[0]!.dedupKey;

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-2", deviceSignalId: "device-1" }, now);
    const second = repository.calls[1]!.dedupKey;

    expect(first).not.toBe(second);
  });
});
```

- [ ] **Step 7: Atualizar o fake repository do teste do controller**

Em `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.test.ts`, arquivo inteiro passa a ser (só a classe `FakeSignalCheckinRepository` e os imports do topo mudam — os `it(...)` de `/signals/checkin` e `/signals/abandon` continuam iguais, só trocando `checkinCalls`/`abandonCalls` por `calls` filtrado por `increments`):

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
  RecordSignalIncrementParams,
  SignalCheckinRepository,
  SignalCounters,
} from "../application/ports/signal-checkin-repository.port.ts";
import { NOTIFICATION_PUBLISHER, type NotificationEvent, type NotificationPublisher } from "@/modules/notification/application/ports/notification.port.js";

const ZERO_COUNTERS: SignalCounters = { checkIns: 0, concerning: 0, abandoned: 0, unsentChatDrafts: 0 };

class FakeSignalCheckinRepository implements SignalCheckinRepository {
  public calls: RecordSignalIncrementParams[] = [];
  public shouldThrowUnknownInstitution = false;
  async recordIncrement(params: RecordSignalIncrementParams): Promise<SignalCounters | null> {
    if (this.shouldThrowUnknownInstitution) {
      throw new UnknownInstitutionOrSectorError();
    }
    this.calls.push(params);
    return ZERO_COUNTERS;
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
    expect(repository.calls).toHaveLength(1);
    expect(repository.calls[0]).toMatchObject({
      institutionId: "inst-1",
      sectorId: "UTI",
      increments: { checkIns: 1, concerning: 1 },
    });
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
    expect(repository.calls).toContainEqual(
      expect.objectContaining({ institutionId: "inst-1", sectorId: "UTI", increments: { abandoned: 1 } }),
    );
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

(Task 3 volta a este arquivo pra acrescentar o provider e os casos de `/signals/chat-draft` — não remova nada aqui, só adiciona depois.)

- [ ] **Step 8: Rodar a suíte do módulo inteira**

Run (de `apps/api`): `npx vitest run src/modules/signal-checkin src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`
Expected: PASS — comportamento idêntico ao de antes da generalização, só a forma interna dos testes mudou.

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erro relacionado a estes arquivos (outros erros pré-existentes de tasks futuras ainda não feitas são esperados até elas rodarem).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/signal-checkin
git commit -m "refactor(api): generalize SignalCheckinRepository into recordIncrement"
```

---

### Task 3: Backend — `RecordUnsentChatDraftUseCase` + `POST /signals/chat-draft`

**Files:**
- Create: `apps/api/src/modules/signal-checkin/application/use-cases/record-unsent-chat-draft.use-case.ts`
- Create: `apps/api/src/modules/signal-checkin/application/use-cases/record-unsent-chat-draft.use-case.test.ts`
- Modify: `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.ts`
- Modify: `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.test.ts`
- Modify: `apps/api/src/modules/signal-checkin/signal-checkin.module.ts`

**Interfaces:**
- Consumes: `SignalCheckinRepository.recordIncrement` (Task 2).
- Produces: `RecordUnsentChatDraftUseCase.execute(input, now?): Promise<void>`, endpoint `POST /signals/chat-draft` (204, sem auth), consumidos pela Task 8 (frontend).

- [ ] **Step 1: Escrever o teste do use case (falhando)**

Create `apps/api/src/modules/signal-checkin/application/use-cases/record-unsent-chat-draft.use-case.test.ts`:

```ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RecordUnsentChatDraftUseCase } from "./record-unsent-chat-draft.use-case.ts";
import type {
  RecordSignalIncrementParams,
  SignalCheckinRepository,
  SignalCounters,
} from "../ports/signal-checkin-repository.port.ts";

const ZERO_COUNTERS: SignalCounters = { checkIns: 0, concerning: 0, abandoned: 0, unsentChatDrafts: 0 };

class FakeSignalCheckinRepository implements SignalCheckinRepository {
  public calls: RecordSignalIncrementParams[] = [];
  async recordIncrement(params: RecordSignalIncrementParams): Promise<SignalCounters | null> {
    this.calls.push(params);
    return { ...ZERO_COUNTERS, unsentChatDrafts: 1 };
  }
}

describe("RecordUnsentChatDraftUseCase", () => {
  it("computes weekStart and a 'chat-draft:'-prefixed dedupKey, and forwards an unsentChatDrafts increment to the repository", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordUnsentChatDraftUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z"); // a Wednesday

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", deviceSignalId: "device-1" },
      now,
    );

    expect(repository.calls[0]).toEqual({
      institutionId: "institution-1",
      sectorId: "sector-1",
      weekStart: new Date("2026-06-15T00:00:00.000Z"), // Monday of that week
      dedupKey: expect.any(String),
      increments: { unsentChatDrafts: 1 },
    });
  });

  it("produces a dedupKey different from a check-in's or an abandonment's, for the same device/institution/sector/week", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordUnsentChatDraftUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z");

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-1", deviceSignalId: "device-1" }, now);

    const checkinStyleDedupKey = createHash("sha256")
      .update("device-1:institution-1:sector-1:2026-06-15T00:00:00.000Z")
      .digest("hex");
    const abandonStyleDedupKey = createHash("sha256")
      .update("abandon:device-1:institution-1:sector-1:2026-06-15T00:00:00.000Z")
      .digest("hex");

    expect(repository.calls[0]!.dedupKey).not.toBe(checkinStyleDedupKey);
    expect(repository.calls[0]!.dedupKey).not.toBe(abandonStyleDedupKey);
  });

  it("produces a different dedupKey for a different sectorId, same device/institution/week", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordUnsentChatDraftUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z");

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-1", deviceSignalId: "device-1" }, now);
    const first = repository.calls[0]!.dedupKey;

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-2", deviceSignalId: "device-1" }, now);
    const second = repository.calls[1]!.dedupKey;

    expect(first).not.toBe(second);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run (de `apps/api`): `npx vitest run src/modules/signal-checkin/application/use-cases/record-unsent-chat-draft.use-case.test.ts`
Expected: FAIL — `record-unsent-chat-draft.use-case.ts` não existe.

- [ ] **Step 3: Implementação mínima**

Create `apps/api/src/modules/signal-checkin/application/use-cases/record-unsent-chat-draft.use-case.ts`:

```ts
import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { startOfIsoWeek } from "@/shared/date/start-of-iso-week.js";
import {
  SIGNAL_CHECKIN_REPOSITORY,
  type SignalCheckinRepository,
} from "../ports/signal-checkin-repository.port.ts";

export interface RecordUnsentChatDraftInput {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
}

@Injectable()
export class RecordUnsentChatDraftUseCase {
  constructor(@Inject(SIGNAL_CHECKIN_REPOSITORY) private readonly repository: SignalCheckinRepository) {}

  async execute(input: RecordUnsentChatDraftInput, now: Date = new Date()): Promise<void> {
    const weekStart = startOfIsoWeek(now);
    const dedupKey = createHash("sha256")
      .update(`chat-draft:${input.deviceSignalId}:${input.institutionId}:${input.sectorId}:${weekStart.toISOString()}`)
      .digest("hex");

    await this.repository.recordIncrement({
      institutionId: input.institutionId,
      sectorId: input.sectorId,
      weekStart,
      dedupKey,
      increments: { unsentChatDrafts: 1 },
    });
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/modules/signal-checkin/application/use-cases/record-unsent-chat-draft.use-case.test.ts`
Expected: PASS, 3 testes.

- [ ] **Step 5: Escrever os testes do endpoint (falhando)**

Modify `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.test.ts` — adicionar o import do novo use case, adicionar `RecordUnsentChatDraftUseCase` aos `providers` do `Test.createTestingModule` (junto dos outros dois), e adicionar estes 4 testes ao fim do `describe`, antes do `});` final:

```ts
  it("POST /signals/chat-draft returns 204 for a valid body and forwards it to the repository", async () => {
    const response = await request(app.getHttpServer()).post("/signals/chat-draft").send({
      institutionId: "inst-1",
      sectorId: "UTI",
      deviceSignalId: "device-6",
    });

    expect(response.status).toBe(204);
    expect(repository.calls).toContainEqual(
      expect.objectContaining({ institutionId: "inst-1", sectorId: "UTI", increments: { unsentChatDrafts: 1 } }),
    );
  });

  it("POST /signals/chat-draft returns 400 for a malformed body", async () => {
    const response = await request(app.getHttpServer()).post("/signals/chat-draft").send({ institutionId: "inst-1" });

    expect(response.status).toBe(400);
  });

  it("POST /signals/chat-draft returns 400 when the institution is unknown", async () => {
    repository.shouldThrowUnknownInstitution = true;
    const response = await request(app.getHttpServer()).post("/signals/chat-draft").send({
      institutionId: "does-not-exist",
      sectorId: "UTI",
      deviceSignalId: "device-7",
    });

    expect(response.status).toBe(400);
    repository.shouldThrowUnknownInstitution = false;
  });

  it("POST /signals/chat-draft requires no authentication", async () => {
    const response = await request(app.getHttpServer()).post("/signals/chat-draft").send({
      institutionId: "inst-1",
      sectorId: "UTI",
      deviceSignalId: "device-8",
    });

    expect(response.status).not.toBe(401);
  });
```

O import do topo do arquivo ganha:

```ts
import { RecordUnsentChatDraftUseCase } from "../application/use-cases/record-unsent-chat-draft.use-case.ts";
```

E os `providers` do `Test.createTestingModule` (no `beforeAll`) ganham `RecordUnsentChatDraftUseCase` na lista, ao lado de `RecordSignalCheckinUseCase`/`RecordAssessmentAbandonmentUseCase`.

- [ ] **Step 6: Rodar os testes e confirmar que os novos falham**

Run: `npx vitest run src/modules/signal-checkin/infrastructure/signal-checkin.controller.test.ts`
Expected: os 8 testes de `/signals/checkin` e `/signals/abandon` continuam passando; os 4 novos de `/signals/chat-draft` falham (endpoint não existe — 404, ou o teste do NestJS falha por provider faltando).

- [ ] **Step 7: Implementar o endpoint**

Modify `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.ts` — arquivo inteiro passa a ser:

```ts
import { BadRequestException, Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import { RecordSignalCheckinUseCase } from "../application/use-cases/record-signal-checkin.use-case.ts";
import { RecordAssessmentAbandonmentUseCase } from "../application/use-cases/record-assessment-abandonment.use-case.ts";
import { RecordUnsentChatDraftUseCase } from "../application/use-cases/record-unsent-chat-draft.use-case.ts";
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

const SignalChatDraftSchema = z.object({
  institutionId: z.string().min(1),
  sectorId: z.string().min(1),
  deviceSignalId: z.string().min(1),
});

@Controller("signals")
export class SignalCheckinController {
  constructor(
    @Inject(RecordSignalCheckinUseCase) private readonly recordSignalCheckin: RecordSignalCheckinUseCase,
    @Inject(RecordAssessmentAbandonmentUseCase) private readonly recordAbandonment: RecordAssessmentAbandonmentUseCase,
    @Inject(RecordUnsentChatDraftUseCase) private readonly recordUnsentChatDraft: RecordUnsentChatDraftUseCase,
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

  @Post("chat-draft")
  @HttpCode(204)
  async chatDraft(@Body() body: unknown): Promise<void> {
    const parsed = SignalChatDraftSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      await this.recordUnsentChatDraft.execute(parsed.data);
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
import { RecordUnsentChatDraftUseCase } from "./application/use-cases/record-unsent-chat-draft.use-case.ts";
import { PrismaSignalCheckinRepository } from "./infrastructure/persistence/prisma-signal-checkin.repository.ts";
import { SIGNAL_CHECKIN_REPOSITORY } from "./application/ports/signal-checkin-repository.port.ts";
import { NotificationModule } from "../notification/notification.module.ts";

@Module({
  imports: [NotificationModule],
  controllers: [SignalCheckinController],
  providers: [
    RecordSignalCheckinUseCase,
    RecordAssessmentAbandonmentUseCase,
    RecordUnsentChatDraftUseCase,
    { provide: SIGNAL_CHECKIN_REPOSITORY, useClass: PrismaSignalCheckinRepository },
  ],
})
export class SignalCheckinModule {}
```

- [ ] **Step 9: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/modules/signal-checkin`
Expected: PASS, todos os testes do módulo.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/signal-checkin
git commit -m "feat(api): add RecordUnsentChatDraftUseCase and POST /signals/chat-draft"
```

---

### Task 4: Backend — `SignalRow.unsentChatDrafts` + `PrismaSignalRepository.findAll`

**Files:**
- Modify: `apps/api/src/modules/manager/application/ports/signal-repository.port.ts`
- Modify: `apps/api/src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts`
- Modify (backfill mecânico, guiado por `tsc`): todo arquivo que constrói um `SignalRow` literal.

**Interfaces:**
- Consumes: `Signal.unsentChatDrafts` (Task 1).
- Produces: `SignalRow.unsentChatDrafts: number`, consumido pela Task 5.

**Aviso conhecido, de uma feature anterior:** `apps/api/tsconfig.json` exclui `src/**/*.test.ts` do typecheck (`exclude: ["src/**/*.test.ts", "dist"]`). Isso significa que `npx tsc --noEmit -p tsconfig.json` **não encontra** os sites de teste que precisam do backfill — só os arquivos de produção. Pra achar todo `SignalRow` literal em arquivo de teste, use um destes dois caminhos: (a) grep por `checkIns:` e `concerning:` co-ocorrendo no mesmo objeto literal em `apps/api/src` (é a assinatura de um `SignalRow`/`WeeklySignalRow`), e filtre manualmente os que são `SignalRow` de verdade (não `WeeklySignalRow`, que não ganha este campo); ou (b) crie um `tsconfig` temporário sem esse `exclude` só pra rodar a busca, sem commitar esse arquivo temporário. Os arquivos de teste que provavelmente precisam do backfill (confirme com sua própria busca, não confie só nesta lista): `get-manager-signals.use-case.test.ts`, `manager.controller.test.ts`, `generate-manager-insight.use-case.test.ts`. `manager-admin.controller.test.ts` usa `SignalRow` só como tipo (stub que lança erro), não como literal — não precisa de mudança.

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
  unsentChatDrafts: number;
}
```

(`WeeklySignalRow` não muda — a varredura de risco semanal não usa `unsentChatDrafts`, mesma razão que já vale pra `abandoned`.)

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
        unsentChatDrafts: true,
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
      unsentChatDrafts: row.unsentChatDrafts,
    }));
  }
```

(`findAllForWeek` e `countBySector` não mudam.)

- [ ] **Step 3: Achar todo site quebrado (produção via tsc, testes via grep — ver o aviso acima)**

Run (de `apps/api`): `npx tsc --noEmit -p tsconfig.json` — anota os erros em arquivos de produção.
Depois, grep manual em `apps/api/src` pelos testes que constroem `SignalRow` literais (ver aviso acima) — confirme cada um antes de editar.

- [ ] **Step 4: Adicionar `unsentChatDrafts: 0` em cada site quebrado**

Pra cada site achado no Step 3: adicionar `unsentChatDrafts: 0` — nenhum desses testes é sobre rascunho de chat. Não alterar nenhuma outra asserção.

- [ ] **Step 5: Rodar o typecheck de novo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erro.

- [ ] **Step 6: Rodar a suíte inteira da api**

Run (de `apps/api`): `npx vitest run`
Expected: PASS — nenhuma asserção pré-existente lia `unsentChatDrafts`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/manager/application/ports/signal-repository.port.ts apps/api/src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts
git add -u apps/api/src
git commit -m "feat(api): thread Signal.unsentChatDrafts through SignalRepository"
```

---

### Task 5: Backend — `GetManagerSignalsUseCase.unsentChatDraftsLast4Weeks`

**Files:**
- Modify: `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts`
- Modify: `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`

**Interfaces:**
- Consumes: `SignalRow.unsentChatDrafts` (Task 4).
- Produces: `ManagerSignalsResponse.unsentChatDraftsLast4Weeks: number`, consumido pelas Tasks 10 (dashboard) e 11 (PGR).

- [ ] **Step 1: Escrever os testes (falhando)**

Em `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`, adicionar (reaproveitar `FakeSignalRepository`/`WEEK_1`/`WEEK_2`/`makeUseCase` já existentes no arquivo; só os literais `SignalRow` precisam ter `unsentChatDrafts` também, já feito na Task 4):

```ts
  it("sums unsentChatDrafts only across the visible sectors' last 4 weeks with real check-ins, mirroring abandonedLast4Weeks", async () => {
    const rows: SignalRow[] = [
      { sectorId: "visible", sectorName: "UTI", weekStart: WEEK_1, checkIns: 6, concerning: 1, abandoned: 0, unsentChatDrafts: 2 },
      { sectorId: "visible", sectorName: "UTI", weekStart: WEEK_2, checkIns: 6, concerning: 2, abandoned: 0, unsentChatDrafts: 3 },
      { sectorId: "hidden", sectorName: "Pronto-Socorro", weekStart: WEEK_1, checkIns: 2, concerning: 0, abandoned: 0, unsentChatDrafts: 9 },
      { sectorId: "hidden", sectorName: "Pronto-Socorro", weekStart: WEEK_2, checkIns: 2, concerning: 0, abandoned: 0, unsentChatDrafts: 9 },
    ];
    const useCase = makeUseCase(rows);

    const result = await useCase.execute("institution-1", ["visible", "hidden"]);

    expect(result.unsentChatDraftsLast4Weeks).toBe(5); // 2 + 3, from "visible" only
  });

  it("returns unsentChatDraftsLast4Weeks: 0 when no sector clears the k-anonymity threshold", async () => {
    const rows: SignalRow[] = [
      { sectorId: "hidden", sectorName: "Pronto-Socorro", weekStart: WEEK_1, checkIns: 1, concerning: 0, abandoned: 0, unsentChatDrafts: 4 },
    ];
    const useCase = makeUseCase(rows);

    const result = await useCase.execute("institution-1", ["hidden"]);

    expect(result.unsentChatDraftsLast4Weeks).toBe(0);
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run (de `apps/api`): `npx vitest run src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`
Expected: FAIL nos 2 novos testes.

- [ ] **Step 3: Implementar**

Em `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts`:

`ManagerSignalsResponse` ganha o campo:

```ts
export interface ManagerSignalsResponse {
  overallConcerningRate: number;
  checkInsLast4Weeks: number;
  abandonedLast4Weeks: number;
  unsentChatDraftsLast4Weeks: number;
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
  unsentChatDraftsLast4Weeks: 0,
  weeklyTrend: [],
  segments: [],
  sectorCoverage: { visible: 0, total: 0 },
  referenceWeekStart: null,
};
```

E, logo depois de onde `abandonedLast4Weeks` é calculado (mesmo `visibleRows`/`recentWeekTimes`):

```ts
    const unsentChatDraftsLast4Weeks = visibleRows
      .filter((r) => recentWeekTimes.has(r.weekStart.getTime()))
      .reduce((sum, r) => sum + r.unsentChatDrafts, 0);
```

E no `return` final:

```ts
    return {
      overallConcerningRate,
      checkInsLast4Weeks,
      abandonedLast4Weeks,
      unsentChatDraftsLast4Weeks,
      weeklyTrend,
      segments,
      followUpResponseRate,
      sectorCoverage: { visible: visibleSectorIds.size, total: sectorIds.length },
      referenceWeekStart: new Date(mostRecentWeek).toISOString(),
    };
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`
Expected: PASS, todos os testes.

- [ ] **Step 5: Typecheck e suíte completa**

Run: `npx tsc --noEmit -p tsconfig.json`
Run: `npx vitest run`
Expected: sem erro, PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts
git commit -m "feat(api): compute unsentChatDraftsLast4Weeks in GetManagerSignalsUseCase"
```

---

### Task 6: Domain compartilhado — métrica `unsentChatDrafts` no glossário

**Files:**
- Modify: `packages/domain/src/manager/metric-glossary.ts`

**Interfaces:**
- Produces: `MANAGER_METRICS.unsentChatDrafts: MetricDefinition`, `unsentChatDraftsReading(total: number): string`, consumidos pelas Tasks 10 e 11.

- [ ] **Step 1: Adicionar o id, a métrica e a função de leitura**

Em `packages/domain/src/manager/metric-glossary.ts`:

`ManagerMetricId` passa a ser:

```ts
export type ManagerMetricId =
  | "concerningRate"
  | "checkIns"
  | "abandoned"
  | "unsentChatDrafts"
  | "followUpRate"
  | "sectorCoverage";
```

`MANAGER_METHODOLOGY_VERSION` sobe:

```ts
export const MANAGER_METHODOLOGY_VERSION = "1.2 — 9 de setembro de 2026";
```

`MANAGER_METRICS` ganha a entrada `unsentChatDrafts`, logo depois de `abandoned`:

```ts
  unsentChatDrafts: {
    id: "unsentChatDrafts",
    label: "Conversas iniciadas e não enviadas",
    method:
      "Quantas vezes alguém escreveu algo no campo de mensagem do chat com a IA e saiu da tela sem enviar. Não guarda o que foi escrito — só a contagem de que aconteceu. Uma pessoa que abandona uma mensagem e depois envia outra numa nova visita conta nos dois eventos, sem tentativa de reconciliar.",
    window: "As 4 semanas mais recentes que têm dados — mesma janela de \"Respostas\".",
    suppression:
      "Conta apenas os setores que já têm 5 respostas ou mais na semana de referência — o mesmo critério de \"Respostas\", nunca um critério próprio. Um setor não fica visível por rascunho não enviado sozinho.",
  },
```

E, ao fim do arquivo, ao lado de `abandonedReading`:

```ts
function conversasNaoEnviadas(count: number): string {
  return count === 1 ? "1 conversa iniciada e não enviada" : `${count} conversas iniciadas e não enviadas`;
}

export function unsentChatDraftsReading(total: number): string {
  return `${conversasNaoEnviadas(total)}, nas últimas 4 semanas`;
}
```

- [ ] **Step 2: Typecheck e rebuild**

Run (de `packages/domain`): `npx tsc --noEmit -p tsconfig.json`
Run (de `packages/domain`): `npx tsc -p tsconfig.json` (rebuild do `dist/`, consumido por `apps/web`/`apps/api` — não commitar `dist/`, é gitignored)
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
git add packages/domain/src/manager/metric-glossary.ts
git commit -m "feat(domain): add the 'unsentChatDrafts' metric to the manager glossary"
```

---

### Task 7: Frontend — camada de porta/adapter para `chatDraft`

**Files:**
- Modify: `apps/web/src/ports/signal-checkin.port.ts`
- Modify: `apps/web/src/infrastructure/http/http-signal-checkin.adapter.ts`
- Modify: `apps/web/src/infrastructure/http/http-signal-checkin.adapter.test.ts`

**Interfaces:**
- Produces: `SignalCheckinPort.chatDraft(params: SignalChatDraftParams): Promise<void>`, consumido pela Task 8.

- [ ] **Step 1: Escrever o teste do adapter (falhando)**

Adicionar a `apps/web/src/infrastructure/http/http-signal-checkin.adapter.test.ts` (arquivo já existe, com `describe("HttpSignalCheckinAdapter abandon", ...)` — adicionar um novo `describe` depois dele):

```ts
describe("HttpSignalCheckinAdapter chatDraft", () => {
  it("posts to /signals/chat-draft with the given params", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    const adapter = new HttpSignalCheckinAdapter();
    await adapter.chatDraft({ institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/signals/chat-draft");
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
      adapter.chatDraft({ institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run (de `apps/web`): `npx vitest run src/infrastructure/http/http-signal-checkin.adapter.test.ts`
Expected: FAIL — `adapter.chatDraft` não existe.

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

export interface SignalChatDraftParams {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
}

export interface SignalCheckinPort {
  checkin(params: SignalCheckinParams): Promise<void>;
  abandon(params: SignalAbandonmentParams): Promise<void>;
  chatDraft(params: SignalChatDraftParams): Promise<void>;
}
```

- [ ] **Step 4: Implementar no adapter**

Em `apps/web/src/infrastructure/http/http-signal-checkin.adapter.ts`, arquivo inteiro passa a ser:

```ts
import type {
  SignalAbandonmentParams,
  SignalChatDraftParams,
  SignalCheckinParams,
  SignalCheckinPort,
} from "@/ports/signal-checkin.port";
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

  async chatDraft(params: SignalChatDraftParams): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/signals/chat-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`signal chat draft failed with status ${response.status}`);
    }
  }
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/infrastructure/http/http-signal-checkin.adapter.test.ts`
Expected: PASS, todos os testes (2 antigos de `abandon` + 2 novos de `chatDraft`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ports/signal-checkin.port.ts apps/web/src/infrastructure/http/http-signal-checkin.adapter.ts apps/web/src/infrastructure/http/http-signal-checkin.adapter.test.ts
git commit -m "feat(web): add SignalCheckinPort.chatDraft"
```

---

### Task 8: Frontend — `RecordUnsentChatDraftUseCase` + wiring

**Files:**
- Create: `apps/web/src/use-cases/record-unsent-chat-draft.usecase.ts`
- Create: `apps/web/src/use-cases/record-unsent-chat-draft.usecase.test.ts`
- Modify: `apps/web/src/app/container/signal-checkin.ts`

**Interfaces:**
- Consumes: `SignalCheckinPort.chatDraft` (Task 7).
- Produces: `recordUnsentChatDraftUseCase` (instância exportada do container), `RecordUnsentChatDraftUseCase.execute({ link }): Promise<void>`, consumido pela Task 9.

- [ ] **Step 1: Escrever o teste (falhando)**

Create `apps/web/src/use-cases/record-unsent-chat-draft.usecase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RecordUnsentChatDraftUseCase } from "./record-unsent-chat-draft.usecase";
import type { SignalChatDraftParams, SignalCheckinPort } from "@/ports/signal-checkin.port";

class FakeSignalCheckinPort implements SignalCheckinPort {
  public chatDraftCalls: SignalChatDraftParams[] = [];
  async checkin(): Promise<void> {
    throw new Error("not used in this test");
  }
  async abandon(): Promise<void> {
    throw new Error("not used in this test");
  }
  async chatDraft(params: SignalChatDraftParams): Promise<void> {
    this.chatDraftCalls.push(params);
  }
}

describe("RecordUnsentChatDraftUseCase", () => {
  it("does nothing when there is no institution link", async () => {
    const port = new FakeSignalCheckinPort();
    const useCase = new RecordUnsentChatDraftUseCase(port);

    await useCase.execute({ link: null });

    expect(port.chatDraftCalls).toHaveLength(0);
  });

  it("calls the port with the link's fields, when a link exists", async () => {
    const port = new FakeSignalCheckinPort();
    const useCase = new RecordUnsentChatDraftUseCase(port);

    await useCase.execute({
      link: { institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" },
    });

    expect(port.chatDraftCalls).toEqual([{ institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" }]);
  });

  it("propagates a port failure (the caller decides whether to swallow it)", async () => {
    class ThrowingPort implements SignalCheckinPort {
      async checkin(): Promise<void> {
        throw new Error("not used in this test");
      }
      async abandon(): Promise<void> {
        throw new Error("not used in this test");
      }
      async chatDraft(): Promise<void> {
        throw new Error("network down");
      }
    }
    const useCase = new RecordUnsentChatDraftUseCase(new ThrowingPort());

    await expect(
      useCase.execute({ link: { institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" } }),
    ).rejects.toThrow("network down");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run (de `apps/web`): `npx vitest run src/use-cases/record-unsent-chat-draft.usecase.test.ts`
Expected: FAIL — arquivo de implementação não existe.

- [ ] **Step 3: Implementação mínima**

Create `apps/web/src/use-cases/record-unsent-chat-draft.usecase.ts`:

```ts
import type { SignalCheckinPort } from "@/ports/signal-checkin.port";

export interface InstitutionLinkSnapshot {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
}

export interface RecordUnsentChatDraftInput {
  link: InstitutionLinkSnapshot | null;
}

export class RecordUnsentChatDraftUseCase {
  constructor(private readonly checkinPort: SignalCheckinPort) {}

  async execute({ link }: RecordUnsentChatDraftInput): Promise<void> {
    if (link === null) return;

    await this.checkinPort.chatDraft({
      institutionId: link.institutionId,
      sectorId: link.sectorId,
      deviceSignalId: link.deviceSignalId,
    });
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/use-cases/record-unsent-chat-draft.usecase.test.ts`
Expected: PASS, 3 testes.

- [ ] **Step 5: Registrar no container**

Modify `apps/web/src/app/container/signal-checkin.ts` — arquivo inteiro passa a ser:

```ts
import { RecordSignalCheckinUseCase } from "@/use-cases/record-signal-checkin.usecase";
import { RecordAssessmentAbandonmentUseCase } from "@/use-cases/record-assessment-abandonment.usecase";
import { RecordUnsentChatDraftUseCase } from "@/use-cases/record-unsent-chat-draft.usecase";
import { HttpSignalCheckinAdapter } from "@/infrastructure/http/http-signal-checkin.adapter";

const signalCheckinAdapter = new HttpSignalCheckinAdapter();

export const recordSignalCheckinUseCase = new RecordSignalCheckinUseCase(signalCheckinAdapter);
export const recordAssessmentAbandonmentUseCase = new RecordAssessmentAbandonmentUseCase(signalCheckinAdapter);
export const recordUnsentChatDraftUseCase = new RecordUnsentChatDraftUseCase(signalCheckinAdapter);
```

- [ ] **Step 6: Typecheck**

Run (de `apps/web`): `npx tsc --noEmit -p tsconfig.json`
Expected: sem erro.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/use-cases/record-unsent-chat-draft.usecase.ts apps/web/src/use-cases/record-unsent-chat-draft.usecase.test.ts apps/web/src/app/container/signal-checkin.ts
git commit -m "feat(web): add RecordUnsentChatDraftUseCase"
```

---

### Task 9: Frontend — detectar rascunho não enviado em `ChatComposer`

**Files:**
- Modify: `apps/web/src/presentation/pages/ChatPage/ChatComposer.tsx`
- Modify: `apps/web/src/presentation/pages/ChatPage/ChatPage.test.tsx`

**Interfaces:**
- Consumes: `recordUnsentChatDraftUseCase` (Task 8), `getLinkedAndOptedIn` (já existente, `@/presentation/lib/institution-link-gate`).

**Sem `useBlocker`, sem modal** — o `ChatPage.test.tsx` continua usando o `MemoryRouter` clássico (`<Routes>`/`<Route>`), sem precisar migrar pra data router como a feature de abandono de questionário precisou. A desmontagem do `ChatComposer` por navegação in-app já é suficiente pra detectar a saída, e o teste já tem um jeito de navegar pra fora do chat: o botão "Falar com uma pessoa real" (handoff), que leva pra `/crisis`.

- [ ] **Step 1: Escrever os testes (falhando)**

Em `apps/web/src/presentation/pages/ChatPage/ChatPage.test.tsx`, adicionar aos imports do topo:

```tsx
import { useInstitutionLinkStore } from '@/stores/institution-link.store';
import { useConsentStore } from '@/stores/consent.store';
```

E adicionar este `describe` novo, depois do `describe('ChatPage', ...)` existente (mesmo nível, não aninhado):

```tsx
describe('unsent chat draft signal', () => {
  beforeEach(() => {
    useInstitutionLinkStore.setState({
      institutionId: null,
      institutionName: null,
      sectorId: null,
      sectorName: null,
      deviceSignalId: null,
    });
    useConsentStore.setState({ aggregateOptIn: true });
  });

  it('does not record anything when the composer is empty and the médico navigates away', async () => {
    const user = userEvent.setup();
    const executeSpy = vi.spyOn(container.recordUnsentChatDraftUseCase, 'execute');
    renderChat();

    await user.click(screen.getByRole('button', { name: /falar com uma pessoa real/i }));

    expect(screen.getByText('Crisis offer screen')).toBeInTheDocument();
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('records the draft when there is unsent text and the médico is linked and opted in', async () => {
    const user = userEvent.setup();
    useInstitutionLinkStore.setState({
      institutionId: 'inst-1',
      institutionName: 'Hospital X',
      sectorId: 'UTI',
      sectorName: 'UTI',
      deviceSignalId: 'device-1',
    });
    vi.spyOn(container.recordUnsentChatDraftUseCase, 'execute').mockResolvedValue(undefined);
    renderChat();

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Não sei bem como');
    await user.click(screen.getByRole('button', { name: /falar com uma pessoa real/i }));

    expect(container.recordUnsentChatDraftUseCase.execute).toHaveBeenCalledWith({
      link: { institutionId: 'inst-1', sectorId: 'UTI', deviceSignalId: 'device-1' },
    });
  });

  it('does not record when there is no institution link', async () => {
    const user = userEvent.setup();
    const executeSpy = vi.spyOn(container.recordUnsentChatDraftUseCase, 'execute');
    renderChat();

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Texto qualquer');
    await user.click(screen.getByRole('button', { name: /falar com uma pessoa real/i }));

    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('does not record when aggregateOptIn is false, even with a valid link', async () => {
    const user = userEvent.setup();
    useInstitutionLinkStore.setState({
      institutionId: 'inst-1',
      institutionName: 'Hospital X',
      sectorId: 'UTI',
      sectorName: 'UTI',
      deviceSignalId: 'device-1',
    });
    useConsentStore.setState({ aggregateOptIn: false });
    const executeSpy = vi.spyOn(container.recordUnsentChatDraftUseCase, 'execute');
    renderChat();

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Texto qualquer');
    await user.click(screen.getByRole('button', { name: /falar com uma pessoa real/i }));

    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('does not record when the message was sent instead of abandoned', async () => {
    const user = userEvent.setup();
    useInstitutionLinkStore.setState({
      institutionId: 'inst-1',
      institutionName: 'Hospital X',
      sectorId: 'UTI',
      sectorName: 'UTI',
      deviceSignalId: 'device-1',
    });
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockReturnValue(fakeAssistantStream());
    const executeSpy = vi.spyOn(container.recordUnsentChatDraftUseCase, 'execute');
    renderChat();

    await user.type(screen.getByPlaceholderText('Escreva como você está…'), 'Estou bem');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Estou bem');
    await user.click(screen.getByRole('button', { name: /falar com uma pessoa real/i }));

    expect(executeSpy).not.toHaveBeenCalled();
  });
});
```

(`renderChat` e `fakeAssistantStream` já existem no arquivo, reaproveitados sem mudança.)

- [ ] **Step 2: Rodar os testes e confirmar que os novos falham**

Run (de `apps/web`): `npx vitest run src/presentation/pages/ChatPage/ChatPage.test.tsx`
Expected: os testes pré-existentes continuam passando; os 5 novos falham (`container.recordUnsentChatDraftUseCase` existe desde a Task 8, mas nada em `ChatComposer` chama ele ainda).

- [ ] **Step 3: Implementar**

Em `apps/web/src/presentation/pages/ChatPage/ChatComposer.tsx`:

Os imports ganham:

```tsx
import { recordUnsentChatDraftUseCase } from '@/app/container';
import { getLinkedAndOptedIn } from '@/presentation/lib/institution-link-gate';
```

Logo depois de `const [text, setText] = useState('');`, adicionar:

```tsx
  // Espelha `text` num ref: o cleanup do efeito abaixo roda na desmontagem,
  // e sua closure captura o `text` do primeiro render se não for por um ref —
  // sem isso, sempre leria string vazia.
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    return () => {
      if (textRef.current.trim().length === 0) return;
      const link = getLinkedAndOptedIn();
      if (link) {
        void recordUnsentChatDraftUseCase.execute({ link }).catch(() => {});
      }
    };
  }, []);
```

(`useEffect`/`useRef` já estão importados no topo do arquivo — não precisa adicionar ao import de `'react'`.)

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/presentation/pages/ChatPage/ChatPage.test.tsx`
Expected: PASS, todos os testes (pré-existentes + os 5 novos).

- [ ] **Step 5: Typecheck e suíte completa do web**

Run (de `apps/web`): `npx tsc --noEmit -p tsconfig.json`
Run: `npx vitest run`
Expected: sem erro, PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/presentation/pages/ChatPage/ChatComposer.tsx apps/web/src/presentation/pages/ChatPage/ChatPage.test.tsx
git commit -m "feat(web): record an unsent chat draft signal when the médico leaves mid-typing"
```

---

### Task 10: Frontend — `unsentChatDraftsLast4Weeks` no schema + KPI no dashboard

**Files:**
- Modify: `apps/web/src/ports/manager-signals.port.ts`
- Modify (backfill mecânico, guiado por `tsc`): todo arquivo que constrói um `ManagerSignalsResponse` literal — no mínimo `ManagerDashboardPage.test.tsx`, `router.test.tsx`, `download-manager-pgr-report.test.ts`, `get-manager-signals.usecase.test.ts` (confirmar a lista completa no Step 2).
- Modify: `apps/web/src/presentation/pages/ManagerDashboardPage.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx`

**Interfaces:**
- Consumes: `MANAGER_METRICS.unsentChatDrafts`/`unsentChatDraftsReading` (Task 6).

**Aviso conhecido, de uma feature anterior:** alguns fixtures de `ManagerSignalsResponse` são consumidos só via `ManagerSignalsResponseSchema.parse(unknown)` (ex.: `http-manager-signals.adapter.test.ts`, `manager-signals.port.test.ts`), sem nunca serem tipados como `ManagerSignalsResponse` — o `tsc` não os enxerga como quebrados porque não há checagem estática ali. Depois de rodar `tsc` e fazer o backfill dos sites que ele aponta, rode a suíte completa (`npx vitest run`) e trate qualquer falha de runtime restante (erro do Zod dizendo campo obrigatório faltando) como um site adicional que precisa do mesmo backfill.

- [ ] **Step 1: Adicionar o campo ao schema**

Em `apps/web/src/ports/manager-signals.port.ts`, `ManagerSignalsResponseSchema` ganha (já nasce com `.default(0)`, mesma razão de `abandonedLast4Weeks`: `api.yml`/`web.yml` são deploys independentes):

```ts
export const ManagerSignalsResponseSchema = z.object({
  overallConcerningRate: z.number(),
  checkInsLast4Weeks: z.number(),
  abandonedLast4Weeks: z.number().default(0),
  unsentChatDraftsLast4Weeks: z.number().default(0),
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

(`.default(0)` só evita quebrar o *parse* em runtime se o campo faltar num deploy fora de ordem — o tipo `ManagerSignalsResponse` inferido por `z.infer` continua exigindo o campo em todo objeto literal tipado como tal, então o backfill mecânico dos Steps 2-4 é necessário do mesmo jeito.)

- [ ] **Step 2: Rodar o typecheck e listar todo site quebrado**

Run (de `apps/web`): `npx tsc --noEmit -p tsconfig.json`
Expected: lista de erros "Property 'unsentChatDraftsLast4Weeks' is missing in type...". Anotar todos.

- [ ] **Step 3: Adicionar `unsentChatDraftsLast4Weeks: 0` em cada site quebrado, exceto o fixture principal do dashboard**

Pra cada erro do Step 2 **exceto** o `SIGNALS_RESPONSE` de `ManagerDashboardPage.test.tsx`: adicionar `unsentChatDraftsLast4Weeks: 0`.

Em `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx`, o fixture principal ganha um valor não-zero (o teste do Step 6 usa esse número):

```ts
const SIGNALS_RESPONSE = {
  overallConcerningRate: 0.41,
  checkInsLast4Weeks: 111,
  abandonedLast4Weeks: 23,
  unsentChatDraftsLast4Weeks: 7,
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

(O fixture de estado vazio, mais abaixo no mesmo arquivo — o de `checkInsLast4Weeks: 0` — ganha `unsentChatDraftsLast4Weeks: 0`, como todos os outros do Step 3.)

- [ ] **Step 4: Rodar o typecheck e a suíte completa; caçar sites que só falham em runtime**

Run: `npx tsc --noEmit -p tsconfig.json` — esperado: sem erro.
Run (de `apps/web`): `npx vitest run` — qualquer falha de Zod "Required" em algum teste indica um fixture não-tipado que precisa do mesmo backfill (ver o aviso no topo desta task). Corrija e rode de novo até tudo passar.

- [ ] **Step 5: Escrever o teste do novo KPI (falhando)**

Em `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx`, adicionar (junto dos outros testes de KPI que usam `SIGNALS_RESPONSE`):

```tsx
  it("shows the unsent-chat-drafts KPI", async () => {
    renderManager();

    expect(await screen.findByText("Conversas iniciadas e não enviadas")).toBeInTheDocument();
    const grid = screen.getByTestId("kpi-grid");
    expect(within(grid).getByText("7")).toBeInTheDocument();
  });
```

- [ ] **Step 6: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/presentation/pages/ManagerDashboardPage.test.tsx`
Expected: FAIL no teste novo.

- [ ] **Step 7: Implementar**

Em `apps/web/src/presentation/pages/ManagerDashboardPage.tsx`:

O import de `@zelo/domain` ganha `unsentChatDraftsReading`:

```tsx
import {
  MANAGER_METRICS,
  abandonedReading,
  checkInsReading,
  concerningRateReading,
  followUpBandFor,
  followUpReading,
  sectorCoverageReading,
  unsentChatDraftsReading,
  type MetricDefinition,
} from "@zelo/domain";
```

Logo depois de `const abandonedLast4Weeks = data?.abandonedLast4Weeks ?? 0;`:

```tsx
  const unsentChatDraftsLast4Weeks = data?.unsentChatDraftsLast4Weeks ?? 0;
```

O grid de KPIs (`data-testid="kpi-grid"`) tem hoje `lg:grid-cols-4` com 4 skeletons/4 cards — com o 5º card, sobe pra `lg:grid-cols-5`:

```tsx
        <div data-testid="kpi-grid" className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          {isLoading ? (
            <>
              <KpiCardSkeleton />
              <KpiCardSkeleton />
              <KpiCardSkeleton />
              <KpiCardSkeleton />
              <KpiCardSkeleton />
            </>
          ) : checkInsLast4Weeks === 0 ? (
            <Card className="h-full text-center md:col-span-2 lg:col-span-5" data-testid="kpi-empty">
```

E um novo `<KpiCard>` logo depois do de `MANAGER_METRICS.abandoned` (antes do de `followUpRate`):

```tsx
              <KpiCard
                metric={MANAGER_METRICS.unsentChatDrafts}
                value={String(unsentChatDraftsLast4Weeks)}
                valueClass="text-ink"
                reading={unsentChatDraftsReading(unsentChatDraftsLast4Weeks)}
              />
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/presentation/pages/ManagerDashboardPage.test.tsx`
Expected: PASS, todos os testes do arquivo (incluindo os que verificam `lg:grid-cols-...`/contagem de cards, se algum existir — ajuste os números pra 5 caso apareçam quebrados, é a mesma mudança de grid, não uma regressão).

- [ ] **Step 9: Typecheck e suíte completa**

Run: `npx tsc --noEmit -p tsconfig.json`
Run: `npx vitest run`
Expected: sem erro, PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/ports/manager-signals.port.ts apps/web/src/presentation/pages/ManagerDashboardPage.tsx apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx
git add -u apps/web/src
git commit -m "feat(web): show the unsent-chat-drafts KPI on the manager dashboard"
```

---

### Task 11: Frontend — linha nova no export PGR

**Files:**
- Modify: `apps/web/src/presentation/lib/download-manager-pgr-report.ts`
- Modify: `apps/web/src/presentation/lib/download-manager-pgr-report.test.ts`

**Interfaces:**
- Consumes: `ManagerSignalsResponse.unsentChatDraftsLast4Weeks` (Task 10), `MANAGER_METRICS.unsentChatDrafts` (Task 6).

- [ ] **Step 1: Escrever os testes (falhando)**

Em `apps/web/src/presentation/lib/download-manager-pgr-report.test.ts`, o fixture `DATA` ganha o campo:

```ts
const DATA: ManagerSignalsResponse = {
  overallConcerningRate: 0.41,
  checkInsLast4Weeks: 111,
  abandonedLast4Weeks: 9,
  unsentChatDraftsLast4Weeks: 4,
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

No `describe("buildPgrCsvLines", ...)`, adicionar uma asserção ao teste `"includes the disclaimer, summary metrics, and one row per segment"`:

```ts
    expect(lines).toContain(`${MANAGER_METRICS.unsentChatDrafts.label} (4 semanas),4`);
```

No describe do PDF (`downloadPgrReportAsPdf`), adicionar um teste novo:

```ts
  it("includes the unsent-chat-drafts line", async () => {
    await downloadPgrReportAsPdf(DATA, GENERATED_AT);

    expect(textMock).toHaveBeenCalledWith(`${MANAGER_METRICS.unsentChatDrafts.label} (4 semanas): 4`, 14, expect.any(Number));
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run (de `apps/web`): `npx vitest run src/presentation/lib/download-manager-pgr-report.test.ts`
Expected: FAIL nos novos asserts/teste.

- [ ] **Step 3: Implementar**

Em `apps/web/src/presentation/lib/download-manager-pgr-report.ts`, `buildPgrCsvLines` ganha a linha, logo depois da de `abandoned`:

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
    `${MANAGER_METRICS.unsentChatDrafts.label} (4 semanas),${data.unsentChatDraftsLast4Weeks}`,
    `${MANAGER_METRICS.followUpRate.label}${DEMONSTRATION_SUFFIX},${Math.round(data.followUpResponseRate * 100)}%`,
    "",
    "Setor,Sinais (%),n",
    ...data.segments.map((segment) => `${segment.label},${segment.value}%,${segment.n}`),
    "",
    csvQuote(`Metodologia: /manager/methodology — versão ${MANAGER_METHODOLOGY_VERSION}`),
  ];
}
```

E `downloadPgrReportAsPdf` ganha a mesma linha, logo depois da de `abandoned`:

```ts
  doc.text(`${MANAGER_METRICS.abandoned.label} (4 semanas): ${data.abandonedLast4Weeks}`, 14, y);
  y += LINE_HEIGHT;
  doc.text(`${MANAGER_METRICS.unsentChatDrafts.label} (4 semanas): ${data.unsentChatDraftsLast4Weeks}`, 14, y);
  y += LINE_HEIGHT;
  const followUpLines = doc.splitTextToSize(
```

(o resto da função não muda — `followUpLines` em diante fica igual, só que agora `y` chega até lá um `LINE_HEIGHT` mais adiante. Se algum teste existente checar a posição `y` exata de uma linha que vem DEPOIS desta na função, esse valor precisa subir em `LINE_HEIGHT` — mesma mecânica que já aconteceu na feature anterior ao inserir a linha de `abandoned`.)

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/presentation/lib/download-manager-pgr-report.test.ts`
Expected: PASS, todos os testes do arquivo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/lib/download-manager-pgr-report.ts apps/web/src/presentation/lib/download-manager-pgr-report.test.ts
git commit -m "feat(web): include unsent chat drafts in the PGR export"
```

---

### Task 12: Frontend — estender o texto de consentimento

**Files:**
- Modify: `apps/web/src/presentation/pages/ConsentPage.tsx`
- Modify: `apps/web/src/presentation/pages/YouPage/AggregateOptInSection.tsx`
- Modify: `apps/web/src/presentation/pages/ConsentPage.test.tsx`
- Modify: `apps/web/src/presentation/pages/YouPage/AggregateOptInSection.test.tsx`

**Interfaces:** nenhuma — só texto.

- [ ] **Step 1: Atualizar `ConsentPage.tsx`**

Em `apps/web/src/presentation/pages/ConsentPage.tsx`, a segunda linha de `ROWS` passa a ser:

```tsx
  <>
    Autorizo o uso <strong>anônimo e agregado</strong> dos meus sinais e interações (como um
    questionário iniciado e não concluído, ou uma mensagem de chat começada e não enviada) para
    melhorar o cuidado da equipe.
  </>,
```

- [ ] **Step 2: Atualizar `AggregateOptInSection.tsx`**

Em `apps/web/src/presentation/pages/YouPage/AggregateOptInSection.tsx`, o texto do `<p>` passa a ser:

```tsx
        <p className="flex-1 text-label text-ink-2">
          Autorizo o uso <strong>anônimo e agregado</strong> dos meus sinais e interações (como um
          questionário iniciado e não concluído, ou uma mensagem de chat começada e não enviada)
          para melhorar o cuidado da equipe.
        </p>
```

- [ ] **Step 3: Rodar os testes dos dois arquivos e de quem os usa**

Run (de `apps/web`): `npx vitest run src/presentation/pages/ConsentPage.test.tsx src/presentation/pages/YouPage/AggregateOptInSection.test.tsx src/presentation/pages/YouPage/YouPage.test.tsx`
Expected: PASS — os testes existentes usam regex parcial (`/anônimo e agregado/`), não o texto inteiro, então continuam passando sem alteração. Se algum teste comparar o texto inteiro literalmente, ele quebra e precisa ser atualizado pro texto novo — trate isso se aparecer.

- [ ] **Step 4: Lint e commit**

Run (de `apps/web`): `npx eslint src/presentation/pages/ConsentPage.tsx src/presentation/pages/YouPage/AggregateOptInSection.tsx`
Expected: sem output.

```bash
git add apps/web/src/presentation/pages/ConsentPage.tsx apps/web/src/presentation/pages/YouPage/AggregateOptInSection.tsx
git commit -m "feat(web): cover unsent chat drafts in the aggregate consent opt-in"
```

---

### Task 13: Verificação full-suite

**Files:** nenhum (só verificação).

- [ ] **Step 1: Rodar a suíte completa da api**

Run (de `apps/api`): `npx vitest run`
Expected: PASS, sem regressão.

- [ ] **Step 2: Rodar a suíte completa do web**

Run (de `apps/web`): `npx vitest run`
Expected: PASS, sem regressão.

- [ ] **Step 3: Typecheck dos três pacotes**

Run (de `apps/api`): `npx tsc --noEmit -p tsconfig.json`
Run (de `apps/web`): `npx tsc --noEmit -p tsconfig.json`
Run (de `packages/domain`): `npx tsc --noEmit -p tsconfig.json`
Expected: sem output nos três.

- [ ] **Step 4: Lint dos arquivos tocados**

Run (de `apps/web`):
```bash
npx eslint src/presentation/pages/ChatPage/ChatComposer.tsx src/presentation/pages/ChatPage/ChatPage.test.tsx \
  src/presentation/pages/ManagerDashboardPage.tsx src/presentation/pages/ManagerDashboardPage.test.tsx \
  src/presentation/lib/download-manager-pgr-report.ts src/presentation/lib/download-manager-pgr-report.test.ts \
  src/presentation/pages/ConsentPage.tsx src/presentation/pages/YouPage/AggregateOptInSection.tsx \
  src/ports/signal-checkin.port.ts src/ports/manager-signals.port.ts \
  src/infrastructure/http/http-signal-checkin.adapter.ts src/infrastructure/http/http-signal-checkin.adapter.test.ts \
  src/use-cases/record-unsent-chat-draft.usecase.ts src/use-cases/record-unsent-chat-draft.usecase.test.ts \
  src/app/container/signal-checkin.ts
```
Expected: sem output.

Run (de `apps/api`):
```bash
npx eslint src/modules/signal-checkin src/modules/manager/application/ports/signal-repository.port.ts \
  src/modules/manager/infrastructure/persistence/prisma-signal.repository.ts \
  src/modules/manager/application/use-cases/get-manager-signals.use-case.ts
```
Expected: sem output.

Run (de `packages/domain`):
```bash
npx eslint src/manager/metric-glossary.ts
```
Expected: sem output.

- [ ] **Step 5: Smoke test manual**

Rodar `pnpm dev` na raiz. Como médico vinculado a instituição/setor com opt-in agregado ativo: abrir o chat, digitar algo sem enviar, sair pra Home (bottom-nav) ou tela de crise (handoff) — confirmar que não aparece modal nenhum e a navegação acontece normalmente. Repetir digitando e ENVIANDO a mensagem antes de sair — nenhum registro extra deveria acontecer (não dá pra ver isso na UI, é uma checagem de rede via devtools se quiser confirmar). Como gestor (setor com 5+ respostas já visíveis): confirmar que o card "Conversas iniciadas e não enviadas" aparece no dashboard, e a mesma linha no export do PGR (CSV e PDF).

- [ ] **Step 6: Relatório**

Sem commit — é só verificação. Regressão encontrada vira um commit de correção pequeno na task que a introduziu, nunca amend.
