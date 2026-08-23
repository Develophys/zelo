import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../../../../../generated/prisma/client.ts";
import type {
  AdminSectorRow,
  SectorRepository,
  UpdateSectorParams,
} from "../../application/ports/sector-repository.port.ts";
import { SectorNameConflictError } from "../../application/ports/sector-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

@Injectable()
export class PrismaSectorRepository implements SectorRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(institutionId: string, name: string): Promise<{ id: string; name: string }> {
    try {
      const row = await this.prisma.sector.create({ data: { institutionId, name } });
      return { id: row.id, name: row.name };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
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
    }));
  }

  async findById(
    id: string,
  ): Promise<{ id: string; institutionId: string; name: string; managerId: string | null; isActive: boolean } | null> {
    return this.prisma.sector.findUnique({
      where: { id },
      select: { id: true, institutionId: true, name: true, managerId: true, isActive: true },
    });
  }

  async update(id: string, patch: UpdateSectorParams): Promise<void> {
    await this.prisma.sector.update({ where: { id }, data: patch });
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

  async delete(id: string): Promise<void> {
    await this.prisma.sector.delete({ where: { id } });
  }
}
