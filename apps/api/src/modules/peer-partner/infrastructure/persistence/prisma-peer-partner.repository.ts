import { Inject, Injectable } from "@nestjs/common";
import type {
  CreatePeerPartnerParams,
  PeerPartnerRepository,
  PeerPartnerRow,
  PeerPartnerSummaryRow,
  UpdatePeerPartnerParams,
} from "../../application/ports/peer-partner-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

@Injectable()
export class PrismaPeerPartnerRepository implements PeerPartnerRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByName(name: string): Promise<PeerPartnerRow | null> {
    const row = await this.prisma.peerPartner.findUnique({ where: { name } });
    return row ? this.toRow(row) : null;
  }

  async findById(id: string): Promise<PeerPartnerRow | null> {
    const row = await this.prisma.peerPartner.findUnique({ where: { id } });
    return row ? this.toRow(row) : null;
  }

  async findAllByInstitution(institutionId: string): Promise<PeerPartnerSummaryRow[]> {
    const rows = await this.prisma.peerPartner.findMany({ where: { institutionId } });
    return rows.map((row) => ({ id: row.id, name: row.name, specialty: row.specialty, isActive: row.isActive }));
  }

  async create(params: CreatePeerPartnerParams): Promise<{ id: string; name: string }> {
    const row = await this.prisma.peerPartner.create({
      data: { name: params.name, passwordHash: params.passwordHash, institutionId: params.institutionId, specialty: params.specialty },
    });
    return { id: row.id, name: row.name };
  }

  async update(id: string, patch: UpdatePeerPartnerParams): Promise<void> {
    await this.prisma.peerPartner.update({ where: { id }, data: patch });
  }

  private toRow(row: { id: string; name: string; passwordHash: string; institutionId: string; specialty: string; isActive: boolean }): PeerPartnerRow {
    return { id: row.id, name: row.name, passwordHash: row.passwordHash, institutionId: row.institutionId, specialty: row.specialty, isActive: row.isActive };
  }
}
