import {
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { ManagerAuthGuard } from "@/modules/manager/infrastructure/manager-auth.guard.js";
import { DEFAULT_LIMIT, ListNotificationsUseCase, MAX_LIMIT } from "../application/use-cases/list-notifications.use-case.ts";
import { MarkNotificationReadUseCase, NotificationNotFoundError } from "../application/use-cases/mark-notification-read.use-case.ts";
import type { NotificationType } from "../application/ports/notification.port.ts";

interface NotificationDto {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  sectorName: string | null;
  readAt: string | null;
  createdAt: string;
}

function parseLimit(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

@Controller("manager/notifications")
@UseGuards(ManagerAuthGuard)
export class NotificationController {
  constructor(
    @Inject(ListNotificationsUseCase) private readonly listNotifications: ListNotificationsUseCase,
    @Inject(MarkNotificationReadUseCase) private readonly markRead: MarkNotificationReadUseCase,
  ) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ): Promise<{ items: NotificationDto[]; nextCursor: string | null; total: number | null }> {
    const page = await this.listNotifications.execute(request.manager!.id, {
      cursor: cursor ?? null,
      limit: parseLimit(limit),
    });

    return {
      items: page.items.map((row) => ({
        id: row.id,
        type: row.type,
        payload: row.payload,
        sectorName: row.sectorName,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  }

  @Get("unread-count")
  async unreadCount(@Req() request: Request): Promise<{ count: number }> {
    return { count: await this.listNotifications.unreadCount(request.manager!.id) };
  }

  @Patch(":id/read")
  @HttpCode(204)
  async read(@Req() request: Request, @Param("id") id: string): Promise<void> {
    try {
      await this.markRead.execute(request.manager!.id, id);
    } catch (error) {
      if (error instanceof NotificationNotFoundError) {
        throw new NotFoundException();
      }
      throw error;
    }
  }

  @Post("read-all")
  @HttpCode(204)
  async readAll(@Req() request: Request): Promise<void> {
    await this.markRead.executeAll(request.manager!.id);
  }
}
