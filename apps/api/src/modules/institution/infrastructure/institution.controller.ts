import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { GetInstitutionByInviteCodeUseCase } from "../application/use-cases/get-institution-by-invite-code.use-case.ts";

@Controller("institutions")
export class InstitutionController {
  constructor(
    @Inject(GetInstitutionByInviteCodeUseCase)
    private readonly getInstitutionByInviteCode: GetInstitutionByInviteCodeUseCase,
  ) {}

  @Get("by-code/:code")
  async byCode(@Param("code") code: string): Promise<{ id: string; name: string }> {
    const institution = await this.getInstitutionByInviteCode.execute(code);
    if (!institution) {
      throw new NotFoundException();
    }
    return { id: institution.id, name: institution.name };
  }
}
