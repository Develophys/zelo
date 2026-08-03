import { describe, expect, it, afterAll, beforeAll, beforeEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import request from "supertest";
import { ManagerAdminController } from "./manager-admin.controller.ts";
import { ManagerAuthGuard } from "./manager-auth.guard.ts";
import { HospitalAdminGuard } from "./hospital-admin.guard.ts";
import { ManagerTokenService } from "../application/services/manager-token.service.ts";
import { SECTOR_REPOSITORY } from "../../sector/application/ports/sector-repository.port.ts";
import type { AdminSectorRow, SectorRepository, UpdateSectorParams } from "../../sector/application/ports/sector-repository.port.ts";
import { SectorNameConflictError } from "../../sector/application/ports/sector-repository.port.ts";
import { CreateManagerUseCase } from "../application/use-cases/create-manager.use-case.ts";
import { UpdateManagerUseCase } from "../application/use-cases/update-manager.use-case.ts";
import { SendManagerSetPasswordEmailUseCase } from "../application/use-cases/send-manager-set-password-email.use-case.ts";
import { ManagerPasswordService } from "../application/services/manager-password.service.ts";
import { MANAGER_REPOSITORY } from "../application/ports/manager-repository.port.ts";
import type { CreateManagerParams, ManagerRepository, ManagerRow, ManagerSummaryRow, UpdateManagerParams } from "../application/ports/manager-repository.port.ts";
import { CreatePeerPartnerUseCase } from "../application/use-cases/create-peer-partner.use-case.ts";
import { SendPeerPartnerSetPasswordEmailUseCase } from "../application/use-cases/send-peer-partner-set-password-email.use-case.ts";
import { PeerPartnerPasswordService } from "../../peer-partner/application/services/peer-partner-password.service.ts";
import { PEER_PARTNER_REPOSITORY } from "../../peer-partner/application/ports/peer-partner-repository.port.ts";
import type { CreatePeerPartnerParams, PeerPartnerRepository, PeerPartnerRow, PeerPartnerSummaryRow, UpdatePeerPartnerParams } from "../../peer-partner/application/ports/peer-partner-repository.port.ts";
import { PeerChatGateway } from "../../peer-chat/infrastructure/peer-chat.gateway.ts";
import { EMAIL_PORT } from "../../../shared/email/email.port.ts";
import type { EmailPort, EmailTemplate, SendEmailParams } from "../../../shared/email/email.port.ts";

class FakeSectorRepository implements SectorRepository {
  public rows: (AdminSectorRow & { institutionId: string })[] = [];
  public shouldThrowConflict = false;

  async create(institutionId: string, name: string) {
    if (this.shouldThrowConflict) throw new SectorNameConflictError();
    const row = { id: `sector-${this.rows.length + 1}`, name, isActive: true, managerId: null, managerName: null, institutionId };
    this.rows.push(row);
    return { id: row.id, name: row.name };
  }
  async findAllForAdmin(institutionId: string): Promise<AdminSectorRow[]> {
    return this.rows
      .filter((row) => row.institutionId === institutionId)
      .map(({ id, name, isActive, managerId, managerName }) => ({ id, name, isActive, managerId, managerName }));
  }
  async findById(id: string) {
    const row = this.rows.find((r) => r.id === id);
    return row ? { id: row.id, institutionId: row.institutionId } : null;
  }
  async update(id: string, patch: UpdateSectorParams): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    if (patch.isActive !== undefined) row.isActive = patch.isActive;
    if (patch.managerId !== undefined) row.managerId = patch.managerId;
  }
  async findActiveByInstitution(): Promise<{ id: string; name: string }[]> {
    throw new Error("not used in this test");
  }
  async findActiveByIds(): Promise<{ id: string; name: string }[]> {
    throw new Error("not used in this test");
  }
  async findAssignedSectorIds(): Promise<string[]> {
    throw new Error("not used in this test");
  }
  async reassignManagerSectors(): Promise<void> {
    // Manager-tab tests only assert the manager-side response; sector
    // reassignment side effects aren't checked here, so this is a no-op.
  }
  async findByIdsInInstitution(institutionId: string, sectorIds: string[]) {
    return this.rows.filter((row) => row.institutionId === institutionId && sectorIds.includes(row.id)).map(({ id }) => ({ id }));
  }
}

class FakeManagerRepository implements ManagerRepository {
  public rows: ManagerRow[] = [];
  public activeHospitalAdmins = 1;
  async findByEmail(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(): Promise<ManagerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<ManagerRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findAllByInstitution(institutionId: string): Promise<ManagerSummaryRow[]> {
    return this.rows
      .filter((r) => r.institutionId === institutionId)
      .map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        isActive: r.isActive,
        sectorNames: [],
        hasPassword: r.passwordHash !== null,
        setPasswordTokenExpiresAt: r.setPasswordTokenExpiresAt?.toISOString() ?? null,
      }));
  }
  async create(params: CreateManagerParams): Promise<{ id: string; name: string; email: string }> {
    const row: ManagerRow = {
      id: `manager-${this.rows.length + 10}`,
      name: params.name,
      email: params.email,
      passwordHash: null,
      setPasswordTokenExpiresAt: params.setPasswordTokenExpiresAt,
      institutionId: params.institutionId,
      role: params.role,
      isActive: true,
    };
    this.rows.push(row);
    return { id: row.id, name: row.name, email: row.email };
  }
  async update(id: string, patch: UpdateManagerParams): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    // Mirror Prisma: an undefined field means "leave this column alone".
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) Object.assign(row, { [key]: value });
    }
  }
  async countActiveHospitalAdmins(_institutionId: string): Promise<number> {
    return this.activeHospitalAdmins;
  }
}

class FakeEmailPort implements EmailPort {
  public lastSend: { to: string; template: EmailTemplate; params: SendEmailParams } | null = null;
  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.lastSend = { to, template, params };
  }
}

class FakePeerPartnerRepository implements PeerPartnerRepository {
  public rows: PeerPartnerRow[] = [];
  async findByEmail(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findAllByInstitution(institutionId: string): Promise<PeerPartnerSummaryRow[]> {
    return this.rows
      .filter((r) => r.institutionId === institutionId)
      .map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        specialty: r.specialty,
        isActive: r.isActive,
        hasPassword: r.passwordHash !== null,
        setPasswordTokenExpiresAt: r.setPasswordTokenExpiresAt?.toISOString() ?? null,
      }));
  }
  async create(params: CreatePeerPartnerParams): Promise<{ id: string; name: string; email: string }> {
    const row: PeerPartnerRow = {
      id: `peer-${this.rows.length + 10}`,
      name: params.name,
      email: params.email,
      passwordHash: null,
      setPasswordTokenExpiresAt: params.setPasswordTokenExpiresAt,
      institutionId: params.institutionId,
      specialty: params.specialty,
      isActive: true,
    };
    this.rows.push(row);
    return { id: row.id, name: row.name, email: row.email };
  }
  async update(id: string, patch: UpdatePeerPartnerParams): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) Object.assign(row, { [key]: value });
    }
  }
}

class FakePeerChatGateway {
  forceDisconnect = vi.fn();
}

function fakeConfig(): ConfigService {
  const values: Record<string, string> = { MANAGER_TOKEN_SECRET: "test-secret" };
  return { getOrThrow: (key: string) => values[key], get: () => undefined } as unknown as ConfigService;
}

describe("manager admin controller — sectors", () => {
  let app: INestApplication;
  let sectorRepository: FakeSectorRepository;
  let managerRepository: FakeManagerRepository;
  let peerPartnerRepository: FakePeerPartnerRepository;
  let peerChatGateway: FakePeerChatGateway;
  let tokenService: ManagerTokenService;
  let emailPort: FakeEmailPort;

  beforeAll(async () => {
    tokenService = new ManagerTokenService(fakeConfig());
    sectorRepository = new FakeSectorRepository();
    managerRepository = new FakeManagerRepository();
    peerPartnerRepository = new FakePeerPartnerRepository();
    peerChatGateway = new FakePeerChatGateway();
    emailPort = new FakeEmailPort();

    const moduleRef = await Test.createTestingModule({
      controllers: [ManagerAdminController],
      providers: [
        ManagerAuthGuard,
        HospitalAdminGuard,
        { provide: ManagerTokenService, useValue: tokenService },
        { provide: SECTOR_REPOSITORY, useValue: sectorRepository },
        { provide: MANAGER_REPOSITORY, useValue: managerRepository },
        { provide: PEER_PARTNER_REPOSITORY, useValue: peerPartnerRepository },
        { provide: PeerChatGateway, useValue: peerChatGateway },
        { provide: EMAIL_PORT, useValue: emailPort },
        CreateManagerUseCase,
        UpdateManagerUseCase,
        SendManagerSetPasswordEmailUseCase,
        ManagerPasswordService,
        CreatePeerPartnerUseCase,
        SendPeerPartnerSetPasswordEmailUseCase,
        PeerPartnerPasswordService,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ManagerAuthGuard re-reads the acting manager's row on every request, so the
  // two callers below must always exist in the repository.
  const ACTING_ADMIN: ManagerRow = { id: "manager-1", name: "Mauricio", email: "mauricio@institution-1.local", passwordHash: "h", setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "HOSPITAL_ADMIN", isActive: true };
  const ACTING_SECTOR_MANAGER: ManagerRow = { id: "manager-2", name: "Paulo", email: "paulo@institution-1.local", passwordHash: "h", setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "SECTOR_MANAGER", isActive: true };

  beforeEach(() => {
    sectorRepository.rows = [];
    sectorRepository.shouldThrowConflict = false;
    managerRepository.rows = [{ ...ACTING_ADMIN }, { ...ACTING_SECTOR_MANAGER }];
    managerRepository.activeHospitalAdmins = 1;
    peerPartnerRepository.rows = [];
  });

  function hospitalAdminToken(): string {
    return tokenService.issue("manager-1", "Mauricio", "institution-1", "HOSPITAL_ADMIN").token;
  }
  function sectorManagerToken(): string {
    return tokenService.issue("manager-2", "Paulo", "institution-1", "SECTOR_MANAGER").token;
  }

  it("GET /manager/admin/sectors rejects a SECTOR_MANAGER with 403", async () => {
    const response = await request(app.getHttpServer())
      .get("/manager/admin/sectors")
      .set("Authorization", `Bearer ${sectorManagerToken()}`);
    expect(response.status).toBe(403);
  });

  it("POST then GET /manager/admin/sectors round-trips a created sector for a HOSPITAL_ADMIN", async () => {
    const token = hospitalAdminToken();
    const createResponse = await request(app.getHttpServer())
      .post("/manager/admin/sectors")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "UTI" });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toEqual({ id: expect.any(String), name: "UTI" });

    const listResponse = await request(app.getHttpServer())
      .get("/manager/admin/sectors")
      .set("Authorization", `Bearer ${token}`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual([
      { id: createResponse.body.id, name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
  });

  it("POST /manager/admin/sectors returns 409 on a duplicate name", async () => {
    sectorRepository.shouldThrowConflict = true;
    const response = await request(app.getHttpServer())
      .post("/manager/admin/sectors")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`)
      .send({ name: "UTI" });
    expect(response.status).toBe(409);
  });

  it("PATCH /manager/admin/sectors/:id deactivates a sector", async () => {
    const token = hospitalAdminToken();
    const created = await request(app.getHttpServer()).post("/manager/admin/sectors").set("Authorization", `Bearer ${token}`).send({ name: "UTI" });

    const patchResponse = await request(app.getHttpServer())
      .patch(`/manager/admin/sectors/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false });
    expect(patchResponse.status).toBe(204);

    const listResponse = await request(app.getHttpServer()).get("/manager/admin/sectors").set("Authorization", `Bearer ${token}`);
    expect(listResponse.body[0].isActive).toBe(false);
  });

  it("PATCH /manager/admin/sectors/:id returns 404 for a sector in a different institution", async () => {
    sectorRepository.rows.push({ id: "other-sector", name: "Other", isActive: true, managerId: null, managerName: null, institutionId: "institution-2" });

    const response = await request(app.getHttpServer())
      .patch("/manager/admin/sectors/other-sector")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`)
      .send({ isActive: false });
    expect(response.status).toBe(404);
  });

  it("PATCH /manager/admin/sectors/:id assigns a manager from the same institution", async () => {
    const token = hospitalAdminToken();
    sectorRepository.rows.push({ id: "sector-a", name: "UTI", isActive: true, managerId: null, managerName: null, institutionId: "institution-1" });
    managerRepository.rows.push({ id: "manager-9", name: "Paulo", email: "paulo2@institution-1.local", passwordHash: "h", setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "SECTOR_MANAGER", isActive: true });

    const response = await request(app.getHttpServer())
      .patch("/manager/admin/sectors/sector-a")
      .set("Authorization", `Bearer ${token}`)
      .send({ managerId: "manager-9" });

    expect(response.status).toBe(204);
    expect(sectorRepository.rows[0]!.managerId).toBe("manager-9");
  });

  it("PATCH /manager/admin/sectors/:id rejects a managerId belonging to a different institution and leaves the sector untouched", async () => {
    const token = hospitalAdminToken();
    sectorRepository.rows.push({ id: "sector-a", name: "UTI", isActive: true, managerId: null, managerName: null, institutionId: "institution-1" });
    managerRepository.rows.push({ id: "foreign-manager", name: "Intruso", email: "intruso@institution-2.local", passwordHash: "h", setPasswordTokenExpiresAt: null, institutionId: "institution-2", role: "SECTOR_MANAGER", isActive: true });

    const response = await request(app.getHttpServer())
      .patch("/manager/admin/sectors/sector-a")
      .set("Authorization", `Bearer ${token}`)
      .send({ managerId: "foreign-manager" });

    expect(response.status).toBe(400);
    expect(sectorRepository.rows[0]!.managerId).toBeNull();
  });

  it("PATCH /manager/admin/sectors/:id rejects an unknown managerId", async () => {
    const token = hospitalAdminToken();
    sectorRepository.rows.push({ id: "sector-a", name: "UTI", isActive: true, managerId: null, managerName: null, institutionId: "institution-1" });

    const response = await request(app.getHttpServer())
      .patch("/manager/admin/sectors/sector-a")
      .set("Authorization", `Bearer ${token}`)
      .send({ managerId: "ghost-manager" });

    expect(response.status).toBe(400);
    expect(sectorRepository.rows[0]!.managerId).toBeNull();
  });

  it("PATCH /manager/admin/sectors/:id clears the assignment with an explicit null managerId", async () => {
    const token = hospitalAdminToken();
    sectorRepository.rows.push({ id: "sector-a", name: "UTI", isActive: true, managerId: "manager-9", managerName: "Paulo", institutionId: "institution-1" });

    const response = await request(app.getHttpServer())
      .patch("/manager/admin/sectors/sector-a")
      .set("Authorization", `Bearer ${token}`)
      .send({ managerId: null });

    expect(response.status).toBe(204);
    expect(sectorRepository.rows[0]!.managerId).toBeNull();
  });

  it("GET /manager/admin/managers returns every manager in the institution", async () => {
    managerRepository.rows.push({ id: "manager-3", name: "Elsewhere", email: "elsewhere@institution-2.local", passwordHash: "h", setPasswordTokenExpiresAt: null, institutionId: "institution-2", role: "HOSPITAL_ADMIN", isActive: true });

    const response = await request(app.getHttpServer()).get("/manager/admin/managers").set("Authorization", `Bearer ${hospitalAdminToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: "manager-1", name: "Mauricio", email: "mauricio@institution-1.local", role: "HOSPITAL_ADMIN", isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
      { id: "manager-2", name: "Paulo", email: "paulo@institution-1.local", role: "SECTOR_MANAGER", isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
  });

  it("POST /manager/admin/managers creates a SECTOR_MANAGER and sends an invite email", async () => {
    sectorRepository.rows = [{ id: "sector-a", name: "UTI", isActive: true, managerId: null, managerName: null, institutionId: "institution-1" }];

    const response = await request(app.getHttpServer())
      .post("/manager/admin/managers")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`)
      .send({ name: "Paulo", email: "paulo3@institution-1.local", role: "SECTOR_MANAGER", sectorIds: ["sector-a"] });

    expect(response.status).toBe(201);
    expect(response.body.manager).toEqual({ id: expect.any(String), name: "Paulo", email: "paulo3@institution-1.local" });
    expect(emailPort.lastSend?.to).toBe("paulo3@institution-1.local");
    expect(emailPort.lastSend?.template).toBe("invite");
  });

  it("POST /manager/admin/managers rejects a SECTOR_MANAGER request with no sectorIds", async () => {
    const response = await request(app.getHttpServer())
      .post("/manager/admin/managers")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`)
      .send({ name: "Paulo", role: "SECTOR_MANAGER" });

    expect(response.status).toBe(400);
  });

  it("PATCH /manager/admin/managers/:id returns 409 when deactivating the institution's last active HOSPITAL_ADMIN", async () => {
    managerRepository.activeHospitalAdmins = 1;

    const response = await request(app.getHttpServer())
      .patch("/manager/admin/managers/manager-1")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`)
      .send({ isActive: false });

    expect(response.status).toBe(409);
  });

  it("PATCH /manager/admin/managers/:id returns 409 when demoting the institution's last active HOSPITAL_ADMIN", async () => {
    managerRepository.activeHospitalAdmins = 1;

    const response = await request(app.getHttpServer())
      .patch("/manager/admin/managers/manager-1")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`)
      .send({ role: "SECTOR_MANAGER" });

    expect(response.status).toBe(409);
    expect(managerRepository.rows.find((row) => row.id === "manager-1")!.role).toBe("HOSPITAL_ADMIN");
  });

  it("revokes admin-panel access on the very next request after a demotion, without waiting for the token to expire", async () => {
    managerRepository.activeHospitalAdmins = 2;
    const token = hospitalAdminToken();

    const before = await request(app.getHttpServer()).get("/manager/admin/sectors").set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);

    const demote = await request(app.getHttpServer())
      .patch("/manager/admin/managers/manager-1")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "SECTOR_MANAGER" });
    expect(demote.status).toBe(204);

    // Same, still-unexpired token — the guard now reads the demoted role from the DB.
    const after = await request(app.getHttpServer()).get("/manager/admin/sectors").set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(403);
  });

  it("revokes all access on the very next request after a deactivation", async () => {
    managerRepository.activeHospitalAdmins = 2;
    const token = hospitalAdminToken();

    const deactivate = await request(app.getHttpServer())
      .patch("/manager/admin/managers/manager-1")
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false });
    expect(deactivate.status).toBe(204);

    const after = await request(app.getHttpServer()).get("/manager/admin/sectors").set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(401);
  });

  it("POST /manager/admin/managers/:id/send-set-password-email sends the manager an email", async () => {
    managerRepository.rows.push({ id: "manager-7", name: "Renata", email: "renata@institution-1.local", passwordHash: "old", setPasswordTokenExpiresAt: null, institutionId: "institution-1", role: "SECTOR_MANAGER", isActive: true });

    const response = await request(app.getHttpServer())
      .post("/manager/admin/managers/manager-7/send-set-password-email")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`);

    expect(response.status).toBe(200);
    expect(emailPort.lastSend?.to).toBe("renata@institution-1.local");
    expect(emailPort.lastSend?.template).toBe("password-reset");
  });

  it("GET /manager/admin/peer-partners returns every peer partner in the institution", async () => {
    peerPartnerRepository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "dra-ana@institution-1.local", passwordHash: "h", setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];

    const response = await request(app.getHttpServer()).get("/manager/admin/peer-partners").set("Authorization", `Bearer ${hospitalAdminToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: "peer-1", name: "Dra. Ana", email: "dra-ana@institution-1.local", specialty: "Clínica médica", isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null }]);
  });

  it("POST /manager/admin/peer-partners creates a peer partner and sends an invite email", async () => {
    const response = await request(app.getHttpServer())
      .post("/manager/admin/peer-partners")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`)
      .send({ name: "Dra. Ana", email: "ana2@institution-1.local", specialty: "Clínica médica" });

    expect(response.status).toBe(201);
    expect(response.body.peerPartner).toEqual({ id: expect.any(String), name: "Dra. Ana", email: "ana2@institution-1.local" });
    expect(emailPort.lastSend?.to).toBe("ana2@institution-1.local");
    expect(emailPort.lastSend?.template).toBe("invite");
  });

  it("POST /manager/admin/peer-partners rejects a request missing specialty with 400", async () => {
    const response = await request(app.getHttpServer())
      .post("/manager/admin/peer-partners")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`)
      .send({ name: "Dra. Ana", email: "ana2@institution-1.local" });

    expect(response.status).toBe(400);
  });

  it("PATCH /manager/admin/peer-partners/:id updates specialty and isActive", async () => {
    peerPartnerRepository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "dra-ana@institution-1.local", passwordHash: "h", setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];

    const response = await request(app.getHttpServer())
      .patch("/manager/admin/peer-partners/peer-1")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`)
      .send({ isActive: false });

    expect(response.status).toBe(204);
    expect(peerPartnerRepository.rows[0]!.isActive).toBe(false);
  });

  it("PATCH /manager/admin/peer-partners/:id returns 404 for a peer partner in a different institution", async () => {
    peerPartnerRepository.rows = [{ id: "peer-other", name: "Outro", email: "outro@institution-2.local", passwordHash: "h", setPasswordTokenExpiresAt: null, institutionId: "institution-2", specialty: "x", isActive: true }];

    const response = await request(app.getHttpServer())
      .patch("/manager/admin/peer-partners/peer-other")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`)
      .send({ isActive: false });

    expect(response.status).toBe(404);
  });

  it("POST /manager/admin/peer-partners/:id/send-set-password-email sends the peer partner an email", async () => {
    peerPartnerRepository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "dra-ana@institution-1.local", passwordHash: "old", setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];

    const response = await request(app.getHttpServer())
      .post("/manager/admin/peer-partners/peer-1/send-set-password-email")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`);

    expect(response.status).toBe(200);
    expect(emailPort.lastSend?.to).toBe("dra-ana@institution-1.local");
    expect(emailPort.lastSend?.template).toBe("password-reset");
  });

  it("PATCH /manager/admin/peer-partners/:id with isActive:false forcibly disconnects the peer partner", async () => {
    peerPartnerRepository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "dra-ana@institution-1.local", passwordHash: "h", setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];

    await request(app.getHttpServer())
      .patch("/manager/admin/peer-partners/peer-1")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`)
      .send({ isActive: false });

    expect(peerChatGateway.forceDisconnect).toHaveBeenCalledWith("peer-1");
  });

  it("PATCH /manager/admin/peer-partners/:id with only specialty does not disconnect anyone", async () => {
    peerPartnerRepository.rows = [{ id: "peer-1", name: "Dra. Ana", email: "dra-ana@institution-1.local", passwordHash: "h", setPasswordTokenExpiresAt: null, institutionId: "institution-1", specialty: "Clínica médica", isActive: true }];
    peerChatGateway.forceDisconnect.mockClear();

    await request(app.getHttpServer())
      .patch("/manager/admin/peer-partners/peer-1")
      .set("Authorization", `Bearer ${hospitalAdminToken()}`)
      .send({ specialty: "Residência" });

    expect(peerChatGateway.forceDisconnect).not.toHaveBeenCalled();
  });
});
