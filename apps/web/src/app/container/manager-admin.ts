import { HttpManagerAdminAdapter } from "@/infrastructure/http/http-manager-admin.adapter";
import { ListSectorsUseCase } from "@/use-cases/list-sectors.usecase";
import { CreateSectorUseCase } from "@/use-cases/create-sector.usecase";
import { UpdateSectorUseCase } from "@/use-cases/update-sector.usecase";
import { ListManagersUseCase } from "@/use-cases/list-managers.usecase";
import { CreateManagerUseCase as CreateManagerAdminUseCase } from "@/use-cases/create-manager.usecase";
import { UpdateManagerUseCase as UpdateManagerAdminUseCase } from "@/use-cases/update-manager.usecase";
import { SendManagerSetPasswordEmailUseCase } from "@/use-cases/send-manager-set-password-email.usecase";
import { ListPeerPartnersUseCase } from "@/use-cases/list-peer-partners.usecase";
import { CreatePeerPartnerUseCase } from "@/use-cases/create-peer-partner.usecase";
import { UpdatePeerPartnerUseCase } from "@/use-cases/update-peer-partner.usecase";
import { SendPeerPartnerSetPasswordEmailUseCase } from "@/use-cases/send-peer-partner-set-password-email.usecase";

const managerAdminAdapter = new HttpManagerAdminAdapter();

export const listSectorsUseCase = new ListSectorsUseCase(managerAdminAdapter);
export const createSectorUseCase = new CreateSectorUseCase(managerAdminAdapter);
export const updateSectorUseCase = new UpdateSectorUseCase(managerAdminAdapter);
export const listManagersUseCase = new ListManagersUseCase(managerAdminAdapter);
export const createManagerAdminUseCase = new CreateManagerAdminUseCase(managerAdminAdapter);
export const updateManagerAdminUseCase = new UpdateManagerAdminUseCase(managerAdminAdapter);
export const sendManagerSetPasswordEmailUseCase = new SendManagerSetPasswordEmailUseCase(managerAdminAdapter);
export const listPeerPartnersUseCase = new ListPeerPartnersUseCase(managerAdminAdapter);
export const createPeerPartnerUseCase = new CreatePeerPartnerUseCase(managerAdminAdapter);
export const updatePeerPartnerUseCase = new UpdatePeerPartnerUseCase(managerAdminAdapter);
export const sendPeerPartnerSetPasswordEmailUseCase = new SendPeerPartnerSetPasswordEmailUseCase(
  managerAdminAdapter,
);
