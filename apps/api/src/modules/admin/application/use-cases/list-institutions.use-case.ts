import { Inject, Injectable } from "@nestjs/common";
import {
  ADMIN_INSTITUTION_REPOSITORY,
  type AdminInstitutionRepository,
  type AdminInstitutionRow,
} from "../ports/admin-institution-repository.port.ts";

@Injectable()
export class ListInstitutionsUseCase {
  constructor(@Inject(ADMIN_INSTITUTION_REPOSITORY) private readonly repository: AdminInstitutionRepository) {}

  async execute(): Promise<AdminInstitutionRow[]> {
    return this.repository.findAll();
  }
}
