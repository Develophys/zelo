import { useState } from "react";
import { isValidEmail } from "@/presentation/lib/validate-email";
import { toast } from "@/stores/toast.store";
import { useCreateManager } from "@/presentation/hooks/useCreateManager";
import { useCreateSector } from "@/presentation/hooks/useCreateSector";
import type { ManagerRole } from "./manager-columns";

/** `form` is the manager fields; the other two are the no-sector detour. */
export type CreateStep = "form" | "confirm-no-sector" | "create-sector";

/**
 * The "add manager" wizard: the manager fields, plus the detour a
 * SECTOR_MANAGER with no sector takes — confirm the pending registration, or
 * create a sector inline and come back with it selected.
 */
export function useManagerCreateFlow({ onCreated }: { onCreated(): void }) {
  const createManager = useCreateManager();
  const createSector = useCreateSector();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [role, setRole] = useState<ManagerRole>("SECTOR_MANAGER");
  const [selectedSectorIds, setSelectedSectorIds] = useState<string[]>([]);
  const [step, setStep] = useState<CreateStep>("form");
  const [newSectorName, setNewSectorName] = useState("");
  const [newSectorInviteCode, setNewSectorInviteCode] = useState("");

  const reset = () => {
    setName("");
    setEmail("");
    setEmailTouched(false);
    setRole("SECTOR_MANAGER");
    setSelectedSectorIds([]);
    setStep("form");
    setNewSectorName("");
    setNewSectorInviteCode("");
  };

  const toggleSector = (id: string) => {
    setSelectedSectorIds((current) =>
      current.includes(id) ? current.filter((sectorId) => sectorId !== id) : [...current, id],
    );
  };

  const submit = () => {
    const isPendingSectorAssignment = role === "SECTOR_MANAGER" && selectedSectorIds.length === 0;
    createManager.mutate(
      { name, email, role, sectorIds: role === "SECTOR_MANAGER" ? selectedSectorIds : undefined },
      {
        onSuccess: (result) => {
          toast.success(
            isPendingSectorAssignment
              ? "Gestor criado. O convite será enviado quando um setor for vinculado a ele."
              : `Convite enviado para ${result.manager.email}.`,
          );
          onCreated();
        },
      },
    );
  };

  const handleSubmit = () => {
    if (role === "SECTOR_MANAGER" && selectedSectorIds.length === 0) {
      setStep("confirm-no-sector");
      return;
    }
    submit();
  };

  const confirmWithoutSector = () => {
    setStep("form");
    submit();
  };

  const openCreateSectorStep = () => {
    setNewSectorName("");
    setNewSectorInviteCode("");
    setStep("create-sector");
  };

  /** Returns to the manager fields — also how closing the dialog rewinds the detour. */
  const backToForm = () => setStep("form");

  const createSectorForManager = () => {
    createSector.mutate(
      { name: newSectorName, inviteCode: newSectorInviteCode.trim() || undefined },
      {
        onSuccess: (created) => {
          setSelectedSectorIds((ids) => [...ids, created.id]);
          setStep("form");
        },
      },
    );
  };

  const emailFormatError =
    emailTouched && email.length > 0 && !isValidEmail(email) ? "Digite um email válido." : null;
  // A SECTOR_MANAGER with no sector selected is still a valid submission — it
  // just routes through the no-sector confirmation step (handleSubmit) instead
  // of saving directly.
  const isSubmitDisabled = name.trim().length === 0 || !isValidEmail(email);

  return {
    name,
    setName,
    email,
    setEmail,
    markEmailTouched: () => setEmailTouched(true),
    emailFormatError,
    role,
    setRole,
    selectedSectorIds,
    toggleSector,
    step,
    newSectorName,
    setNewSectorName,
    newSectorInviteCode,
    setNewSectorInviteCode,
    isNewSectorNameEmpty: newSectorName.trim().length === 0,
    isSubmitDisabled,
    isSaving: createManager.isPending,
    isCreatingSector: createSector.isPending,
    reset,
    handleSubmit,
    confirmWithoutSector,
    openCreateSectorStep,
    backToForm,
    createSectorForManager,
  };
}

export type ManagerCreateFlow = ReturnType<typeof useManagerCreateFlow>;
