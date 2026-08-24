import { Inject, Injectable } from "@nestjs/common";
import { SECTOR_REPOSITORY, type SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";
import { SIGNAL_REPOSITORY, type SignalRepository } from "../ports/signal-repository.port.ts";
import { SectorHasHistoryError, SectorNotInInstitutionError } from "./manager-admin-errors.ts";

export interface DeleteSectorInput {
  institutionId: string;
  sectorId: string;
}

@Injectable()
export class DeleteSectorUseCase {
  constructor(
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
    @Inject(SIGNAL_REPOSITORY) private readonly signalRepository: SignalRepository,
  ) {}

  async execute(input: DeleteSectorInput): Promise<void> {
    const sector = await this.sectorRepository.findById(input.sectorId);
    if (!sector || sector.institutionId !== input.institutionId) {
      throw new SectorNotInInstitutionError();
    }

    const signalCount = await this.signalRepository.countBySector(input.sectorId);
    if (signalCount > 0) {
      throw new SectorHasHistoryError();
    }

    await this.sectorRepository.delete(input.sectorId);
  }
}
