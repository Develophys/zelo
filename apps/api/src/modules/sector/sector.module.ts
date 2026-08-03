import { Module } from "@nestjs/common";
import { PrismaSectorRepository } from "./infrastructure/persistence/prisma-sector.repository.ts";
import { SECTOR_REPOSITORY } from "./application/ports/sector-repository.port.ts";

@Module({
  providers: [{ provide: SECTOR_REPOSITORY, useClass: PrismaSectorRepository }],
  exports: [SECTOR_REPOSITORY],
})
export class SectorModule {}
