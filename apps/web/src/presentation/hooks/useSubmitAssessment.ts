import { useMutation } from "@tanstack/react-query";
import { submitAssessmentUseCase, recordSignalCheckinUseCase } from "@/app/container";
import type { SubmitAssessmentParams, SubmitAssessmentResult } from "@/use-cases/submit-assessment.usecase";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
import { isConcerningScore } from "@/domain/is-concerning-score";

export function useSubmitAssessment() {
  return useMutation({
    mutationFn: async (params: SubmitAssessmentParams): Promise<SubmitAssessmentResult> => {
      const result = await submitAssessmentUseCase.execute(params);

      // Fully decoupled from the assessment submission above: fire-and-forget,
      // and a failure here must never surface as a failed assessment submission
      // (linking is optional and never gates core functionality).
      const { institutionId, department, deviceSignalId } = useInstitutionLinkStore.getState();
      const link =
        institutionId !== null && department !== null && deviceSignalId !== null
          ? { institutionId, department, deviceSignalId }
          : null;
      void recordSignalCheckinUseCase
        .execute({ link, concerning: isConcerningScore(result.totalScore) })
        .catch(() => {});

      return result;
    },
  });
}
