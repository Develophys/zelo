import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository, type ManagerRole } from "../ports/manager-repository.port.ts";
import { SECTOR_REPOSITORY, type SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import { generateTemporaryPassword } from "../../../../shared/generate-temporary-password.ts";
import { SectorNotInInstitutionError } from "./manager-admin-errors.ts";

export interface CreateManagerInput {
  institutionId: string;
  name: string;
  role: ManagerRole;
  sectorIds?: string[];
}

export interface CreateManagerResult {
  manager: { id: string; name: string };
  temporaryPassword: string;
}

@Injectable()
export class CreateManagerUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
    @Inject(ManagerPasswordService) private readonly passwordService: ManagerPasswordService,
  ) {}

  async execute(input: CreateManagerInput): Promise<CreateManagerResult> {
    const sectorIds = input.sectorIds ?? [];

    if (input.role === "SECTOR_MANAGER" && sectorIds.length > 0) {
      const owned = await this.sectorRepository.findByIdsInInstitution(input.institutionId, sectorIds);
      if (owned.length !== sectorIds.length) {
        throw new SectorNotInInstitutionError();
      }
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);

    const manager = await this.managerRepository.create({
      name: input.name,
      passwordHash,
      institutionId: input.institutionId,
      role: input.role,
    });

    if (input.role === "SECTOR_MANAGER" && sectorIds.length > 0) {
      await this.sectorRepository.reassignManagerSectors(input.institutionId, manager.id, sectorIds);
    }

    return { manager, temporaryPassword };
  }
}
