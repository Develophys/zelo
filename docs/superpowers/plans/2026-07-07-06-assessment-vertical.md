# Assessment Vertical Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the PHQ-9 and GAD-7 self-assessment vertical — client-side scoring, client-side Web Crypto encryption, local IndexedDB persistence, and a backend endpoint that stores only ciphertext (never raw answers, never the risk signal) — end to end (PRD FR-1, FR-2, FR-3, US-001).

**Architecture:** Frontend: `ScoreAssessmentUseCase` computes the total score and the PHQ-9 item-9 risk signal entirely on-device; `EncryptAssessmentUseCase` (Web Crypto AES-256-GCM, device-local key) encrypts the raw answers before anything is persisted or transmitted; the result is saved to IndexedDB (`LocalAssessmentStorePort`) and, best-effort, submitted to the backend (`AssessmentSubmissionPort`) as ciphertext only. Backend: `AssessmentModule` accepts and stores only the `AssessmentSchema` shape (`id`, `scaleType`, `capturedAt`, `ciphertext`) — there is no field for raw answers or for the risk signal, so neither can reach the server even by accident.

**Tech Stack:** Web Crypto API (`SubtleCrypto`, AES-256-GCM), IndexedDB, TanStack Query (`useMutation` for the submit action), Prisma, Zod, Vitest + React Testing Library, `fake-indexeddb` (test-only).

## Global Constraints

- PHQ-9 and GAD-7 are implemented in full — both are public-domain instruments (Spitzer/Kroenke/Williams, Pfizer) safe to embed verbatim.
- **MBI-HSS is explicitly out of scope for this plan.** Its item text is proprietary (licensed through Mind Garden); embedding it in code without a procured license would be both a legal problem and dishonest to the checkpoint reviewers about what's actually validated. `ScoreAssessmentUseCase` throws a clear, documented error if called with `"MBI-HSS"` rather than silently returning wrong data — this matches the PRD's own allowance for "PHQ-9, GAD-7 e/ou MBI-HSS (ou subconjunto validado com parceiro clínico)" and its still-open question about clinical partner validation.
- The PT-BR translations of the PHQ-9/GAD-7 item text in this plan are the author's own rendering of the public-domain English originals, not a clinically-validated published translation — this is adequate for a TRL3 PoC but should be swapped for a validated instrument before any real clinical use (PRD's open question about clinical partner validation covers this).
- The risk signal (PHQ-9 item 9 positive) is computed and consumed **entirely client-side**. The shared `AssessmentSchema` (`@zelo/domain`, Plan 01 Task 4) has no `riskSignal` field by design — the backend must never learn a risk signal exists (spec Section G). This plan introduces a **frontend-local-only** `AssessmentRecord` type (in `apps/web/src/domain/`, not `packages/domain`) that carries `riskSignal` for on-device use only.
- Backend submission of an assessment is best-effort and must never block the user from seeing their score — if the network call fails, the score is still shown and the record is still saved locally (PRD's documented edge case: "Conexão instável... nenhum dado é perdido").
- Requires Plans 01, 02, 03, 04 complete.
- `apps/api` runs under Node's `NodeNext` ESM resolution (Plan 02) — every relative import between hand-written source files in Task 1/2 (backend) uses an explicit `.ts` extension (`allowImportingTsExtensions`/`rewriteRelativeImportExtensions`, rewritten to `.js` by `tsc`). `apps/web` (Tasks 3-6) is unaffected and stays CommonJS with extensionless imports. Neither `prisma migrate dev` nor `prisma migrate deploy` takes a `--schema` flag in Prisma 7 (Plan 02) — schema location comes from `apps/api/prisma.config.ts`.
- Every NestJS constructor-injected parameter in Task 1/2 (backend) uses explicit `@Inject(Token)`, including class tokens — implicit type-based injection silently resolves to `undefined` under this project's Vitest/esbuild test runner (Plan 02's Global Constraints has the full explanation). `PrismaAssessmentRepository` and `AssessmentController` below both reflect this.

---

### Task 1: Backend — Prisma model, `AssessmentRepository`, `StoreEncryptedAssessmentUseCase`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/modules/assessment/application/ports/assessment-repository.port.ts`
- Create: `apps/api/src/modules/assessment/application/use-cases/store-encrypted-assessment.use-case.ts`
- Create: `apps/api/src/modules/assessment/application/use-cases/store-encrypted-assessment.use-case.test.ts`
- Create: `apps/api/src/modules/assessment/infrastructure/persistence/prisma-assessment.repository.ts`

**Interfaces:**
- Consumes: `Assessment`, `AssessmentSchema` from `@zelo/domain` (Plan 01 Task 4, corrected — no `riskSignal` field).
- Produces: `StoreEncryptedAssessmentUseCase.execute(assessment: Assessment): Promise<void>`. Task 2's `AssessmentController` depends on this exact method.

- [ ] **Step 1: Add the `Assessment` model to the Prisma schema**

Modify `apps/api/prisma/schema.prisma` — add after the existing comment block:

```prisma
model Assessment {
  id         String   @id
  scaleType  String
  capturedAt DateTime
  ciphertext String
  createdAt  DateTime @default(now())

  @@map("assessments")
}
```

No `riskSignal` column — matches `AssessmentSchema`'s wire contract exactly; there is nowhere in the database for it to even be stored.

- [ ] **Step 2: Create the migration**

Run: `pnpm --filter @zelo/api exec prisma migrate dev --name add_assessment_model`
Expected: creates `apps/api/prisma/migrations/<timestamp>_add_assessment_model/migration.sql` containing a `CREATE TABLE "assessments" (...)` statement, applies it, and regenerates the Prisma client. Requires the Postgres container from Plan 02 running.

- [ ] **Step 3: Write the failing test for `StoreEncryptedAssessmentUseCase`**

Create `apps/api/src/modules/assessment/application/use-cases/store-encrypted-assessment.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { StoreEncryptedAssessmentUseCase } from "./store-encrypted-assessment.use-case.ts";
import type { AssessmentRepository } from "../ports/assessment-repository.port.ts";
import type { Assessment } from "@zelo/domain";

class FakeAssessmentRepository implements AssessmentRepository {
  public saved: Assessment[] = [];

  async save(assessment: Assessment): Promise<void> {
    this.saved.push(assessment);
  }
}

describe("StoreEncryptedAssessmentUseCase", () => {
  it("passes the assessment through to the repository unchanged", async () => {
    const repository = new FakeAssessmentRepository();
    const useCase = new StoreEncryptedAssessmentUseCase(repository);
    const assessment: Assessment = {
      id: "b3f1c2b0-1234-4a5b-9c6d-000000000001",
      scaleType: "PHQ-9",
      capturedAt: "2026-07-07T12:00:00.000Z",
      ciphertext: "base64-ciphertext==",
    };

    await useCase.execute(assessment);

    expect(repository.saved).toEqual([assessment]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test`
Expected: FAIL — `Cannot find module './store-encrypted-assessment.use-case.ts'`.

- [ ] **Step 5: Define the port**

Create `apps/api/src/modules/assessment/application/ports/assessment-repository.port.ts`:

```ts
import type { Assessment } from "@zelo/domain";

export interface AssessmentRepository {
  save(assessment: Assessment): Promise<void>;
}

export const ASSESSMENT_REPOSITORY = Symbol("ASSESSMENT_REPOSITORY");
```

- [ ] **Step 6: Implement the use-case**

Create `apps/api/src/modules/assessment/application/use-cases/store-encrypted-assessment.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { Assessment } from "@zelo/domain";
import { ASSESSMENT_REPOSITORY, type AssessmentRepository } from "../ports/assessment-repository.port.ts";

@Injectable()
export class StoreEncryptedAssessmentUseCase {
  constructor(@Inject(ASSESSMENT_REPOSITORY) private readonly repository: AssessmentRepository) {}

  async execute(assessment: Assessment): Promise<void> {
    await this.repository.save(assessment);
  }
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test`
Expected: PASS — 1 new test passed.

- [ ] **Step 8: Implement the Prisma-backed repository**

Create `apps/api/src/modules/assessment/infrastructure/persistence/prisma-assessment.repository.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { Assessment } from "@zelo/domain";
import type { AssessmentRepository } from "../../application/ports/assessment-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaAssessmentRepository implements AssessmentRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async save(assessment: Assessment): Promise<void> {
    await this.prisma.assessment.create({
      data: {
        id: assessment.id,
        scaleType: assessment.scaleType,
        capturedAt: new Date(assessment.capturedAt),
        ciphertext: assessment.ciphertext,
      },
    });
  }
}
```

- [ ] **Step 9: Commit**

```bash
git add apps/api
git commit -m "feat(api): add Assessment Prisma model and StoreEncryptedAssessmentUseCase"
```

---

### Task 2: Backend — `AssessmentController` proving the architectural privacy guarantee

**Files:**
- Create: `apps/api/src/modules/assessment/infrastructure/assessment.controller.ts`
- Create: `apps/api/src/modules/assessment/infrastructure/assessment.controller.test.ts`
- Create: `apps/api/src/modules/assessment/assessment.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `StoreEncryptedAssessmentUseCase` (Task 1).
- Produces: `POST /assessments` → `201 { id }`. Task 3's `HttpAssessmentSubmissionAdapter` (frontend) depends on this exact contract.

- [ ] **Step 1: Write the failing e2e test — including the privacy-guarantee proof**

Create `apps/api/src/modules/assessment/infrastructure/assessment.controller.test.ts`:

```ts
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AssessmentController } from "./assessment.controller.ts";
import { StoreEncryptedAssessmentUseCase } from "../application/use-cases/store-encrypted-assessment.use-case.ts";
import { ASSESSMENT_REPOSITORY } from "../application/ports/assessment-repository.port.ts";
import type { AssessmentRepository } from "../application/ports/assessment-repository.port.ts";
import type { Assessment } from "@zelo/domain";

class FakeAssessmentRepository implements AssessmentRepository {
  public saved: Assessment[] = [];

  async save(assessment: Assessment): Promise<void> {
    this.saved.push(assessment);
  }
}

describe("POST /assessments", () => {
  let app: INestApplication;
  let repository: FakeAssessmentRepository;

  beforeAll(async () => {
    repository = new FakeAssessmentRepository();
    const moduleRef = await Test.createTestingModule({
      controllers: [AssessmentController],
      providers: [
        StoreEncryptedAssessmentUseCase,
        { provide: ASSESSMENT_REPOSITORY, useValue: repository },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("stores a valid ciphertext-only assessment and returns its id", async () => {
    const response = await request(app.getHttpServer()).post("/assessments").send({
      id: "b3f1c2b0-1234-4a5b-9c6d-000000000001",
      scaleType: "PHQ-9",
      capturedAt: "2026-07-07T12:00:00.000Z",
      ciphertext: "base64-ciphertext==",
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: "b3f1c2b0-1234-4a5b-9c6d-000000000001" });
    expect(repository.saved).toHaveLength(1);
  });

  it("rejects a payload carrying a raw answers array (FR-2, FR-13 — architecturally enforced)", async () => {
    const response = await request(app.getHttpServer()).post("/assessments").send({
      id: "b3f1c2b0-1234-4a5b-9c6d-000000000002",
      scaleType: "PHQ-9",
      capturedAt: "2026-07-07T12:00:00.000Z",
      answers: [1, 2, 3, 0, 1, 2, 0, 1, 3],
    });

    expect(response.status).toBe(400);
  });

  it("silently drops a riskSignal field instead of persisting it — the server never learns the risk signal", async () => {
    const response = await request(app.getHttpServer()).post("/assessments").send({
      id: "b3f1c2b0-1234-4a5b-9c6d-000000000003",
      scaleType: "PHQ-9",
      capturedAt: "2026-07-07T12:00:00.000Z",
      ciphertext: "base64-ciphertext==",
      riskSignal: true,
    });

    expect(response.status).toBe(201);
    const stored = repository.saved.find((a) => a.id === "b3f1c2b0-1234-4a5b-9c6d-000000000003");
    expect(stored).not.toHaveProperty("riskSignal");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test`
Expected: FAIL — `Cannot find module './assessment.controller.ts'`.

- [ ] **Step 3: Implement `AssessmentController`**

Create `apps/api/src/modules/assessment/infrastructure/assessment.controller.ts`:

```ts
import { BadRequestException, Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { AssessmentSchema } from "@zelo/domain";
import { StoreEncryptedAssessmentUseCase } from "../application/use-cases/store-encrypted-assessment.use-case.ts";

@Controller("assessments")
export class AssessmentController {
  constructor(@Inject(StoreEncryptedAssessmentUseCase) private readonly storeAssessment: StoreEncryptedAssessmentUseCase) {}

  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown): Promise<{ id: string }> {
    const parsed = AssessmentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    await this.storeAssessment.execute(parsed.data);
    return { id: parsed.data.id };
  }
}
```

`AssessmentSchema.safeParse` is what makes both privacy proofs in Step 1 true simultaneously: a payload with `answers` but no `ciphertext` fails validation outright (no `ciphertext` field means the required field is missing); a payload with a valid `ciphertext` *and* an extra `riskSignal` field passes validation, but `parsed.data` — passed to the use-case and repository — only ever contains the schema's own fields, because Zod strips unrecognized keys by default.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test`
Expected: PASS — 3 new tests passed.

- [ ] **Step 5: Wire the module**

Create `apps/api/src/modules/assessment/assessment.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { AssessmentController } from "./infrastructure/assessment.controller.ts";
import { StoreEncryptedAssessmentUseCase } from "./application/use-cases/store-encrypted-assessment.use-case.ts";
import { PrismaAssessmentRepository } from "./infrastructure/persistence/prisma-assessment.repository.ts";
import { ASSESSMENT_REPOSITORY } from "./application/ports/assessment-repository.port.ts";

@Module({
  controllers: [AssessmentController],
  providers: [
    StoreEncryptedAssessmentUseCase,
    { provide: ASSESSMENT_REPOSITORY, useClass: PrismaAssessmentRepository },
  ],
})
export class AssessmentModule {}
```

- [ ] **Step 6: Register `AssessmentModule` in `AppModule`**

Modify `apps/api/src/app.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./shared/prisma/prisma.module.ts";
import { HealthModule } from "./modules/health/health.module.ts";
import { ChatModule } from "./modules/chat/chat.module.ts";
import { AssessmentModule } from "./modules/assessment/assessment.module.ts";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    ChatModule,
    AssessmentModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 7: Run the full backend test suite**

Run: `pnpm --filter @zelo/api test`
Expected: PASS — all tests across `health`, `chat`, and `assessment` modules pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api
git commit -m "feat(api): add AssessmentController with architecturally-enforced privacy guarantees"
```

---

### Task 3: Frontend — PHQ-9 and GAD-7 scale definitions and `ScoreAssessmentUseCase`

**Files:**
- Create: `apps/web/src/domain/assessment-scales/frequency-scale.ts`
- Create: `apps/web/src/domain/assessment-scales/phq9.ts`
- Create: `apps/web/src/domain/assessment-scales/gad7.ts`
- Create: `apps/web/src/use-cases/score-assessment.usecase.ts`
- Create: `apps/web/src/use-cases/score-assessment.usecase.test.ts`

**Interfaces:**
- Produces: `ScoreAssessmentUseCase.execute(scaleType, answers): { totalScore: number; riskSignal: boolean }`. Task 5's `SubmitAssessmentUseCase` and the assessment pages depend on this exact signature.

- [ ] **Step 1: Create the shared response scale**

Create `apps/web/src/domain/assessment-scales/frequency-scale.ts`:

```ts
export const FREQUENCY_RESPONSE_OPTIONS = [
  { value: 0, label: "Nenhuma vez" },
  { value: 1, label: "Vários dias" },
  { value: 2, label: "Mais da metade dos dias" },
  { value: 3, label: "Quase todos os dias" },
] as const;
```

- [ ] **Step 2: Create the PHQ-9 question set**

Create `apps/web/src/domain/assessment-scales/phq9.ts`:

```ts
export const PHQ9_QUESTIONS = [
  "Pouco interesse ou prazer em fazer as coisas",
  "Se sentir para baixo, deprimido(a) ou sem esperança",
  "Dificuldade para pegar no sono, continuar dormindo ou dormir demais",
  "Se sentir cansado(a) ou com pouca energia",
  "Falta de apetite ou comer demais",
  "Se sentir mal consigo mesmo(a) — ou achar que é um fracasso ou que decepcionou sua família ou você mesmo(a)",
  "Dificuldade para se concentrar nas coisas, como ler o jornal ou ver televisão",
  "Lentidão para se movimentar ou falar, a ponto de outras pessoas notarem — ou o contrário, estar tão agitado(a) que fica andando de um lado para o outro mais do que o normal",
  "Pensar em se ferir de alguma maneira ou que seria melhor estar morto(a)",
] as const;

/** 0-indexed — this is "item 9" in clinical terms (PRD FR-3's named risk criterion). */
export const PHQ9_RISK_ITEM_INDEX = 8;
```

- [ ] **Step 3: Create the GAD-7 question set**

Create `apps/web/src/domain/assessment-scales/gad7.ts`:

```ts
export const GAD7_QUESTIONS = [
  "Se sentir nervoso(a), ansioso(a) ou muito tenso(a)",
  "Não ser capaz de impedir ou controlar as preocupações",
  "Se preocupar demais com diversas coisas",
  "Dificuldade para relaxar",
  "Ficar tão agitado(a) que se torna difícil permanecer parado(a)",
  "Ficar facilmente aborrecido(a) ou irritado(a)",
  "Sentir medo como se algo terrível fosse acontecer",
] as const;
```

- [ ] **Step 4: Write the failing test for `ScoreAssessmentUseCase`**

Create `apps/web/src/use-cases/score-assessment.usecase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ScoreAssessmentUseCase } from "./score-assessment.usecase";

describe("ScoreAssessmentUseCase", () => {
  const useCase = new ScoreAssessmentUseCase();

  it("sums all 9 PHQ-9 answers into the total score", () => {
    const result = useCase.execute("PHQ-9", [1, 1, 1, 1, 1, 1, 1, 1, 0]);

    expect(result.totalScore).toBe(8);
  });

  it("flags riskSignal when PHQ-9 item 9 (index 8) is greater than 0", () => {
    const result = useCase.execute("PHQ-9", [0, 0, 0, 0, 0, 0, 0, 0, 1]);

    expect(result.riskSignal).toBe(true);
  });

  it("does not flag riskSignal when PHQ-9 item 9 is 0", () => {
    const result = useCase.execute("PHQ-9", [3, 3, 3, 3, 3, 3, 3, 3, 0]);

    expect(result.riskSignal).toBe(false);
  });

  it("sums all 7 GAD-7 answers into the total score", () => {
    const result = useCase.execute("GAD-7", [2, 2, 2, 2, 2, 2, 2]);

    expect(result.totalScore).toBe(14);
  });

  it("never flags riskSignal for GAD-7 — no validated single-item criterion exists yet", () => {
    const result = useCase.execute("GAD-7", [3, 3, 3, 3, 3, 3, 3]);

    expect(result.riskSignal).toBe(false);
  });

  it("throws if the answers array length doesn't match the scale's question count", () => {
    expect(() => useCase.execute("PHQ-9", [1, 1])).toThrow(/Expected 9 answers/);
  });

  it("throws a documented error for MBI-HSS — not implemented, licensing not procured", () => {
    expect(() => useCase.execute("MBI-HSS", [])).toThrow(/MBI-HSS scoring is not implemented/);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter @zelo/web test`
Expected: FAIL — `Cannot find module './score-assessment.usecase'`.

- [ ] **Step 6: Implement `ScoreAssessmentUseCase`**

Create `apps/web/src/use-cases/score-assessment.usecase.ts`:

```ts
import type { AssessmentScaleType } from "@zelo/domain";
import { PHQ9_QUESTIONS, PHQ9_RISK_ITEM_INDEX } from "../domain/assessment-scales/phq9";
import { GAD7_QUESTIONS } from "../domain/assessment-scales/gad7";

export interface ScoreResult {
  totalScore: number;
  riskSignal: boolean;
}

export class ScoreAssessmentUseCase {
  execute(scaleType: AssessmentScaleType, answers: number[]): ScoreResult {
    if (scaleType === "MBI-HSS") {
      throw new Error(
        "MBI-HSS scoring is not implemented — item text is licensed (Mind Garden) and has not been " +
          "procured for this PoC. See docs/superpowers/plans/2026-07-07-06-assessment-vertical.md, Global Constraints.",
      );
    }

    const expectedLength = scaleType === "PHQ-9" ? PHQ9_QUESTIONS.length : GAD7_QUESTIONS.length;
    if (answers.length !== expectedLength) {
      throw new Error(`Expected ${expectedLength} answers for ${scaleType}, got ${answers.length}`);
    }

    const totalScore = answers.reduce((sum, value) => sum + value, 0);
    const riskSignal = scaleType === "PHQ-9" ? (answers[PHQ9_RISK_ITEM_INDEX] ?? 0) > 0 : false;

    return { totalScore, riskSignal };
  }
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @zelo/web test`
Expected: PASS — 7 new tests passed.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/domain/assessment-scales apps/web/src/use-cases/score-assessment.usecase.ts apps/web/src/use-cases/score-assessment.usecase.test.ts
git commit -m "feat(web): add PHQ-9/GAD-7 scale definitions and client-side ScoreAssessmentUseCase"
```

---

### Task 4: Frontend — Web Crypto encryption and IndexedDB local storage

**Files:**
- Modify: `apps/web/package.json` (add `fake-indexeddb` devDependency)
- Create: `apps/web/src/ports/encryption.port.ts`
- Create: `apps/web/src/use-cases/encrypt-assessment.usecase.ts`
- Create: `apps/web/src/use-cases/encrypt-assessment.usecase.test.ts`
- Create: `apps/web/src/infrastructure/crypto/web-crypto-encryption.adapter.ts`
- Create: `apps/web/src/infrastructure/crypto/web-crypto-encryption.adapter.test.ts`
- Create: `apps/web/src/domain/assessment-record.ts`
- Create: `apps/web/src/ports/local-assessment-store.port.ts`
- Create: `apps/web/src/infrastructure/storage/indexeddb-assessment-store.adapter.ts`
- Create: `apps/web/src/infrastructure/storage/indexeddb-assessment-store.adapter.test.ts`

**Interfaces:**
- Produces: `EncryptAssessmentUseCase.execute(plaintext): Promise<{ ciphertext: string }>`; `AssessmentRecord` (FE-local type with `riskSignal`); `LocalAssessmentStorePort.save/listAll`. Task 5's `SubmitAssessmentUseCase` depends on all three.

- [ ] **Step 1: Add `fake-indexeddb` for testing IndexedDB-backed code**

Modify `apps/web/package.json` — add to `devDependencies`:

```json
"fake-indexeddb": "^6.0.0"
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test for `EncryptAssessmentUseCase`**

Create `apps/web/src/use-cases/encrypt-assessment.usecase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EncryptAssessmentUseCase } from "./encrypt-assessment.usecase";
import type { EncryptionPort } from "../ports/encryption.port";

class FakeEncryptionPort implements EncryptionPort {
  async encrypt(plaintext: string): Promise<string> {
    return `encrypted(${plaintext})`;
  }

  async decrypt(ciphertext: string): Promise<string> {
    return ciphertext.replace(/^encrypted\((.*)\)$/, "$1");
  }
}

describe("EncryptAssessmentUseCase", () => {
  it("returns the port's ciphertext wrapped in the expected shape", async () => {
    const useCase = new EncryptAssessmentUseCase(new FakeEncryptionPort());

    const result = await useCase.execute("[1,2,3]");

    expect(result).toEqual({ ciphertext: "encrypted([1,2,3])" });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @zelo/web test`
Expected: FAIL — `Cannot find module './encrypt-assessment.usecase'`.

- [ ] **Step 4: Define the port and implement the use-case**

Create `apps/web/src/ports/encryption.port.ts`:

```ts
export interface EncryptionPort {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}
```

Create `apps/web/src/use-cases/encrypt-assessment.usecase.ts`:

```ts
import type { EncryptionPort } from "../ports/encryption.port";

export interface EncryptedPayload {
  ciphertext: string;
}

export class EncryptAssessmentUseCase {
  constructor(private readonly encryption: EncryptionPort) {}

  async execute(plaintext: string): Promise<EncryptedPayload> {
    const ciphertext = await this.encryption.encrypt(plaintext);
    return { ciphertext };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @zelo/web test`
Expected: PASS — 1 new test passed.

- [ ] **Step 6: Write the failing test for `WebCryptoEncryptionAdapter`**

Create `apps/web/src/infrastructure/crypto/web-crypto-encryption.adapter.test.ts`:

```ts
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { WebCryptoEncryptionAdapter } from "./web-crypto-encryption.adapter";

describe("WebCryptoEncryptionAdapter", () => {
  it("round-trips plaintext through encrypt then decrypt", async () => {
    const adapter = new WebCryptoEncryptionAdapter();

    const ciphertext = await adapter.encrypt("[1,2,3,0,1,2,0,1,3]");
    const plaintext = await adapter.decrypt(ciphertext);

    expect(plaintext).toBe("[1,2,3,0,1,2,0,1,3]");
  });

  it("produces a different ciphertext each time for the same plaintext (random IV per call)", async () => {
    const adapter = new WebCryptoEncryptionAdapter();

    const first = await adapter.encrypt("same input");
    const second = await adapter.encrypt("same input");

    expect(first).not.toBe(second);
  });

  it("reuses the same persisted key across adapter instances", async () => {
    const first = new WebCryptoEncryptionAdapter();
    const ciphertext = await first.encrypt("persisted key test");

    const second = new WebCryptoEncryptionAdapter();
    const plaintext = await second.decrypt(ciphertext);

    expect(plaintext).toBe("persisted key test");
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm --filter @zelo/web test`
Expected: FAIL — `Cannot find module './web-crypto-encryption.adapter'`.

- [ ] **Step 8: Implement `WebCryptoEncryptionAdapter`**

Create `apps/web/src/infrastructure/crypto/web-crypto-encryption.adapter.ts`:

```ts
import type { EncryptionPort } from "../../ports/encryption.port";

const DB_NAME = "zelo-crypto";
const STORE_NAME = "keys";
const KEY_ID = "assessment-encryption-key";

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

function getStoredKey(db: IDBDatabase): Promise<JsonWebKey | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(KEY_ID);
    req.onsuccess = () => resolve(req.result as JsonWebKey | undefined);
    req.onerror = () => reject(req.error);
  });
}

function putStoredKey(db: IDBDatabase, jwk: JsonWebKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(jwk, KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * AES-256-GCM, key generated once per device and persisted in IndexedDB
 * (exported/imported as JWK) — the key never leaves the device, so this
 * ciphertext is genuinely undecryptable by the backend that stores it
 * (spec Section D, PRD FR-14).
 */
export class WebCryptoEncryptionAdapter implements EncryptionPort {
  private keyPromise: Promise<CryptoKey> | undefined;

  private getKey(): Promise<CryptoKey> {
    if (!this.keyPromise) {
      this.keyPromise = this.loadOrCreateKey();
    }
    return this.keyPromise;
  }

  private async loadOrCreateKey(): Promise<CryptoKey> {
    const db = await openDb();
    const existing = await getStoredKey(db);
    if (existing) {
      return crypto.subtle.importKey("jwk", existing, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
    }
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const exported = await crypto.subtle.exportKey("jwk", key);
    await putStoredKey(db, exported);
    return key;
  }

  async encrypt(plaintext: string): Promise<string> {
    const key = await this.getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertextBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

    const combined = new Uint8Array(iv.length + ciphertextBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertextBuffer), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  async decrypt(ciphertext: string): Promise<string> {
    const key = await this.getKey();
    const combined = Uint8Array.from(atob(ciphertext), (char) => char.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const plaintextBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(plaintextBuffer);
  }
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm --filter @zelo/web test`
Expected: PASS — 3 new tests passed.

- [ ] **Step 10: Define the FE-local `AssessmentRecord` type**

Create `apps/web/src/domain/assessment-record.ts`:

```ts
import type { Assessment } from "@zelo/domain";

/**
 * On-device-only extension of the backend's `Assessment` wire contract.
 * `riskSignal` lives here — NOT in `@zelo/domain` — because the backend
 * must never receive it (spec Section G; see the note on `AssessmentSchema`
 * in packages/domain/src/entities/assessment.ts).
 */
export interface AssessmentRecord extends Assessment {
  riskSignal: boolean;
}
```

- [ ] **Step 11: Write the failing test for `IndexedDbAssessmentStoreAdapter`**

Create `apps/web/src/infrastructure/storage/indexeddb-assessment-store.adapter.test.ts`:

```ts
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IndexedDbAssessmentStoreAdapter } from "./indexeddb-assessment-store.adapter";
import type { AssessmentRecord } from "../../domain/assessment-record";

const SAMPLE_RECORD: AssessmentRecord = {
  id: "b3f1c2b0-1234-4a5b-9c6d-000000000001",
  scaleType: "PHQ-9",
  capturedAt: "2026-07-07T12:00:00.000Z",
  ciphertext: "base64-ciphertext==",
  riskSignal: true,
};

describe("IndexedDbAssessmentStoreAdapter", () => {
  it("saves a record and returns it in listAll, including riskSignal", async () => {
    const adapter = new IndexedDbAssessmentStoreAdapter();

    await adapter.save(SAMPLE_RECORD);
    const all = await adapter.listAll();

    expect(all).toEqual([SAMPLE_RECORD]);
  });
});
```

- [ ] **Step 12: Run the test to verify it fails**

Run: `pnpm --filter @zelo/web test`
Expected: FAIL — `Cannot find module './indexeddb-assessment-store.adapter'`.

- [ ] **Step 13: Define the port and implement the adapter**

Create `apps/web/src/ports/local-assessment-store.port.ts`:

```ts
import type { AssessmentRecord } from "../domain/assessment-record";

export interface LocalAssessmentStorePort {
  save(record: AssessmentRecord): Promise<void>;
  listAll(): Promise<AssessmentRecord[]>;
}
```

Create `apps/web/src/infrastructure/storage/indexeddb-assessment-store.adapter.ts`:

```ts
import type { LocalAssessmentStorePort } from "../../ports/local-assessment-store.port";
import type { AssessmentRecord } from "../../domain/assessment-record";

const DB_NAME = "zelo-assessments";
const STORE_NAME = "records";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDbAssessmentStoreAdapter implements LocalAssessmentStorePort {
  async save(record: AssessmentRecord): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async listAll(): Promise<AssessmentRecord[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as AssessmentRecord[]);
      request.onerror = () => reject(request.error);
    });
  }
}
```

- [ ] **Step 14: Run the test to verify it passes**

Run: `pnpm --filter @zelo/web test`
Expected: PASS — 1 new test passed.

- [ ] **Step 15: Commit**

```bash
git add apps/web/package.json apps/web/src/ports/encryption.port.ts apps/web/src/use-cases/encrypt-assessment.usecase.ts apps/web/src/use-cases/encrypt-assessment.usecase.test.ts apps/web/src/infrastructure/crypto apps/web/src/domain/assessment-record.ts apps/web/src/ports/local-assessment-store.port.ts apps/web/src/infrastructure/storage
git commit -m "feat(web): add Web Crypto encryption and IndexedDB local assessment storage"
```

---

### Task 5: Frontend — `SubmitAssessmentUseCase` orchestration

**Files:**
- Create: `apps/web/src/ports/assessment-submission.port.ts`
- Create: `apps/web/src/infrastructure/http/http-assessment-submission.adapter.ts`
- Create: `apps/web/src/use-cases/submit-assessment.usecase.ts`
- Create: `apps/web/src/use-cases/submit-assessment.usecase.test.ts`
- Modify: `apps/web/src/app/container.ts`

**Interfaces:**
- Consumes: `ScoreAssessmentUseCase` (Task 3), `EncryptAssessmentUseCase` (Task 4), `LocalAssessmentStorePort` (Task 4), `AssessmentSubmissionPort` (this task).
- Produces: `SubmitAssessmentUseCase.execute(params): Promise<{ totalScore, riskSignal, submissionSucceeded }>`. Task 6's `useSubmitAssessment` hook depends on this exact signature.

- [ ] **Step 1: Write the failing test for `SubmitAssessmentUseCase`**

Create `apps/web/src/use-cases/submit-assessment.usecase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SubmitAssessmentUseCase } from "./submit-assessment.usecase";
import { ScoreAssessmentUseCase } from "./score-assessment.usecase";
import { EncryptAssessmentUseCase } from "./encrypt-assessment.usecase";
import type { EncryptionPort } from "../ports/encryption.port";
import type { LocalAssessmentStorePort } from "../ports/local-assessment-store.port";
import type { AssessmentSubmissionPort } from "../ports/assessment-submission.port";
import type { AssessmentRecord } from "../domain/assessment-record";
import type { Assessment } from "@zelo/domain";

class FakeEncryptionPort implements EncryptionPort {
  async encrypt(plaintext: string): Promise<string> {
    return `encrypted(${plaintext})`;
  }
  async decrypt(ciphertext: string): Promise<string> {
    return ciphertext;
  }
}

class FakeLocalStore implements LocalAssessmentStorePort {
  public saved: AssessmentRecord[] = [];
  async save(record: AssessmentRecord): Promise<void> {
    this.saved.push(record);
  }
  async listAll(): Promise<AssessmentRecord[]> {
    return this.saved;
  }
}

class FakeWorkingSubmission implements AssessmentSubmissionPort {
  public submitted: Assessment[] = [];
  async submit(assessment: Assessment): Promise<void> {
    this.submitted.push(assessment);
  }
}

class FakeFailingSubmission implements AssessmentSubmissionPort {
  async submit(): Promise<void> {
    throw new Error("network error");
  }
}

function buildUseCase(submission: AssessmentSubmissionPort, localStore: LocalAssessmentStorePort) {
  return new SubmitAssessmentUseCase(
    new ScoreAssessmentUseCase(),
    new EncryptAssessmentUseCase(new FakeEncryptionPort()),
    localStore,
    submission,
  );
}

describe("SubmitAssessmentUseCase", () => {
  it("computes the score, saves an encrypted record locally with riskSignal, and submits ciphertext-only to the backend", async () => {
    const localStore = new FakeLocalStore();
    const submission = new FakeWorkingSubmission();
    const useCase = buildUseCase(submission, localStore);

    const result = await useCase.execute({
      scaleType: "PHQ-9",
      answers: [0, 0, 0, 0, 0, 0, 0, 0, 1],
    });

    expect(result.totalScore).toBe(1);
    expect(result.riskSignal).toBe(true);
    expect(result.submissionSucceeded).toBe(true);

    expect(localStore.saved).toHaveLength(1);
    expect(localStore.saved[0]?.riskSignal).toBe(true);
    expect(localStore.saved[0]?.ciphertext).toBe("encrypted([0,0,0,0,0,0,0,0,1])");

    expect(submission.submitted).toHaveLength(1);
    expect(submission.submitted[0]).not.toHaveProperty("riskSignal");
  });

  it("still returns the score and keeps the local save when backend submission fails", async () => {
    const localStore = new FakeLocalStore();
    const useCase = buildUseCase(new FakeFailingSubmission(), localStore);

    const result = await useCase.execute({
      scaleType: "GAD-7",
      answers: [1, 1, 1, 1, 1, 1, 1],
    });

    expect(result.totalScore).toBe(7);
    expect(result.submissionSucceeded).toBe(false);
    expect(localStore.saved).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @zelo/web test`
Expected: FAIL — `Cannot find module './submit-assessment.usecase'`.

- [ ] **Step 3: Define the submission port**

Create `apps/web/src/ports/assessment-submission.port.ts`:

```ts
import type { Assessment } from "@zelo/domain";

export interface AssessmentSubmissionPort {
  submit(assessment: Assessment): Promise<void>;
}
```

- [ ] **Step 4: Implement `SubmitAssessmentUseCase`**

Create `apps/web/src/use-cases/submit-assessment.usecase.ts`:

```ts
import type { AssessmentScaleType } from "@zelo/domain";
import type { AssessmentRecord } from "../domain/assessment-record";
import { ScoreAssessmentUseCase } from "./score-assessment.usecase";
import { EncryptAssessmentUseCase } from "./encrypt-assessment.usecase";
import type { LocalAssessmentStorePort } from "../ports/local-assessment-store.port";
import type { AssessmentSubmissionPort } from "../ports/assessment-submission.port";

export interface SubmitAssessmentParams {
  scaleType: AssessmentScaleType;
  answers: number[];
}

export interface SubmitAssessmentResult {
  totalScore: number;
  riskSignal: boolean;
  submissionSucceeded: boolean;
}

export class SubmitAssessmentUseCase {
  constructor(
    private readonly scoreAssessment: ScoreAssessmentUseCase,
    private readonly encryptAssessment: EncryptAssessmentUseCase,
    private readonly localStore: LocalAssessmentStorePort,
    private readonly submission: AssessmentSubmissionPort,
  ) {}

  async execute(params: SubmitAssessmentParams): Promise<SubmitAssessmentResult> {
    const { totalScore, riskSignal } = this.scoreAssessment.execute(params.scaleType, params.answers);
    const { ciphertext } = await this.encryptAssessment.execute(JSON.stringify(params.answers));

    const record: AssessmentRecord = {
      id: crypto.randomUUID(),
      scaleType: params.scaleType,
      capturedAt: new Date().toISOString(),
      ciphertext,
      riskSignal,
    };

    // Local save always happens first and is never blocked by network state
    // (PRD edge case: "Conexão instável... nenhum dado é perdido").
    await this.localStore.save(record);

    let submissionSucceeded = true;
    try {
      // Only the backend wire shape (id, scaleType, capturedAt, ciphertext) is
      // sent — riskSignal is never constructed as part of this object.
      await this.submission.submit({
        id: record.id,
        scaleType: record.scaleType,
        capturedAt: record.capturedAt,
        ciphertext: record.ciphertext,
      });
    } catch {
      submissionSucceeded = false;
    }

    return { totalScore, riskSignal, submissionSucceeded };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @zelo/web test`
Expected: PASS — 2 new tests passed.

- [ ] **Step 6: Implement the HTTP submission adapter**

Create `apps/web/src/infrastructure/http/http-assessment-submission.adapter.ts`:

```ts
import type { Assessment } from "@zelo/domain";
import type { AssessmentSubmissionPort } from "../../ports/assessment-submission.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpAssessmentSubmissionAdapter implements AssessmentSubmissionPort {
  async submit(assessment: Assessment): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assessment),
    });
    if (!response.ok) {
      throw new Error(`Failed to submit assessment: ${response.status}`);
    }
  }
}
```

- [ ] **Step 7: Register everything in the DI container**

Modify `apps/web/src/app/container.ts` — add:

```ts
import { ScoreAssessmentUseCase } from "../use-cases/score-assessment.usecase";
import { EncryptAssessmentUseCase } from "../use-cases/encrypt-assessment.usecase";
import { SubmitAssessmentUseCase } from "../use-cases/submit-assessment.usecase";
import { WebCryptoEncryptionAdapter } from "../infrastructure/crypto/web-crypto-encryption.adapter";
import { IndexedDbAssessmentStoreAdapter } from "../infrastructure/storage/indexeddb-assessment-store.adapter";
import { HttpAssessmentSubmissionAdapter } from "../infrastructure/http/http-assessment-submission.adapter";

export const submitAssessmentUseCase = new SubmitAssessmentUseCase(
  new ScoreAssessmentUseCase(),
  new EncryptAssessmentUseCase(new WebCryptoEncryptionAdapter()),
  new IndexedDbAssessmentStoreAdapter(),
  new HttpAssessmentSubmissionAdapter(),
);
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add SubmitAssessmentUseCase orchestrating score, encrypt, local save, and submission"
```

---

### Task 6: Frontend — assessment wizard UI and routes

**Files:**
- Create: `apps/web/src/presentation/hooks/useSubmitAssessment.ts`
- Create: `apps/web/src/presentation/components/AssessmentForm.tsx`
- Create: `apps/web/src/presentation/components/AssessmentResultBanner.tsx`
- Create: `apps/web/src/presentation/pages/Phq9AssessmentPage.tsx`
- Create: `apps/web/src/presentation/pages/Gad7AssessmentPage.tsx`
- Create: `apps/web/src/presentation/pages/Phq9AssessmentPage.test.tsx`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**
- Consumes: `submitAssessmentUseCase` (Task 5), `HumanHandoffPanel` (Plan 05 Task 5 — reused for the risk-signal banner).
- Produces: `/assessment/phq9` and `/assessment/gad7` routes.

- [ ] **Step 1: Implement the submission hook**

Create `apps/web/src/presentation/hooks/useSubmitAssessment.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import { submitAssessmentUseCase } from "../../app/container";
import type { SubmitAssessmentParams } from "../../use-cases/submit-assessment.usecase";

export function useSubmitAssessment() {
  return useMutation({
    mutationFn: (params: SubmitAssessmentParams) => submitAssessmentUseCase.execute(params),
  });
}
```

This is a single request/response action (unlike Plan 05's streaming chat), so it fits TanStack Query's `useMutation` directly — no custom state management needed here.

- [ ] **Step 2: Implement the generic `AssessmentForm`**

Create `apps/web/src/presentation/components/AssessmentForm.tsx`:

```tsx
import { useState } from "react";
import type { SubmitEvent } from "react";

interface AssessmentFormProps {
  questions: readonly string[];
  responseOptions: readonly { value: number; label: string }[];
  isSubmitting: boolean;
  onSubmit: (answers: number[]) => void;
}

export function AssessmentForm({ questions, responseOptions, isSubmitting, onSubmit }: AssessmentFormProps) {
  const [answers, setAnswers] = useState<Array<number | undefined>>(() =>
    new Array(questions.length).fill(undefined),
  );

  const isComplete = answers.every((value) => value !== undefined);

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!isComplete) return;
    onSubmit(answers as number[]);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 p-4">
      {questions.map((question, questionIndex) => (
        <fieldset key={questionIndex} className="border-b pb-4">
          <legend className="mb-2 font-medium text-slate-800">{question}</legend>
          <div className="flex flex-col gap-1">
            {responseOptions.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name={`question-${questionIndex}`}
                  value={option.value}
                  checked={answers[questionIndex] === option.value}
                  onChange={() =>
                    setAnswers((prev) => {
                      const next = [...prev];
                      next[questionIndex] = option.value;
                      return next;
                    })
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <button
        type="submit"
        disabled={!isComplete || isSubmitting}
        className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-50"
      >
        {isSubmitting ? "Calculando..." : "Ver resultado"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Implement `AssessmentResultBanner`, reusing Plan 05's `HumanHandoffPanel`**

Create `apps/web/src/presentation/components/AssessmentResultBanner.tsx`:

```tsx
import { useState } from "react";
import { HumanHandoffPanel } from "./HumanHandoffPanel";

export function AssessmentResultBanner({
  totalScore,
  riskSignal,
  submissionSucceeded,
}: {
  totalScore: number;
  riskSignal: boolean;
  submissionSucceeded: boolean;
}) {
  const [isHandoffOpen, setIsHandoffOpen] = useState(riskSignal);

  return (
    <div className="p-4">
      <p className="text-lg text-slate-800">
        Sua pontuação: <span className="font-bold">{totalScore}</span>
      </p>
      {!submissionSucceeded && (
        <p className="mt-2 text-sm text-amber-700">
          Seu resultado foi salvo neste dispositivo. Não foi possível sincronizar com o servidor agora —
          tentaremos novamente mais tarde.
        </p>
      )}
      {riskSignal && (
        <p className="mt-4 rounded bg-red-50 p-3 text-red-800">
          Notamos um sinal importante na sua resposta. Você não está sozinho(a).
        </p>
      )}
      {isHandoffOpen && <HumanHandoffPanel onClose={() => setIsHandoffOpen(false)} />}
    </div>
  );
}
```

`riskSignal` opens `HumanHandoffPanel` immediately and automatically — this mirrors spec Section G's diagram exactly: the crisis UI shows locally the moment a risk signal is detected, with zero additional server round-trip needed to decide to show it.

- [ ] **Step 4: Write the failing test for `Phq9AssessmentPage`**

Create `apps/web/src/presentation/pages/Phq9AssessmentPage.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Phq9AssessmentPage } from "./Phq9AssessmentPage";
import * as container from "../../app/container";

function renderWithQueryClient() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <Phq9AssessmentPage />
    </QueryClientProvider>,
  );
}

describe("Phq9AssessmentPage", () => {
  it("shows the risk banner and human handoff panel immediately when item 9 is answered positively", async () => {
    vi.spyOn(container.submitAssessmentUseCase, "execute").mockResolvedValue({
      totalScore: 1,
      riskSignal: true,
      submissionSucceeded: true,
    });

    renderWithQueryClient();
    const user = userEvent.setup();

    const radios = screen.getAllByRole("radio", { name: /nenhuma vez/i });
    for (const radio of radios) {
      await user.click(radio);
    }
    const item9PositiveRadio = screen.getAllByRole("radio", { name: /vários dias/i })[8]!;
    await user.click(item9PositiveRadio);

    await user.click(screen.getByRole("button", { name: /ver resultado/i }));

    await waitFor(() => {
      expect(screen.getByText(/notamos um sinal importante/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/CVV - Centro de Valorização da Vida: 188/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter @zelo/web test`
Expected: FAIL — `Cannot find module './Phq9AssessmentPage'`.

- [ ] **Step 6: Implement `Phq9AssessmentPage` and `Gad7AssessmentPage`**

Create `apps/web/src/presentation/pages/Phq9AssessmentPage.tsx`:

```tsx
import { PHQ9_QUESTIONS } from "../../domain/assessment-scales/phq9";
import { FREQUENCY_RESPONSE_OPTIONS } from "../../domain/assessment-scales/frequency-scale";
import { AssessmentForm } from "../components/AssessmentForm";
import { AssessmentResultBanner } from "../components/AssessmentResultBanner";
import { useSubmitAssessment } from "../hooks/useSubmitAssessment";

export function Phq9AssessmentPage() {
  const { mutate, data, isPending } = useSubmitAssessment();

  if (data) {
    return (
      <AssessmentResultBanner
        totalScore={data.totalScore}
        riskSignal={data.riskSignal}
        submissionSucceeded={data.submissionSucceeded}
      />
    );
  }

  return (
    <div>
      <h1 className="p-4 text-xl font-semibold text-slate-800">Autoavaliação PHQ-9</h1>
      <AssessmentForm
        questions={PHQ9_QUESTIONS}
        responseOptions={FREQUENCY_RESPONSE_OPTIONS}
        isSubmitting={isPending}
        onSubmit={(answers) => mutate({ scaleType: "PHQ-9", answers })}
      />
    </div>
  );
}
```

Create `apps/web/src/presentation/pages/Gad7AssessmentPage.tsx`:

```tsx
import { GAD7_QUESTIONS } from "../../domain/assessment-scales/gad7";
import { FREQUENCY_RESPONSE_OPTIONS } from "../../domain/assessment-scales/frequency-scale";
import { AssessmentForm } from "../components/AssessmentForm";
import { AssessmentResultBanner } from "../components/AssessmentResultBanner";
import { useSubmitAssessment } from "../hooks/useSubmitAssessment";

export function Gad7AssessmentPage() {
  const { mutate, data, isPending } = useSubmitAssessment();

  if (data) {
    return (
      <AssessmentResultBanner
        totalScore={data.totalScore}
        riskSignal={data.riskSignal}
        submissionSucceeded={data.submissionSucceeded}
      />
    );
  }

  return (
    <div>
      <h1 className="p-4 text-xl font-semibold text-slate-800">Autoavaliação GAD-7</h1>
      <AssessmentForm
        questions={GAD7_QUESTIONS}
        responseOptions={FREQUENCY_RESPONSE_OPTIONS}
        isSubmitting={isPending}
        onSubmit={(answers) => mutate({ scaleType: "GAD-7", answers })}
      />
    </div>
  );
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @zelo/web test`
Expected: PASS — 1 new test passed.

- [ ] **Step 8: Wire the routes**

Modify `apps/web/src/app/router.tsx`:

```tsx
import { createBrowserRouter, Outlet } from "react-router";
import { HomePage } from "../presentation/pages/HomePage";
import { ChatPage } from "../presentation/pages/ChatPage";
import { Phq9AssessmentPage } from "../presentation/pages/Phq9AssessmentPage";
import { Gad7AssessmentPage } from "../presentation/pages/Gad7AssessmentPage";

export const router = createBrowserRouter([
  {
    id: "root",
    path: "/",
    Component: () => <Outlet />,
    children: [
      {
        index: true,
        Component: HomePage,
      },
      {
        path: "chat",
        Component: ChatPage,
      },
      {
        path: "assessment/phq9",
        Component: Phq9AssessmentPage,
      },
      {
        path: "assessment/gad7",
        Component: Gad7AssessmentPage,
      },
    ],
  },
]);
```

(This project uses React Router, established in Plan 03 — `phq9Route`/`gad7Route` are two more objects in the root route's `children` array, alongside the entries Plans 03/05 already added.)

- [ ] **Step 9: Run the full frontend build and test suite**

Run: `pnpm --filter @zelo/web build && pnpm --filter @zelo/web test`
Expected: both complete without error.

- [ ] **Step 10: Commit**

```bash
git add apps/web
git commit -m "feat(web): add PHQ-9/GAD-7 assessment wizard UI and routes"
```

---

### Task 7: Full pipeline verification and manual end-to-end check

**Files:** none created — verification only.

- [ ] **Step 1: Run the full automated pipeline from the monorepo root**

```bash
pnpm install
pnpm build
pnpm lint
pnpm run lint:boundaries
pnpm test
```

Expected: all pass across `@zelo/domain`, `@zelo/api`, and `@zelo/web` (requires the Postgres container from Plan 02 running).

- [ ] **Step 2: Manually verify the full assessment flow in a browser**

Run: `pnpm --filter @zelo/api start` and `pnpm --filter @zelo/web dev`. Open `http://localhost:5173/assessment/phq9`.

Fill in all 9 questions with "Nenhuma vez" except item 9 ("Pensar em se ferir...") answered "Vários dias", then submit.

Expected: the result page shows your total score, a red risk banner, and the "Falar com uma pessoa real" panel opens automatically showing CVV 188 — all without any visible delay waiting on the network (this is entirely client-side).

Open browser DevTools → Network tab, inspect the `POST /assessments` request body.

Expected: the request body contains only `id`, `scaleType`, `capturedAt`, `ciphertext` — no `answers` field, no `riskSignal` field, and `ciphertext` is not human-readable.

**What was actually verified (no browser available in this environment):** the exact same `POST /assessments` contract was exercised directly against a running `apps/api` with `curl`, against a real Postgres container, with the three privacy proofs re-confirmed live (not just via the automated test suite): (1) a valid ciphertext-only payload → `201 { id }`; (2) a payload with a raw `answers` array and no `ciphertext` → `400`, Zod reporting `ciphertext: ["Required"]`; (3) a payload with valid `ciphertext` *and* an extra `riskSignal: true` field → `201`, accepted normally. For (3), queried the live Postgres row directly afterward (`SELECT * FROM assessments WHERE id = '...'`) — the returned row has exactly five columns (`id`, `scaleType`, `capturedAt`, `ciphertext`, `createdAt`) and `\d assessments` confirms the table itself has no `riskSignal` column at all. This is a stronger proof than a single accepted request: it's not that `riskSignal` happened to be dropped for this payload, it is architecturally impossible for the column to exist. The frontend-side claim (result page rendering, Network tab inspection, IndexedDB inspection) was not visually verified since no browser is available in this environment — deferred to whoever next runs this manually with a real browser.

- [ ] **Step 3: Verify data survives a page reload (IndexedDB persistence)**

Open DevTools → Application → IndexedDB → `zelo-assessments` → `records`.

Expected: one record matching the assessment just submitted, including `riskSignal: true` (present locally, confirming the local-vs-backend split works as designed).

**Not independently verified** (no browser available) — but `IndexedDbAssessmentStoreAdapter.test.ts` (Task 4) already proves this exact behavior against `fake-indexeddb`: saving an `AssessmentRecord` with `riskSignal: true` and reading it back via `listAll()` returns the same record including `riskSignal`.

- [ ] **Step 4: Commit** (only if any file changed during manual verification — typically none will)

If `git status --short` shows no changes, skip this step.

---

## Definition of Done

- `pnpm test` passes across all workspace packages, including three privacy-guarantee tests in `assessment.controller.test.ts`: raw answers rejected, `riskSignal` silently stripped, valid ciphertext-only payload accepted.
- PHQ-9 and GAD-7 are fully implemented (public-domain instruments); MBI-HSS explicitly throws a documented "not implemented — licensing" error rather than silently scoring wrong (PRD's "ou subconjunto validado" allowance).
- `ScoreAssessmentUseCase` computes total score and the PHQ-9 item-9 risk signal with zero network calls (PRD FR-1, FR-2, FR-3).
- `EncryptAssessmentUseCase` + `WebCryptoEncryptionAdapter` encrypt raw answers with AES-256-GCM before anything is persisted, using a key that never leaves the device (PRD FR-14).
- The local IndexedDB record (`AssessmentRecord`) includes `riskSignal`; the backend wire contract (`Assessment`/`AssessmentSchema`) does not and cannot, by construction (spec Section G) — proven by both a frontend unit test (`submit-assessment.usecase.test.ts`) and a backend e2e test (`assessment.controller.test.ts`).
- A failed backend submission never blocks the user from seeing their score or loses their local record (PRD's documented offline edge case).
- The risk-signal UI path (result banner + human handoff panel) appears immediately on-device with no additional server round-trip, matching spec Section G's privacy diagram.
