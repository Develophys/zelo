import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "../../../../../generated/prisma/client.ts";
import type {
  CreateNotificationParams,
  NotificationPage,
  NotificationRepository,
  NotificationRow,
} from "../../application/ports/notification-repository.port.ts";
import type { NotificationType } from "../../application/ports/notification.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

type Row = {
  id: string;
  type: NotificationType;
  payload: Prisma.JsonValue;
  sectorId: string | null;
  sector: { name: string } | null;
  readAt: Date | null;
  createdAt: Date;
};

function toRow(row: Row): NotificationRow {
  return {
    id: row.id,
    type: row.type,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    sectorId: row.sectorId,
    sectorName: row.sector?.name ?? null,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

const SELECT = {
  id: true,
  type: true,
  payload: true,
  sectorId: true,
  sector: { select: { name: true } },
  readAt: true,
  createdAt: true,
} as const;

@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createMany(rows: CreateNotificationParams[]): Promise<void> {
    await this.prisma.notification.createMany({
      data: rows.map((row) => ({ ...row, payload: row.payload as Prisma.InputJsonValue })),
      skipDuplicates: true,
    });
  }

  // Keyset pagination on (createdAt desc, id desc): an offset would re-serve or
  // skip a row whenever a notification arrives mid-scroll.
  async findPage(managerId: string, query: { cursor: string | null; limit: number }): Promise<NotificationPage> {
    const rows = (await this.prisma.notification.findMany({
      where: { managerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: SELECT,
    })) as Row[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const total = await this.prisma.notification.count({ where: { managerId } });

    return {
      items: page.map(toRow),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      total,
    };
  }

  async countUnread(managerId: string): Promise<number> {
    return this.prisma.notification.count({ where: { managerId, readAt: null } });
  }

  async markRead(managerId: string, id: string): Promise<boolean> {
    // Scoped by managerId in the WHERE, so another manager's row is simply not
    // found — the caller cannot tell it exists.
    const result = await this.prisma.notification.updateMany({
      where: { id, managerId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count > 0) return true;
    const exists = await this.prisma.notification.count({ where: { id, managerId } });
    return exists > 0;
  }

  async markAllRead(managerId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { managerId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async deleteReadOlderThan(cutoff: Date): Promise<number> {
    const result = await this.prisma.notification.deleteMany({
      where: { readAt: { not: null, lt: cutoff } },
    });
    return result.count;
  }
}
