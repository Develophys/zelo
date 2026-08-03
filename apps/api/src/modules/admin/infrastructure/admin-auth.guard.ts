import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { AdminTokenService } from "../application/services/admin-token.service.ts";

declare global {
  namespace Express {
    interface Request {
      admin?: { id: string; name: string };
    }
  }
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(@Inject(AdminTokenService) private readonly tokenService: AdminTokenService) {}

  canActivate(context: ExecutionContext): boolean {
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

    request.admin = { id: decoded.adminId, name: decoded.adminName };
    return true;
  }
}
