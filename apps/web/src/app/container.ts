import { CheckApiHealthUseCase } from "@/use-cases/check-api-health.usecase";
import { HttpApiHealthAdapter } from "@/infrastructure/http/http-api-health.adapter";
import { AnonymizeTextUseCase } from "@/use-cases/anonymize-text.usecase";
import { SendChatMessageUseCase } from "@/use-cases/send-chat-message.usecase";
import { HttpChatGatewayAdapter } from "@/infrastructure/http/http-chat-gateway.adapter";
import { RequestHumanHandoffUseCase } from "@/use-cases/request-human-handoff.usecase";
import { ScoreAssessmentUseCase } from "@/use-cases/score-assessment.usecase";
import { EncryptAssessmentUseCase } from "@/use-cases/encrypt-assessment.usecase";
import { SubmitAssessmentUseCase } from "@/use-cases/submit-assessment.usecase";
import { GetAssessmentHistoryUseCase } from "@/use-cases/get-assessment-history.usecase";
import { WebCryptoEncryptionAdapter } from "@/infrastructure/crypto/web-crypto-encryption.adapter";
import { IndexedDbAssessmentStoreAdapter } from "@/infrastructure/storage/indexeddb-assessment-store.adapter";
import { HttpAssessmentSubmissionAdapter } from "@/infrastructure/http/http-assessment-submission.adapter";
import { LoginManagerUseCase } from "@/use-cases/login-manager.usecase";
import { HttpManagerAuthAdapter } from "@/infrastructure/http/http-manager-auth.adapter";
import { GetManagerSignalsUseCase } from "@/use-cases/get-manager-signals.usecase";
import { HttpManagerSignalsAdapter } from "@/infrastructure/http/http-manager-signals.adapter";
import { GenerateManagerInsightUseCase } from "@/use-cases/generate-manager-insight.usecase";
import { HttpManagerInsightAdapter } from "@/infrastructure/http/http-manager-insight.adapter";
import { GetManagerInsightHistoryUseCase } from "@/use-cases/get-manager-insight-history.usecase";
import { HttpManagerInsightHistoryAdapter } from "@/infrastructure/http/http-manager-insight-history.adapter";
import { LookupInstitutionUseCase } from "@/use-cases/lookup-institution.usecase";
import { HttpInstitutionLinkAdapter } from "@/infrastructure/http/http-institution-link.adapter";
import { RecordSignalCheckinUseCase } from "@/use-cases/record-signal-checkin.usecase";
import { HttpSignalCheckinAdapter } from "@/infrastructure/http/http-signal-checkin.adapter";
import { LoginAdminUseCase } from "@/use-cases/login-admin.usecase";
import { HttpAdminAuthAdapter } from "@/infrastructure/http/http-admin-auth.adapter";
import { CreateInstitutionUseCase } from "@/use-cases/create-institution.usecase";
import { ListInstitutionsUseCase } from "@/use-cases/list-institutions.usecase";
import { HttpAdminInstitutionAdapter } from "@/infrastructure/http/http-admin-institution.adapter";
import { HttpManagerAdminAdapter } from "@/infrastructure/http/http-manager-admin.adapter";
import { ListSectorsUseCase } from "@/use-cases/list-sectors.usecase";
import { CreateSectorUseCase } from "@/use-cases/create-sector.usecase";
import { UpdateSectorUseCase } from "@/use-cases/update-sector.usecase";
import { ListManagersUseCase } from "@/use-cases/list-managers.usecase";
import { CreateManagerUseCase as CreateManagerAdminUseCase } from "@/use-cases/create-manager.usecase";
import { UpdateManagerUseCase as UpdateManagerAdminUseCase } from "@/use-cases/update-manager.usecase";
import { ResetManagerPasswordUseCase } from "@/use-cases/reset-manager-password.usecase";
import { HttpManagerSectorsAdapter } from "@/infrastructure/http/http-manager-sectors.adapter";
import { ListAccessibleSectorsUseCase } from "@/use-cases/list-accessible-sectors.usecase";
import { ListInstitutionSectorsUseCase } from "@/use-cases/list-institution-sectors.usecase";

export const checkApiHealthUseCase = new CheckApiHealthUseCase(new HttpApiHealthAdapter());
export const sendChatMessageUseCase = new SendChatMessageUseCase(
  new HttpChatGatewayAdapter(),
  new AnonymizeTextUseCase(),
);
export const requestHumanHandoffUseCase = new RequestHumanHandoffUseCase();
export const submitAssessmentUseCase = new SubmitAssessmentUseCase(
  new ScoreAssessmentUseCase(),
  new EncryptAssessmentUseCase(new WebCryptoEncryptionAdapter()),
  new IndexedDbAssessmentStoreAdapter(),
  new HttpAssessmentSubmissionAdapter(),
);
export const getAssessmentHistoryUseCase = new GetAssessmentHistoryUseCase(
  new IndexedDbAssessmentStoreAdapter(),
  new WebCryptoEncryptionAdapter(),
  new ScoreAssessmentUseCase(),
);
export const loginManagerUseCase = new LoginManagerUseCase(new HttpManagerAuthAdapter());
export const getManagerSignalsUseCase = new GetManagerSignalsUseCase(new HttpManagerSignalsAdapter());
export const generateManagerInsightUseCase = new GenerateManagerInsightUseCase(new HttpManagerInsightAdapter());
export const getManagerInsightHistoryUseCase = new GetManagerInsightHistoryUseCase(new HttpManagerInsightHistoryAdapter());
export const lookupInstitutionUseCase = new LookupInstitutionUseCase(new HttpInstitutionLinkAdapter());
export const listInstitutionSectorsUseCase = new ListInstitutionSectorsUseCase(new HttpInstitutionLinkAdapter());
export const recordSignalCheckinUseCase = new RecordSignalCheckinUseCase(new HttpSignalCheckinAdapter());
export const loginAdminUseCase = new LoginAdminUseCase(new HttpAdminAuthAdapter());
export const createInstitutionUseCase = new CreateInstitutionUseCase(new HttpAdminInstitutionAdapter());
export const listInstitutionsUseCase = new ListInstitutionsUseCase(new HttpAdminInstitutionAdapter());

const managerAdminAdapter = new HttpManagerAdminAdapter();
export const listSectorsUseCase = new ListSectorsUseCase(managerAdminAdapter);
export const createSectorUseCase = new CreateSectorUseCase(managerAdminAdapter);
export const updateSectorUseCase = new UpdateSectorUseCase(managerAdminAdapter);
export const listManagersUseCase = new ListManagersUseCase(managerAdminAdapter);
export const createManagerAdminUseCase = new CreateManagerAdminUseCase(managerAdminAdapter);
export const updateManagerAdminUseCase = new UpdateManagerAdminUseCase(managerAdminAdapter);
export const resetManagerPasswordUseCase = new ResetManagerPasswordUseCase(managerAdminAdapter);
export const listAccessibleSectorsUseCase = new ListAccessibleSectorsUseCase(new HttpManagerSectorsAdapter());
