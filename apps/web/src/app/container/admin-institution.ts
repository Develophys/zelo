import { CreateInstitutionUseCase } from "@/use-cases/create-institution.usecase";
import { ListInstitutionsUseCase } from "@/use-cases/list-institutions.usecase";
import { UpdateInstitutionUseCase } from "@/use-cases/update-institution.usecase";
import { ListAdminInstitutionSectorsUseCase } from "@/use-cases/list-admin-institution-sectors.usecase";
import { HttpAdminInstitutionAdapter } from "@/infrastructure/http/http-admin-institution.adapter";

export const createInstitutionUseCase = new CreateInstitutionUseCase(new HttpAdminInstitutionAdapter());
export const listInstitutionsUseCase = new ListInstitutionsUseCase(new HttpAdminInstitutionAdapter());
export const updateInstitutionUseCase = new UpdateInstitutionUseCase(new HttpAdminInstitutionAdapter());
export const listAdminInstitutionSectorsUseCase = new ListAdminInstitutionSectorsUseCase(
  new HttpAdminInstitutionAdapter(),
);
