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

  const handleCodeSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    lookup.mutate(code.trim(), {
      onSuccess: (result) => {
        setInstitution(result);
        setStep("sector");
      },
    });
  };

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
      list: sectors.data ?? [],
      hasSectors: (sectors.data?.length ?? 0) > 0,
    },
    sectorId,
    onSectorSelect: setSectorId,
    handleCodeSubmit,
    handleSectorSubmit,
    goToCodeStep: () => setStep("code"),
    goToYou: () => navigate(routes.you),
  };
}

export type LinkInstitutionFlow = ReturnType<typeof useLinkInstitutionFlow>;
