import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { ManagerTokenService } from "../application/services/manager-token.service.ts";

declare global {
  namespace Express {
    interface Request {
      manager?: { id: string; name: string };
    }
  }
}

// Verifies a Bearer token, not an HttpOnly cookie — deliberate,
// see docs/superpowers/specs/technical-debt.md#td-001.
@Injectable()
export class ManagerAuthGuard implements CanActivate {
  constructor(@Inject(ManagerTokenService) private readonly tokenService: ManagerTokenService) {}

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

    request.manager = { id: decoded.managerId, name: decoded.managerName };
    return true;
  }
}
