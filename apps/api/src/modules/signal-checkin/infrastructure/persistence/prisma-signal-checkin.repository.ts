import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../../../../../generated/prisma/client.ts";
import type {
  RecordSignalIncrementParams,
  SignalCheckinRepository,
  SignalCounters,
} from "@/modules/signal-checkin/application/ports/signal-checkin-repository.port.js";
import { UnknownInstitutionOrSectorError } from "@/modules/signal-checkin/application/ports/signal-checkin-repository.port.js";
import { PrismaService } from "@/shared/prisma/prisma.service.js";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";
const FOREIGN_KEY_VIOLATION = "P2003";

@Injectable()
export class PrismaSignalCheckinRepository implements SignalCheckinRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async recordIncrement(params: RecordSignalIncrementParams): Promise<SignalCounters | null> {
    const { checkIns = 0, concerning = 0, abandoned = 0, unsentChatDrafts = 0 } = params.increments;

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
          update: {
            checkIns: { increment: checkIns },
            concerning: { increment: concerning },
            abandoned: { increment: abandoned },
            unsentChatDrafts: { increment: unsentChatDrafts },
          },
          create: {
            institutionId: params.institutionId,
            sectorId: params.sectorId,
            weekStart: params.weekStart,
            checkIns,
            concerning,
            abandoned,
            unsentChatDrafts,
          },
          select: { checkIns: true, concerning: true, abandoned: true, unsentChatDrafts: true },
        });
        return signal;
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
