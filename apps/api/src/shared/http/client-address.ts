export function resolveClientAddress(
  headers: Record<string, string | string[] | undefined> | undefined,
  fallback: string | undefined,
): string {
  const flyClientIp = headers?.["fly-client-ip"];
  if (typeof flyClientIp === "string" && flyClientIp.length > 0) return flyClientIp;
  return fallback ?? "unknown";
}
