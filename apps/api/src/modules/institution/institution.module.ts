import { Module } from "@nestjs/common";
import { InstitutionController } from "./infrastructure/institution.controller.ts";
import { GetInstitutionByInviteCodeUseCase } from "./application/use-cases/get-institution-by-invite-code.use-case.ts";
import { PrismaInstitutionRepository } from "./infrastructure/persistence/prisma-institution.repository.ts";
import { INSTITUTION_REPOSITORY } from "./application/ports/institution-repository.port.ts";
import { SectorModule } from "../sector/sector.module.ts";

@Module({
  imports: [SectorModule],
  controllers: [InstitutionController],
  providers: [
    GetInstitutionByInviteCodeUseCase,
    { provide: INSTITUTION_REPOSITORY, useClass: PrismaInstitutionRepository },
  ],
})
export class InstitutionModule {}
