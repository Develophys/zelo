import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Nothing else in this codebase implements the Next.js/CRA-style .env cascade
// (.env.$(NODE_ENV).local overriding .env) — plain `dotenv/config` and
// @nestjs/config's default ConfigModule.forRoot() both only ever read `.env`.
// This file adds that cascade for local dev, imported first by every process
// entry point (main.ts, prisma.config.ts) so process.env is fully resolved
// before anything else runs.
//
// dotenv's config() never overrides a variable already present in
// process.env, so loading in this order (most specific first) makes the
// most specific file win: NODE_ENV+local > local > NODE_ENV > the plain
// `.env` every other file falls back to.
const NODE_ENV = process.env.NODE_ENV ?? "development";

const CANDIDATES = [`.env.${NODE_ENV}.local`, ".env.local", `.env.${NODE_ENV}`, ".env"];

for (const fileName of CANDIDATES) {
  const path = resolve(process.cwd(), fileName);
  if (existsSync(path)) {
    loadDotenv({ path });
  }
}
