import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { createElement, type ReactNode } from "react";
import { useLinkInstitutionFlow } from "./useLinkInstitutionFlow";
import * as container from "@/app/container";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  return createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(MemoryRouter, null, children),
  );
}

function submitEvent() {
  return { preventDefault: () => {} } as never;
}

describe("useLinkInstitutionFlow", () => {
  beforeEach(() => {
    localStorage.clear();
    useInstitutionLinkStore.setState({
      institutionId: null,
      institutionName: null,
      sectorId: null,
      sectorName: null,
      deviceSignalId: null,
    });
    vi.restoreAllMocks();
  });

  it("moves to the sector step when the lookup resolves only an institution", async () => {
    vi.spyOn(container.lookupInstitutionUseCase, "execute").mockResolvedValue({
      institution: { id: "inst-1", name: "Hospital São Lucas" },
    });

    const { result } = renderHook(() => useLinkInstitutionFlow(), { wrapper });

    act(() => result.current.onCodeChange("sao-lucas-2026"));
    act(() => result.current.handleCodeSubmit(submitEvent()));

    await waitFor(() => expect(result.current.step).toBe("sector"));
  });

  it("moves straight to the confirm step when the lookup resolves a sector too", async () => {
    vi.spyOn(container.lookupInstitutionUseCase, "execute").mockResolvedValue({
      institution: { id: "inst-1", name: "Hospital São Lucas" },
      sector: { id: "sector-1", name: "UTI" },
    });

    const { result } = renderHook(() => useLinkInstitutionFlow(), { wrapper });

    act(() => result.current.onCodeChange("uti-sao-lucas-2026"));
    act(() => result.current.handleCodeSubmit(submitEvent()));

    await waitFor(() => expect(result.current.step).toBe("confirm"));
    expect(result.current.confirmSector).toEqual({ id: "sector-1", name: "UTI" });
  });

  it("does not fetch the sectors list when the lookup resolves a sector too (confirm path skips the picker)", async () => {
    vi.spyOn(container.lookupInstitutionUseCase, "execute").mockResolvedValue({
      institution: { id: "inst-1", name: "Hospital São Lucas" },
      sector: { id: "sector-1", name: "UTI" },
    });
    const listSectorsSpy = vi.spyOn(container.listInstitutionSectorsUseCase, "execute");

    const { result } = renderHook(() => useLinkInstitutionFlow(), { wrapper });

    act(() => result.current.onCodeChange("uti-sao-lucas-2026"));
    act(() => result.current.handleCodeSubmit(submitEvent()));
    await waitFor(() => expect(result.current.step).toBe("confirm"));

    expect(listSectorsSpy).not.toHaveBeenCalled();
  });

  it("handleConfirmSubmit links using the already-resolved institution and sector, without another lookup call", async () => {
    const lookupSpy = vi.spyOn(container.lookupInstitutionUseCase, "execute").mockResolvedValue({
      institution: { id: "inst-1", name: "Hospital São Lucas" },
      sector: { id: "sector-1", name: "UTI" },
    });

    const { result } = renderHook(() => useLinkInstitutionFlow(), { wrapper });

    act(() => result.current.onCodeChange("uti-sao-lucas-2026"));
    act(() => result.current.handleCodeSubmit(submitEvent()));
    await waitFor(() => expect(result.current.step).toBe("confirm"));

    act(() => result.current.handleConfirmSubmit());

    expect(lookupSpy).toHaveBeenCalledTimes(1);
    expect(useInstitutionLinkStore.getState().institutionId).toBe("inst-1");
    expect(useInstitutionLinkStore.getState().institutionName).toBe("Hospital São Lucas");
    expect(useInstitutionLinkStore.getState().sectorId).toBe("sector-1");
    expect(useInstitutionLinkStore.getState().sectorName).toBe("UTI");
  });

  it("handleRejectConfirm returns to the code step so a wrong QR can be rescanned", async () => {
    vi.spyOn(container.lookupInstitutionUseCase, "execute").mockResolvedValue({
      institution: { id: "inst-1", name: "Hospital São Lucas" },
      sector: { id: "sector-1", name: "UTI" },
    });

    const { result } = renderHook(() => useLinkInstitutionFlow(), { wrapper });

    act(() => result.current.onCodeChange("uti-sao-lucas-2026"));
    act(() => result.current.handleCodeSubmit(submitEvent()));
    await waitFor(() => expect(result.current.step).toBe("confirm"));

    act(() => result.current.handleRejectConfirm());

    expect(result.current.step).toBe("code");
  });
});
