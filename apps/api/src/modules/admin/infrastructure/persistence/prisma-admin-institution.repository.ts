import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../../../../../generated/prisma/client.ts";
import type {
  AdminInstitutionRepository,
  AdminInstitutionRow,
  CreateInstitutionParams,
} from "../../application/ports/admin-institution-repository.port.ts";
import { DuplicateInstitutionOrManagerError } from "../../application/ports/admin-institution-repository.port.ts";
import { PrismaService } from "../../../../shared/prisma/prisma.service.ts";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

@Injectable()
export class PrismaAdminInstitutionRepository implements AdminInstitutionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createWithHospitalAdmin(
    params: CreateInstitutionParams,
  ): Promise<{ institution: { id: string; name: string; inviteCode: string }; hospitalAdmin: { id: string; name: string } }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const institution = await tx.institution.create({
          data: { name: params.institutionName, inviteCode: params.inviteCode },
        });
        const hospitalAdmin = await tx.manager.create({
          data: {
            name: params.hospitalAdminName,
            passwordHash: params.hospitalAdminPasswordHash,
            institutionId: institution.id,
            role: "HOSPITAL_ADMIN",
          },
        });
        return {
          institution: { id: institution.id, name: institution.name, inviteCode: institution.inviteCode },
          hospitalAdmin: { id: hospitalAdmin.id, name: hospitalAdmin.name },
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        throw new DuplicateInstitutionOrManagerError();
      }
      throw error;
    }
  }

  async findAll(): Promise<AdminInstitutionRow[]> {
    const institutions = await this.prisma.institution.findMany({
      include: { managers: { where: { role: "HOSPITAL_ADMIN" }, select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return institutions.map((institution) => ({
      id: institution.id,
      name: institution.name,
      inviteCode: institution.inviteCode,
      createdAt: institution.createdAt,
      hospitalAdminNames: institution.managers.map((manager) => manager.name),
    }));
  }
}
