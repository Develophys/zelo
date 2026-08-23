import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../ports/manager-repository.port.ts";
import { SECTOR_REPOSITORY, type SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";
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
    // A manager from another institution is "not found", never "forbidden":
    // the difference would confirm that the id exists.
    if (!manager || manager.institutionId !== input.institutionId) {
      throw new ManagerNotFoundError();
    }

    // Sector.managerId is ON DELETE SET NULL, not RESTRICT — the database
    // will not refuse this delete on its own. This check is the only thing
    // standing between deleting a manager and silently unassigning every
    // sector they own, so it must run, and must run before the delete.
    const ownedSectorIds = await this.sectorRepository.findAssignedSectorIds(input.managerId);
    if (ownedSectorIds.length > 0) {
      throw new ManagerOwnsSectorsError();
    }

    // The same door this institution could already lock itself behind by
    // deactivating or demoting its last admin — deleting is no different, and
    // has no undo at all.
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
