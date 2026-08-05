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
    MANAGER_TOKEN_SECRET: z.string({ required_error: "MANAGER_TOKEN_SECRET is required" }).min(1, "MANAGER_TOKEN_SECRET is required"),
    ADMIN_TOKEN_SECRET: z.string({ required_error: "ADMIN_TOKEN_SECRET is required" }).min(1, "ADMIN_TOKEN_SECRET is required"),
    PEER_PARTNER_TOKEN_SECRET: z.string({ required_error: "PEER_PARTNER_TOKEN_SECRET is required" }).min(1, "PEER_PARTNER_TOKEN_SECRET is required"),
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
  .refine((env) => env.NODE_ENV !== "production" || env.MANAGER_TOKEN_SECRET.trim().length >= 32, {
    message: "MANAGER_TOKEN_SECRET must be at least 32 characters in production (the \"change-me-in-production\" placeholder and other short values are rejected — a weak key lets anyone forge a valid session token)",
    path: ["MANAGER_TOKEN_SECRET"],
  })
  .refine((env) => env.NODE_ENV !== "production" || env.ADMIN_TOKEN_SECRET.trim().length >= 32, {
    message: "ADMIN_TOKEN_SECRET must be at least 32 characters in production (the \"change-me-in-production\" placeholder and other short values are rejected — a weak key lets anyone forge a valid session token)",
    path: ["ADMIN_TOKEN_SECRET"],
  })
  .refine((env) => env.NODE_ENV !== "production" || env.PEER_PARTNER_TOKEN_SECRET.trim().length >= 32, {
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
