import { useState } from "react";
import { useUpdateManager } from "@/presentation/hooks/useUpdateManager";
import type { ManagerSummary } from "@/ports/manager-admin.port";
import type { ManagerRole } from "./manager-columns";

/**
 * Editing an existing manager: role and sector assignment only.
 *
 * `sectorsUnknown` comes from the caller because saving a SECTOR_MANAGER
 * replaces their whole sector set — it must not be possible while the list
 * those sectors come from failed to load or is still in flight.
 */
export function useManagerEditFlow({
  sectorsUnknown,
  onSaved,
}: {
  sectorsUnknown: boolean;
  onSaved(): void;
}) {
  const updateManager = useUpdateManager();

  const [editingManager, setEditingManager] = useState<ManagerSummary | null>(null);
  const [role, setRole] = useState<ManagerRole>("SECTOR_MANAGER");
  const [sectorIds, setSectorIds] = useState<string[]>([]);

  const start = (manager: ManagerSummary) => {
    setEditingManager(manager);
    setRole(manager.role);
    setSectorIds(manager.sectorIds);
  };

  const clear = () => setEditingManager(null);

  const toggleSector = (id: string) => {
    setSectorIds((current) =>
      current.includes(id) ? current.filter((sectorId) => sectorId !== id) : [...current, id],
    );
  };

  const save = () => {
    if (!editingManager) return;
    updateManager.mutate(
      {
        id: editingManager.id,
        patch: { role, sectorIds: role === "SECTOR_MANAGER" ? sectorIds : undefined },
      },
      { onSuccess: () => onSaved() },
    );
  };

  return {
    editingManager,
    role,
    setRole,
    sectorIds,
    toggleSector,
    isSubmitDisabled: role === "SECTOR_MANAGER" && (sectorIds.length === 0 || sectorsUnknown),
    isSaving: updateManager.isPending,
    start,
    clear,
    save,
  };
}

export type ManagerEditFlow = ReturnType<typeof useManagerEditFlow>;
