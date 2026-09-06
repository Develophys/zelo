import { Inject, Injectable } from "@nestjs/common";
import type { DatabaseHealthPort } from "../application/ports/database-health.port.ts";
import { PrismaService } from "@/shared/prisma/prisma.service.js";

@Injectable()
export class PrismaDatabaseHealthAdapter implements DatabaseHealthPort {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async isReachable(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
