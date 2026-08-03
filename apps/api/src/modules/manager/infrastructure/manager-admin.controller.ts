import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { ManagerAuthGuard } from "./manager-auth.guard.ts";
import { HospitalAdminGuard } from "./hospital-admin.guard.ts";
import { SECTOR_REPOSITORY, type SectorRepository, type AdminSectorRow } from "../../sector/application/ports/sector-repository.port.ts";
import { SectorNameConflictError } from "../../sector/application/ports/sector-repository.port.ts";
import { MANAGER_REPOSITORY, type ManagerRepository, type ManagerSummaryRow } from "../application/ports/manager-repository.port.ts";
import { CreateManagerUseCase, type CreateManagerResult } from "../application/use-cases/create-manager.use-case.ts";
import { UpdateManagerUseCase } from "../application/use-cases/update-manager.use-case.ts";
import { ResetManagerPasswordUseCase } from "../application/use-cases/reset-manager-password.use-case.ts";
import { LastActiveHospitalAdminError, ManagerNotFoundError, SectorNotInInstitutionError, PeerPartnerNotFoundError } from "../application/use-cases/manager-admin-errors.ts";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository, type PeerPartnerSummaryRow } from "../../peer-partner/application/ports/peer-partner-repository.port.ts";
import { CreatePeerPartnerUseCase, type CreatePeerPartnerResult } from "../application/use-cases/create-peer-partner.use-case.ts";
import { ResetPeerPartnerPasswordUseCase } from "../application/use-cases/reset-peer-partner-password.use-case.ts";

const CreateSectorSchema = z.object({ name: z.string().trim().min(1).max(200) });
const UpdateSectorSchema = z.object({ isActive: z.boolean().optional(), managerId: z.string().nullable().optional() });

const CreateManagerSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    role: z.enum(["HOSPITAL_ADMIN", "SECTOR_MANAGER"]),
    sectorIds: z.array(z.string()).optional(),
  })
  .refine((data) => data.role !== "SECTOR_MANAGER" || (data.sectorIds && data.sectorIds.length > 0), {
    message: "sectorIds is required and non-empty when role is SECTOR_MANAGER",
    path: ["sectorIds"],
  });

const UpdateManagerSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(["HOSPITAL_ADMIN", "SECTOR_MANAGER"]).optional(),
  sectorIds: z.array(z.string()).optional(),
});

const CreatePeerPartnerSchema = z.object({ name: z.string().trim().min(1).max(200), specialty: z.string().trim().min(1).max(200) });
const UpdatePeerPartnerSchema = z.object({ isActive: z.boolean().optional(), specialty: z.string().trim().min(1).max(200).optional() });

@Controller("manager/admin")
@UseGuards(ManagerAuthGuard, HospitalAdminGuard)
export class ManagerAdminController {
  constructor(
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(CreateManagerUseCase) private readonly createManager: CreateManagerUseCase,
    @Inject(UpdateManagerUseCase) private readonly updateManager: UpdateManagerUseCase,
    @Inject(ResetManagerPasswordUseCase) private readonly resetManagerPassword: ResetManagerPasswordUseCase,
    @Inject(PEER_PARTNER_REPOSITORY) private readonly peerPartnerRepository: PeerPartnerRepository,
    @Inject(CreatePeerPartnerUseCase) private readonly createPeerPartner: CreatePeerPartnerUseCase,
    @Inject(ResetPeerPartnerPasswordUseCase) private readonly resetPeerPartnerPassword: ResetPeerPartnerPasswordUseCase,
  ) {}

  @Get("sectors")
  async listSectors(@Req() request: Request): Promise<AdminSectorRow[]> {
    return this.sectorRepository.findAllForAdmin(request.manager!.institutionId);
  }

  @Post("sectors")
  @HttpCode(201)
  async createSector(@Req() request: Request, @Body() body: unknown): Promise<{ id: string; name: string }> {
    const parsed = CreateSectorSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.sectorRepository.create(request.manager!.institutionId, parsed.data.name);
    } catch (error) {
      if (error instanceof SectorNameConflictError) {
        throw new ConflictException();
      }
      throw error;
    }
  }

  @Patch("sectors/:id")
  @HttpCode(204)
  async updateSector(@Req() request: Request, @Param("id") id: string, @Body() body: unknown): Promise<void> {
    const parsed = UpdateSectorSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const sector = await this.sectorRepository.findById(id);
    if (!sector || sector.institutionId !== request.manager!.institutionId) {
      throw new NotFoundException();
    }

    // The DB foreign key only proves the manager exists, not that they belong
    // here — without this check an admin could assign another institution's
    // manager to one of their own sectors.
    if (parsed.data.managerId) {
      const assignee = await this.managerRepository.findById(parsed.data.managerId);
      if (!assignee || assignee.institutionId !== request.manager!.institutionId) {
        throw new BadRequestException("managerId does not belong to this institution");
      }
    }

    await this.sectorRepository.update(id, parsed.data);
  }

  @Get("managers")
  async listManagers(@Req() request: Request): Promise<ManagerSummaryRow[]> {
    return this.managerRepository.findAllByInstitution(request.manager!.institutionId);
  }

  @Post("managers")
  @HttpCode(201)
  async createManagerHandler(@Req() request: Request, @Body() body: unknown): Promise<CreateManagerResult> {
    const parsed = CreateManagerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.createManager.execute({ institutionId: request.manager!.institutionId, ...parsed.data });
    } catch (error) {
      if (error instanceof SectorNotInInstitutionError) {
        throw new BadRequestException("One or more sectorIds do not belong to this institution");
      }
      throw error;
    }
  }

  @Patch("managers/:id")
  @HttpCode(204)
  async updateManagerHandler(@Req() request: Request, @Param("id") id: string, @Body() body: unknown): Promise<void> {
    const parsed = UpdateManagerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      await this.updateManager.execute({ institutionId: request.manager!.institutionId, managerId: id, patch: parsed.data });
    } catch (error) {
      if (error instanceof ManagerNotFoundError) {
        throw new NotFoundException();
      }
      if (error instanceof LastActiveHospitalAdminError) {
        throw new ConflictException();
      }
      if (error instanceof SectorNotInInstitutionError) {
        throw new BadRequestException("One or more sectorIds do not belong to this institution");
      }
      throw error;
    }
  }

  @Post("managers/:id/reset-password")
  @HttpCode(200)
  async resetManagerPasswordHandler(@Req() request: Request, @Param("id") id: string): Promise<{ temporaryPassword: string }> {
    try {
      return await this.resetManagerPassword.execute({ institutionId: request.manager!.institutionId, managerId: id });
    } catch (error) {
      if (error instanceof ManagerNotFoundError) {
        throw new NotFoundException();
      }
      throw error;
    }
  }

  @Get("peer-partners")
  async listPeerPartners(@Req() request: Request): Promise<PeerPartnerSummaryRow[]> {
    return this.peerPartnerRepository.findAllByInstitution(request.manager!.institutionId);
  }

  @Post("peer-partners")
  @HttpCode(201)
  async createPeerPartnerHandler(@Req() request: Request, @Body() body: unknown): Promise<CreatePeerPartnerResult> {
    const parsed = CreatePeerPartnerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.createPeerPartner.execute({ institutionId: request.manager!.institutionId, ...parsed.data });
  }

  @Patch("peer-partners/:id")
  @HttpCode(204)
  async updatePeerPartnerHandler(@Req() request: Request, @Param("id") id: string, @Body() body: unknown): Promise<void> {
    const parsed = UpdatePeerPartnerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const peerPartner = await this.peerPartnerRepository.findById(id);
    if (!peerPartner || peerPartner.institutionId !== request.manager!.institutionId) {
      throw new NotFoundException();
    }

    await this.peerPartnerRepository.update(id, parsed.data);
  }

  @Post("peer-partners/:id/reset-password")
  @HttpCode(200)
  async resetPeerPartnerPasswordHandler(@Req() request: Request, @Param("id") id: string): Promise<{ temporaryPassword: string }> {
    try {
      return await this.resetPeerPartnerPassword.execute({ institutionId: request.manager!.institutionId, peerPartnerId: id });
    } catch (error) {
      if (error instanceof PeerPartnerNotFoundError) {
        throw new NotFoundException();
      }
      throw error;
    }
  }
}
