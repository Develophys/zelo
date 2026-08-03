import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { ManagerTokenService } from "../application/services/manager-token.service.ts";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../application/ports/manager-repository.port.ts";

// Verifies a Bearer token, not an HttpOnly cookie — deliberate,
// see docs/superpowers/specs/technical-debt.md#td-001.
@Injectable()
export class ManagerAuthGuard implements CanActivate {
  constructor(
    @Inject(ManagerTokenService) private readonly tokenService: ManagerTokenService,
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice("Bearer ".length);
    const decoded = this.tokenService.verify(token);
    if (!decoded) {
      throw new UnauthorizedException();
    }

    // The token's role and active status are a snapshot from login time. Re-read
    // the row on every request (one indexed primary-key lookup) so that
    // deactivating or demoting a manager takes effect immediately instead of
    // whenever their session happens to expire.
    const manager = await this.managerRepository.findById(decoded.managerId);
    if (!manager || !manager.isActive) {
      throw new UnauthorizedException();
    }

    request.manager = { id: decoded.managerId, name: decoded.managerName, institutionId: decoded.institutionId, role: manager.role };
    return true;
  }
}
