import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@/stores/toast.store";
import { useCreateManager } from "@/presentation/hooks/useCreateManager";
import { useCreateSector } from "@/presentation/hooks/useCreateSector";
import { managerFormSchema, type ManagerFormValues } from "./manager-form-schema";
import type { ManagerRole } from "./manager-columns";

/** `form` is the manager fields; the other two are the no-sector detour. */
export type CreateStep = "form" | "confirm-no-sector" | "create-sector";

/** The "add manager" wizard: the manager fields, plus the no-sector detour. */
export function useManagerCreateFlow({ onCreated }: { onCreated(): void }) {
  const createManager = useCreateManager();
  const createSector = useCreateSector();

  const form = useForm<ManagerFormValues>({
    resolver: zodResolver(managerFormSchema),
    defaultValues: { name: "", email: "" },
    mode: "onBlur",
  });

  const [role, setRole] = useState<ManagerRole>("SECTOR_MANAGER");
  const [selectedSectorIds, setSelectedSectorIds] = useState<string[]>([]);
  const [step, setStep] = useState<CreateStep>("form");
  const [newSectorName, setNewSectorName] = useState("");
  const [newSectorInviteCode, setNewSectorInviteCode] = useState("");

  const reset = () => {
    form.reset({ name: "", email: "" });
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

  const submit = (values: ManagerFormValues) => {
    const isPendingSectorAssignment = role === "SECTOR_MANAGER" && selectedSectorIds.length === 0;
    createManager.mutate(
      { ...values, role, sectorIds: role === "SECTOR_MANAGER" ? selectedSectorIds : undefined },
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

  const handleSubmit = form.handleSubmit((values) => {
    if (role === "SECTOR_MANAGER" && selectedSectorIds.length === 0) {
      setStep("confirm-no-sector");
      return;
    }
    submit(values);
  });

  const confirmWithoutSector = () => {
    setStep("form");
    submit(form.getValues());
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

  const [nameValue, emailValue] = form.watch(["name", "email"]);
  const isSubmitDisabled = !managerFormSchema.safeParse({ name: nameValue, email: emailValue }).success;

  return {
    form,
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
