import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../../../../../generated/prisma/client.ts";
import type { RecordCheckinParams, SignalCheckinRepository } from "../../application/ports/signal-checkin-repository.port.ts";
import { UnknownInstitutionError } from "../../application/ports/signal-checkin-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";
const FOREIGN_KEY_VIOLATION = "P2003";

@Injectable()
export class PrismaSignalCheckinRepository implements SignalCheckinRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async recordCheckin(params: RecordCheckinParams): Promise<void> {
    // Both writes must be atomic: if the Signal upsert fails (e.g. P2003 on an unknown
    // institutionId), the dedup-key insert must roll back with it. Otherwise a failed
    // attempt leaves its dedup key committed, and a later genuinely-valid retry with the
    // exact same device/institution/department/week silently no-ops on the leftover key —
    // the real signal is lost with no error anywhere.
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.signalDedupKey.create({ data: { dedupKey: params.dedupKey } });
        await tx.signal.upsert({
          where: {
            institutionId_department_weekStart: {
              institutionId: params.institutionId,
              department: params.department,
              weekStart: params.weekStart,
            },
          },
          update: { checkIns: { increment: 1 }, concerning: { increment: params.concerning ? 1 : 0 } },
          create: {
            institutionId: params.institutionId,
            department: params.department,
            weekStart: params.weekStart,
            checkIns: 1,
            concerning: params.concerning ? 1 : 0,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        // Already counted this device/institution/department/week — no-op, still a
        // success to the caller (the client can't distinguish a fresh count from a
        // deduped one, by design).
        return;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === FOREIGN_KEY_VIOLATION) {
        throw new UnknownInstitutionError();
      }
      throw error;
    }
  }
}
