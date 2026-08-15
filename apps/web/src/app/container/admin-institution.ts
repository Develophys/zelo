import { CreateInstitutionUseCase } from "@/use-cases/create-institution.usecase";
import { ListInstitutionsUseCase } from "@/use-cases/list-institutions.usecase";
import { HttpAdminInstitutionAdapter } from "@/infrastructure/http/http-admin-institution.adapter";

export const createInstitutionUseCase = new CreateInstitutionUseCase(new HttpAdminInstitutionAdapter());
export const listInstitutionsUseCase = new ListInstitutionsUseCase(new HttpAdminInstitutionAdapter());
