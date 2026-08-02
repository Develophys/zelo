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
import { LastActiveHospitalAdminError, ManagerNotFoundError, SectorNotInInstitutionError } from "../application/use-cases/manager-admin-errors.ts";

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

@Controller("manager/admin")
@UseGuards(ManagerAuthGuard, HospitalAdminGuard)
export class ManagerAdminController {
  constructor(
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(CreateManagerUseCase) private readonly createManager: CreateManagerUseCase,
    @Inject(UpdateManagerUseCase) private readonly updateManager: UpdateManagerUseCase,
    @Inject(ResetManagerPasswordUseCase) private readonly resetManagerPassword: ResetManagerPasswordUseCase,
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
}
