import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository, type ManagerRole } from "../ports/manager-repository.port.ts";
import { SECTOR_REPOSITORY, type SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";
import { LastActiveHospitalAdminError, ManagerNotFoundError, SectorNotInInstitutionError } from "./manager-admin-errors.ts";

export interface UpdateManagerInput {
  institutionId: string;
  managerId: string;
  patch: { isActive?: boolean; role?: ManagerRole; sectorIds?: string[] };
}

@Injectable()
export class UpdateManagerUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
  ) {}

  async execute(input: UpdateManagerInput): Promise<void> {
    const manager = await this.managerRepository.findById(input.managerId);
    if (!manager || manager.institutionId !== input.institutionId) {
      throw new ManagerNotFoundError();
    }

    const deactivating = input.patch.isActive === false;
    // Demoting the last admin locks the institution out of its own admin panel
    // just as thoroughly as deactivating them, and there is no recovery path.
    const demoting = input.patch.role !== undefined && input.patch.role !== "HOSPITAL_ADMIN";
    const losingAdminRights = deactivating || demoting;

    if (losingAdminRights && manager.role === "HOSPITAL_ADMIN" && manager.isActive) {
      const activeHospitalAdmins = await this.managerRepository.countActiveHospitalAdmins(input.institutionId);
      if (activeHospitalAdmins <= 1) {
        throw new LastActiveHospitalAdminError();
      }
    }

    await this.managerRepository.update(input.managerId, {
      isActive: input.patch.isActive,
      role: input.patch.role,
    });

    if (deactivating) {
      // Sectors lose their manager on deactivation regardless of any sectorIds
      // passed alongside it — clearing wins, matching the spec's "sector
      // becomes unassigned" behavior.
      await this.sectorRepository.reassignManagerSectors(input.institutionId, input.managerId, []);
      return;
    }

    if (input.patch.sectorIds) {
      const owned = await this.sectorRepository.findByIdsInInstitution(input.institutionId, input.patch.sectorIds);
      if (owned.length !== input.patch.sectorIds.length) {
        throw new SectorNotInInstitutionError();
      }
      await this.sectorRepository.reassignManagerSectors(input.institutionId, input.managerId, input.patch.sectorIds);
    }
  }
}
