import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "@/shared/prisma/prisma.service.ts";
import { PrismaSectorRepository } from "./prisma-sector.repository.ts";
import { SectorInviteCodeConflictError } from "@/modules/sector/application/ports/sector-repository.port.ts";

describe("PrismaSectorRepository", () => {
  const prisma = new PrismaService();
  const repository = new PrismaSectorRepository(prisma);
  let institutionIds: string[] = [];

  beforeAll(async () => {
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  afterEach(async () => {
    if (institutionIds.length > 0) {
      await prisma.sector.deleteMany({ where: { institutionId: { in: institutionIds } } });
      await prisma.institution.deleteMany({ where: { id: { in: institutionIds } } });
      institutionIds = [];
    }
  });

  async function createTestInstitution(overrides: { isActive?: boolean } = {}) {
    const institution = await prisma.institution.create({
      data: {
        name: `Test Institution ${crypto.randomUUID()}`,
        inviteCode: `test-inst-${crypto.randomUUID()}`,
        isActive: overrides.isActive ?? true,
      },
    });
    institutionIds.push(institution.id);
    return institution;
  }

  describe("findByInviteCode", () => {
    it("resolves an active sector in an active institution", async () => {
      const institution = await createTestInstitution({ isActive: true });
      const created = await repository.create(institution.id, "UTI", "uti-2026");

      const result = await repository.findByInviteCode("uti-2026");

      expect(result).toEqual({
        id: created.id,
        name: "UTI",
        isActive: true,
        institution: { id: institution.id, name: institution.name, isActive: true },
      });
    });

    it("returns null for an unknown code", async () => {
      const result = await repository.findByInviteCode("does-not-exist");
      expect(result).toBeNull();
    });

    it("still returns the row when the sector itself is inactive (caller decides what to do)", async () => {
      const institution = await createTestInstitution({ isActive: true });
      const created = await repository.create(institution.id, "UTI", "uti-inactive-2026");
      await repository.update(created.id, { isActive: false });

      const result = await repository.findByInviteCode("uti-inactive-2026");

      expect(result?.isActive).toBe(false);
    });
  });

  describe("create with an invite code", () => {
    it("stores the invite code", async () => {
      const institution = await createTestInstitution({ isActive: true });

      await repository.create(institution.id, "PS", "ps-2026");

      const found = await repository.findByInviteCode("ps-2026");
      expect(found?.name).toBe("PS");
    });

    it("throws SectorInviteCodeConflictError when the code is already used by another sector", async () => {
      const institution = await createTestInstitution({ isActive: true });
      await repository.create(institution.id, "UTI", "shared-code");

      await expect(repository.create(institution.id, "PS", "shared-code")).rejects.toThrow(
        SectorInviteCodeConflictError,
      );
    });
  });

  describe("update with an invite code", () => {
    it("throws SectorInviteCodeConflictError when the new code collides with another sector", async () => {
      const institution = await createTestInstitution({ isActive: true });
      await repository.create(institution.id, "UTI", "taken-code");
      const other = await repository.create(institution.id, "PS", null as unknown as string);

      await expect(repository.update(other.id, { inviteCode: "taken-code" })).rejects.toThrow(
        SectorInviteCodeConflictError,
      );
    });
  });
});
