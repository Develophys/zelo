import { Inject, Injectable } from "@nestjs/common";
import type { InstitutionRepository, InstitutionRow } from "@/modules/institution/application/ports/institution-repository.port.js";
import { PrismaService } from "@/shared/prisma/prisma.service.js";

@Injectable()
export class PrismaInstitutionRepository implements InstitutionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByInviteCode(inviteCode: string): Promise<InstitutionRow | null> {
    const row = await this.prisma.institution.findUnique({ where: { inviteCode } });
    if (!row) return null;
    return { id: row.id, name: row.name, inviteCode: row.inviteCode, isActive: row.isActive };
  }

  async findById(id: string): Promise<InstitutionRow | null> {
    const row = await this.prisma.institution.findUnique({ where: { id } });
    if (!row) return null;
    return { id: row.id, name: row.name, inviteCode: row.inviteCode, isActive: row.isActive };
  }
}
