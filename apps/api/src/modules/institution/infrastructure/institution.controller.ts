import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { GetInstitutionByInviteCodeUseCase } from "../application/use-cases/get-institution-by-invite-code.use-case.ts";
import { GetSectorByInviteCodeUseCase } from "@/modules/sector/application/use-cases/get-sector-by-invite-code.use-case.js";
import { SECTOR_REPOSITORY, type SectorRepository } from "@/modules/sector/application/ports/sector-repository.port.js";

export interface LinkCodeResult {
  id: string;
  name: string;
  institution: { id: string; name: string };
  sector?: { id: string; name: string };
}

@Controller("institutions")
export class InstitutionController {
  constructor(
    @Inject(GetInstitutionByInviteCodeUseCase)
    private readonly getInstitutionByInviteCode: GetInstitutionByInviteCodeUseCase,
    @Inject(GetSectorByInviteCodeUseCase)
    private readonly getSectorByInviteCode: GetSectorByInviteCodeUseCase,
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
  ) {}

  @Get("by-code/:code")
  async byCode(@Param("code") code: string): Promise<LinkCodeResult> {
    const institution = await this.getInstitutionByInviteCode.execute(code);
    if (institution) {
      return {
        id: institution.id,
        name: institution.name,
        institution: { id: institution.id, name: institution.name },
      };
    }

    const sector = await this.getSectorByInviteCode.execute(code);
    if (!sector) {
      throw new NotFoundException();
    }
    return {
      id: sector.institution.id,
      name: sector.institution.name,
      institution: { id: sector.institution.id, name: sector.institution.name },
      sector: { id: sector.id, name: sector.name },
    };
  }

  @Get(":id/sectors")
  async sectors(@Param("id") id: string): Promise<{ id: string; name: string }[]> {
    return this.sectorRepository.findActiveByInstitution(id);
  }
}
