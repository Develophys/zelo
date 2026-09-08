import { Inject, Injectable } from "@nestjs/common";
import type {
  ManagerInsightPage,
  ManagerInsightRepository,
} from "@/modules/manager/application/ports/manager-insight-repository.port.js";
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

  // Keyset pagination on (generatedAt desc, id desc): an offset would re-serve
  // or skip a row whenever a new analysis is generated mid-scroll.
  async findPage(institutionId: string, query: { cursor: string | null; limit: number }): Promise<ManagerInsightPage> {
    const rows = await this.prisma.managerInsight.findMany({
      where: { institutionId },
      orderBy: [{ generatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const total = await this.prisma.managerInsight.count({ where: { institutionId } });

    return {
      items: page.map((row) => ({
        id: row.id,
        interpretation: row.interpretation,
        suggestedActions: row.suggestedActions,
        summary: row.summary,
        generatedAt: row.generatedAt,
        createdByManagerName: row.createdByManagerName,
        institutionId: row.institutionId,
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      total,
    };
  }
}
