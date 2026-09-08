import { Inject, Injectable } from "@nestjs/common";
import {
  INSTITUTION_REPOSITORY,
  type InstitutionRepository,
  type InstitutionRow,
} from "../ports/institution-repository.port.ts";

@Injectable()
export class GetInstitutionByInviteCodeUseCase {
  constructor(@Inject(INSTITUTION_REPOSITORY) private readonly repository: InstitutionRepository) {}

  async execute(inviteCode: string): Promise<InstitutionRow | null> {
    const institution = await this.repository.findByInviteCode(inviteCode);
    if (!institution || !institution.isActive) return null;
    return institution;
  }
}
