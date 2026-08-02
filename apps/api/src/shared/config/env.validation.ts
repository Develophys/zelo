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
    CORS_ALLOWED_ORIGINS: z.string().optional(),
  })
  .passthrough()
  .refine((env) => env.AI_PROVIDER === "mock" || !!env.GROQ_API_KEY, {
    message: "GROQ_API_KEY is required when AI_PROVIDER is not \"mock\"",
    path: ["GROQ_API_KEY"],
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
