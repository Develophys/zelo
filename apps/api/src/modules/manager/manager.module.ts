import { Module } from "@nestjs/common";
import { SectorModule } from "../sector/sector.module.ts";
import { PeerPartnerModule } from "../peer-partner/peer-partner.module.ts";
import { PeerChatModule } from "../peer-chat/peer-chat.module.ts";
import { EmailModule } from "@/shared/email/email.module.js";
import { NotificationModule } from "../notification/notification.module.ts";
import { ManagerController } from "./infrastructure/manager.controller.ts";
import { ManagerAdminController } from "./infrastructure/manager-admin.controller.ts";
import { ManagerAuthGuard } from "./infrastructure/manager-auth.guard.ts";
import { HospitalAdminGuard } from "./infrastructure/hospital-admin.guard.ts";
import { PrismaSignalRepository } from "./infrastructure/persistence/prisma-signal.repository.ts";
import { PrismaSimulatedFollowUpRepository } from "./infrastructure/persistence/prisma-simulated-follow-up.repository.ts";
import { PrismaManagerInsightRepository } from "./infrastructure/persistence/prisma-manager-insight.repository.ts";
import { PrismaManagerRepository } from "./infrastructure/persistence/prisma-manager.repository.ts";
import { GroqInsightAdapter } from "./infrastructure/ai-providers/groq-insight.adapter.ts";
import { FakeInsightAdapter } from "./infrastructure/ai-providers/fake-insight.adapter.ts";
import { LoginManagerUseCase } from "./application/use-cases/login-manager.use-case.ts";
import { GetManagerSignalsUseCase } from "./application/use-cases/get-manager-signals.use-case.ts";
import { GenerateManagerInsightUseCase } from "./application/use-cases/generate-manager-insight.use-case.ts";
import { GetManagerInsightHistoryUseCase } from "./application/use-cases/get-manager-insight-history.use-case.ts";
import { ResolveAccessibleSectorIdsUseCase } from "./application/use-cases/resolve-accessible-sector-ids.use-case.ts";
import { GetAccessibleSectorsUseCase } from "./application/use-cases/get-accessible-sectors.use-case.ts";
import { CreateManagerUseCase } from "./application/use-cases/create-manager.use-case.ts";
import { UpdateManagerUseCase } from "./application/use-cases/update-manager.use-case.ts";
import { SendManagerSetPasswordEmailUseCase } from "./application/use-cases/send-manager-set-password-email.use-case.ts";
import { FinishManagerSetupUseCase } from "./application/use-cases/finish-manager-setup.use-case.ts";
import { DeleteManagerUseCase } from "./application/use-cases/delete-manager.use-case.ts";
import { DeleteSectorUseCase } from "./application/use-cases/delete-sector.use-case.ts";
import { DeletePeerPartnerUseCase } from "./application/use-cases/delete-peer-partner.use-case.ts";
import { CreatePeerPartnerUseCase } from "./application/use-cases/create-peer-partner.use-case.ts";
import { SendPeerPartnerSetPasswordEmailUseCase } from "./application/use-cases/send-peer-partner-set-password-email.use-case.ts";
import { ManagerTokenService } from "./application/services/manager-token.service.ts";
import { ManagerPasswordService } from "./application/services/manager-password.service.ts";
import { SIGNAL_REPOSITORY } from "./application/ports/signal-repository.port.ts";
import { SIMULATED_FOLLOW_UP_REPOSITORY } from "./application/ports/simulated-follow-up-repository.port.ts";
import { AI_INSIGHT_PORT } from "./application/ports/ai-insight.port.ts";
import { MANAGER_INSIGHT_REPOSITORY } from "./application/ports/manager-insight-repository.port.ts";
import { MANAGER_REPOSITORY } from "./application/ports/manager-repository.port.ts";

// Read directly from process.env (not ConfigService) so that only the
// selected adapter is ever instantiated — AI_PROVIDER=mock must not require
// a GROQ_API_KEY, but GroqInsightAdapter's constructor calls config.getOrThrow for it.
const aiInsightPortProvider =
  process.env.AI_PROVIDER === "mock"
    ? { provide: AI_INSIGHT_PORT, useClass: FakeInsightAdapter }
    : { provide: AI_INSIGHT_PORT, useClass: GroqInsightAdapter };

@Module({
  imports: [SectorModule, PeerPartnerModule, PeerChatModule, EmailModule, NotificationModule],
  controllers: [ManagerController, ManagerAdminController],
  providers: [
    LoginManagerUseCase,
    GetManagerSignalsUseCase,
    GenerateManagerInsightUseCase,
    GetManagerInsightHistoryUseCase,
    ResolveAccessibleSectorIdsUseCase,
    GetAccessibleSectorsUseCase,
    CreateManagerUseCase,
    UpdateManagerUseCase,
    SendManagerSetPasswordEmailUseCase,
    FinishManagerSetupUseCase,
    DeleteManagerUseCase,
    DeleteSectorUseCase,
    DeletePeerPartnerUseCase,
    ManagerTokenService,
    ManagerPasswordService,
    CreatePeerPartnerUseCase,
    SendPeerPartnerSetPasswordEmailUseCase,
    ManagerAuthGuard,
    HospitalAdminGuard,
    { provide: SIGNAL_REPOSITORY, useClass: PrismaSignalRepository },
    { provide: SIMULATED_FOLLOW_UP_REPOSITORY, useClass: PrismaSimulatedFollowUpRepository },
    aiInsightPortProvider,
    { provide: MANAGER_INSIGHT_REPOSITORY, useClass: PrismaManagerInsightRepository },
    { provide: MANAGER_REPOSITORY, useClass: PrismaManagerRepository },
  ],
})
export class ManagerModule {}
