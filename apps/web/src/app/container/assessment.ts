import { ScoreAssessmentUseCase } from "@/use-cases/score-assessment.usecase";
import { EncryptAssessmentUseCase } from "@/use-cases/encrypt-assessment.usecase";
import { SubmitAssessmentUseCase } from "@/use-cases/submit-assessment.usecase";
import { GetAssessmentHistoryUseCase } from "@/use-cases/get-assessment-history.usecase";
import { WebCryptoEncryptionAdapter } from "@/infrastructure/crypto/web-crypto-encryption.adapter";
import { IndexedDbAssessmentStoreAdapter } from "@/infrastructure/storage/indexeddb-assessment-store.adapter";
import { HttpAssessmentSubmissionAdapter } from "@/infrastructure/http/http-assessment-submission.adapter";

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
