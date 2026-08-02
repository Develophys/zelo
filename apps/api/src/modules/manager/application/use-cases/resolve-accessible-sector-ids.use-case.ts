import { Inject, Injectable } from "@nestjs/common";
import { SECTOR_REPOSITORY, type SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";
import type { ManagerRole } from "../ports/manager-repository.port.ts";

export interface ResolveAccessibleSectorIdsInput {
  institutionId: string;
  role: ManagerRole;
  managerId: string;
  requestedSectorIds?: string[];
}

@Injectable()
export class ResolveAccessibleSectorIdsUseCase {
  constructor(@Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository) {}

  async execute(input: ResolveAccessibleSectorIdsInput): Promise<string[]> {
    if (input.role === "HOSPITAL_ADMIN") {
      const active = await this.sectorRepository.findActiveByInstitution(input.institutionId);
      const activeIds = new Set(active.map((sector) => sector.id));
      if (!input.requestedSectorIds) return [...activeIds];
      return input.requestedSectorIds.filter((id) => activeIds.has(id));
    }

    const assigned = await this.sectorRepository.findAssignedSectorIds(input.managerId);
    if (!input.requestedSectorIds) return assigned;
    const assignedSet = new Set(assigned);
    return input.requestedSectorIds.filter((id) => assignedSet.has(id));
  }
}
