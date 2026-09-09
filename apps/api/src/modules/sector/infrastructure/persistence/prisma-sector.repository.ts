import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../../../../../generated/prisma/client.ts";
import type {
  AdminSectorRow,
  SectorRepository,
  SectorWithInstitution,
  UpdateSectorParams,
} from "@/modules/sector/application/ports/sector-repository.port.js";
import {
  SectorNameConflictError,
  SectorInviteCodeConflictError,
} from "@/modules/sector/application/ports/sector-repository.port.js";
import { PrismaService } from "@/shared/prisma/prisma.service.js";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

function violatesInviteCodeConstraint(error: Prisma.PrismaClientKnownRequestError): boolean {
  const target = error.meta?.target;
  if (Array.isArray(target) && target.includes("inviteCode")) {
    return true;
  }

  const driverAdapterError = error.meta?.driverAdapterError as
    | { cause?: { constraint?: { fields?: unknown } } }
    | undefined;
  const fields = driverAdapterError?.cause?.constraint?.fields;
  if (!Array.isArray(fields)) {
    return false;
  }
  return fields.some((field) => typeof field === "string" && field.replace(/"/g, "") === "inviteCode");
}

@Injectable()
export class PrismaSectorRepository implements SectorRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(institutionId: string, name: string, inviteCode?: string): Promise<{ id: string; name: string }> {
    try {
      const row = await this.prisma.sector.create({
        data: { institutionId, name, inviteCode: inviteCode ?? null },
      });
      return { id: row.id, name: row.name };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        if (violatesInviteCodeConstraint(error)) {
          throw new SectorInviteCodeConflictError();
        }
        throw new SectorNameConflictError();
      }
      throw error;
    }
  }

  async findAllForAdmin(institutionId: string): Promise<AdminSectorRow[]> {
    const rows = await this.prisma.sector.findMany({
      where: { institutionId },
      include: { manager: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      managerId: row.managerId,
      managerName: row.manager?.name ?? null,
      inviteCode: row.inviteCode,
    }));
  }

  async findById(
    id: string,
  ): Promise<
    { id: string; institutionId: string; name: string; managerId: string | null; isActive: boolean; inviteCode: string | null } | null
  > {
    return this.prisma.sector.findUnique({
      where: { id },
      select: { id: true, institutionId: true, name: true, managerId: true, isActive: true, inviteCode: true },
    });
  }

  async update(id: string, patch: UpdateSectorParams): Promise<void> {
    try {
      await this.prisma.sector.update({ where: { id }, data: patch });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        throw new SectorInviteCodeConflictError();
      }
      throw error;
    }
  }

  async findActiveByInstitution(institutionId: string): Promise<{ id: string; name: string }[]> {
    return this.prisma.sector.findMany({
      where: { institutionId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  async findActiveByIds(institutionId: string, sectorIds: string[]): Promise<{ id: string; name: string }[]> {
    if (sectorIds.length === 0) return [];
    return this.prisma.sector.findMany({
      where: { institutionId, isActive: true, id: { in: sectorIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  async findAssignedSectorIds(managerId: string): Promise<string[]> {
    const rows = await this.prisma.sector.findMany({ where: { managerId }, select: { id: true } });
    return rows.map((row) => row.id);
  }

  async reassignManagerSectors(institutionId: string, managerId: string, sectorIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.sector.updateMany({
        where: { institutionId, managerId, id: { notIn: sectorIds } },
        data: { managerId: null },
      }),
      this.prisma.sector.updateMany({
        where: { institutionId, id: { in: sectorIds } },
        data: { managerId },
      }),
    ]);
  }

  async findByIdsInInstitution(institutionId: string, sectorIds: string[]): Promise<{ id: string }[]> {
    if (sectorIds.length === 0) return [];
    return this.prisma.sector.findMany({ where: { institutionId, id: { in: sectorIds } }, select: { id: true } });
  }

  async findByInviteCode(inviteCode: string): Promise<SectorWithInstitution | null> {
    const row = await this.prisma.sector.findUnique({
      where: { inviteCode },
      include: { institution: { select: { id: true, name: true, isActive: true } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      institution: { id: row.institution.id, name: row.institution.name, isActive: row.institution.isActive },
    };
  }

  async delete(id: string): Promise<void> {
    await this.prisma.sector.delete({ where: { id } });
  }
}
