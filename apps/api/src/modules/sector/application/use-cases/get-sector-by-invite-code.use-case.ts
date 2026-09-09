import { Inject, Injectable } from "@nestjs/common";
import {
  SECTOR_REPOSITORY,
  type SectorRepository,
  type SectorWithInstitution,
} from "../ports/sector-repository.port.ts";

@Injectable()
export class GetSectorByInviteCodeUseCase {
  constructor(@Inject(SECTOR_REPOSITORY) private readonly repository: SectorRepository) {}

  async execute(inviteCode: string): Promise<SectorWithInstitution | null> {
    const sector = await this.repository.findByInviteCode(inviteCode);
    if (!sector || !sector.isActive || !sector.institution.isActive) return null;
    return sector;
  }
}
