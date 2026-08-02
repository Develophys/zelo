import { Inject, Injectable } from "@nestjs/common";
import type { ManagerInsightRepository, StoredManagerInsight } from "../../application/ports/manager-insight-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaManagerInsightRepository implements ManagerInsightRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async save(entry: {
    interpretation: string;
    suggestedActions: string[];
    summary: string;
    createdByManagerName: string | null;
  }): Promise<void> {
    await this.prisma.managerInsight.create({ data: entry });
  }

  async findAll(): Promise<StoredManagerInsight[]> {
    const rows = await this.prisma.managerInsight.findMany({ orderBy: { generatedAt: "desc" } });
    return rows.map((row) => ({
      id: row.id,
      interpretation: row.interpretation,
      suggestedActions: row.suggestedActions,
      summary: row.summary,
      generatedAt: row.generatedAt,
      createdByManagerName: row.createdByManagerName,
    }));
  }
}
