import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../ports/manager-repository.port.ts";
import { SECTOR_REPOSITORY, type SectorRepository } from "@/modules/sector/application/ports/sector-repository.port.js";
import {
  LastActiveHospitalAdminError,
  ManagerNotFoundError,
  ManagerOwnsSectorsError,
} from "./manager-admin-errors.ts";

export interface DeleteManagerInput {
  institutionId: string;
  managerId: string;
}

@Injectable()
export class DeleteManagerUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
  ) {}

  async execute(input: DeleteManagerInput): Promise<void> {
    const manager = await this.managerRepository.findById(input.managerId);
    if (!manager || manager.institutionId !== input.institutionId) {
      throw new ManagerNotFoundError();
    }

    const ownedSectorIds = await this.sectorRepository.findAssignedSectorIds(input.managerId);
    if (ownedSectorIds.length > 0) {
      throw new ManagerOwnsSectorsError();
    }

    if (manager.role === "HOSPITAL_ADMIN" && manager.isActive) {
      const activeHospitalAdmins = await this.managerRepository.countActiveHospitalAdmins(
        input.institutionId,
      );
      if (activeHospitalAdmins <= 1) {
        throw new LastActiveHospitalAdminError();
      }
    }

    await this.managerRepository.delete(input.managerId);
  }
}
