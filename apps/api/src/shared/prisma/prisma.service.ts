import "../config/load-env.ts";
import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { PrismaClient } from "../../../generated/prisma/client.ts";

neonConfig.webSocketConstructor = ws;

// Neon's pooler proxies raw Postgres TCP over a WebSocket (port 443) instead of
// the classic 5432 wire protocol. Some networks (observed: Fly.io's egress to
// this Neon project) silently black-hole the TCP+TLS Postgres protocol despite
// completing the initial TCP handshake, while WSS traffic on 443 is unaffected.
// Local dev/CI always target a plain Postgres container, which the Neon
// WebSocket driver cannot reach, so only switch adapters for a real Neon host.
function isNeonHost(connectionString: string | undefined): boolean {
  return connectionString?.includes(".neon.tech") ?? false;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    super({
      adapter: isNeonHost(connectionString)
        ? new PrismaNeon({ connectionString })
        : new PrismaPg({ connectionString }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
