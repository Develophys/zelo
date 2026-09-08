import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../../../../../generated/prisma/client.ts";
import type {
  AdminInstitutionPage,
  AdminInstitutionRepository,
  AdminInstitutionRow,
  CreateInstitutionParams,
  UpdateInstitutionParams,
} from "@/modules/admin/application/ports/admin-institution-repository.port.js";
import { DuplicateInstitutionOrManagerError } from "@/modules/admin/application/ports/admin-institution-repository.port.js";
import { PrismaService } from "@/shared/prisma/prisma.service.js";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

@Injectable()
export class PrismaAdminInstitutionRepository implements AdminInstitutionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createWithHospitalAdmin(
    params: CreateInstitutionParams,
  ): Promise<{ institution: { id: string; name: string; inviteCode: string }; hospitalAdmin: { id: string; name: string; email: string } }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const institution = await tx.institution.create({
          data: { name: params.institutionName, inviteCode: params.inviteCode },
        });
        const hospitalAdmin = await tx.manager.create({
          data: {
            name: params.hospitalAdminName,
            email: params.hospitalAdminEmail,
            institutionId: institution.id,
            role: "HOSPITAL_ADMIN",
            setPasswordToken: params.setPasswordToken,
            setPasswordTokenExpiresAt: params.setPasswordTokenExpiresAt,
          },
        });
        return {
          institution: { id: institution.id, name: institution.name, inviteCode: institution.inviteCode },
          hospitalAdmin: { id: hospitalAdmin.id, name: hospitalAdmin.name, email: hospitalAdmin.email },
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        throw new DuplicateInstitutionOrManagerError();
      }
      throw error;
    }
  }

  // Keyset pagination on (createdAt desc, id desc): an offset would re-serve
  // or skip a row whenever a new institution is created mid-scroll.
  async findPage(query: { cursor: string | null; limit: number }): Promise<AdminInstitutionPage> {
    const institutions = await this.prisma.institution.findMany({
      include: { managers: { where: { role: "HOSPITAL_ADMIN" }, select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = institutions.length > query.limit;
    const page = hasMore ? institutions.slice(0, query.limit) : institutions;
    const total = await this.prisma.institution.count();

    return {
      items: page.map((institution) => ({
        id: institution.id,
        name: institution.name,
        inviteCode: institution.inviteCode,
        isActive: institution.isActive,
        createdAt: institution.createdAt,
        hospitalAdminNames: institution.managers.map((manager) => manager.name),
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      total,
    };
  }

  async findById(id: string): Promise<AdminInstitutionRow | null> {
    const institution = await this.prisma.institution.findUnique({
      where: { id },
      include: { managers: { where: { role: "HOSPITAL_ADMIN" }, select: { name: true } } },
    });
    if (!institution) return null;
    return {
      id: institution.id,
      name: institution.name,
      inviteCode: institution.inviteCode,
      isActive: institution.isActive,
      createdAt: institution.createdAt,
      hospitalAdminNames: institution.managers.map((manager) => manager.name),
    };
  }

  async update(id: string, patch: UpdateInstitutionParams): Promise<void> {
    try {
      await this.prisma.institution.update({ where: { id }, data: patch });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        throw new DuplicateInstitutionOrManagerError();
      }
      throw error;
    }
  }
}
