const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function hostnameOf(variable: string, connectionString: string): string {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error(
      `${variable} is not a parseable connection string, so this script cannot confirm which database it would write to. Refusing to run.`,
    );
  }
  return parsed.hostname;
}

function isLocal(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname);
}

export function assertSameDatabaseTarget(env: NodeJS.ProcessEnv = process.env): void {
  const directUrl = env.DIRECT_DATABASE_URL;
  if (!directUrl) return;

  const databaseUrl = env.DATABASE_URL;
  const directHost = hostnameOf("DIRECT_DATABASE_URL", directUrl);

  if (!databaseUrl) {
    throw new Error(
      `DIRECT_DATABASE_URL points at ${directHost} but DATABASE_URL is not set. ` +
        `Prisma's CLI reads DIRECT_DATABASE_URL while this script writes through DATABASE_URL, ` +
        `so the env cascade would silently fall through to apps/api/.env and write somewhere else. ` +
        `Set DATABASE_URL for the same database and re-run.`,
    );
  }

  const databaseHost = hostnameOf("DATABASE_URL", databaseUrl);

  if (isLocal(databaseHost) !== isLocal(directHost)) {
    throw new Error(
      `DATABASE_URL and DIRECT_DATABASE_URL point at different databases: ` +
        `this script would write to ${databaseHost} while Prisma's CLI targets ${directHost}. ` +
        `Refusing to run — a destructive seed against the wrong database reports success either way.`,
    );
  }
}
