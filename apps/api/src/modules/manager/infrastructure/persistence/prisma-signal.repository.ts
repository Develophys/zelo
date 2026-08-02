import { Inject, Injectable } from "@nestjs/common";
import type { SignalRepository, SignalRow } from "../../application/ports/signal-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaSignalRepository implements SignalRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll(institutionId: string): Promise<SignalRow[]> {
    const rows = await this.prisma.signal.findMany({ where: { institutionId } });
    return rows.map((row) => ({
      department: row.department,
      weekStart: row.weekStart,
      checkIns: row.checkIns,
      concerning: row.concerning,
    }));
  }
}
