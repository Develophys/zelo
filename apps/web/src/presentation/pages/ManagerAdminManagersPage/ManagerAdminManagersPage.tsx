import { useMemo, useState } from "react";
import { Button } from "@/presentation/ui/Button";
import { IconButton } from "@/presentation/ui/IconButton";
import { DataTable } from "@/presentation/ui/DataTable/DataTable";
import { DataTableEmpty } from "@/presentation/ui/DataTable/DataTableEmpty";
import { DataTableError } from "@/presentation/ui/DataTable/DataTableError";
import { DataTableToolbar } from "@/presentation/ui/DataTable/DataTableToolbar";
import { DataTableMobileCard } from "@/presentation/ui/DataTable/DataTableMobileCard";
import { BulkActionButton } from "@/presentation/ui/DataTable/BulkActionButton";
import { BulkDeleteConfirmModal } from "@/presentation/ui/DataTable/BulkDeleteConfirmModal";
import { useDataTableSelection } from "@/presentation/ui/DataTable/useDataTableSelection";
import { useBulkDelete } from "@/presentation/ui/DataTable/useBulkDelete";
import { useBulkStatusUpdate } from "@/presentation/ui/DataTable/useBulkStatusUpdate";
import { accountStatusPill } from "@/presentation/lib/account-status-pill";
import { updateConflictMessage } from "@/ports/manager-admin.port";
import { useAdminSectors } from "@/presentation/hooks/useAdminSectors";
import { useAdminManagers } from "@/presentation/hooks/useAdminManagers";
import { useUpdateManager } from "@/presentation/hooks/useUpdateManager";
import { useDeleteManager } from "@/presentation/hooks/useDeleteManager";
import { useDebouncedSearch } from "@/presentation/hooks/useDebouncedSearch";
import { useHotkey } from "@/presentation/hooks/useHotkey";
import type { ManagerSummary } from "@/ports/manager-admin.port";
import { Pencil, Mail, KeyRound } from "lucide-react";
import { COLUMNS, roleLabel, withPendingSectorFlag } from "./manager-columns";
import { ManagerFormModal } from "./ManagerFormModal";
import { ResetPasswordConfirmModal } from "./ResetPasswordConfirmModal";
import { useManagerCreateFlow } from "./useManagerCreateFlow";
import { useManagerEditFlow } from "./useManagerEditFlow";
import { useManagerInvites } from "./useManagerInvites";

export function ManagerAdminManagersPage() {
  const sectors = useAdminSectors();
  const managers = useAdminManagers();
  const updateManager = useUpdateManager();
  const deleteManager = useDeleteManager();

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);

  const managerList = useMemo(() => managers.data ?? [], [managers.data]);
  const { search, setSearch, hasQuery, filtered: filteredManagers } = useDebouncedSearch(
    managerList,
    (manager) =>
      [manager.name, manager.email, roleLabel(manager.role), manager.sectorNames.join(" ")].join(" "),
  );

  const selection = useDataTableSelection(filteredManagers, { singular: "gestor", article: "um" });

  const bulkDelete = useBulkDelete({
    deleteOne: (id) => deleteManager.mutateAsync(id),
    noun: { singular: "gestor" },
    onSuccess: () => selection.clear(),
    getName: (id) => managerList.find((manager) => manager.id === id)?.name,
  });

  const bulkStatus = useBulkStatusUpdate({
    updateOne: (id, isActive) => updateManager.mutateAsync({ id, patch: { isActive } }),
    conflictMessage: updateConflictMessage,
    noun: { singular: "gestor" },
    onSuccess: () => selection.clear(),
  });

  // Saving a SECTOR_MANAGER replaces their whole sector set, so it must not be
  // possible while the list those sectors come from is unknown.
  const sectorsUnknown = sectors.isPending || sectors.isError;

  const closeModal = () => {
    setFormMode(null);
    edit.clear();
    create.backToForm();
  };

  const create = useManagerCreateFlow({ onCreated: closeModal });
  const edit = useManagerEditFlow({ sectorsUnknown, onSaved: closeModal });
  const invites = useManagerInvites();

  const isAnyModalOpen =
    formMode !== null || bulkDelete.deleteTarget !== null || invites.resetPasswordTarget !== null;

  const openCreate = () => {
    create.reset();
    setFormMode("create");
  };

  const openEdit = (manager: ManagerSummary) => {
    edit.start(manager);
    setFormMode("edit");
  };

  const handleBulkPause = () => bulkStatus.run(selection.selectedIds, false);
  const handleBulkActivate = () => bulkStatus.run(selection.selectedIds, true);

  useHotkey("a", openCreate, "Adicionar gestor", { enabled: !isAnyModalOpen });
  useHotkey("e", () => selection.selectedRows[0] && openEdit(selection.selectedRows[0]), "Editar", {
    enabled: !isAnyModalOpen && selection.edit.enabled,
  });
  useHotkey("v", edit.save, "Salvar", { enabled: formMode === "edit" });
  useHotkey("u", handleBulkPause, "Pausar", { enabled: !isAnyModalOpen && selection.pause.enabled });
  useHotkey("i", handleBulkActivate, "Ativar", { enabled: !isAnyModalOpen && selection.activate.enabled });
  useHotkey("x", () => bulkDelete.openDeleteConfirm(selection.selectedIds), "Excluir", {
    enabled: !isAnyModalOpen && selection.remove.enabled,
  });

  const renderRowActions = (manager: ManagerSummary) => {
    const status = accountStatusPill(withPendingSectorFlag(manager));
    const isInvite = status.status === "pending" || status.status === "expired";
    return (
      <>
        <IconButton
          label={`Editar ${manager.name}`}
          icon={<Pencil size={16} aria-hidden="true" />}
          onClick={() => openEdit(manager)}
        />
        {status.status !== "pending_registration" && (
          <IconButton
            label={isInvite ? `Reenviar convite de ${manager.name}` : `Redefinir senha de ${manager.name}`}
            icon={isInvite ? <Mail size={16} aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
            onClick={() => (isInvite ? invites.resend(manager) : invites.askToResetPassword(manager))}
          />
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col gap-5 md:h-full md:min-h-0">
      <DataTable
        fill
        caption="Gestores do hospital"
        columns={COLUMNS}
        rows={filteredManagers}
        selection={selection}
        rowActions={renderRowActions}
        toolbar={
          <DataTableToolbar
            selection={selection}
            search={search}
            onSearchChange={setSearch}
            action={
              <Button variant="primary" size="sm" full={false} className="max-md:w-full" onClick={openCreate}>
                + Adicionar gestor
              </Button>
            }
            actions={
              <>
                <BulkActionButton
                  label="Editar"
                  state={selection.edit}
                  onClick={() => selection.selectedRows[0] && openEdit(selection.selectedRows[0])}
                />
                <BulkActionButton label="Pausar" state={selection.pause} onClick={handleBulkPause} />
                <BulkActionButton label="Ativar" state={selection.activate} onClick={handleBulkActivate} />
                <BulkActionButton
                  label="Excluir"
                  state={selection.remove}
                  onClick={() => bulkDelete.openDeleteConfirm(selection.selectedIds)}
                />
              </>
            }
          />
        }
        emptyState={
          managers.isLoading ? (
            <DataTableEmpty title="Carregando gestores…" hint="Isso deve levar só um instante." />
          ) : managers.isError ? (
            <DataTableError message="Não foi possível carregar os gestores." onRetry={() => managers.refetch()} />
          ) : hasQuery ? (
            <DataTableEmpty
              title="Nada encontrado para esta busca"
              hint="Tente outro termo ou revise a ortografia."
            />
          ) : (
            <DataTableEmpty title="Nenhum gestor cadastrado." hint="Adicione o primeiro para dar acesso ao painel." />
          )
        }
        mobileList={
          <ul data-testid="manager-card-list" className="flex flex-col gap-2 md:hidden">
            {filteredManagers.map((manager) => {
              const status = accountStatusPill(withPendingSectorFlag(manager));
              return (
                <DataTableMobileCard
                  key={manager.id}
                  label={`${manager.name}, ${status.text}`}
                  selected={selection.isSelected(manager.id)}
                  onToggle={() => selection.toggle(manager.id)}
                  status={status}
                  fields={[
                    { label: "Nome", value: manager.name },
                    { label: "Email", value: manager.email, breakAll: true },
                    { label: "Papel", value: roleLabel(manager.role) },
                    ...(manager.role === "SECTOR_MANAGER"
                      ? [{ label: "Setores", value: manager.sectorNames.join(", ") || "—" }]
                      : []),
                  ]}
                  actions={renderRowActions(manager)}
                />
              );
            })}
          </ul>
        }
      />

      <ManagerFormModal
        mode={formMode}
        onClose={closeModal}
        create={create}
        edit={edit}
        sectors={sectors.data ?? []}
        sectorsPending={sectors.isPending}
        sectorsFailed={sectors.isError}
      />

      <BulkDeleteConfirmModal bulk={bulkDelete} />

      <ResetPasswordConfirmModal invites={invites} />
    </div>
  );
}
