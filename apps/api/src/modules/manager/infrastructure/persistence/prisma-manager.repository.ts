import { Inject, Injectable } from "@nestjs/common";
import type { ManagerRepository, ManagerRow } from "../../application/ports/manager-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaManagerRepository implements ManagerRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByName(name: string): Promise<ManagerRow | null> {
    const row = await this.prisma.manager.findUnique({ where: { name } });
    if (!row) return null;
    return { id: row.id, name: row.name, passwordHash: row.passwordHash, institutionId: row.institutionId };
  }
}
