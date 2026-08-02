import { Module } from "@nestjs/common";
import { AdminController } from "./infrastructure/admin.controller.ts";
import { AdminAuthGuard } from "./infrastructure/admin-auth.guard.ts";
import { PrismaAdminRepository } from "./infrastructure/persistence/prisma-admin.repository.ts";
import { PrismaAdminInstitutionRepository } from "./infrastructure/persistence/prisma-admin-institution.repository.ts";
import { LoginAdminUseCase } from "./application/use-cases/login-admin.use-case.ts";
import { CreateInstitutionUseCase } from "./application/use-cases/create-institution.use-case.ts";
import { ListInstitutionsUseCase } from "./application/use-cases/list-institutions.use-case.ts";
import { AdminTokenService } from "./application/services/admin-token.service.ts";
import { AdminPasswordService } from "./application/services/admin-password.service.ts";
import { ADMIN_REPOSITORY } from "./application/ports/admin-repository.port.ts";
import { ADMIN_INSTITUTION_REPOSITORY } from "./application/ports/admin-institution-repository.port.ts";

@Module({
  controllers: [AdminController],
  providers: [
    LoginAdminUseCase,
    CreateInstitutionUseCase,
    ListInstitutionsUseCase,
    AdminTokenService,
    AdminPasswordService,
    AdminAuthGuard,
    { provide: ADMIN_REPOSITORY, useClass: PrismaAdminRepository },
    { provide: ADMIN_INSTITUTION_REPOSITORY, useClass: PrismaAdminInstitutionRepository },
  ],
})
export class AdminModule {}
