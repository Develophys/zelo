import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../../../../../generated/prisma/client.ts";
import type { RecordCheckinParams, SignalCheckinRepository } from "../../application/ports/signal-checkin-repository.port.ts";
import { UnknownInstitutionOrSectorError } from "../../application/ports/signal-checkin-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";
const FOREIGN_KEY_VIOLATION = "P2003";

@Injectable()
export class PrismaSignalCheckinRepository implements SignalCheckinRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async recordCheckin(params: RecordCheckinParams): Promise<{ checkIns: number } | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.signalDedupKey.create({ data: { dedupKey: params.dedupKey } });
        const signal = await tx.signal.upsert({
          where: {
            institutionId_sectorId_weekStart: {
              institutionId: params.institutionId,
              sectorId: params.sectorId,
              weekStart: params.weekStart,
            },
          },
          update: { checkIns: { increment: 1 }, concerning: { increment: params.concerning ? 1 : 0 } },
          create: {
            institutionId: params.institutionId,
            sectorId: params.sectorId,
            weekStart: params.weekStart,
            checkIns: 1,
            concerning: params.concerning ? 1 : 0,
          },
          select: { checkIns: true },
        });
        return { checkIns: signal.checkIns };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        return null;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === FOREIGN_KEY_VIOLATION) {
        throw new UnknownInstitutionOrSectorError();
      }
      throw error;
    }
  }
}
