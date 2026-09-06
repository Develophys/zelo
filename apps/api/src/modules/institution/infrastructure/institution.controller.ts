import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { GetInstitutionByInviteCodeUseCase } from "../application/use-cases/get-institution-by-invite-code.use-case.ts";
import { SECTOR_REPOSITORY, type SectorRepository } from "@/modules/sector/application/ports/sector-repository.port.js";

@Controller("institutions")
export class InstitutionController {
  constructor(
    @Inject(GetInstitutionByInviteCodeUseCase)
    private readonly getInstitutionByInviteCode: GetInstitutionByInviteCodeUseCase,
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
  ) {}

  @Get("by-code/:code")
  async byCode(@Param("code") code: string): Promise<{ id: string; name: string }> {
    const institution = await this.getInstitutionByInviteCode.execute(code);
    if (!institution) {
      throw new NotFoundException();
    }
    return { id: institution.id, name: institution.name };
  }

  @Get(":id/sectors")
  async sectors(@Param("id") id: string): Promise<{ id: string; name: string }[]> {
    return this.sectorRepository.findActiveByInstitution(id);
  }
}
