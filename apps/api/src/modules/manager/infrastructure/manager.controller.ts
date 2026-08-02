import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { LoginManagerUseCase, InvalidManagerCredentialsError } from "../application/use-cases/login-manager.use-case.ts";
import { GetManagerSignalsUseCase, type ManagerSignalsResponse } from "../application/use-cases/get-manager-signals.use-case.ts";
import { GenerateManagerInsightUseCase } from "../application/use-cases/generate-manager-insight.use-case.ts";
import { GetManagerInsightHistoryUseCase } from "../application/use-cases/get-manager-insight-history.use-case.ts";
import { ResolveAccessibleSectorIdsUseCase } from "../application/use-cases/resolve-accessible-sector-ids.use-case.ts";
import { GetAccessibleSectorsUseCase } from "../application/use-cases/get-accessible-sectors.use-case.ts";
import { InsightGenerationFailedError, type ManagerInsightResponse } from "../application/ports/ai-insight.port.ts";
import type { StoredManagerInsight } from "../application/ports/manager-insight-repository.port.ts";
import type { IssuedManagerToken } from "../application/services/manager-token.service.ts";
import { ManagerAuthGuard } from "./manager-auth.guard.ts";

const LoginRequestSchema = z.object({ name: z.string().min(1).max(200), password: z.string().min(1).max(200) });

@Controller("manager")
export class ManagerController {
  constructor(
    @Inject(LoginManagerUseCase) private readonly loginManager: LoginManagerUseCase,
    @Inject(GetManagerSignalsUseCase) private readonly getManagerSignals: GetManagerSignalsUseCase,
    @Inject(GenerateManagerInsightUseCase) private readonly generateManagerInsight: GenerateManagerInsightUseCase,
    @Inject(GetManagerInsightHistoryUseCase) private readonly getManagerInsightHistory: GetManagerInsightHistoryUseCase,
    @Inject(ResolveAccessibleSectorIdsUseCase) private readonly resolveAccessibleSectorIds: ResolveAccessibleSectorIdsUseCase,
    @Inject(GetAccessibleSectorsUseCase) private readonly getAccessibleSectors: GetAccessibleSectorsUseCase,
  ) {}

  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown): Promise<IssuedManagerToken> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.loginManager.execute(parsed.data.name, parsed.data.password);
    } catch (error) {
      if (error instanceof InvalidManagerCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }

  @Get("sectors")
  @UseGuards(ManagerAuthGuard)
  async sectors(@Req() request: Request): Promise<{ id: string; name: string }[]> {
    return this.getAccessibleSectors.execute({
      institutionId: request.manager!.institutionId,
      role: request.manager!.role,
      managerId: request.manager!.id,
    });
  }

  @Get("signals")
  @UseGuards(ManagerAuthGuard)
  async signals(@Req() request: Request, @Query("sectorIds") sectorIdsParam?: string): Promise<ManagerSignalsResponse> {
    const requestedSectorIds = sectorIdsParam ? sectorIdsParam.split(",").filter((id) => id.length > 0) : undefined;
    const sectorIds = await this.resolveAccessibleSectorIds.execute({
      institutionId: request.manager!.institutionId,
      role: request.manager!.role,
      managerId: request.manager!.id,
      requestedSectorIds,
    });
    return this.getManagerSignals.execute(request.manager!.institutionId, sectorIds);
  }

  @Post("insights")
  @HttpCode(200)
  @UseGuards(ManagerAuthGuard)
  async insights(@Req() request: Request): Promise<ManagerInsightResponse> {
    try {
      return await this.generateManagerInsight.execute(request.manager!.name, request.manager!.institutionId);
    } catch (error) {
      if (error instanceof InsightGenerationFailedError) {
        throw new BadGatewayException();
      }
      throw error;
    }
  }

  @Get("insights/history")
  @UseGuards(ManagerAuthGuard)
  async insightsHistory(@Req() request: Request): Promise<StoredManagerInsight[]> {
    return this.getManagerInsightHistory.execute(request.manager!.institutionId);
  }
}
