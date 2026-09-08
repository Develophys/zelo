import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { LoginAdminUseCase, InvalidAdminCredentialsError } from "../application/use-cases/login-admin.use-case.ts";
import { CreateInstitutionUseCase, type CreateInstitutionResult } from "../application/use-cases/create-institution.use-case.ts";
import { ListInstitutionsUseCase } from "../application/use-cases/list-institutions.use-case.ts";
import { ADMIN_INSTITUTION_REPOSITORY } from "../application/ports/admin-institution-repository.port.ts";
import type { AdminInstitutionRepository, AdminInstitutionRow } from "../application/ports/admin-institution-repository.port.ts";
import { DuplicateInstitutionOrManagerError } from "../application/ports/admin-institution-repository.port.ts";
import type { IssuedAdminToken } from "../application/services/admin-token.service.ts";
import { AdminAuthGuard } from "./admin-auth.guard.ts";

const LoginRequestSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });
const CreateInstitutionSchema = z.object({
  institutionName: z.string().min(1).max(200),
  inviteCode: z.string().min(1).max(100),
  hospitalAdminName: z.string().min(1).max(200),
  hospitalAdminEmail: z.string().email().max(200),
});
const UpdateInstitutionSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
});

@Controller("admin")
export class AdminController {
  constructor(
    @Inject(LoginAdminUseCase) private readonly loginAdmin: LoginAdminUseCase,
    @Inject(CreateInstitutionUseCase) private readonly createInstitution: CreateInstitutionUseCase,
    @Inject(ListInstitutionsUseCase) private readonly listInstitutions: ListInstitutionsUseCase,
    @Inject(ADMIN_INSTITUTION_REPOSITORY) private readonly institutionRepository: AdminInstitutionRepository,
  ) {}

  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown): Promise<IssuedAdminToken> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.loginAdmin.execute(parsed.data.email, parsed.data.password);
    } catch (error) {
      if (error instanceof InvalidAdminCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }

  @Post("institutions")
  @HttpCode(201)
  @UseGuards(AdminAuthGuard)
  async createInstitutionHandler(@Body() body: unknown): Promise<CreateInstitutionResult> {
    const parsed = CreateInstitutionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.createInstitution.execute(parsed.data);
    } catch (error) {
      if (error instanceof DuplicateInstitutionOrManagerError) {
        throw new ConflictException();
      }
      throw error;
    }
  }

  @Get("institutions")
  @UseGuards(AdminAuthGuard)
  async listInstitutionsHandler(): Promise<AdminInstitutionRow[]> {
    return this.listInstitutions.execute();
  }

  @Patch("institutions/:id")
  @HttpCode(204)
  @UseGuards(AdminAuthGuard)
  async updateInstitutionHandler(@Param("id") id: string, @Body() body: unknown): Promise<void> {
    const parsed = UpdateInstitutionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const institution = await this.institutionRepository.findById(id);
    if (!institution) {
      throw new NotFoundException();
    }

    try {
      await this.institutionRepository.update(id, parsed.data);
    } catch (error) {
      if (error instanceof DuplicateInstitutionOrManagerError) throw new ConflictException();
      throw error;
    }
  }
}
