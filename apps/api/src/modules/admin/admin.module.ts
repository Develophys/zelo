import { Module } from "@nestjs/common";
import { AdminController } from "./infrastructure/admin.controller.ts";
import { AdminAuthGuard } from "./infrastructure/admin-auth.guard.ts";
import { PrismaAdminRepository } from "./infrastructure/persistence/prisma-admin.repository.ts";
import { LoginAdminUseCase } from "./application/use-cases/login-admin.use-case.ts";
import { AdminTokenService } from "./application/services/admin-token.service.ts";
import { AdminPasswordService } from "./application/services/admin-password.service.ts";
import { ADMIN_REPOSITORY } from "./application/ports/admin-repository.port.ts";

@Module({
  controllers: [AdminController],
  providers: [
    LoginAdminUseCase,
    AdminTokenService,
    AdminPasswordService,
    AdminAuthGuard,
    { provide: ADMIN_REPOSITORY, useClass: PrismaAdminRepository },
  ],
})
export class AdminModule {}
