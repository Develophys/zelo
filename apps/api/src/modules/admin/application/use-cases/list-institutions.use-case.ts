import { Inject, Injectable } from "@nestjs/common";
import {
  ADMIN_INSTITUTION_REPOSITORY,
  type AdminInstitutionPage,
  type AdminInstitutionRepository,
} from "../ports/admin-institution-repository.port.ts";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

@Injectable()
export class ListInstitutionsUseCase {
  constructor(@Inject(ADMIN_INSTITUTION_REPOSITORY) private readonly repository: AdminInstitutionRepository) {}

  async execute(query: { cursor: string | null; limit: number }): Promise<AdminInstitutionPage> {
    return this.repository.findPage(query);
  }
}
