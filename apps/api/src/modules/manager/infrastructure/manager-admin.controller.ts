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

const CreateSectorSchema = z.object({ name: z.string().trim().min(1).max(200) });
const UpdateSectorSchema = z.object({ isActive: z.boolean().optional(), managerId: z.string().nullable().optional() });

@Controller("manager/admin")
@UseGuards(ManagerAuthGuard, HospitalAdminGuard)
export class ManagerAdminController {
  constructor(@Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository) {}

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
}
