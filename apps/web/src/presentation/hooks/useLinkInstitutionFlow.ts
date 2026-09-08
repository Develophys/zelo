import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router";
import { routes } from "@/presentation/lib/routes";
import { useLookupInstitution } from "@/presentation/hooks/useLookupInstitution";
import { useInstitutionSectors } from "@/presentation/hooks/useInstitutionSectors";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
import { InstitutionNotFoundError } from "@/ports/institution-link.port";

export function useLinkInstitutionFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"code" | "sector">("code");
  const [code, setCode] = useState("");
  const [sectorId, setSectorId] = useState<string | null>(null);
  const [institution, setInstitution] = useState<{ id: string; name: string } | null>(null);
  const lookup = useLookupInstitution();
  const sectors = useInstitutionSectors(institution?.id ?? null);
  const link = useInstitutionLinkStore((state) => state.link);

  const lookupCode = (rawCode: string) => {
    const trimmed = rawCode.trim();
    setCode(trimmed);
    lookup.mutate(trimmed, {
      onSuccess: (result) => {
        setInstitution(result);
        setStep("sector");
      },
    });
  };

  const handleCodeSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    lookupCode(code);
  };

  // A scanned code skips straight to the lookup — the médico already made
  // the deliberate choice to scan, so there's no "Continuar" left to press.
  const handleCodeScanned = (scannedCode: string) => lookupCode(scannedCode);

  const handleSectorSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!institution || !sectorId) return;
    const sector = sectors.data?.find((candidate) => candidate.id === sectorId);
    if (!sector) return;
    link({
      institutionId: institution.id,
      institutionName: institution.name,
      sectorId: sector.id,
      sectorName: sector.name,
    });
    navigate(routes.you);
  };

  const codeErrorMessage = lookup.isError
    ? lookup.error instanceof InstitutionNotFoundError
      ? "Código não encontrado."
      : "Não foi possível verificar agora. Tente novamente."
    : null;

  return {
    step,
    code,
    onCodeChange: setCode,
    codeErrorMessage,
    isLookupPending: lookup.isPending,
    institutionName: institution?.name ?? null,
    sectors: {
      isLoading: sectors.isLoading,
      // Distinguished from hasSectors on purpose: "your hospital has not
      // registered its sectors" and "we could not reach the server" are
      // different facts, and only one is the hospital's fault.
      isError: sectors.isError,
      list: sectors.data ?? [],
      hasSectors: (sectors.data?.length ?? 0) > 0,
    },
    sectorId,
    onSectorSelect: setSectorId,
    handleCodeSubmit,
    handleCodeScanned,
    handleSectorSubmit,
  };
}

export type LinkInstitutionFlow = ReturnType<typeof useLinkInstitutionFlow>;
