import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateManagerParams,
  ManagerRepository,
  ManagerRow,
  ManagerSummaryRow,
  UpdateManagerParams,
} from "../../application/ports/manager-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaManagerRepository implements ManagerRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByName(name: string): Promise<ManagerRow | null> {
    const row = await this.prisma.manager.findUnique({ where: { name } });
    return row ? this.toRow(row) : null;
  }

  async findById(id: string): Promise<ManagerRow | null> {
    const row = await this.prisma.manager.findUnique({ where: { id } });
    return row ? this.toRow(row) : null;
  }

  async findAllByInstitution(institutionId: string): Promise<ManagerSummaryRow[]> {
    const rows = await this.prisma.manager.findMany({
      where: { institutionId },
      include: { sectors: { select: { name: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      isActive: row.isActive,
      sectorNames: row.sectors.map((sector) => sector.name),
    }));
  }

  async create(params: CreateManagerParams): Promise<{ id: string; name: string }> {
    const row = await this.prisma.manager.create({
      data: {
        name: params.name,
        passwordHash: params.passwordHash,
        institutionId: params.institutionId,
        role: params.role,
      },
    });
    return { id: row.id, name: row.name };
  }

  async update(id: string, patch: UpdateManagerParams): Promise<void> {
    await this.prisma.manager.update({ where: { id }, data: patch });
  }

  async countActiveHospitalAdmins(institutionId: string): Promise<number> {
    return this.prisma.manager.count({ where: { institutionId, role: "HOSPITAL_ADMIN", isActive: true } });
  }

  private toRow(row: { id: string; name: string; passwordHash: string; institutionId: string; role: string; isActive: boolean }): ManagerRow {
    return {
      id: row.id,
      name: row.name,
      passwordHash: row.passwordHash,
      institutionId: row.institutionId,
      role: row.role as ManagerRow["role"],
      isActive: row.isActive,
    };
  }
}
