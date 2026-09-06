import { Inject, Injectable } from "@nestjs/common";
import type { ManagerInsightRepository, StoredManagerInsight } from "@/modules/manager/application/ports/manager-insight-repository.port.js";
import { PrismaService } from "@/shared/prisma/prisma.service.js";

@Injectable()
export class PrismaManagerInsightRepository implements ManagerInsightRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async save(entry: {
    interpretation: string;
    suggestedActions: string[];
    summary: string;
    createdByManagerName: string | null;
    institutionId: string;
  }): Promise<void> {
    await this.prisma.managerInsight.create({ data: entry });
  }

  async findAll(institutionId: string): Promise<StoredManagerInsight[]> {
    const rows = await this.prisma.managerInsight.findMany({
      where: { institutionId },
      orderBy: { generatedAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      interpretation: row.interpretation,
      suggestedActions: row.suggestedActions,
      summary: row.summary,
      generatedAt: row.generatedAt,
      createdByManagerName: row.createdByManagerName,
      institutionId: row.institutionId,
    }));
  }
}
