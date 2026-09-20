export const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:8080"];

export function resolveAllowedOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const configured = env.CORS_ALLOWED_ORIGINS;
  if (!configured) return DEFAULT_ALLOWED_ORIGINS;
  return configured.split(",").map((origin) => origin.trim()).filter((origin) => origin.length > 0);
}
