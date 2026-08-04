# Production Secret Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap where the three session-token-signing secrets (`MANAGER_TOKEN_SECRET`, `ADMIN_TOKEN_SECRET`, `PEER_PARTNER_TOKEN_SECRET`) can silently be missing, empty, or left at the `change-me-in-production` placeholder in a production boot — and replace the real Fly secrets with strong, unique values now, while the app is pre-launch.

**Architecture:** Two additive changes to the existing Zod env-validation schema in `apps/api/src/shared/config/env.validation.ts` (which already fails the process fast at boot on bad config, per its own file header comment): first, `ADMIN_TOKEN_SECRET`/`PEER_PARTNER_TOKEN_SECRET` become required schema fields (today only `MANAGER_TOKEN_SECRET` is validated at all — the other two silently pass through unchecked); second, a production-only `.refine()` per secret requires at least 32 characters, mirroring the `EMAIL_PROVIDER`/`WEB_APP_BASE_URL` production refines already in this file. A final rollout task generates three real 256-bit secrets and rotates them on the live Fly app.

**Tech Stack:** NestJS + `@nestjs/config`'s `ConfigModule.forRoot({ validate })` hook, Zod, Vitest, Fly CLI (`fly secrets set`), Node's `crypto.randomBytes`.

## Global Constraints

- The production guard applies **only** when `NODE_ENV === "production"` — dev/test environments keep working with the `change-me-in-production` placeholder exactly as today, unchanged.
- Minimum length: **32 characters**, chosen to reject the placeholder (23 chars) and any other short/weak value without hand-coding the placeholder string as a blocklist, while leaving headroom below the 64-character values this plan actually generates.
- Three **independent** secrets, not one shared value — preserves the existing property that a manager session token can never be replayed as an admin or peer-partner token (each entity's `*TokenService` signs/verifies with only its own secret).
- Secret rotation is a real infrastructure action against the live `zelo-api` Fly app (`fly.toml`'s `app = "zelo-api"`) — it is a plan task with an explicit rollout step and verification, not folded silently into a code diff.
- Full spec: `docs/superpowers/specs/2026-08-04-production-secret-management-design.md`.

---

### Task 1: Require `ADMIN_TOKEN_SECRET` and `PEER_PARTNER_TOKEN_SECRET` (currently unvalidated)

**Files:**

- Modify: `apps/api/src/shared/config/env.validation.ts`
- Modify: `apps/api/src/shared/config/env.validation.test.ts`

**Interfaces:**

- Produces: the env schema now requires `ADMIN_TOKEN_SECRET: string` and `PEER_PARTNER_TOKEN_SECRET: string` (non-empty) in every environment, matching the existing `MANAGER_TOKEN_SECRET` requirement — later tasks (Task 2) build the production-strength check on top of this.

- [ ] **Step 1: Write the failing tests**

Replace `apps/api/src/shared/config/env.validation.test.ts` in full:

```ts
import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.validation.ts";

function baseConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    DATABASE_URL: "postgresql://localhost/zelo",
    MANAGER_TOKEN_SECRET: "secret",
    ADMIN_TOKEN_SECRET: "secret",
    PEER_PARTNER_TOKEN_SECRET: "secret",
    AI_PROVIDER: "mock", // avoid tripping the unrelated GROQ_API_KEY refine in these fixtures
    ...overrides,
  };
}

describe("validateEnv", () => {
  it("accepts the local-dev defaults (EMAIL_PROVIDER=mock, localhost WEB_APP_BASE_URL) when NODE_ENV is not production", () => {
    expect(() => validateEnv(baseConfig({ NODE_ENV: "development" }))).not.toThrow();
    expect(() => validateEnv(baseConfig({ NODE_ENV: "test" }))).not.toThrow();
  });

  it("rejects a boot with no ADMIN_TOKEN_SECRET set", () => {
    const config = baseConfig({ NODE_ENV: "development" });
    delete config.ADMIN_TOKEN_SECRET;
    expect(() => validateEnv(config)).toThrow(/ADMIN_TOKEN_SECRET is required/);
  });

  it("rejects a boot with no PEER_PARTNER_TOKEN_SECRET set", () => {
    const config = baseConfig({ NODE_ENV: "development" });
    delete config.PEER_PARTNER_TOKEN_SECRET;
    expect(() => validateEnv(config)).toThrow(/PEER_PARTNER_TOKEN_SECRET is required/);
  });

  it("rejects a production boot with the default mock EMAIL_PROVIDER", () => {
    expect(() =>
      validateEnv(
        baseConfig({
          NODE_ENV: "production",
          WEB_APP_BASE_URL: "https://app.zelo.example",
        }),
      ),
    ).toThrow(/EMAIL_PROVIDER must be "resend" in production/);
  });

  it("rejects a production boot with the default localhost WEB_APP_BASE_URL", () => {
    expect(() =>
      validateEnv(
        baseConfig({
          NODE_ENV: "production",
          EMAIL_PROVIDER: "resend",
          RESEND_API_KEY: "re_test",
        }),
      ),
    ).toThrow(/WEB_APP_BASE_URL must be set explicitly in production/);
  });

  it("accepts a production boot with EMAIL_PROVIDER=resend, a RESEND_API_KEY, and a non-default WEB_APP_BASE_URL", () => {
    expect(() =>
      validateEnv(
        baseConfig({
          NODE_ENV: "production",
          EMAIL_PROVIDER: "resend",
          RESEND_API_KEY: "re_test",
          WEB_APP_BASE_URL: "https://app.zelo.example",
        }),
      ),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify the two new ones fail**

Run: `pnpm --filter @zelo/api exec vitest run src/shared/config/env.validation.test.ts`
Expected: FAIL — the two new tests ("rejects a boot with no ADMIN_TOKEN_SECRET set" / "...PEER_PARTNER_TOKEN_SECRET set") fail because `validateEnv` does NOT throw today: the schema's `.passthrough()` lets unknown/undeclared keys through unchecked, and `ADMIN_TOKEN_SECRET`/`PEER_PARTNER_TOKEN_SECRET` aren't declared in the schema at all yet, so deleting them from the input config has no effect on validation. All other tests should still PASS.

- [ ] **Step 3: Add the two fields to the schema**

In `apps/api/src/shared/config/env.validation.ts`, add these two lines immediately after the existing `MANAGER_TOKEN_SECRET` line inside the `z.object({...})` block:

```ts
    ADMIN_TOKEN_SECRET: z.string().min(1, "ADMIN_TOKEN_SECRET is required"),
    PEER_PARTNER_TOKEN_SECRET: z.string().min(1, "PEER_PARTNER_TOKEN_SECRET is required"),
```

So the block reads (only the changed region shown):

```ts
    MANAGER_TOKEN_SECRET: z.string().min(1, "MANAGER_TOKEN_SECRET is required"),
    ADMIN_TOKEN_SECRET: z.string().min(1, "ADMIN_TOKEN_SECRET is required"),
    PEER_PARTNER_TOKEN_SECRET: z.string().min(1, "PEER_PARTNER_TOKEN_SECRET is required"),
    CORS_ALLOWED_ORIGINS: z.string().optional(),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @zelo/api exec vitest run src/shared/config/env.validation.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Run the full API suite to confirm nothing else broke**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: PASS, same result as before this change (the app's own local `.env`/`.env.development.local` already have both secrets set as of the email-login-and-invites branch, so this stricter validation doesn't newly break local dev or CI's test env).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/shared/config/env.validation.ts apps/api/src/shared/config/env.validation.test.ts
git commit -m "fix(api): require ADMIN_TOKEN_SECRET and PEER_PARTNER_TOKEN_SECRET at boot (previously silently unvalidated)"
```

---

### Task 2: Reject weak/placeholder token secrets in production

**Files:**

- Modify: `apps/api/src/shared/config/env.validation.ts`
- Modify: `apps/api/src/shared/config/env.validation.test.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**

- Consumes: `ADMIN_TOKEN_SECRET`/`PEER_PARTNER_TOKEN_SECRET` as required schema fields (Task 1).
- Produces: a production boot now fails fast if any of `MANAGER_TOKEN_SECRET`/`ADMIN_TOKEN_SECRET`/`PEER_PARTNER_TOKEN_SECRET` is under 32 characters — Task 3's rollout is what actually satisfies this in the live deployment.

- [ ] **Step 1: Write the failing tests**

Replace `apps/api/src/shared/config/env.validation.test.ts` in full:

```ts
import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.validation.ts";

const LONG_SECRET = "a".repeat(32);

function baseConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    DATABASE_URL: "postgresql://localhost/zelo",
    MANAGER_TOKEN_SECRET: LONG_SECRET,
    ADMIN_TOKEN_SECRET: LONG_SECRET,
    PEER_PARTNER_TOKEN_SECRET: LONG_SECRET,
    AI_PROVIDER: "mock", // avoid tripping the unrelated GROQ_API_KEY refine in these fixtures
    ...overrides,
  };
}

describe("validateEnv", () => {
  it("accepts the local-dev defaults (EMAIL_PROVIDER=mock, localhost WEB_APP_BASE_URL) when NODE_ENV is not production", () => {
    expect(() => validateEnv(baseConfig({ NODE_ENV: "development", MANAGER_TOKEN_SECRET: "secret", ADMIN_TOKEN_SECRET: "secret", PEER_PARTNER_TOKEN_SECRET: "secret" }))).not.toThrow();
    expect(() => validateEnv(baseConfig({ NODE_ENV: "test", MANAGER_TOKEN_SECRET: "secret", ADMIN_TOKEN_SECRET: "secret", PEER_PARTNER_TOKEN_SECRET: "secret" }))).not.toThrow();
  });

  it("rejects a boot with no ADMIN_TOKEN_SECRET set", () => {
    const config = baseConfig({ NODE_ENV: "development" });
    delete config.ADMIN_TOKEN_SECRET;
    expect(() => validateEnv(config)).toThrow(/ADMIN_TOKEN_SECRET is required/);
  });

  it("rejects a boot with no PEER_PARTNER_TOKEN_SECRET set", () => {
    const config = baseConfig({ NODE_ENV: "development" });
    delete config.PEER_PARTNER_TOKEN_SECRET;
    expect(() => validateEnv(config)).toThrow(/PEER_PARTNER_TOKEN_SECRET is required/);
  });

  it("rejects a production boot with the default mock EMAIL_PROVIDER", () => {
    expect(() =>
      validateEnv(
        baseConfig({
          NODE_ENV: "production",
          WEB_APP_BASE_URL: "https://app.zelo.example",
        }),
      ),
    ).toThrow(/EMAIL_PROVIDER must be "resend" in production/);
  });

  it("rejects a production boot with the default localhost WEB_APP_BASE_URL", () => {
    expect(() =>
      validateEnv(
        baseConfig({
          NODE_ENV: "production",
          EMAIL_PROVIDER: "resend",
          RESEND_API_KEY: "re_test",
        }),
      ),
    ).toThrow(/WEB_APP_BASE_URL must be set explicitly in production/);
  });

  it("rejects a production boot with a short MANAGER_TOKEN_SECRET", () => {
    expect(() =>
      validateEnv(
        baseConfig({
          NODE_ENV: "production",
          EMAIL_PROVIDER: "resend",
          RESEND_API_KEY: "re_test",
          WEB_APP_BASE_URL: "https://app.zelo.example",
          MANAGER_TOKEN_SECRET: "change-me-in-production",
        }),
      ),
    ).toThrow(/MANAGER_TOKEN_SECRET must be at least 32 characters in production/);
  });

  it("rejects a production boot with a short ADMIN_TOKEN_SECRET", () => {
    expect(() =>
      validateEnv(
        baseConfig({
          NODE_ENV: "production",
          EMAIL_PROVIDER: "resend",
          RESEND_API_KEY: "re_test",
          WEB_APP_BASE_URL: "https://app.zelo.example",
          ADMIN_TOKEN_SECRET: "change-me-in-production",
        }),
      ),
    ).toThrow(/ADMIN_TOKEN_SECRET must be at least 32 characters in production/);
  });

  it("rejects a production boot with a short PEER_PARTNER_TOKEN_SECRET", () => {
    expect(() =>
      validateEnv(
        baseConfig({
          NODE_ENV: "production",
          EMAIL_PROVIDER: "resend",
          RESEND_API_KEY: "re_test",
          WEB_APP_BASE_URL: "https://app.zelo.example",
          PEER_PARTNER_TOKEN_SECRET: "change-me-in-production",
        }),
      ),
    ).toThrow(/PEER_PARTNER_TOKEN_SECRET must be at least 32 characters in production/);
  });

  it("accepts a production boot with EMAIL_PROVIDER=resend, a RESEND_API_KEY, a non-default WEB_APP_BASE_URL, and 32+ character token secrets", () => {
    expect(() =>
      validateEnv(
        baseConfig({
          NODE_ENV: "production",
          EMAIL_PROVIDER: "resend",
          RESEND_API_KEY: "re_test",
          WEB_APP_BASE_URL: "https://app.zelo.example",
        }),
      ),
    ).not.toThrow();
  });
});
```

Note: `baseConfig()`'s defaults changed from the short `"secret"` (Task 1) to a 32-character `LONG_SECRET` — the first test explicitly overrides all three token secrets back to `"secret"` to prove the *non-production* path still accepts short values (the production-only refine must never fire outside `NODE_ENV === "production"`).

- [ ] **Step 2: Run tests to verify the three new ones fail**

Run: `pnpm --filter @zelo/api exec vitest run src/shared/config/env.validation.test.ts`
Expected: FAIL — the three new tests ("rejects a production boot with a short MANAGER_TOKEN_SECRET" / "...ADMIN_TOKEN_SECRET" / "...PEER_PARTNER_TOKEN_SECRET") fail because no length check exists yet, so `validateEnv` doesn't throw for a 24-character `"change-me-in-production"` value in production. All other tests should still PASS (including the renamed/expanded acceptance test, since `LONG_SECRET` already satisfies a not-yet-added 32-char check).

- [ ] **Step 3: Add the three production-length refines**

Replace `apps/api/src/shared/config/env.validation.ts` in full:

```ts
import { z } from "zod";

// Fails fast at boot with a clear message (which key, what's wrong) instead of
// a misconfigured value surfacing three layers deep at request time — e.g. a
// missing MANAGER_TOKEN_SECRET today only breaks the first login attempt,
// with a stack trace that doesn't say why. `.passthrough()` is required:
// process.env always carries OS/tooling vars (PATH, etc.) and this app's own
// CLI-only vars (DIRECT_DATABASE_URL, MANAGER_SEED_PASSWORD_*) that this
// schema deliberately doesn't constrain — only the vars this running process
// itself reads are validated here; everything else passes through unchanged.
const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    AI_PROVIDER: z.enum(["groq", "mock"]).default("groq"),
    // Only required when a real Groq call will actually be made — GroqAdapter's
    // constructor is never instantiated when AI_PROVIDER=mock (see chat.module.ts
    // and manager/manager.module.ts's provider-selection comment).
    GROQ_API_KEY: z.string().optional(),
    GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
    MANAGER_TOKEN_SECRET: z.string().min(1, "MANAGER_TOKEN_SECRET is required"),
    ADMIN_TOKEN_SECRET: z.string().min(1, "ADMIN_TOKEN_SECRET is required"),
    PEER_PARTNER_TOKEN_SECRET: z.string().min(1, "PEER_PARTNER_TOKEN_SECRET is required"),
    CORS_ALLOWED_ORIGINS: z.string().optional(),
    EMAIL_PROVIDER: z.enum(["mock", "resend"]).default("mock"),
    // Only required when a real Resend call will actually be made — ResendEmailAdapter's
    // constructor is never instantiated when EMAIL_PROVIDER=mock (see email.module.ts).
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default("onboarding@resend.dev"),
    WEB_APP_BASE_URL: z.string().default("http://localhost:5173"),
  })
  .passthrough()
  .refine((env) => env.AI_PROVIDER === "mock" || !!env.GROQ_API_KEY, {
    message: "GROQ_API_KEY is required when AI_PROVIDER is not \"mock\"",
    path: ["GROQ_API_KEY"],
  })
  .refine((env) => env.EMAIL_PROVIDER === "mock" || !!env.RESEND_API_KEY, {
    message: "RESEND_API_KEY is required when EMAIL_PROVIDER is not \"mock\"",
    path: ["RESEND_API_KEY"],
  })
  // Guards against a production deploy silently booting with the local-dev
  // defaults: EMAIL_PROVIDER=mock only logs invite/reset links to the server
  // console (a completely broken invite flow with no error anywhere), and the
  // localhost WEB_APP_BASE_URL default would embed a dead link in any email
  // that did go out. Fail loudly at startup instead.
  .refine((env) => env.NODE_ENV !== "production" || env.EMAIL_PROVIDER === "resend", {
    message: "EMAIL_PROVIDER must be \"resend\" in production (the \"mock\" default only logs invite/reset links to the server console instead of sending them)",
    path: ["EMAIL_PROVIDER"],
  })
  .refine((env) => env.NODE_ENV !== "production" || env.WEB_APP_BASE_URL !== "http://localhost:5173", {
    message: "WEB_APP_BASE_URL must be set explicitly in production (the localhost default would embed a dead link in invite/reset emails)",
    path: ["WEB_APP_BASE_URL"],
  })
  // Guards against a production deploy silently booting with a guessable
  // session-signing key — the change-me-in-production placeholder (or any
  // other short value) would let anyone forge a valid session token for any
  // account, bypassing the password check entirely. Fail loudly at startup.
  .refine((env) => env.NODE_ENV !== "production" || env.MANAGER_TOKEN_SECRET.length >= 32, {
    message: "MANAGER_TOKEN_SECRET must be at least 32 characters in production (the \"change-me-in-production\" placeholder and other short values are rejected — a weak key lets anyone forge a valid session token)",
    path: ["MANAGER_TOKEN_SECRET"],
  })
  .refine((env) => env.NODE_ENV !== "production" || env.ADMIN_TOKEN_SECRET.length >= 32, {
    message: "ADMIN_TOKEN_SECRET must be at least 32 characters in production (the \"change-me-in-production\" placeholder and other short values are rejected — a weak key lets anyone forge a valid session token)",
    path: ["ADMIN_TOKEN_SECRET"],
  })
  .refine((env) => env.NODE_ENV !== "production" || env.PEER_PARTNER_TOKEN_SECRET.length >= 32, {
    message: "PEER_PARTNER_TOKEN_SECRET must be at least 32 characters in production (the \"change-me-in-production\" placeholder and other short values are rejected — a weak key lets anyone forge a valid session token)",
    path: ["PEER_PARTNER_TOKEN_SECRET"],
  });

// NestJS's ConfigModule.forRoot({ validate }) contract: receives the raw
// process.env-shaped object, must return the (possibly transformed/defaulted)
// object ConfigService will serve, or throw to abort startup.
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `"${issue.path.join(".")}" ${issue.message}`).join("; ");
    throw new Error(`Config validation error: ${issues}`);
  }
  return parsed.data;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @zelo/api exec vitest run src/shared/config/env.validation.test.ts`
Expected: PASS (all 9 tests).

- [ ] **Step 5: Run the full API suite**

Run: `pnpm --filter @zelo/api test -- --run`
Expected: PASS — same baseline as Task 1 (local `.env`/`.env.development.local` run with `NODE_ENV=development`/`test`, so this production-only refine doesn't affect them).

- [ ] **Step 6: Document the production minimum in `.env.example`**

In `apps/api/.env.example`, add a comment immediately above the three `*_TOKEN_SECRET` lines (which currently have no comment above them):

```env
# HMAC keys signing session tokens for each account type — must be at least 32
# characters in production (enforced at boot by env.validation.ts); the
# placeholder below is fine for local dev only.
MANAGER_TOKEN_SECRET=change-me-in-production
ADMIN_TOKEN_SECRET=change-me-in-production
PEER_PARTNER_TOKEN_SECRET=change-me-in-production
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/shared/config/env.validation.ts apps/api/src/shared/config/env.validation.test.ts apps/api/.env.example
git commit -m "feat(api): reject weak or placeholder session-token secrets on a production boot"
```

---

### Task 3: Rollout — generate and rotate real secrets on the live Fly app

**Files:** none (no code changes — this task rotates real secrets on the live `zelo-api` Fly app, the same "operational rollout task" pattern used for the DB migration rollout in the email-login-and-invites plan).

**Interfaces:**

- Consumes: Task 2's production guard (this rollout is what makes a subsequent production boot actually satisfy it).
- Produces: nothing later tasks consume — this is the final delivery step.

- [ ] **Step 1: Confirm the Fly CLI is authenticated**

```bash
fly auth whoami
```

Expected: prints the logged-in account's email. If instead it errors with `no access token available`, **stop here** — do not attempt to log in on the user's behalf. Generate the three secret values anyway (Step 2), print the exact `fly secrets set` command (Step 3) with those real values filled in, and report to the user that they need to run `fly auth login` themselves and then run that command — do not treat this as a blocker for the rest of the plan, the same way the Neon compute-quota block was handled as an external, out-of-session-control blocker in the email-login-and-invites plan's rollout task.

- [ ] **Step 2: Generate three independent 256-bit secrets**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run three times (not once reused) — each invocation produces a different 64-character hex string. Assign the first to `MANAGER_TOKEN_SECRET`, the second to `ADMIN_TOKEN_SECRET`, the third to `PEER_PARTNER_TOKEN_SECRET`. Do not commit these values anywhere in the repo — they exist only in the Fly secrets store (and briefly in this task's report, which lives outside version control in the SDD workspace, same as how the email-login-and-invites plan's rollout task handled the real `.env` file edits).

- [ ] **Step 3: Set the secrets on the live Fly app**

```bash
fly secrets set \
  MANAGER_TOKEN_SECRET="<value generated above>" \
  ADMIN_TOKEN_SECRET="<value generated above>" \
  PEER_PARTNER_TOKEN_SECRET="<value generated above>" \
  --app zelo-api
```

Expected: Fly reports the secrets were set and triggers a rolling restart of the `zelo-api` machine(s) to pick them up (this is Fly's default behavior on `secrets set` — no separate `fly deploy` needed).

- [ ] **Step 4: Verify the app booted successfully post-rotation**

```bash
fly status --app zelo-api
```

Expected: machine(s) show `started`/healthy, not crashed or restarting in a loop (a crash-loop here would mean Task 2's new production refine rejected one of the values set in Step 3 — re-check each generated value is genuinely 64 characters, no copy-paste truncation).

```bash
curl -s https://zelo-api.fly.dev/health
```

Expected: `{"status":"ok","database":true}` (or whatever the current healthy shape is — confirm the process is actually serving requests, not just "started" in Fly's machine state).

- [ ] **Step 5: Report the outcome**

No commit — this task changes live infrastructure secrets, not files. Summarize for the user: whether Fly CLI was authenticated and the rotation completed directly, or whether the exact command was handed to them to run themselves; confirm the app's health check passed post-rotation. Note explicitly that full login-flow verification against the live production app (issuing and verifying a real session token end-to-end) is **not** performed here, because it depends on the Neon dev database's email-login migration rollout, which is a separate, already-known blocker (Neon compute-time quota exhaustion, tracked from the email-login-and-invites plan) — not something this task can resolve. Local automated tests (Task 1 and 2's `env.validation.test.ts` suite) and the existing local manual test checklist already exercise the token-signing code path itself.

---
