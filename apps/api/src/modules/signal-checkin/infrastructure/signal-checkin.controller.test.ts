import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SignalCheckinController } from "./signal-checkin.controller.ts";
import { RecordSignalCheckinUseCase } from "../application/use-cases/record-signal-checkin.use-case.ts";
import { RecordAssessmentAbandonmentUseCase } from "../application/use-cases/record-assessment-abandonment.use-case.ts";
import { RecordUnsentChatDraftUseCase } from "../application/use-cases/record-unsent-chat-draft.use-case.ts";
import {
  SIGNAL_CHECKIN_REPOSITORY,
  UnknownInstitutionOrSectorError,
} from "../application/ports/signal-checkin-repository.port.ts";
import type {
  RecordSignalIncrementParams,
  SignalCheckinRepository,
  SignalCounters,
} from "../application/ports/signal-checkin-repository.port.ts";
import { NOTIFICATION_PUBLISHER, type NotificationEvent, type NotificationPublisher } from "@/modules/notification/application/ports/notification.port.js";

const ZERO_COUNTERS: SignalCounters = { checkIns: 0, concerning: 0, abandoned: 0, unsentChatDrafts: 0 };

class FakeSignalCheckinRepository implements SignalCheckinRepository {
  public calls: RecordSignalIncrementParams[] = [];
  public shouldThrowUnknownInstitution = false;
  async recordIncrement(params: RecordSignalIncrementParams): Promise<SignalCounters | null> {
    if (this.shouldThrowUnknownInstitution) {
      throw new UnknownInstitutionOrSectorError();
    }
    this.calls.push(params);
    return ZERO_COUNTERS;
  }
}

const fakeNotificationPublisher: NotificationPublisher = {
  async publish(_event: NotificationEvent): Promise<void> {},
};

describe("signal-checkin controller", () => {
  let app: INestApplication;
  let repository: FakeSignalCheckinRepository;

  beforeAll(async () => {
    repository = new FakeSignalCheckinRepository();
    const moduleRef = await Test.createTestingModule({
      controllers: [SignalCheckinController],
      providers: [
        RecordSignalCheckinUseCase,
        RecordAssessmentAbandonmentUseCase,
        RecordUnsentChatDraftUseCase,
        { provide: SIGNAL_CHECKIN_REPOSITORY, useValue: repository },
        { provide: NOTIFICATION_PUBLISHER, useValue: fakeNotificationPublisher },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /signals/checkin returns 204 for a valid body and forwards it to the repository", async () => {
    const response = await request(app.getHttpServer()).post("/signals/checkin").send({
      institutionId: "inst-1",
      sectorId: "UTI",
      concerning: true,
      deviceSignalId: "device-1",
    });

    expect(response.status).toBe(204);
    expect(repository.calls).toHaveLength(1);
    expect(repository.calls[0]).toMatchObject({
      institutionId: "inst-1",
      sectorId: "UTI",
      increments: { checkIns: 1, concerning: 1 },
    });
  });

  it("POST /signals/checkin returns 400 for a malformed body", async () => {
    const response = await request(app.getHttpServer()).post("/signals/checkin").send({ institutionId: "inst-1" });

    expect(response.status).toBe(400);
  });

  it("POST /signals/checkin returns 400 when the institution is unknown", async () => {
    repository.shouldThrowUnknownInstitution = true;
    const response = await request(app.getHttpServer()).post("/signals/checkin").send({
      institutionId: "does-not-exist",
      sectorId: "UTI",
      concerning: false,
      deviceSignalId: "device-1",
    });

    expect(response.status).toBe(400);
    repository.shouldThrowUnknownInstitution = false;
  });

  it("POST /signals/checkin requires no authentication", async () => {
    const response = await request(app.getHttpServer()).post("/signals/checkin").send({
      institutionId: "inst-1",
      sectorId: "UTI",
      concerning: false,
      deviceSignalId: "device-2",
    });

    expect(response.status).not.toBe(401);
  });

  it("POST /signals/abandon returns 204 for a valid body and forwards it to the repository", async () => {
    const response = await request(app.getHttpServer()).post("/signals/abandon").send({
      institutionId: "inst-1",
      sectorId: "UTI",
      deviceSignalId: "device-3",
    });

    expect(response.status).toBe(204);
    expect(repository.calls).toContainEqual(
      expect.objectContaining({ institutionId: "inst-1", sectorId: "UTI", increments: { abandoned: 1 } }),
    );
  });

  it("POST /signals/abandon returns 400 for a malformed body", async () => {
    const response = await request(app.getHttpServer()).post("/signals/abandon").send({ institutionId: "inst-1" });

    expect(response.status).toBe(400);
  });

  it("POST /signals/abandon returns 400 when the institution is unknown", async () => {
    repository.shouldThrowUnknownInstitution = true;
    const response = await request(app.getHttpServer()).post("/signals/abandon").send({
      institutionId: "does-not-exist",
      sectorId: "UTI",
      deviceSignalId: "device-4",
    });

    expect(response.status).toBe(400);
    repository.shouldThrowUnknownInstitution = false;
  });

  it("POST /signals/abandon requires no authentication", async () => {
    const response = await request(app.getHttpServer()).post("/signals/abandon").send({
      institutionId: "inst-1",
      sectorId: "UTI",
      deviceSignalId: "device-5",
    });

    expect(response.status).not.toBe(401);
  });

  it("POST /signals/chat-draft returns 204 for a valid body and forwards it to the repository", async () => {
    const response = await request(app.getHttpServer()).post("/signals/chat-draft").send({
      institutionId: "inst-1",
      sectorId: "UTI",
      deviceSignalId: "device-6",
    });

    expect(response.status).toBe(204);
    expect(repository.calls).toContainEqual(
      expect.objectContaining({ institutionId: "inst-1", sectorId: "UTI", increments: { unsentChatDrafts: 1 } }),
    );
  });

  it("POST /signals/chat-draft returns 400 for a malformed body", async () => {
    const response = await request(app.getHttpServer()).post("/signals/chat-draft").send({ institutionId: "inst-1" });

    expect(response.status).toBe(400);
  });

  it("POST /signals/chat-draft returns 400 when the institution is unknown", async () => {
    repository.shouldThrowUnknownInstitution = true;
    const response = await request(app.getHttpServer()).post("/signals/chat-draft").send({
      institutionId: "does-not-exist",
      sectorId: "UTI",
      deviceSignalId: "device-7",
    });

    expect(response.status).toBe(400);
    repository.shouldThrowUnknownInstitution = false;
  });

  it("POST /signals/chat-draft requires no authentication", async () => {
    const response = await request(app.getHttpServer()).post("/signals/chat-draft").send({
      institutionId: "inst-1",
      sectorId: "UTI",
      deviceSignalId: "device-8",
    });

    expect(response.status).not.toBe(401);
  });
});
