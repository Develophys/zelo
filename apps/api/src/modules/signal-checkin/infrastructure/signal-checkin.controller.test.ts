import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SignalCheckinController } from "./signal-checkin.controller.ts";
import { RecordSignalCheckinUseCase } from "../application/use-cases/record-signal-checkin.use-case.ts";
import {
  SIGNAL_CHECKIN_REPOSITORY,
  UnknownInstitutionOrSectorError,
} from "../application/ports/signal-checkin-repository.port.ts";
import type { RecordCheckinParams, SignalCheckinRepository } from "../application/ports/signal-checkin-repository.port.ts";

class FakeSignalCheckinRepository implements SignalCheckinRepository {
  public calls: RecordCheckinParams[] = [];
  public shouldThrowUnknownInstitution = false;
  async recordCheckin(params: RecordCheckinParams): Promise<void> {
    if (this.shouldThrowUnknownInstitution) {
      throw new UnknownInstitutionOrSectorError();
    }
    this.calls.push(params);
  }
}

describe("signal-checkin controller", () => {
  let app: INestApplication;
  let repository: FakeSignalCheckinRepository;

  beforeAll(async () => {
    repository = new FakeSignalCheckinRepository();
    const moduleRef = await Test.createTestingModule({
      controllers: [SignalCheckinController],
      providers: [
        RecordSignalCheckinUseCase,
        { provide: SIGNAL_CHECKIN_REPOSITORY, useValue: repository },
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
    expect(repository.calls[0]).toMatchObject({ institutionId: "inst-1", sectorId: "UTI", concerning: true });
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
});
