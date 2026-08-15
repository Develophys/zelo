import { LookupInstitutionUseCase } from "@/use-cases/lookup-institution.usecase";
import { HttpInstitutionLinkAdapter } from "@/infrastructure/http/http-institution-link.adapter";
import { ListInstitutionSectorsUseCase } from "@/use-cases/list-institution-sectors.usecase";

export const lookupInstitutionUseCase = new LookupInstitutionUseCase(new HttpInstitutionLinkAdapter());
export const listInstitutionSectorsUseCase = new ListInstitutionSectorsUseCase(new HttpInstitutionLinkAdapter());
