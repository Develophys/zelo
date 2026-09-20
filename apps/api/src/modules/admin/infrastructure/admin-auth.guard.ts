import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { AdminTokenService } from "../application/services/admin-token.service.ts";
import { ADMIN_REPOSITORY, type AdminRepository } from "../application/ports/admin-repository.port.ts";
import { readSessionToken } from "@/shared/http/session-cookie.js";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    @Inject(AdminTokenService) private readonly tokenService: AdminTokenService,
    @Inject(ADMIN_REPOSITORY) private readonly adminRepository: AdminRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = readSessionToken(request, "admin");
    if (!token) {
      throw new UnauthorizedException();
    }

    const decoded = this.tokenService.verify(token);
    if (!decoded) {
      throw new UnauthorizedException();
    }

    const admin = await this.adminRepository.findById(decoded.adminId);
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException();
    }

    request.admin = { id: admin.id, name: admin.name };
    return true;
  }
}
