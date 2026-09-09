import { useMutation } from '@tanstack/react-query';
import { submitAssessmentUseCase, recordSignalCheckinUseCase } from '@/app/container';
import type {
  SubmitAssessmentParams,
  SubmitAssessmentResult,
} from '@/use-cases/submit-assessment.usecase';
import { getLinkedAndOptedIn } from '@/presentation/lib/institution-link-gate';
import { isConcerningScore } from '@/domain/is-concerning-score';

export function useSubmitAssessment() {
  return useMutation({
    mutationFn: async (params: SubmitAssessmentParams): Promise<SubmitAssessmentResult> => {
      const result = await submitAssessmentUseCase.execute(params);

      // Fully decoupled from the assessment submission above: fire-and-forget,
      // and a failure here must never surface as a failed assessment submission
      // (linking is optional and never gates core functionality). An unlinked
      // device must fire zero check-in network calls, so we skip invoking the
      // use case entirely rather than calling it with a null link.
      const link = getLinkedAndOptedIn();
      if (link) {
        void recordSignalCheckinUseCase
          .execute({ link, concerning: isConcerningScore(result.totalScore) })
          .catch(() => {});
      }

      return result;
    },
  });
}
