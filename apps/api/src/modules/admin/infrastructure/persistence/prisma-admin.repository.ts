import { Inject, Injectable } from "@nestjs/common";
import type { AdminRepository, AdminRow } from "../../application/ports/admin-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaAdminRepository implements AdminRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<AdminRow | null> {
    const row = await this.prisma.superAdmin.findUnique({ where: { email } });
    if (!row) return null;
    return { id: row.id, name: row.name, email: row.email, passwordHash: row.passwordHash };
  }
}
