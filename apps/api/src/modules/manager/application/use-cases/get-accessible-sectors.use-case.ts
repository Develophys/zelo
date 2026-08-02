import { Inject, Injectable } from "@nestjs/common";
import { SECTOR_REPOSITORY, type SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";
import type { ManagerRole } from "../ports/manager-repository.port.ts";

export interface GetAccessibleSectorsInput {
  institutionId: string;
  role: ManagerRole;
  managerId: string;
}

@Injectable()
export class GetAccessibleSectorsUseCase {
  constructor(@Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository) {}

  async execute(input: GetAccessibleSectorsInput): Promise<{ id: string; name: string }[]> {
    if (input.role === "HOSPITAL_ADMIN") {
      return this.sectorRepository.findActiveByInstitution(input.institutionId);
    }

    const assignedIds = await this.sectorRepository.findAssignedSectorIds(input.managerId);
    return this.sectorRepository.findActiveByIds(input.institutionId, assignedIds);
  }
}
