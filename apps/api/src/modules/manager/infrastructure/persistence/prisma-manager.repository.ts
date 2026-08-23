import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateManagerParams,
  ManagerRepository,
  ManagerRow,
  ManagerSummaryRow,
  UpdateManagerParams,
} from "../../application/ports/manager-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";
import { LAPSED_INVITE_WINDOW_DAYS } from "../../../notification/application/thresholds.ts";

@Injectable()
export class PrismaManagerRepository implements ManagerRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<ManagerRow | null> {
    const row = await this.prisma.manager.findUnique({ where: { email } });
    return row ? this.toRow(row) : null;
  }

  async findBySetPasswordToken(token: string): Promise<ManagerRow | null> {
    const row = await this.prisma.manager.findUnique({ where: { setPasswordToken: token } });
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
      email: row.email,
      role: row.role,
      isActive: row.isActive,
      sectorNames: row.sectors.map((sector) => sector.name),
      hasPassword: row.passwordHash !== null,
      setPasswordTokenExpiresAt: row.setPasswordTokenExpiresAt?.toISOString() ?? null,
    }));
  }

  async create(params: CreateManagerParams): Promise<{ id: string; name: string; email: string }> {
    const row = await this.prisma.manager.create({
      data: {
        name: params.name,
        email: params.email,
        institutionId: params.institutionId,
        role: params.role,
        setPasswordToken: params.setPasswordToken,
        setPasswordTokenExpiresAt: params.setPasswordTokenExpiresAt,
      },
    });
    return { id: row.id, name: row.name, email: row.email };
  }

  async update(id: string, patch: UpdateManagerParams): Promise<void> {
    await this.prisma.manager.update({ where: { id }, data: patch });
  }

  async countActiveHospitalAdmins(institutionId: string): Promise<number> {
    return this.prisma.manager.count({ where: { institutionId, role: "HOSPITAL_ADMIN", isActive: true } });
  }

  async findActiveHospitalAdminIds(institutionId: string): Promise<string[]> {
    const rows = await this.prisma.manager.findMany({
      where: { institutionId, role: "HOSPITAL_ADMIN", isActive: true },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async findLapsedInvites(
    now: Date,
  ): Promise<{ id: string; name: string; institutionId: string; setPasswordTokenExpiresAt: Date }[]> {
    const windowStart = new Date(now.getTime() - LAPSED_INVITE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.manager.findMany({
      where: { passwordHash: null, setPasswordTokenExpiresAt: { not: null, gte: windowStart, lt: now } },
      select: { id: true, name: true, institutionId: true, setPasswordTokenExpiresAt: true },
    });
    return rows.map((row) => ({ ...row, setPasswordTokenExpiresAt: row.setPasswordTokenExpiresAt as Date }));
  }

  async delete(id: string): Promise<void> {
    await this.prisma.manager.delete({ where: { id } });
  }

  private toRow(row: {
    id: string;
    name: string;
    email: string;
    passwordHash: string | null;
    setPasswordTokenExpiresAt: Date | null;
    institutionId: string;
    role: string;
    isActive: boolean;
  }): ManagerRow {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.passwordHash,
      setPasswordTokenExpiresAt: row.setPasswordTokenExpiresAt,
      institutionId: row.institutionId,
      role: row.role as ManagerRow["role"],
      isActive: row.isActive,
    };
  }
}
