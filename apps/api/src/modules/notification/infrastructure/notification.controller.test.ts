import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import request from "supertest";
import { NotificationController } from "./notification.controller.ts";
import { ListNotificationsUseCase } from "../application/use-cases/list-notifications.use-case.ts";
import { MarkNotificationReadUseCase } from "../application/use-cases/mark-notification-read.use-case.ts";
import { NOTIFICATION_REPOSITORY } from "../application/ports/notification-repository.port.ts";
import { ManagerAuthGuard } from "../../manager/infrastructure/manager-auth.guard.ts";
import { ManagerTokenService } from "../../manager/application/services/manager-token.service.ts";
import { MANAGER_REPOSITORY } from "../../manager/application/ports/manager-repository.port.ts";
import type { ManagerRepository, ManagerRow } from "../../manager/application/ports/manager-repository.port.ts";

class FakeManagerRepository implements ManagerRepository {
  rows: ManagerRow[] = [];
  async findByEmail(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  // ManagerAuthGuard re-reads the row on every authenticated request.
  async findById(id: string): Promise<ManagerRow | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }
  async findAllByInstitution(): Promise<never> {
    throw new Error("not used in this test");
  }
  async create(): Promise<never> {
    throw new Error("not used in this test");
  }
  async update(): Promise<void> {
    throw new Error("not used in this test");
  }
  async countActiveHospitalAdmins(): Promise<number> {
    throw new Error("not used in this test");
  }
  async findActiveHospitalAdminIds(): Promise<never> {
    throw new Error("not used in this test");
  }
  async findLapsedInvites(): Promise<never> {
    throw new Error("not used in this test");
  }
  async delete(): Promise<never> {
    throw new Error("not used in this test");
  }
}

class FakeNotificationRepository {
  page = {
    items: [
      {
        id: "n-1",
        type: "INVITE_ACCEPTED" as const,
        payload: { kind: "manager", name: "Paulo" },
        sectorId: null,
        sectorName: null,
        readAt: null,
        createdAt: new Date("2026-08-20T10:00:00.000Z"),
      },
    ],
    nextCursor: "n-1",
    total: 42,
  };
  unread = 3;
  markReadResult = true;
  lastMarkRead: { managerId: string; id: string } | null = null;
  markedAllFor: string | null = null;
  lastQuery: { managerId: string; cursor: string | null; limit: number } | null = null;

  async findPage(managerId: string, query: { cursor: string | null; limit: number }) {
    this.lastQuery = { managerId, ...query };
    return this.page;
  }
  async countUnread() {
    return this.unread;
  }
  async markRead(managerId: string, id: string) {
    this.lastMarkRead = { managerId, id };
    return this.markReadResult;
  }
  async markAllRead(managerId: string) {
    this.markedAllFor = managerId;
  }
  async createMany() {}
  async deleteReadOlderThan() {
    return 0;
  }
}

function fakeConfig(): ConfigService {
  const values: Record<string, string> = { MANAGER_TOKEN_SECRET: "test-secret" };
  return { getOrThrow: (key: string) => values[key], get: () => undefined } as unknown as ConfigService;
}

describe("notification controller", () => {
  let app: INestApplication;
  let repository: FakeNotificationRepository;
  let managerRepository: FakeManagerRepository;
  let tokenService: ManagerTokenService;
  let token: string;

  beforeAll(async () => {
    repository = new FakeNotificationRepository();
    managerRepository = new FakeManagerRepository();
    managerRepository.rows = [
      {
        id: "manager-1",
        name: "Ana",
        email: "ana@zelo-demo.local",
        passwordHash: "h",
        setPasswordTokenExpiresAt: null,
        institutionId: "institution-1",
        role: "HOSPITAL_ADMIN",
        isActive: true,
      },
    ];
    tokenService = new ManagerTokenService(fakeConfig());
    token = tokenService.issue("manager-1", "Ana", "institution-1", "HOSPITAL_ADMIN").token;

    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        ListNotificationsUseCase,
        MarkNotificationReadUseCase,
        ManagerAuthGuard,
        { provide: ManagerTokenService, useValue: tokenService },
        { provide: MANAGER_REPOSITORY, useValue: managerRepository },
        { provide: NOTIFICATION_REPOSITORY, useValue: repository },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(req: request.Test): request.Test {
    return req.set("Authorization", `Bearer ${token}`);
  }

  it("rejects a request with no token", async () => {
    await request(app.getHttpServer()).get("/manager/notifications").expect(401);
  });

  it("returns a page shaped like every other list in the panel", async () => {
    const response = await auth(request(app.getHttpServer()).get("/manager/notifications")).expect(200);

    expect(response.body).toEqual({
      items: [
        {
          id: "n-1",
          type: "INVITE_ACCEPTED",
          payload: { kind: "manager", name: "Paulo" },
          sectorName: null,
          readAt: null,
          createdAt: "2026-08-20T10:00:00.000Z",
        },
      ],
      nextCursor: "n-1",
      total: 42,
    });
  });

  it("scopes the query to the authenticated manager, never to a parameter", async () => {
    await auth(request(app.getHttpServer()).get("/manager/notifications?cursor=n-9&limit=25")).expect(200);

    expect(repository.lastQuery).toEqual({ managerId: "manager-1", cursor: "n-9", limit: 25 });
  });

  it("clamps an absurd limit rather than letting a caller pull the whole table", async () => {
    await auth(request(app.getHttpServer()).get("/manager/notifications?limit=5000")).expect(200);

    expect(repository.lastQuery!.limit).toBe(50);
  });

  it("falls back to the default limit when the parameter is not a number", async () => {
    await auth(request(app.getHttpServer()).get("/manager/notifications?limit=abc")).expect(200);

    expect(repository.lastQuery!.limit).toBe(20);
  });

  it("falls back to the default limit for a negative or zero limit", async () => {
    await auth(request(app.getHttpServer()).get("/manager/notifications?limit=-3")).expect(200);
    expect(repository.lastQuery!.limit).toBe(20);

    await auth(request(app.getHttpServer()).get("/manager/notifications?limit=0")).expect(200);
    expect(repository.lastQuery!.limit).toBe(20);
  });

  it("serves the unread count on its own, since the badge is on every screen", async () => {
    const response = await auth(request(app.getHttpServer()).get("/manager/notifications/unread-count")).expect(200);

    expect(response.body).toEqual({ count: 3 });
  });

  it("marks one notification read", async () => {
    await auth(request(app.getHttpServer()).patch("/manager/notifications/n-1/read")).expect(204);

    expect(repository.lastMarkRead).toEqual({ managerId: "manager-1", id: "n-1" });
  });

  it("returns 404, not 403, for a notification that is not this manager's — existence is not the caller's to know", async () => {
    repository.markReadResult = false;

    await auth(request(app.getHttpServer()).patch("/manager/notifications/someone-elses/read")).expect(404);

    repository.markReadResult = true;
  });

  it("marks everything read", async () => {
    await auth(request(app.getHttpServer()).post("/manager/notifications/read-all")).expect(204);

    expect(repository.markedAllFor).toBe("manager-1");
  });
});
