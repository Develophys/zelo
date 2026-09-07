import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useSubmitAssessment } from "./useSubmitAssessment";
import * as container from "@/app/container";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
import { useConsentStore } from "@/stores/consent.store";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useSubmitAssessment", () => {
  beforeEach(() => {
    useInstitutionLinkStore.setState({
      institutionId: null,
      institutionName: null,
      sectorId: null,
      sectorName: null,
      deviceSignalId: null,
    });
    useConsentStore.setState({ aggregateOptIn: true });
  });

  it("does not call recordSignalCheckinUseCase when no institution is linked", async () => {
    vi.spyOn(container.submitAssessmentUseCase, "execute").mockResolvedValue({
      totalScore: 5,
      riskSignal: false,
      submissionSucceeded: true,
    });
    const checkinSpy = vi.spyOn(container.recordSignalCheckinUseCase, "execute");

    const { result } = renderHook(() => useSubmitAssessment(), { wrapper });

    result.current.mutate({ scaleType: "PHQ-9", answers: [0, 0, 0] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(checkinSpy).not.toHaveBeenCalled();
  });

  it("does not let a rejected check-in fail the assessment-submission mutation", async () => {
    useInstitutionLinkStore.getState().link({
      institutionId: "inst-1",
      institutionName: "Hospital São Lucas",
      sectorId: "sector-1",
      sectorName: "UTI",
    });
    vi.spyOn(container.submitAssessmentUseCase, "execute").mockResolvedValue({
      totalScore: 12,
      riskSignal: true,
      submissionSucceeded: true,
    });
    vi.spyOn(container.recordSignalCheckinUseCase, "execute").mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useSubmitAssessment(), { wrapper });

    result.current.mutate({ scaleType: "GAD-7", answers: [1, 1, 1] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      totalScore: 12,
      riskSignal: true,
      submissionSucceeded: true,
    });
    expect(result.current.isError).toBe(false);
  });

  it("does not call recordSignalCheckinUseCase when the médico declined the aggregate signal, even with a linked institution", async () => {
    useInstitutionLinkStore.getState().link({
      institutionId: "inst-1",
      institutionName: "Hospital São Lucas",
      sectorId: "sector-1",
      sectorName: "UTI",
    });
    useConsentStore.setState({ aggregateOptIn: false });
    vi.spyOn(container.submitAssessmentUseCase, "execute").mockResolvedValue({
      totalScore: 5,
      riskSignal: false,
      submissionSucceeded: true,
    });
    const checkinSpy = vi.spyOn(container.recordSignalCheckinUseCase, "execute");

    const { result } = renderHook(() => useSubmitAssessment(), { wrapper });

    result.current.mutate({ scaleType: "PHQ-9", answers: [0, 0, 0] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(checkinSpy).not.toHaveBeenCalled();
  });
});
