import { Inject, Injectable } from "@nestjs/common";
import { GetAccessibleSectorsUseCase } from "./get-accessible-sectors.use-case.ts";
import type { ManagerRole } from "../ports/manager-repository.port.ts";

export interface ResolveAccessibleSectorIdsInput {
  institutionId: string;
  role: ManagerRole;
  managerId: string;
  requestedSectorIds?: string[];
}

@Injectable()
export class ResolveAccessibleSectorIdsUseCase {
  constructor(@Inject(GetAccessibleSectorsUseCase) private readonly getAccessibleSectors: GetAccessibleSectorsUseCase) {}

  // Deliberately delegates the "which sectors can this manager see" question to
  // GetAccessibleSectorsUseCase so that GET /manager/sectors (the picker) and
  // GET /manager/signals (the data) can never disagree — notably about
  // deactivated sectors, which must be invisible to both.
  async execute(input: ResolveAccessibleSectorIdsInput): Promise<string[]> {
    const accessible = await this.getAccessibleSectors.execute({
      institutionId: input.institutionId,
      role: input.role,
      managerId: input.managerId,
    });
    const accessibleIds = accessible.map((sector) => sector.id);

    if (!input.requestedSectorIds) return accessibleIds;

    const accessibleIdSet = new Set(accessibleIds);
    return input.requestedSectorIds.filter((id) => accessibleIdSet.has(id));
  }
}
