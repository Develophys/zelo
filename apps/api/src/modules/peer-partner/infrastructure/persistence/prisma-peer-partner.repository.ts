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

  async findByEmail(email: string): Promise<PeerPartnerRow | null> {
    const row = await this.prisma.peerPartner.findUnique({ where: { email } });
    return row ? this.toRow(row) : null;
  }

  async findBySetPasswordToken(token: string): Promise<PeerPartnerRow | null> {
    const row = await this.prisma.peerPartner.findUnique({ where: { setPasswordToken: token } });
    return row ? this.toRow(row) : null;
  }

  async findById(id: string): Promise<PeerPartnerRow | null> {
    const row = await this.prisma.peerPartner.findUnique({ where: { id } });
    return row ? this.toRow(row) : null;
  }

  async findAllByInstitution(institutionId: string): Promise<PeerPartnerSummaryRow[]> {
    const rows = await this.prisma.peerPartner.findMany({ where: { institutionId } });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      specialty: row.specialty,
      isActive: row.isActive,
      hasPassword: row.passwordHash !== null,
      setPasswordTokenExpiresAt: row.setPasswordTokenExpiresAt?.toISOString() ?? null,
    }));
  }

  async create(params: CreatePeerPartnerParams): Promise<{ id: string; name: string; email: string }> {
    const row = await this.prisma.peerPartner.create({
      data: {
        name: params.name,
        email: params.email,
        institutionId: params.institutionId,
        specialty: params.specialty,
        setPasswordToken: params.setPasswordToken,
        setPasswordTokenExpiresAt: params.setPasswordTokenExpiresAt,
      },
    });
    return { id: row.id, name: row.name, email: row.email };
  }

  async update(id: string, patch: UpdatePeerPartnerParams): Promise<void> {
    await this.prisma.peerPartner.update({ where: { id }, data: patch });
  }

  private toRow(row: {
    id: string;
    name: string;
    email: string;
    passwordHash: string | null;
    setPasswordTokenExpiresAt: Date | null;
    institutionId: string;
    specialty: string;
    isActive: boolean;
  }): PeerPartnerRow {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.passwordHash,
      setPasswordTokenExpiresAt: row.setPasswordTokenExpiresAt,
      institutionId: row.institutionId,
      specialty: row.specialty,
      isActive: row.isActive,
    };
  }
}
