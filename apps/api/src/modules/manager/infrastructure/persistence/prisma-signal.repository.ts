import { Inject, Injectable } from "@nestjs/common";
import type { SignalRepository, SignalRow } from "../../application/ports/signal-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaSignalRepository implements SignalRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll(institutionId: string, sectorIds: string[]): Promise<SignalRow[]> {
    const rows = await this.prisma.signal.findMany({
      where: { institutionId, sectorId: { in: sectorIds } },
      select: { sectorId: true, weekStart: true, checkIns: true, concerning: true, sector: { select: { name: true } } },
    });
    return rows.map((row) => ({
      sectorId: row.sectorId,
      sectorName: row.sector.name,
      weekStart: row.weekStart,
      checkIns: row.checkIns,
      concerning: row.concerning,
    }));
  }
}
