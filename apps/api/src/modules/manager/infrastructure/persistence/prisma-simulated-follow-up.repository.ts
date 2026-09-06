import { Inject, Injectable } from "@nestjs/common";
import type { SimulatedFollowUpRepository, SimulatedFollowUpRow } from "@/modules/manager/application/ports/simulated-follow-up-repository.port.js";
import { PrismaService } from "@/shared/prisma/prisma.service.js";

@Injectable()
export class PrismaSimulatedFollowUpRepository implements SimulatedFollowUpRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll(): Promise<SimulatedFollowUpRow[]> {
    const rows = await this.prisma.simulatedFollowUp.findMany();
    return rows.map((row) => ({ weekStart: row.weekStart, sent: row.sent, responded: row.responded }));
  }
}
