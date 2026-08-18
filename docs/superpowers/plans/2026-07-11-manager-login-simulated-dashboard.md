# Manager Login + Simulated Dashboard Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `ManagerDashboardPage` a real, working shared-code login gate and real (simulated, not real-encrypted) department-level burnout signal data, replacing the hardcoded `SEGMENTS` array — matching `docs/superpowers/specs/2026-07-11-manager-login-simulated-dashboard-design.md`.

**Architecture:** A new `apps/api/src/modules/manager/` NestJS module exposes `POST /manager/login` (shared-code auth, issues an HMAC-signed opaque token) and `GET /manager/signals` (bearer-token gated, aggregates a new `SimulatedSignal` Prisma table with server-side k≥5 suppression). A new `apps/api/prisma/seed.ts` populates 6 weeks of fabricated department data. On the frontend, a new `ManagerLoginPage` + `useManagerSessionStore` (Zustand, sessionStorage) gate a router loader on the existing `/manager` route, and `ManagerDashboardPage` is rewired from the hardcoded array to a `useManagerSignals()` query hook.

**Tech Stack:** NestJS 10, Prisma 7, Zod, Vitest + supertest (backend); React 19, TanStack Query 5, Zustand 5, React Router 8, Vitest + Testing Library (frontend). No new dependencies.

## Global Constraints

- k-anonymity, k=5, enforced **server-side**: a department with `n < 5` check-ins in the current week is never constructed into the API response, never serialized.
- The manager login must be real (server-enforced), even though the data behind it is simulated.
- `SimulatedSignal` is a separate Prisma model/table from `Assessment` — never joined with, derived from, or written to the same table.
- Doctors get no accounts, no login, no change to their existing anonymous flow — this plan touches nothing on the doctor-facing side except where one existing link (`"Ver painel do gestor (demo)"`) now leads.
- `MANAGER_TOKEN_SECRET` and the code comparison use `crypto.timingSafeEqual` (via a shared `timingSafeStringEqual` helper), not `===`, to avoid a timing side-channel.
- The "concerning" rule (a check-in counts as concerning if it would score "Moderado" or worse) and the k=5 threshold are each defined in exactly **one** place in code (`prisma/seed-data.ts`'s `SCENARIOS` table, and `application/constants.ts`'s `K_ANONYMITY_THRESHOLD` respectively) — no other file hardcodes either.
- `apps/api/prisma/README.md` documents the seed scenario and both rules above, linking back to the design spec, so they're discoverable without reading script source.

---

### Task 1: `SimulatedSignal` model, seed data generator, and seed script

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/seed-data.ts`
- Test: `apps/api/prisma/seed-data.test.ts`
- Create: `apps/api/prisma/seed.ts`
- Create: `apps/api/prisma/README.md`
- Modify: `apps/api/package.json`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Produces: `SimulatedSignal` Prisma model (`department: string`, `weekStart: DateTime`, `checkIns: Int`, `concerning: Int`); `buildSeedRows(referenceDate: Date): SimulatedSignalSeedRow[]` and `startOfIsoWeek(date: Date): Date` (both exported from `prisma/seed-data.ts`, used only by `seed.ts` — no other task imports these).
- Consumes: nothing from other tasks. `MANAGER_ACCESS_CODE` / `MANAGER_TOKEN_SECRET` env var **names** are established here (in `.env.example`) and consumed by Task 2/3 as string keys — no code dependency, just a documented contract.

- [ ] **Step 1: Start the local database**

Run: `docker compose -f docker/docker-compose.yml up -d`
Expected: Postgres container running (check with `docker compose -f docker/docker-compose.yml ps`).

- [ ] **Step 2: Add the `SimulatedSignal` model**

Edit `apps/api/prisma/schema.prisma`, appending after the existing `Assessment` model:

```prisma
model SimulatedSignal {
  id         String   @id @default(cuid())
  department String
  weekStart  DateTime
  checkIns   Int
  concerning Int
  createdAt  DateTime @default(now())

  @@unique([department, weekStart])
  @@map("simulated_signals")
}
```

- [ ] **Step 3: Generate and run the migration**

Run: `pnpm --filter @zelo/api exec prisma migrate dev --name add_simulated_signal`
Expected: a new directory under `apps/api/prisma/migrations/` containing the generated SQL, and `Your database is now in sync with your schema.` in the output. This also regenerates the Prisma client at `apps/api/generated/prisma`.

- [ ] **Step 4: Write the failing test for the seed data generator**

Create `apps/api/prisma/seed-data.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSeedRows, startOfIsoWeek } from "./seed-data.ts";

describe("startOfIsoWeek", () => {
  it("resolves a Wednesday back to that week's Monday", () => {
    const wednesday = new Date("2026-07-08T15:00:00.000Z");
    expect(startOfIsoWeek(wednesday).toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });

  it("resolves a Sunday back to that same week's Monday, not forward", () => {
    const sunday = new Date("2026-07-12T15:00:00.000Z");
    expect(startOfIsoWeek(sunday).toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });
});

describe("buildSeedRows", () => {
  const reference = new Date("2026-07-08T12:00:00.000Z"); // a Wednesday, week of 2026-07-06

  it("produces 6 weeks x 4 departments = 24 rows", () => {
    expect(buildSeedRows(reference)).toHaveLength(24);
  });

  it("keeps Ambulatório under the k=5 threshold every week", () => {
    const rows = buildSeedRows(reference).filter((r) => r.department === "Ambulatório");
    expect(rows.every((r) => r.checkIns < 5)).toBe(true);
  });

  it("UTI's concerning rate climbs from week 1 to week 6, ending at 60%", () => {
    const rows = buildSeedRows(reference)
      .filter((r) => r.department === "UTI")
      .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());

    const firstRate = rows[0]!.concerning / rows[0]!.checkIns;
    const lastRate = rows[5]!.concerning / rows[5]!.checkIns;
    expect(lastRate).toBeGreaterThan(firstRate);
    expect(lastRate).toBe(0.6);
  });

  it("the most recent week's weekStart is the Monday of the reference date's week", () => {
    const rows = buildSeedRows(reference).filter((r) => r.department === "UTI");
    const mostRecent = rows.reduce((a, b) => (a.weekStart > b.weekStart ? a : b));
    expect(mostRecent.weekStart.toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api exec vitest run prisma/seed-data.test.ts`
Expected: FAIL — `Cannot find module './seed-data.ts'`.

- [ ] **Step 6: Implement the seed data generator**

Create `apps/api/prisma/seed-data.ts`:

```ts
export interface SimulatedSignalSeedRow {
  department: string;
  weekStart: Date;
  checkIns: number;
  concerning: number;
}

const WEEKS_TO_SEED = 6;

/** Monday 00:00 UTC of the ISO week containing `date` — same convention as apps/web's GetAssessmentHistoryUseCase. */
export function startOfIsoWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Sunday(0) -> 7, so Monday(1) is always the start
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Per-department, per-week checkIns and concerning counts, oldest week first (index 0 = 5
// weeks ago, index 5 = current week). See
// docs/superpowers/specs/2026-07-11-manager-login-simulated-dashboard-design.md §3 for what
// "concerning" means and why these specific numbers were chosen. Edit ONLY this table (and
// the mirrored numbers in prisma/README.md) to change the demo scenario.
const SCENARIOS: { department: string; checkIns: number; concerning: number[] }[] = [
  { department: "Pronto-socorro", checkIns: 24, concerning: [9, 9, 9, 9, 9, 9] },
  { department: "Plantão noturno", checkIns: 18, concerning: [9, 9, 9, 9, 9, 9] },
  { department: "UTI", checkIns: 10, concerning: [3, 4, 4, 5, 6, 6] },
  { department: "Ambulatório", checkIns: 3, concerning: [1, 1, 1, 1, 1, 1] },
];

export function buildSeedRows(referenceDate: Date): SimulatedSignalSeedRow[] {
  const currentWeekStart = startOfIsoWeek(referenceDate);
  const rows: SimulatedSignalSeedRow[] = [];

  for (const scenario of SCENARIOS) {
    for (let i = 0; i < WEEKS_TO_SEED; i++) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setUTCDate(weekStart.getUTCDate() - (WEEKS_TO_SEED - 1 - i) * 7);
      rows.push({
        department: scenario.department,
        weekStart,
        checkIns: scenario.checkIns,
        concerning: scenario.concerning[i]!,
      });
    }
  }

  return rows;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api exec vitest run prisma/seed-data.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 8: Write the DB-writing seed script**

Create `apps/api/prisma/seed.ts`:

```ts
import { PrismaService } from "../src/shared/prisma/prisma.service.ts";
import { buildSeedRows } from "./seed-data.ts";

async function main() {
  const prisma = new PrismaService();
  const rows = buildSeedRows(new Date());

  await prisma.simulatedSignal.deleteMany();
  await prisma.simulatedSignal.createMany({ data: rows });

  console.log(`Seeded ${rows.length} SimulatedSignal rows.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

This reuses `PrismaService`'s existing Neon-vs-local-Postgres adapter selection (see `apps/api/src/shared/prisma/prisma.service.ts`) instead of duplicating it — the script works unmodified against either a local Docker Postgres or a real Neon `DATABASE_URL`.

- [ ] **Step 9: Wire the seed command**

Edit `apps/api/package.json`. Add `"prisma:seed": "prisma db seed"` to `"scripts"`, and add a new top-level `"prisma"` field (sibling of `"scripts"`, `"dependencies"`, etc.):

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

- [ ] **Step 10: Add the manager env vars**

Edit `apps/api/.env.example`, appending:

```
MANAGER_ACCESS_CODE=zelo-demo-2026
MANAGER_TOKEN_SECRET=change-me-in-production
```

Copy the same two lines into your local `apps/api/.env` (not committed) so Task 2 onward has real values to run against.

- [ ] **Step 11: Run the seed script against the real local database**

Run: `pnpm --filter @zelo/api prisma:seed`
Expected: `Seeded 24 SimulatedSignal rows.` Verify with `pnpm --filter @zelo/api exec prisma studio` (optional) or a direct query — 24 rows in `simulated_signals`, 4 distinct `department` values.

- [ ] **Step 12: Write the seed documentation**

Create `apps/api/prisma/README.md`:

```markdown
# apps/api/prisma

## Seeding simulated manager-dashboard data

`pnpm --filter @zelo/api prisma:seed` populates the `simulated_signals` table with 6 weeks
of fabricated department check-in data, powering `ManagerDashboardPage`. This is
**demo data, not real assessment data** — see
`docs/superpowers/specs/2026-07-11-manager-login-simulated-dashboard-design.md` for why the
manager dashboard can never read real (encrypted) assessments.

The script is idempotent: it deletes all existing `SimulatedSignal` rows and regenerates
them relative to today's date, so re-running it mid-demo always produces a fresh, current
6-week window with no manual cleanup.

**"Concerning" rule:** a simulated check-in counts as concerning if it would have scored
"Moderado" or worse on the app's existing PHQ-9/GAD-7 severity bands (`apps/web/src/presentation/lib/band-for.ts`).
To change this bar, edit both the design spec (§3) and `seed-data.ts`'s `SCENARIOS` table —
nothing else in the pipeline encodes this rule.

**k-anonymity threshold:** `K_ANONYMITY_THRESHOLD = 5`, defined in
`../src/modules/manager/application/constants.ts`. A department's data is only ever
returned by `GET /api/manager/signals` for weeks where it has at least this many check-ins.

**Seed scenario** (`seed-data.ts`'s `SCENARIOS`):

| Department | checkIns/week | Concerning rate | Purpose |
|---|---|---|---|
| Pronto-socorro | 24 | flat 37.5% | baseline "normal" department |
| Plantão noturno | 18 | flat 50% | baseline "elevated but stable" |
| UTI | 10 | climbing 30% → 60% | demo narrative — visibly worsening trend |
| Ambulatório | 3 | irrelevant | always below k=5, proves suppression works |
```

- [ ] **Step 13: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/prisma/seed-data.ts apps/api/prisma/seed-data.test.ts apps/api/prisma/seed.ts apps/api/prisma/README.md apps/api/package.json apps/api/.env.example
git commit -m "feat(api): add SimulatedSignal model, seed data generator, and seed script"
```

---

### Task 2: `ManagerTokenService` and `LoginManagerUseCase`

**Files:**
- Create: `apps/api/src/modules/manager/application/services/timing-safe-equal.ts`
- Create: `apps/api/src/modules/manager/application/services/manager-token.service.ts`
- Test: `apps/api/src/modules/manager/application/services/manager-token.service.test.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/login-manager.use-case.ts`
- Test: `apps/api/src/modules/manager/application/use-cases/login-manager.use-case.test.ts`

**Interfaces:**
- Consumes: `MANAGER_ACCESS_CODE` / `MANAGER_TOKEN_SECRET` env var names (Task 1, `.env.example`), read via `ConfigService.getOrThrow`.
- Produces: `timingSafeStringEqual(a: string, b: string): boolean`; `ManagerTokenService` with `issue(): IssuedManagerToken` and `verify(token: string): boolean`; `IssuedManagerToken { token: string; expiresAt: string }`; `LoginManagerUseCase` with `execute(code: string): IssuedManagerToken`; `InvalidManagerCodeError`. Task 3's `ManagerAuthGuard` consumes `ManagerTokenService.verify`. Task 4's controller consumes `LoginManagerUseCase.execute` and `InvalidManagerCodeError`.

- [ ] **Step 1: Write the failing test for `timingSafeStringEqual`**

Create `apps/api/src/modules/manager/application/services/timing-safe-equal.ts` as an empty stub first is unnecessary — write the test against the real implementation directly since this is a 4-line pure function. Create the test:

Create `apps/api/src/modules/manager/application/services/manager-token.service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { ManagerTokenService } from "./manager-token.service.ts";

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

describe("ManagerTokenService", () => {
  it("issues a token that verify() accepts", () => {
    const service = new ManagerTokenService(fakeConfig("test-secret"));
    const { token, expiresAt } = service.issue();

    expect(service.verify(token)).toBe(true);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects a token signed with a different secret", () => {
    const issuer = new ManagerTokenService(fakeConfig("secret-a"));
    const verifier = new ManagerTokenService(fakeConfig("secret-b"));
    const { token } = issuer.issue();

    expect(verifier.verify(token)).toBe(false);
  });

  it("rejects a malformed token", () => {
    const service = new ManagerTokenService(fakeConfig("test-secret"));

    expect(service.verify("not-a-valid-token")).toBe(false);
    expect(service.verify("")).toBe(false);
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    const service = new ManagerTokenService(fakeConfig("test-secret"));
    const { token } = service.issue();

    vi.advanceTimersByTime(9 * 60 * 60 * 1000); // 9h, past the 8h expiry
    expect(service.verify(token)).toBe(false);

    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/application/services/manager-token.service.test.ts`
Expected: FAIL — `Cannot find module './manager-token.service.ts'`.

- [ ] **Step 3: Implement `timingSafeStringEqual`**

Create `apps/api/src/modules/manager/application/services/timing-safe-equal.ts`:

```ts
import { timingSafeEqual } from "node:crypto";

// A length mismatch short-circuits before the constant-time comparison. This leaks the
// *length* of a mismatch via timing, but not its content — an accepted tradeoff for a
// single shared demo credential, not a high-security multi-tenant secret.
export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
```

- [ ] **Step 4: Implement `ManagerTokenService`**

Create `apps/api/src/modules/manager/application/services/manager-token.service.ts`:

```ts
import { createHmac, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeStringEqual } from "./timing-safe-equal.ts";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface IssuedManagerToken {
  token: string;
  expiresAt: string;
}

@Injectable()
export class ManagerTokenService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  issue(): IssuedManagerToken {
    const sessionId = randomUUID();
    const expiresAtEpoch = Date.now() + SESSION_DURATION_MS;
    const payloadB64 = Buffer.from(`${sessionId}.${expiresAtEpoch}`).toString("base64url");
    const signature = this.sign(payloadB64);

    return { token: `${payloadB64}.${signature}`, expiresAt: new Date(expiresAtEpoch).toISOString() };
  }

  verify(token: string): boolean {
    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) return false;

    const expectedSignature = this.sign(payloadB64);
    if (!timingSafeStringEqual(signature, expectedSignature)) return false;

    const payload = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const expiresAtEpoch = Number(payload.split(".")[1]);
    if (!Number.isFinite(expiresAtEpoch)) return false;

    return Date.now() < expiresAtEpoch;
  }

  private sign(payloadB64: string): string {
    return createHmac("sha256", this.config.getOrThrow<string>("MANAGER_TOKEN_SECRET"))
      .update(payloadB64)
      .digest("base64url");
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/application/services/manager-token.service.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing test for `LoginManagerUseCase`**

Create `apps/api/src/modules/manager/application/use-cases/login-manager.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { LoginManagerUseCase, InvalidManagerCodeError } from "./login-manager.use-case.ts";
import { ManagerTokenService } from "../services/manager-token.service.ts";

function fakeConfig(values: Record<string, string>): ConfigService {
  return { getOrThrow: (key: string) => values[key], get: () => undefined } as unknown as ConfigService;
}

describe("LoginManagerUseCase", () => {
  it("issues a token when the code matches MANAGER_ACCESS_CODE", () => {
    const config = fakeConfig({ MANAGER_ACCESS_CODE: "secret-code", MANAGER_TOKEN_SECRET: "token-secret" });
    const useCase = new LoginManagerUseCase(config, new ManagerTokenService(config));

    const result = useCase.execute("secret-code");

    expect(result.token).toEqual(expect.any(String));
    expect(result.expiresAt).toEqual(expect.any(String));
  });

  it("throws InvalidManagerCodeError when the code does not match", () => {
    const config = fakeConfig({ MANAGER_ACCESS_CODE: "secret-code", MANAGER_TOKEN_SECRET: "token-secret" });
    const useCase = new LoginManagerUseCase(config, new ManagerTokenService(config));

    expect(() => useCase.execute("wrong-code")).toThrow(InvalidManagerCodeError);
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/application/use-cases/login-manager.use-case.test.ts`
Expected: FAIL — `Cannot find module './login-manager.use-case.ts'`.

- [ ] **Step 8: Implement `LoginManagerUseCase`**

Create `apps/api/src/modules/manager/application/use-cases/login-manager.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ManagerTokenService, type IssuedManagerToken } from "../services/manager-token.service.ts";
import { timingSafeStringEqual } from "../services/timing-safe-equal.ts";

export class InvalidManagerCodeError extends Error {}

@Injectable()
export class LoginManagerUseCase {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ManagerTokenService) private readonly tokenService: ManagerTokenService,
  ) {}

  execute(code: string): IssuedManagerToken {
    const expectedCode = this.config.getOrThrow<string>("MANAGER_ACCESS_CODE");
    if (!timingSafeStringEqual(code, expectedCode)) {
      throw new InvalidManagerCodeError();
    }
    return this.tokenService.issue();
  }
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/application/use-cases/login-manager.use-case.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/manager/application/services apps/api/src/modules/manager/application/use-cases/login-manager.use-case.ts apps/api/src/modules/manager/application/use-cases/login-manager.use-case.test.ts
git commit -m "feat(api): add ManagerTokenService and LoginManagerUseCase"
```

---

### Task 3: `GetManagerSignalsUseCase`, repository port, and `ManagerAuthGuard`

**Files:**
- Create: `apps/api/src/modules/manager/application/constants.ts`
- Create: `apps/api/src/modules/manager/application/ports/simulated-signal-repository.port.ts`
- Create: `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts`
- Test: `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`
- Create: `apps/api/src/modules/manager/infrastructure/manager-auth.guard.ts`
- Test: `apps/api/src/modules/manager/infrastructure/manager-auth.guard.test.ts`
- Create: `apps/api/src/modules/manager/infrastructure/persistence/prisma-simulated-signal.repository.ts`

**Interfaces:**
- Consumes: `ManagerTokenService` (Task 2) in the guard; `SimulatedSignal` Prisma model (Task 1) in the repository implementation.
- Produces: `K_ANONYMITY_THRESHOLD = 5`; `SimulatedSignalRow { department: string; weekStart: Date; checkIns: number; concerning: number }`, `SimulatedSignalRepository { findAll(): Promise<SimulatedSignalRow[]> }`, `SIMULATED_SIGNAL_REPOSITORY` DI token; `GetManagerSignalsUseCase.execute(): Promise<ManagerSignalsResponse>`; `ManagerSignalsResponse { overallConcerningRate: number; checkInsLast4Weeks: number; weeklyTrend: { weekStart: string; concerningRate: number }[]; segments: { label: string; value: number; n: number }[] }`; `ManagerAuthGuard` (`CanActivate`); `PrismaSimulatedSignalRepository`. Task 4 consumes all of these.

**Aggregation semantics (resolves an ambiguity the design spec left implicit — pin this down exactly):**
`segments` reflects only the **single most recent week** present in the data (a "right now" snapshot per department, filtered to `n >= K_ANONYMITY_THRESHOLD`). `overallConcerningRate` is the same most-recent-week snapshot, weighted-averaged across only the visible (`n >= 5`) departments. `checkInsLast4Weeks` and `weeklyTrend` are both **org-wide sums across all departments, including any suppressed one** (safe because a per-week sum never isolates the small department's individual contribution) — `checkInsLast4Weeks` sums the trailing 4 weeks found in the data (or fewer, if less than 4 weeks exist), `weeklyTrend` returns one point per **distinct week found in the data** (not hardcoded to 6 — the real seed produces 6, but the use-case itself is generic).

- [ ] **Step 1: Add the k-anonymity constant**

Create `apps/api/src/modules/manager/application/constants.ts`:

```ts
export const K_ANONYMITY_THRESHOLD = 5;
```

- [ ] **Step 2: Add the repository port**

Create `apps/api/src/modules/manager/application/ports/simulated-signal-repository.port.ts`:

```ts
export interface SimulatedSignalRow {
  department: string;
  weekStart: Date;
  checkIns: number;
  concerning: number;
}

export interface SimulatedSignalRepository {
  findAll(): Promise<SimulatedSignalRow[]>;
}

export const SIMULATED_SIGNAL_REPOSITORY = Symbol("SIMULATED_SIGNAL_REPOSITORY");
```

- [ ] **Step 3: Write the failing tests for `GetManagerSignalsUseCase`**

Create `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GetManagerSignalsUseCase } from "./get-manager-signals.use-case.ts";
import type { SimulatedSignalRepository, SimulatedSignalRow } from "../ports/simulated-signal-repository.port.ts";

class FakeSimulatedSignalRepository implements SimulatedSignalRepository {
  constructor(private readonly rows: SimulatedSignalRow[]) {}
  async findAll(): Promise<SimulatedSignalRow[]> {
    return this.rows;
  }
}

const WEEK_1 = new Date("2026-06-15T00:00:00.000Z");
const WEEK_2 = new Date("2026-06-22T00:00:00.000Z"); // most recent

describe("GetManagerSignalsUseCase", () => {
  it("computes segments from the most recent week only, excluding departments under k=5", async () => {
    const repository = new FakeSimulatedSignalRepository([
      { department: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { department: "A", weekStart: WEEK_1, checkIns: 10, concerning: 3 },
      { department: "C", weekStart: WEEK_1, checkIns: 4, concerning: 2 },
      { department: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { department: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
      { department: "B", weekStart: WEEK_1, checkIns: 10, concerning: 4 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository);

    const result = await useCase.execute();

    expect(result.segments).toEqual(
      expect.arrayContaining([
        { label: "A", value: 60, n: 10 },
        { label: "B", value: 40, n: 10 },
      ]),
    );
    expect(result.segments).toHaveLength(2); // "C" (n=4) suppressed
  });

  it("computes overallConcerningRate from only the visible departments' most recent week", async () => {
    const repository = new FakeSimulatedSignalRepository([
      { department: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { department: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { department: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository);

    const result = await useCase.execute();

    expect(result.overallConcerningRate).toBe(0.5); // (6+4)/(10+10), C excluded
  });

  it("computes weeklyTrend and checkInsLast4Weeks as org-wide sums including the suppressed department", async () => {
    const repository = new FakeSimulatedSignalRepository([
      { department: "A", weekStart: WEEK_1, checkIns: 10, concerning: 3 },
      { department: "A", weekStart: WEEK_2, checkIns: 10, concerning: 6 },
      { department: "B", weekStart: WEEK_1, checkIns: 10, concerning: 4 },
      { department: "B", weekStart: WEEK_2, checkIns: 10, concerning: 4 },
      { department: "C", weekStart: WEEK_1, checkIns: 4, concerning: 2 },
      { department: "C", weekStart: WEEK_2, checkIns: 4, concerning: 2 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository);

    const result = await useCase.execute();

    expect(result.weeklyTrend).toEqual([
      { weekStart: WEEK_1.toISOString(), concerningRate: 0.375 }, // (3+4+2)/(10+10+4)
      { weekStart: WEEK_2.toISOString(), concerningRate: 0.5 }, // (6+4+2)/(10+10+4)
    ]);
    expect(result.checkInsLast4Weeks).toBe(48); // both weeks, all 3 departments: 24+24
  });

  it("sums only the trailing 4 weeks for checkInsLast4Weeks when more than 4 weeks exist", async () => {
    const weeks = [
      new Date("2026-06-01T00:00:00.000Z"),
      new Date("2026-06-08T00:00:00.000Z"),
      new Date("2026-06-15T00:00:00.000Z"),
      new Date("2026-06-22T00:00:00.000Z"),
      new Date("2026-06-29T00:00:00.000Z"),
    ];
    const repository = new FakeSimulatedSignalRepository(
      weeks.map((weekStart) => ({ department: "A", weekStart, checkIns: 10, concerning: 5 })),
    );
    const useCase = new GetManagerSignalsUseCase(repository);

    const result = await useCase.execute();

    expect(result.checkInsLast4Weeks).toBe(40); // trailing 4 of 5 weeks, not all 5 (which would be 50)
    expect(result.weeklyTrend).toHaveLength(5); // but the trend still returns every week
  });

  it("returns 0 for overallConcerningRate (not NaN) when every department is suppressed", async () => {
    const repository = new FakeSimulatedSignalRepository([
      { department: "Tiny", weekStart: WEEK_2, checkIns: 2, concerning: 1 },
    ]);
    const useCase = new GetManagerSignalsUseCase(repository);

    const result = await useCase.execute();

    expect(result.segments).toEqual([]);
    expect(result.overallConcerningRate).toBe(0);
    expect(result.checkInsLast4Weeks).toBe(2); // org-wide sum still includes the suppressed dept
  });

  it("returns all-zero/empty output for an unseeded (empty) database, without crashing", async () => {
    const repository = new FakeSimulatedSignalRepository([]);
    const useCase = new GetManagerSignalsUseCase(repository);

    const result = await useCase.execute();

    expect(result).toEqual({
      overallConcerningRate: 0,
      checkInsLast4Weeks: 0,
      weeklyTrend: [],
      segments: [],
    });
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`
Expected: FAIL — `Cannot find module './get-manager-signals.use-case.ts'`.

- [ ] **Step 5: Implement `GetManagerSignalsUseCase`**

Create `apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { K_ANONYMITY_THRESHOLD } from "../constants.ts";
import {
  SIMULATED_SIGNAL_REPOSITORY,
  type SimulatedSignalRepository,
  type SimulatedSignalRow,
} from "../ports/simulated-signal-repository.port.ts";

export interface ManagerSignalsResponse {
  overallConcerningRate: number;
  checkInsLast4Weeks: number;
  weeklyTrend: { weekStart: string; concerningRate: number }[];
  segments: { label: string; value: number; n: number }[];
}

const RECENT_WEEKS_FOR_VOLUME = 4;

@Injectable()
export class GetManagerSignalsUseCase {
  constructor(@Inject(SIMULATED_SIGNAL_REPOSITORY) private readonly repository: SimulatedSignalRepository) {}

  async execute(): Promise<ManagerSignalsResponse> {
    const rows = await this.repository.findAll();
    if (rows.length === 0) {
      return { overallConcerningRate: 0, checkInsLast4Weeks: 0, weeklyTrend: [], segments: [] };
    }

    const weekTimes = [...new Set(rows.map((r) => r.weekStart.getTime()))].sort((a, b) => a - b);
    const mostRecentWeek = weekTimes[weekTimes.length - 1]!;

    const byDepartment = new Map<string, SimulatedSignalRow[]>();
    for (const row of rows) {
      const list = byDepartment.get(row.department) ?? [];
      list.push(row);
      byDepartment.set(row.department, list);
    }

    const segments: { label: string; value: number; n: number }[] = [];
    let visibleConcerning = 0;
    let visibleCheckIns = 0;

    for (const [department, deptRows] of byDepartment) {
      const currentWeekRow = deptRows.find((r) => r.weekStart.getTime() === mostRecentWeek);
      if (!currentWeekRow || currentWeekRow.checkIns < K_ANONYMITY_THRESHOLD) continue;

      segments.push({
        label: department,
        value: Math.round((currentWeekRow.concerning / currentWeekRow.checkIns) * 100),
        n: currentWeekRow.checkIns,
      });
      visibleConcerning += currentWeekRow.concerning;
      visibleCheckIns += currentWeekRow.checkIns;
    }

    const overallConcerningRate = visibleCheckIns === 0 ? 0 : visibleConcerning / visibleCheckIns;

    const recentWeekTimes = new Set(weekTimes.slice(-RECENT_WEEKS_FOR_VOLUME));
    const checkInsLast4Weeks = rows
      .filter((r) => recentWeekTimes.has(r.weekStart.getTime()))
      .reduce((sum, r) => sum + r.checkIns, 0);

    const weeklyTrend = weekTimes.map((weekTime) => {
      const weekRows = rows.filter((r) => r.weekStart.getTime() === weekTime);
      const totalCheckIns = weekRows.reduce((sum, r) => sum + r.checkIns, 0);
      const totalConcerning = weekRows.reduce((sum, r) => sum + r.concerning, 0);
      return {
        weekStart: new Date(weekTime).toISOString(),
        concerningRate: totalCheckIns === 0 ? 0 : totalConcerning / totalCheckIns,
      };
    });

    return { overallConcerningRate, checkInsLast4Weeks, weeklyTrend, segments };
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Write the failing tests for `ManagerAuthGuard`**

Create `apps/api/src/modules/manager/infrastructure/manager-auth.guard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { ManagerAuthGuard } from "./manager-auth.guard.ts";
import { ManagerTokenService } from "../application/services/manager-token.service.ts";

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

function contextWithHeader(authorization: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  } as unknown as ExecutionContext;
}

describe("ManagerAuthGuard", () => {
  const tokenService = new ManagerTokenService(fakeConfig("test-secret"));
  const guard = new ManagerAuthGuard(tokenService);

  it("allows a request with a valid Bearer token", () => {
    const { token } = tokenService.issue();
    expect(guard.canActivate(contextWithHeader(`Bearer ${token}`))).toBe(true);
  });

  it("rejects a request with no Authorization header", () => {
    expect(() => guard.canActivate(contextWithHeader(undefined))).toThrow(UnauthorizedException);
  });

  it("rejects a request with a malformed or tampered token", () => {
    expect(() => guard.canActivate(contextWithHeader("Bearer not-a-real-token"))).toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 8: Run the tests to verify they fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/infrastructure/manager-auth.guard.test.ts`
Expected: FAIL — `Cannot find module './manager-auth.guard.ts'`.

- [ ] **Step 9: Implement `ManagerAuthGuard`**

Create `apps/api/src/modules/manager/infrastructure/manager-auth.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { ManagerTokenService } from "../application/services/manager-token.service.ts";

@Injectable()
export class ManagerAuthGuard implements CanActivate {
  constructor(@Inject(ManagerTokenService) private readonly tokenService: ManagerTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice("Bearer ".length);
    if (!this.tokenService.verify(token)) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/infrastructure/manager-auth.guard.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 11: Implement the Prisma repository (no dedicated test — exercised by Task 4's controller test and manual verification)**

Create `apps/api/src/modules/manager/infrastructure/persistence/prisma-simulated-signal.repository.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { SimulatedSignalRepository, SimulatedSignalRow } from "../../application/ports/simulated-signal-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaSimulatedSignalRepository implements SimulatedSignalRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll(): Promise<SimulatedSignalRow[]> {
    const rows = await this.prisma.simulatedSignal.findMany();
    return rows.map((row) => ({
      department: row.department,
      weekStart: row.weekStart,
      checkIns: row.checkIns,
      concerning: row.concerning,
    }));
  }
}
```

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/modules/manager/application/constants.ts apps/api/src/modules/manager/application/ports apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.ts apps/api/src/modules/manager/application/use-cases/get-manager-signals.use-case.test.ts apps/api/src/modules/manager/infrastructure
git commit -m "feat(api): add GetManagerSignalsUseCase, ManagerAuthGuard, and Prisma repository"
```

---

### Task 4: `ManagerController`, `ManagerModule`, and app registration

**Files:**
- Create: `apps/api/src/modules/manager/infrastructure/manager.controller.ts`
- Test: `apps/api/src/modules/manager/infrastructure/manager.controller.test.ts`
- Create: `apps/api/src/modules/manager/manager.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `LoginManagerUseCase`/`InvalidManagerCodeError` (Task 2); `GetManagerSignalsUseCase`/`ManagerSignalsResponse`/`ManagerAuthGuard` (Task 3); `PrismaSimulatedSignalRepository`/`SIMULATED_SIGNAL_REPOSITORY` (Task 3).
- Produces: working `POST /manager/login` and `GET /manager/signals` HTTP endpoints — this is what the frontend (Tasks 6-7) calls.

- [ ] **Step 1: Write the failing controller tests**

Create `apps/api/src/modules/manager/infrastructure/manager.controller.test.ts`:

```ts
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { ManagerController } from "./manager.controller.ts";
import { ManagerAuthGuard } from "./manager-auth.guard.ts";
import { LoginManagerUseCase } from "../application/use-cases/login-manager.use-case.ts";
import { GetManagerSignalsUseCase } from "../application/use-cases/get-manager-signals.use-case.ts";
import { ManagerTokenService } from "../application/services/manager-token.service.ts";
import { SIMULATED_SIGNAL_REPOSITORY } from "../application/ports/simulated-signal-repository.port.ts";
import type { SimulatedSignalRepository, SimulatedSignalRow } from "../application/ports/simulated-signal-repository.port.ts";

class FakeSimulatedSignalRepository implements SimulatedSignalRepository {
  public rows: SimulatedSignalRow[] = [];
  async findAll(): Promise<SimulatedSignalRow[]> {
    return this.rows;
  }
}

function fakeConfig(): ConfigService {
  const values: Record<string, string> = { MANAGER_ACCESS_CODE: "test-code", MANAGER_TOKEN_SECRET: "test-secret" };
  return { getOrThrow: (key: string) => values[key], get: () => undefined } as unknown as ConfigService;
}

describe("manager controller", () => {
  let app: INestApplication;
  let repository: FakeSimulatedSignalRepository;

  beforeAll(async () => {
    repository = new FakeSimulatedSignalRepository();
    const moduleRef = await Test.createTestingModule({
      controllers: [ManagerController],
      providers: [
        LoginManagerUseCase,
        GetManagerSignalsUseCase,
        ManagerTokenService,
        ManagerAuthGuard,
        { provide: SIMULATED_SIGNAL_REPOSITORY, useValue: repository },
        { provide: ConfigService, useValue: fakeConfig() },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /manager/login returns a token for the correct code", async () => {
    const response = await request(app.getHttpServer()).post("/manager/login").send({ code: "test-code" });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.expiresAt).toEqual(expect.any(String));
  });

  it("POST /manager/login rejects the wrong code with 401", async () => {
    const response = await request(app.getHttpServer()).post("/manager/login").send({ code: "wrong-code" });

    expect(response.status).toBe(401);
  });

  it("POST /manager/login rejects a malformed body with 400", async () => {
    const response = await request(app.getHttpServer()).post("/manager/login").send({});

    expect(response.status).toBe(400);
  });

  it("GET /manager/signals rejects a request with no token", async () => {
    const response = await request(app.getHttpServer()).get("/manager/signals");

    expect(response.status).toBe(401);
  });

  it("GET /manager/signals returns aggregated data for a valid token, suppressing n<5 departments", async () => {
    repository.rows = [
      { department: "A", weekStart: new Date("2026-06-22T00:00:00.000Z"), checkIns: 10, concerning: 6 },
      { department: "Tiny", weekStart: new Date("2026-06-22T00:00:00.000Z"), checkIns: 3, concerning: 1 },
    ];

    const login = await request(app.getHttpServer()).post("/manager/login").send({ code: "test-code" });
    const token = login.body.token;

    const response = await request(app.getHttpServer()).get("/manager/signals").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.segments).toEqual([{ label: "A", value: 60, n: 10 }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/infrastructure/manager.controller.test.ts`
Expected: FAIL — `Cannot find module './manager.controller.ts'`.

- [ ] **Step 3: Implement `ManagerController`**

Create `apps/api/src/modules/manager/infrastructure/manager.controller.ts`:

```ts
import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, UnauthorizedException, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { LoginManagerUseCase, InvalidManagerCodeError } from "../application/use-cases/login-manager.use-case.ts";
import { GetManagerSignalsUseCase, type ManagerSignalsResponse } from "../application/use-cases/get-manager-signals.use-case.ts";
import type { IssuedManagerToken } from "../application/services/manager-token.service.ts";
import { ManagerAuthGuard } from "./manager-auth.guard.ts";

const LoginRequestSchema = z.object({ code: z.string().min(1) });

@Controller("manager")
export class ManagerController {
  constructor(
    @Inject(LoginManagerUseCase) private readonly loginManager: LoginManagerUseCase,
    @Inject(GetManagerSignalsUseCase) private readonly getManagerSignals: GetManagerSignalsUseCase,
  ) {}

  @Post("login")
  @HttpCode(200)
  login(@Body() body: unknown): IssuedManagerToken {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return this.loginManager.execute(parsed.data.code);
    } catch (error) {
      if (error instanceof InvalidManagerCodeError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }

  @Get("signals")
  @UseGuards(ManagerAuthGuard)
  async signals(): Promise<ManagerSignalsResponse> {
    return this.getManagerSignals.execute();
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @zelo/api exec vitest run src/modules/manager/infrastructure/manager.controller.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire the module**

Create `apps/api/src/modules/manager/manager.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { ManagerController } from "./infrastructure/manager.controller.ts";
import { ManagerAuthGuard } from "./infrastructure/manager-auth.guard.ts";
import { PrismaSimulatedSignalRepository } from "./infrastructure/persistence/prisma-simulated-signal.repository.ts";
import { LoginManagerUseCase } from "./application/use-cases/login-manager.use-case.ts";
import { GetManagerSignalsUseCase } from "./application/use-cases/get-manager-signals.use-case.ts";
import { ManagerTokenService } from "./application/services/manager-token.service.ts";
import { SIMULATED_SIGNAL_REPOSITORY } from "./application/ports/simulated-signal-repository.port.ts";

@Module({
  controllers: [ManagerController],
  providers: [
    LoginManagerUseCase,
    GetManagerSignalsUseCase,
    ManagerTokenService,
    ManagerAuthGuard,
    { provide: SIMULATED_SIGNAL_REPOSITORY, useClass: PrismaSimulatedSignalRepository },
  ],
})
export class ManagerModule {}
```

- [ ] **Step 6: Register the module**

Edit `apps/api/src/app.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./shared/prisma/prisma.module.ts";
import { HealthModule } from "./modules/health/health.module.ts";
import { ChatModule } from "./modules/chat/chat.module.ts";
import { AssessmentModule } from "./modules/assessment/assessment.module.ts";
import { ManagerModule } from "./modules/manager/manager.module.ts";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    ChatModule,
    AssessmentModule,
    ManagerModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 7: Run the whole backend test suite**

Run: `pnpm --filter @zelo/api test`
Expected: all tests pass, including all Task 1-4 tests plus every pre-existing test.

- [ ] **Step 8: Manually verify against the real seeded database**

With the API running (`pnpm --filter @zelo/api dev`) and the Task 1 seed already applied:

```bash
curl -s -X POST http://localhost:3000/manager/login -H "Content-Type: application/json" -d '{"code":"zelo-demo-2026"}'
```

Expected: `{"token":"...","expiresAt":"..."}`. Copy the token, then:

```bash
curl -s http://localhost:3000/manager/signals -H "Authorization: Bearer <token>"
```

Expected: JSON with `segments` containing exactly 3 entries (Pronto-socorro, Plantão noturno, UTI — Ambulatório absent), `overallConcerningRate` and `checkInsLast4Weeks` as non-zero numbers, `weeklyTrend` with 6 entries.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/manager/infrastructure/manager.controller.ts apps/api/src/modules/manager/infrastructure/manager.controller.test.ts apps/api/src/modules/manager/manager.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): add ManagerController, wire ManagerModule into the app"
```

---

### Task 5: Frontend `useManagerSessionStore`

**Files:**
- Create: `apps/web/src/stores/manager-session.store.ts`
- Test: `apps/web/src/stores/manager-session.store.test.ts`

**Interfaces:**
- Produces: `useManagerSessionStore` (Zustand) with state `{ token: string | null; expiresAt: string | null }` and actions `setSession(token: string, expiresAt: string): void`, `clearSession(): void`, `isValid(): boolean`. Persisted to `sessionStorage` under key `"zelo.manager-session"`. Consumed by Tasks 6 and 7.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/stores/manager-session.store.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { useManagerSessionStore } from "./manager-session.store";

describe("useManagerSessionStore", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useManagerSessionStore.setState({ token: null, expiresAt: null });
  });

  it("starts with no session", () => {
    expect(useManagerSessionStore.getState().token).toBeNull();
    expect(useManagerSessionStore.getState().isValid()).toBe(false);
  });

  it("setSession stores a token, persisted to sessionStorage", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    useManagerSessionStore.getState().setSession("abc.def", future);

    expect(useManagerSessionStore.getState().token).toBe("abc.def");
    expect(useManagerSessionStore.getState().isValid()).toBe(true);

    const persisted = JSON.parse(sessionStorage.getItem("zelo.manager-session")!);
    expect(persisted.state.token).toBe("abc.def");
  });

  it("isValid() returns false once expiresAt is in the past", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    useManagerSessionStore.getState().setSession("abc.def", past);

    expect(useManagerSessionStore.getState().isValid()).toBe(false);
  });

  it("clearSession() removes the token", () => {
    useManagerSessionStore.getState().setSession("abc.def", new Date(Date.now() + 60_000).toISOString());
    useManagerSessionStore.getState().clearSession();

    expect(useManagerSessionStore.getState().token).toBeNull();
    expect(useManagerSessionStore.getState().isValid()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @zelo/web exec vitest run src/stores/manager-session.store.test.ts`
Expected: FAIL — `Cannot find module './manager-session.store'`.

- [ ] **Step 3: Implement the store**

Create `apps/web/src/stores/manager-session.store.ts`:

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ManagerSessionState {
  token: string | null;
  expiresAt: string | null;
  setSession: (token: string, expiresAt: string) => void;
  clearSession: () => void;
  isValid: () => boolean;
}

export const useManagerSessionStore = create<ManagerSessionState>()(
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
    { name: "zelo.manager-session", storage: createJSONStorage(() => sessionStorage) },
  ),
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @zelo/web exec vitest run src/stores/manager-session.store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/stores/manager-session.store.ts apps/web/src/stores/manager-session.store.test.ts
git commit -m "feat(web): add useManagerSessionStore"
```

---

### Task 6: Login flow — port, adapter, use-case, hook, `ManagerLoginPage`

**Files:**
- Create: `apps/web/src/ports/manager-auth.port.ts`
- Create: `apps/web/src/infrastructure/http/http-manager-auth.adapter.ts`
- Create: `apps/web/src/use-cases/login-manager.usecase.ts`
- Test: `apps/web/src/use-cases/login-manager.usecase.test.ts`
- Modify: `apps/web/src/app/container.ts`
- Create: `apps/web/src/presentation/hooks/useManagerLogin.ts`
- Modify: `apps/web/src/presentation/lib/routes.ts`
- Create: `apps/web/src/presentation/pages/ManagerLoginPage.tsx`
- Test: `apps/web/src/presentation/pages/ManagerLoginPage.test.tsx`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**
- Consumes: `useManagerSessionStore` (Task 5).
- Produces: `routes.managerLogin = "/manager/login"` (Task 7 references this for its redirect target); `loginManagerUseCase` exported from `container.ts` (Task 7's dashboard test file does not need this, but the pattern it establishes is mirrored there); `ManagerLoginPage` mounted at `/manager/login`.

- [ ] **Step 1: Add the port**

Create `apps/web/src/ports/manager-auth.port.ts`:

```ts
import { z } from "zod";

export const ManagerLoginResultSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
});
export type ManagerLoginResult = z.infer<typeof ManagerLoginResultSchema>;

export class InvalidManagerCodeError extends Error {}

export interface ManagerAuthPort {
  login(code: string): Promise<ManagerLoginResult>;
}
```

- [ ] **Step 2: Add the HTTP adapter**

Create `apps/web/src/infrastructure/http/http-manager-auth.adapter.ts`:

```ts
import type { ManagerAuthPort, ManagerLoginResult } from "../../ports/manager-auth.port";
import { ManagerLoginResultSchema, InvalidManagerCodeError } from "../../ports/manager-auth.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpManagerAuthAdapter implements ManagerAuthPort {
  async login(code: string): Promise<ManagerLoginResult> {
    const response = await fetch(`${API_BASE_URL}/manager/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (response.status === 401) {
      throw new InvalidManagerCodeError();
    }
    if (!response.ok) {
      throw new Error(`manager login failed with status ${response.status}`);
    }

    return ManagerLoginResultSchema.parse(await response.json());
  }
}
```

- [ ] **Step 3: Write the failing use-case test**

Create `apps/web/src/use-cases/login-manager.usecase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LoginManagerUseCase } from "./login-manager.usecase";
import type { ManagerAuthPort, ManagerLoginResult } from "../ports/manager-auth.port";
import { InvalidManagerCodeError } from "../ports/manager-auth.port";

class FakeManagerAuthPort implements ManagerAuthPort {
  constructor(private readonly result: ManagerLoginResult | Error) {}
  async login(): Promise<ManagerLoginResult> {
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

describe("LoginManagerUseCase", () => {
  it("returns the token and expiry on success", async () => {
    const useCase = new LoginManagerUseCase(
      new FakeManagerAuthPort({ token: "abc.def", expiresAt: "2026-07-11T20:00:00.000Z" }),
    );

    const result = await useCase.execute("1234");

    expect(result).toEqual({ token: "abc.def", expiresAt: "2026-07-11T20:00:00.000Z" });
  });

  it("propagates InvalidManagerCodeError on a wrong code", async () => {
    const useCase = new LoginManagerUseCase(new FakeManagerAuthPort(new InvalidManagerCodeError()));

    await expect(useCase.execute("wrong")).rejects.toBeInstanceOf(InvalidManagerCodeError);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @zelo/web exec vitest run src/use-cases/login-manager.usecase.test.ts`
Expected: FAIL — `Cannot find module './login-manager.usecase'`.

- [ ] **Step 5: Implement the use-case**

Create `apps/web/src/use-cases/login-manager.usecase.ts`:

```ts
import type { ManagerAuthPort, ManagerLoginResult } from "../ports/manager-auth.port";

export class LoginManagerUseCase {
  constructor(private readonly authPort: ManagerAuthPort) {}

  async execute(code: string): Promise<ManagerLoginResult> {
    return this.authPort.login(code);
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @zelo/web exec vitest run src/use-cases/login-manager.usecase.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Wire the container**

Edit `apps/web/src/app/container.ts`, adding the imports and the new export (append, don't reorder existing lines):

```ts
import { LoginManagerUseCase } from "../use-cases/login-manager.usecase";
import { HttpManagerAuthAdapter } from "../infrastructure/http/http-manager-auth.adapter";
```

```ts
export const loginManagerUseCase = new LoginManagerUseCase(new HttpManagerAuthAdapter());
```

- [ ] **Step 8: Add the hook**

Create `apps/web/src/presentation/hooks/useManagerLogin.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import { loginManagerUseCase } from "../../app/container";
import { useManagerSessionStore } from "../../stores/manager-session.store";

export function useManagerLogin() {
  const setSession = useManagerSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: (code: string) => loginManagerUseCase.execute(code),
    onSuccess: (result) => {
      setSession(result.token, result.expiresAt);
    },
  });
}
```

- [ ] **Step 9: Add the route constant**

Edit `apps/web/src/presentation/lib/routes.ts`:

```ts
export const routes = {
  splash: "/",
  privacy: "/privacy",
  consent: "/consent",
  home: "/home",
  assessment: "/assessment",
  phq9: "/assessment/phq9",
  gad7: "/assessment/gad7",
  result: "/assessment/result",
  crisis: "/crisis",
  crisisConnect: "/crisis/connect",
  crisisLine: "/crisis/line",
  chat: "/chat",
  peers: "/peers",
  manager: "/manager",
  managerLogin: "/manager/login",
} as const;
```

- [ ] **Step 10: Write the failing page test**

Create `apps/web/src/presentation/pages/ManagerLoginPage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerLoginPage } from "./ManagerLoginPage";
import * as container from "../../app/container";
import { InvalidManagerCodeError } from "../../ports/manager-auth.port";

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

  it("navigates to /manager on a correct code", async () => {
    vi.spyOn(container.loginManagerUseCase, "execute").mockResolvedValue({
      token: "abc.def",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Código de acesso"), "1234");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Manager dashboard")).toBeInTheDocument();
  });

  it("shows an inline error on an incorrect code, without navigating", async () => {
    vi.spyOn(container.loginManagerUseCase, "execute").mockRejectedValue(new InvalidManagerCodeError());
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Código de acesso"), "wrong");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Código incorreto.");
    });
    expect(screen.queryByText("Manager dashboard")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 11: Run the test to verify it fails**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerLoginPage.test.tsx`
Expected: FAIL — `Cannot find module './ManagerLoginPage'`.

- [ ] **Step 12: Implement `ManagerLoginPage`**

Create `apps/web/src/presentation/pages/ManagerLoginPage.tsx`:

```tsx
import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "../layout/PhoneShell";
import { BackButton } from "../ui/BackButton";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { routes } from "../lib/routes";
import { useManagerLogin } from "../hooks/useManagerLogin";
import { InvalidManagerCodeError } from "../../ports/manager-auth.port";

export function ManagerLoginPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const login = useManagerLogin();

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    login.mutate(code, { onSuccess: () => navigate(routes.manager) });
  };

  const errorMessage = login.isError
    ? login.error instanceof InvalidManagerCodeError
      ? "Código incorreto."
      : "Não foi possível entrar agora. Tente novamente."
    : null;

  return (
    <PhoneShell>
      <div className="pt-[30px]">
        <BackButton label="Início" onClick={() => navigate(routes.home)} />
        <h1 className="mb-[6px] mt-4 text-h1 text-ink">Acesso do gestor</h1>
        <p className="text-caption text-muted">Digite o código fornecido pela sua instituição.</p>

        <form onSubmit={handleSubmit}>
          <Card className="mt-5">
            <label htmlFor="manager-code" className="text-label font-semibold text-ink-2">
              Código de acesso
            </label>
            <input
              id="manager-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Digite o código"
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
            {errorMessage && (
              <p role="alert" className="mt-2 text-label text-danger">
                {errorMessage}
              </p>
            )}
          </Card>

          <div className="mt-[24px]">
            <Button type="submit" variant="primary" loading={login.isPending} disabled={code.trim().length === 0}>
              Entrar
            </Button>
          </div>
        </form>
      </div>
    </PhoneShell>
  );
}
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerLoginPage.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 14: Add the route**

Edit `apps/web/src/app/router.tsx`. Add the import:

```ts
import { ManagerLoginPage } from "../presentation/pages/ManagerLoginPage";
```

Add the new route entry to `routeChildren`, immediately before the existing `manager` entry:

```ts
  { path: "manager/login", Component: ManagerLoginPage },
  { path: "manager", Component: ManagerDashboardPage },
```

- [ ] **Step 15: Commit**

```bash
git add apps/web/src/ports/manager-auth.port.ts apps/web/src/infrastructure/http/http-manager-auth.adapter.ts apps/web/src/use-cases/login-manager.usecase.ts apps/web/src/use-cases/login-manager.usecase.test.ts apps/web/src/app/container.ts apps/web/src/presentation/hooks/useManagerLogin.ts apps/web/src/presentation/lib/routes.ts apps/web/src/presentation/pages/ManagerLoginPage.tsx apps/web/src/presentation/pages/ManagerLoginPage.test.tsx apps/web/src/app/router.tsx
git commit -m "feat(web): add manager login flow and ManagerLoginPage"
```

---

### Task 7: Signals flow, route guard, and `ManagerDashboardPage` rewrite

**Files:**
- Create: `apps/web/src/ports/manager-signals.port.ts`
- Create: `apps/web/src/infrastructure/http/http-manager-signals.adapter.ts`
- Create: `apps/web/src/use-cases/get-manager-signals.usecase.ts`
- Test: `apps/web/src/use-cases/get-manager-signals.usecase.test.ts`
- Modify: `apps/web/src/app/container.ts`
- Create: `apps/web/src/presentation/hooks/useManagerSignals.ts`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerDashboardPage.tsx`
- Modify: `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx`
- Modify: `apps/web/src/app/router.test.tsx`
- Modify: `apps/web/src/presentation/pages/a11y.test.tsx`

**Interfaces:**
- Consumes: `useManagerSessionStore` (Task 5), `routes.managerLogin` (Task 6).
- Produces: real, gated `ManagerDashboardPage`.

**Deliberate deviation from the design spec:** §5 of the design spec describes the route
guard as a `RequireManagerSession` wrapper component. This plan instead adds a `loader` to
the `manager` route, matching the codebase's existing precedent for exactly this kind of
redirect (`router.tsx`'s `splash` route already does `loader: () => (hasConsented ?
redirect(...) : null)`). Same behavior, no new pattern introduced — a wrapper component
would have been redundant with an idiom already established in this file.

- [ ] **Step 1: Add the port**

Create `apps/web/src/ports/manager-signals.port.ts`:

```ts
import { z } from "zod";

export const ManagerSignalsResponseSchema = z.object({
  overallConcerningRate: z.number(),
  checkInsLast4Weeks: z.number(),
  weeklyTrend: z.array(z.object({ weekStart: z.string(), concerningRate: z.number() })),
  segments: z.array(z.object({ label: z.string(), value: z.number(), n: z.number() })),
});
export type ManagerSignalsResponse = z.infer<typeof ManagerSignalsResponseSchema>;

export class UnauthorizedManagerError extends Error {}

export interface ManagerSignalsPort {
  fetchSignals(token: string): Promise<ManagerSignalsResponse>;
}
```

- [ ] **Step 2: Add the HTTP adapter**

Create `apps/web/src/infrastructure/http/http-manager-signals.adapter.ts`:

```ts
import type { ManagerSignalsPort, ManagerSignalsResponse } from "../../ports/manager-signals.port";
import { ManagerSignalsResponseSchema, UnauthorizedManagerError } from "../../ports/manager-signals.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpManagerSignalsAdapter implements ManagerSignalsPort {
  async fetchSignals(token: string): Promise<ManagerSignalsResponse> {
    const response = await fetch(`${API_BASE_URL}/manager/signals`, {
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

- [ ] **Step 3: Write the failing use-case test**

Create `apps/web/src/use-cases/get-manager-signals.usecase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GetManagerSignalsUseCase } from "./get-manager-signals.usecase";
import type { ManagerSignalsPort, ManagerSignalsResponse } from "../ports/manager-signals.port";
import { UnauthorizedManagerError } from "../ports/manager-signals.port";

const SAMPLE_RESPONSE: ManagerSignalsResponse = {
  overallConcerningRate: 0.41,
  checkInsLast4Weeks: 111,
  weeklyTrend: [{ weekStart: "2026-06-01T00:00:00.000Z", concerningRate: 0.3 }],
  segments: [{ label: "UTI", value: 44, n: 9 }],
};

class FakeManagerSignalsPort implements ManagerSignalsPort {
  constructor(private readonly result: ManagerSignalsResponse | Error) {}
  async fetchSignals(): Promise<ManagerSignalsResponse> {
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

describe("GetManagerSignalsUseCase", () => {
  it("returns the signals response on success", async () => {
    const useCase = new GetManagerSignalsUseCase(new FakeManagerSignalsPort(SAMPLE_RESPONSE));

    const result = await useCase.execute("valid-token");

    expect(result).toEqual(SAMPLE_RESPONSE);
  });

  it("propagates UnauthorizedManagerError on a rejected token", async () => {
    const useCase = new GetManagerSignalsUseCase(new FakeManagerSignalsPort(new UnauthorizedManagerError()));

    await expect(useCase.execute("expired-token")).rejects.toBeInstanceOf(UnauthorizedManagerError);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @zelo/web exec vitest run src/use-cases/get-manager-signals.usecase.test.ts`
Expected: FAIL — `Cannot find module './get-manager-signals.usecase'`.

- [ ] **Step 5: Implement the use-case**

Create `apps/web/src/use-cases/get-manager-signals.usecase.ts`:

```ts
import type { ManagerSignalsPort, ManagerSignalsResponse } from "../ports/manager-signals.port";

export class GetManagerSignalsUseCase {
  constructor(private readonly signalsPort: ManagerSignalsPort) {}

  async execute(token: string): Promise<ManagerSignalsResponse> {
    return this.signalsPort.fetchSignals(token);
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @zelo/web exec vitest run src/use-cases/get-manager-signals.usecase.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Wire the container**

Edit `apps/web/src/app/container.ts`, adding the imports and the new export:

```ts
import { GetManagerSignalsUseCase } from "../use-cases/get-manager-signals.usecase";
import { HttpManagerSignalsAdapter } from "../infrastructure/http/http-manager-signals.adapter";
```

```ts
export const getManagerSignalsUseCase = new GetManagerSignalsUseCase(new HttpManagerSignalsAdapter());
```

- [ ] **Step 8: Add the hook**

Create `apps/web/src/presentation/hooks/useManagerSignals.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { getManagerSignalsUseCase } from "../../app/container";
import { useManagerSessionStore } from "../../stores/manager-session.store";

export function useManagerSignals() {
  const token = useManagerSessionStore((state) => state.token);

  return useQuery({
    queryKey: ["manager-signals", token],
    queryFn: () => getManagerSignalsUseCase.execute(token!),
    enabled: token !== null,
  });
}
```

- [ ] **Step 9: Add the route guard loader**

Edit `apps/web/src/app/router.tsx`. Add the import:

```ts
import { useManagerSessionStore } from "../stores/manager-session.store";
```

Replace the existing `manager` route entry:

```ts
  { path: "manager", Component: ManagerDashboardPage },
```

with:

```ts
  {
    path: "manager",
    Component: ManagerDashboardPage,
    loader: () => (useManagerSessionStore.getState().isValid() ? null : redirect(routes.managerLogin)),
  },
```

- [ ] **Step 10: Rewrite `ManagerDashboardPage`**

Replace the full contents of `apps/web/src/presentation/pages/ManagerDashboardPage.tsx`:

```tsx
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "../layout/PhoneShell";
import { BackButton } from "../ui/BackButton";
import { PrivacyBadge } from "../ui/PrivacyBadge";
import { SectionLabel } from "../ui/SectionLabel";
import { Card } from "../ui/Card";
import { routes } from "../lib/routes";
import { useManagerSignals } from "../hooks/useManagerSignals";
import { useManagerSessionStore } from "../../stores/manager-session.store";
import { UnauthorizedManagerError } from "../../ports/manager-signals.port";

const MIN_TREND_BAR_HEIGHT = 8;

function toTrendBarHeights(trend: { concerningRate: number }[]): number[] {
  return trend.map((point) => Math.max(MIN_TREND_BAR_HEIGHT, Math.round(point.concerningRate * 100)));
}

export function ManagerDashboardPage() {
  const navigate = useNavigate();
  const clearSession = useManagerSessionStore((state) => state.clearSession);
  const { data, error, isError } = useManagerSignals();

  useEffect(() => {
    if (isError && error instanceof UnauthorizedManagerError) {
      clearSession();
      navigate(routes.managerLogin, { replace: true });
    }
  }, [isError, error, clearSession, navigate]);

  const trend = data?.weeklyTrend ?? [];
  const bars = toTrendBarHeights(trend);
  const segments = data?.segments ?? [];
  const overallConcerningRate = data?.overallConcerningRate ?? 0;
  const checkInsLast4Weeks = data?.checkInsLast4Weeks ?? 0;

  return (
    <PhoneShell bg="canvas-alt">
      <div className="pt-[26px]">
        <div className="flex items-center justify-between">
          <BackButton label="Sair da demo" onClick={() => navigate(routes.home)} />
          <PrivacyBadge />
        </div>
        <div className="mt-4">
          <SectionLabel>Painel do gestor</SectionLabel>
        </div>
        <h1 className="mt-2 text-h2 text-ink">Tendências da equipe</h1>
        <p className="mt-1 text-caption text-muted">
          Somente dados anônimos e agregados. Segmentos com menos de 5 respostas ficam ocultos
          para evitar re-identificação.
        </p>

        <div className="mt-5 flex gap-3">
          <Card className="flex-1 text-center">
            <p className="font-serif text-[30px] text-warn">{Math.round(overallConcerningRate * 100)}%</p>
            <p className="text-caption text-muted">sinais de burnout na equipe</p>
          </Card>
          <Card className="flex-1 text-center">
            <p className="font-serif text-[30px] text-brand">{checkInsLast4Weeks}</p>
            <p className="text-caption text-muted">check-ins nas últimas 4 semanas</p>
          </Card>
        </div>

        <div className="mt-[14px]">
          <Card>
            <div className="flex items-center justify-between">
              <p className="text-body font-extrabold text-ink">Tendência geral</p>
              <p className="font-mono text-[12px] text-muted-2">últimas 6 semanas</p>
            </div>
            <div className="mt-3 flex h-14 items-end gap-2">
              {bars.map((height, index) => (
                <div key={index} data-testid="trend-bar" className="w-full rounded-md bg-brand" style={{ height: `${height}%` }} />
              ))}
            </div>
          </Card>
        </div>

        <div className="mt-[14px]">
          <Card>
            <p className="text-body font-extrabold text-ink">Sinais por setor</p>
            <div className="mt-3 flex flex-col gap-3">
              {segments.map((segment) => (
                <div key={segment.label}>
                  <div className="flex items-center justify-between text-label text-ink-2">
                    <span>{segment.label}</span>
                    <span className="font-mono text-[12px] text-muted-2">
                      {segment.value}% · n={segment.n}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-pill bg-canvas-alt">
                    <div className="h-full rounded-pill bg-brand" style={{ width: `${segment.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </PhoneShell>
  );
}
```

- [ ] **Step 11: Rewrite `ManagerDashboardPage.test.tsx`**

Replace the full contents of `apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerDashboardPage } from "./ManagerDashboardPage";
import { useManagerSessionStore } from "../../stores/manager-session.store";
import * as container from "../../app/container";
import { UnauthorizedManagerError } from "../../ports/manager-signals.port";

function renderManager() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/manager"]}>
        <Routes>
          <Route path="/manager" element={<ManagerDashboardPage />} />
          <Route path="/manager/login" element={<div>Login screen</div>} />
          <Route path="/home" element={<div>Home screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const SIGNALS_RESPONSE = {
  overallConcerningRate: 0.41,
  checkInsLast4Weeks: 111,
  weeklyTrend: [
    { weekStart: "2026-06-01T00:00:00.000Z", concerningRate: 0.3 },
    { weekStart: "2026-06-08T00:00:00.000Z", concerningRate: 0.5 },
  ],
  segments: [
    { label: "Plantão noturno", value: 52, n: 18 },
    { label: "Pronto-socorro", value: 38, n: 24 },
    { label: "UTI", value: 44, n: 9 },
  ],
};

describe("ManagerDashboardPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useManagerSessionStore.setState({ token: "abc.def", expiresAt: new Date(Date.now() + 60_000).toISOString() });
  });

  it("renders segments and trend bars from the real signals response, suppressing n<5 departments", async () => {
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockResolvedValue(SIGNALS_RESPONSE);
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    expect(screen.getByText("Pronto-socorro")).toBeInTheDocument();
    expect(screen.getByText("UTI")).toBeInTheDocument();
    expect(screen.queryByText("Ambulatório")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("trend-bar")).toHaveLength(2);
    expect(screen.getByText("41%")).toBeInTheDocument();
    expect(screen.getByText("111")).toBeInTheDocument();
  });

  it("navigates to /home on back", async () => {
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockResolvedValue(SIGNALS_RESPONSE);
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("button", { name: "Sair da demo" }));
    expect(screen.getByText("Home screen")).toBeInTheDocument();
  });

  it("clears the session and redirects to login on a 401", async () => {
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockRejectedValue(new UnauthorizedManagerError());
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Login screen")).toBeInTheDocument();
    });
    expect(useManagerSessionStore.getState().token).toBeNull();
  });
});
```

- [ ] **Step 12: Run the dashboard test to verify it passes**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerDashboardPage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 13: Update `router.test.tsx`**

Edit `apps/web/src/app/router.test.tsx`. Add the import:

```ts
import { useManagerSessionStore } from "../stores/manager-session.store";
```

Add `sessionStorage.clear()` and a store reset inside the existing `beforeEach`:

```ts
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useConsentStore.setState({ hasConsented: false, consentedAt: null });
    useManagerSessionStore.setState({ token: null, expiresAt: null });
    vi.spyOn(container.checkApiHealthUseCase, "execute").mockResolvedValue({ status: "ok", database: true });
  });
```

Replace the existing `"Home's Manager demo link reaches the dashboard"` test with:

```ts
  it("Home's Manager demo link reaches the manager login screen when unauthenticated", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    buildTestRouter("/home");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Ver painel do gestor (demo)" }));
    expect(await screen.findByText("Acesso do gestor")).toBeInTheDocument();
  });

  it("an authenticated manager session reaches the dashboard directly", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    useManagerSessionStore.setState({ token: "abc.def", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockResolvedValue({
      overallConcerningRate: 0,
      checkInsLast4Weeks: 0,
      weeklyTrend: [],
      segments: [],
    });

    buildTestRouter("/manager");

    expect(await screen.findByText("Tendências da equipe")).toBeInTheDocument();
  });
```

- [ ] **Step 14: Run `router.test.tsx` to verify it passes**

Run: `pnpm --filter @zelo/web exec vitest run src/app/router.test.tsx`
Expected: PASS (all tests, including the 2 new/updated manager ones).

- [ ] **Step 15: Update `a11y.test.tsx`**

Edit `apps/web/src/presentation/pages/a11y.test.tsx`. Add the import:

```ts
import { ManagerLoginPage } from "./ManagerLoginPage";
```

Add a new entry to the `SCREENS` array, immediately before the `ManagerDashboard` entry:

```ts
  { name: "ManagerLogin", Component: ManagerLoginPage, path: "/manager/login" },
```

- [ ] **Step 16: Run the a11y suite to verify it passes**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/a11y.test.tsx`
Expected: PASS, no axe violations on any screen including the two new/changed ones.

- [ ] **Step 17: Run the full frontend test suite**

Run: `pnpm --filter @zelo/web test`
Expected: all tests pass.

- [ ] **Step 18: Run the full monorepo build**

Run: `pnpm turbo run build --filter=@zelo/web --filter=@zelo/api`
Expected: both build cleanly, no type errors.

- [ ] **Step 19: Manually verify end-to-end in a real browser**

With both `pnpm --filter @zelo/api dev` and `pnpm --filter @zelo/web dev` running, and the Task 1 seed already applied:

1. Navigate to Home, click "Ver painel do gestor (demo)" — should land on `/manager/login`, not the dashboard.
2. Enter the wrong code — should show "Código incorreto." inline, no navigation.
3. Enter the real `MANAGER_ACCESS_CODE` from your local `.env` — should navigate to `/manager` and show real data: 3 department segments (not 4 — Ambulatório suppressed), a 6-bar trend chart, and non-hardcoded KPI numbers.
4. Reload the page — should stay on the dashboard (session persisted in `sessionStorage`), not bounce back to login.
5. Open a new tab to `/manager` directly (simulating a fresh unauthenticated visit) — should redirect to `/manager/login`.

- [ ] **Step 20: Commit**

```bash
git add apps/web/src/ports/manager-signals.port.ts apps/web/src/infrastructure/http/http-manager-signals.adapter.ts apps/web/src/use-cases/get-manager-signals.usecase.ts apps/web/src/use-cases/get-manager-signals.usecase.test.ts apps/web/src/app/container.ts apps/web/src/presentation/hooks/useManagerSignals.ts apps/web/src/app/router.tsx apps/web/src/presentation/pages/ManagerDashboardPage.tsx apps/web/src/presentation/pages/ManagerDashboardPage.test.tsx apps/web/src/app/router.test.tsx apps/web/src/presentation/pages/a11y.test.tsx
git commit -m "feat(web): wire real manager signals data and route guard into ManagerDashboardPage"
```
