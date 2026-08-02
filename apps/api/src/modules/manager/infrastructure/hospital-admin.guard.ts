import { ForbiddenException, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

// Must run after ManagerAuthGuard in the same @UseGuards(...) list —
// it reads request.manager, which only ManagerAuthGuard populates.
@Injectable()
export class HospitalAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.manager?.role !== "HOSPITAL_ADMIN") {
      throw new ForbiddenException();
    }
    return true;
  }
}
