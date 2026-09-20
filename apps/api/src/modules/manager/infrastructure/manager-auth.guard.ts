import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { ManagerTokenService } from "../application/services/manager-token.service.ts";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../application/ports/manager-repository.port.ts";
import { INSTITUTION_REPOSITORY, type InstitutionRepository } from "@/modules/institution/application/ports/institution-repository.port.js";
import { readSessionToken } from "@/shared/http/session-cookie.js";

@Injectable()
export class ManagerAuthGuard implements CanActivate {
  constructor(
    @Inject(ManagerTokenService) private readonly tokenService: ManagerTokenService,
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(INSTITUTION_REPOSITORY) private readonly institutionRepository: InstitutionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = readSessionToken(request, "manager");
    if (!token) {
      throw new UnauthorizedException();
    }

    const decoded = this.tokenService.verify(token);
    if (!decoded) {
      throw new UnauthorizedException();
    }

    // The token's role and active status are a snapshot from login time. Re-read
    // the row on every request (one indexed primary-key lookup) so that
    // deactivating or demoting a manager takes effect immediately instead of
    // whenever their session happens to expire. The institution gets the same
    // re-read for the same reason: deactivating a hospital must kill its
    // managers' live sessions too, not just block their next login.
    const manager = await this.managerRepository.findById(decoded.managerId);
    if (!manager || !manager.isActive) {
      throw new UnauthorizedException();
    }
    const institution = await this.institutionRepository.findById(decoded.institutionId);
    if (!institution?.isActive) {
      throw new UnauthorizedException();
    }

    request.manager = { id: decoded.managerId, name: decoded.managerName, institutionId: decoded.institutionId, role: manager.role };
    return true;
  }
}
