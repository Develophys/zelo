import { Module } from "@nestjs/common";
import { PrismaSectorRepository } from "./infrastructure/persistence/prisma-sector.repository.ts";
import { SECTOR_REPOSITORY } from "./application/ports/sector-repository.port.ts";
import { GetSectorByInviteCodeUseCase } from "./application/use-cases/get-sector-by-invite-code.use-case.ts";

@Module({
  providers: [
    { provide: SECTOR_REPOSITORY, useClass: PrismaSectorRepository },
    GetSectorByInviteCodeUseCase,
  ],
  exports: [SECTOR_REPOSITORY, GetSectorByInviteCodeUseCase],
})
export class SectorModule {}
