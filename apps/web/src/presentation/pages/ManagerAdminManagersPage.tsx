import { useEffect, useMemo, useState } from "react";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { IconButton } from "@/presentation/ui/IconButton";
import { Modal } from "@/presentation/ui/Modal";
import { Pill } from "@/presentation/ui/Pill";
import { SectorPillPicker } from "@/presentation/ui/SectorPillPicker";
import { TextField } from "@/presentation/ui/TextField";
import { Tooltip } from "@/presentation/ui/Tooltip";
import { ManagerPageHeader } from "@/presentation/layout/ManagerPageHeader";
import { DataTable, type DataTableColumn } from "@/presentation/ui/DataTable/DataTable";
import { DataTableEmpty } from "@/presentation/ui/DataTable/DataTableEmpty";
import { DataTableToolbar } from "@/presentation/ui/DataTable/DataTableToolbar";
import { useDataTableSelection, type BulkActionState } from "@/presentation/ui/DataTable/useDataTableSelection";
import { useAdminSectors } from "@/presentation/hooks/useAdminSectors";
import { useAdminManagers } from "@/presentation/hooks/useAdminManagers";
import { useCreateManager } from "@/presentation/hooks/useCreateManager";
import { useUpdateManager } from "@/presentation/hooks/useUpdateManager";
import { useSendManagerSetPasswordEmail } from "@/presentation/hooks/useSendManagerSetPasswordEmail";
import { useDeleteManager } from "@/presentation/hooks/useDeleteManager";
import { deleteConflictMessage } from "@/ports/manager-admin.port";
import type { AdminSector, ManagerSummary } from "@/ports/manager-admin.port";
import { Pencil, Mail, KeyRound } from "lucide-react";

type ManagerRole = "HOSPITAL_ADMIN" | "SECTOR_MANAGER";
type ManagerStatus = "active" | "inactive" | "pending" | "expired";

const STATUS_PILL: Record<ManagerStatus, { tone: "positive" | "neutral" | "warning" | "danger"; text: string }> = {
  active: { tone: "positive", text: "Ativa" },
  inactive: { tone: "neutral", text: "Inativa" },
  pending: { tone: "warning", text: "Convite pendente" },
  expired: { tone: "danger", text: "Convite expirado" },
};

function managerStatus(manager: ManagerSummary): ManagerStatus {
  if (manager.hasPassword) return manager.isActive ? "active" : "inactive";
  const tokenValid =
    manager.setPasswordTokenExpiresAt !== null &&
    new Date(manager.setPasswordTokenExpiresAt).getTime() > Date.now();
  return tokenValid ? "pending" : "expired";
}

function roleLabel(role: ManagerRole): string {
  return role === "HOSPITAL_ADMIN" ? "Gestor do hospital" : "Gestor de setor";
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// Shared by the create form and the edit form, both hosted inside the same
// Modal — only one of the two is ever mounted at a time, so a single id
// namespace per field is enough.
function RoleAndSectorFields({
  idPrefix,
  role,
  onRoleChange,
  sectors,
  selectedSectorIds,
  onToggleSector,
}: {
  idPrefix: string;
  role: ManagerRole;
  onRoleChange: (role: ManagerRole) => void;
  sectors: AdminSector[];
  selectedSectorIds: string[];
  onToggleSector: (id: string) => void;
}) {
  return (
    <>
      <fieldset className="mt-3">
        <legend className="text-label font-semibold text-ink-2">Tipo de gestor</legend>
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id={`${idPrefix}-role-hospital-admin`}
              name={`${idPrefix}-manager-role`}
              checked={role === "HOSPITAL_ADMIN"}
              onChange={() => onRoleChange("HOSPITAL_ADMIN")}
            />
            <label htmlFor={`${idPrefix}-role-hospital-admin`} className="text-label text-ink-2">
              Gestor do hospital
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id={`${idPrefix}-role-sector-manager`}
              name={`${idPrefix}-manager-role`}
              checked={role === "SECTOR_MANAGER"}
              onChange={() => onRoleChange("SECTOR_MANAGER")}
            />
            <label htmlFor={`${idPrefix}-role-sector-manager`} className="text-label text-ink-2">
              Gestor de setor
            </label>
          </div>
        </div>
      </fieldset>

      {role === "SECTOR_MANAGER" && (
        <div className="mt-3">
          <p className="text-label font-semibold text-ink-2">Setores</p>
          <div className="mt-2">
            <SectorPillPicker
              sectors={sectors}
              selectedIds={selectedSectorIds}
              onToggle={onToggleSector}
              emptyHref="/manager/admin/sectors"
              emptyLabel="Cadastrar um setor"
            />
          </div>
        </div>
      )}
    </>
  );
}

function BulkActionButton({
  label,
  state,
  onClick,
}: {
  label: string;
  state: BulkActionState;
  onClick: () => void;
}) {
  const button = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      full={false}
      aria-disabled={!state.enabled}
      onClick={() => {
        if (state.enabled) onClick();
      }}
    >
      {label}
    </Button>
  );
  // Guarding the click handler (not the `disabled` attribute) keeps the
  // button focusable, so the tooltip explaining why it's off stays reachable
  // by keyboard — a `disabled` button drops out of the tab order entirely.
  return state.reason ? <Tooltip content={state.reason}>{button}</Tooltip> : button;
}

const COLUMNS: DataTableColumn<ManagerSummary>[] = [
  { key: "name", header: "Nome", width: "w-[26%]", cell: (row) => row.name },
  { key: "email", header: "Email", width: "w-[30%]", breakAll: true, cell: (row) => row.email },
  { key: "role", header: "Papel", width: "w-[18%]", cell: (row) => roleLabel(row.role) },
  {
    key: "sectors",
    header: "Setores",
    width: "w-[16%]",
    hideBelowLg: true,
    cell: (row) => row.sectorNames.join(", ") || "—",
  },
  {
    key: "status",
    header: "Status",
    width: "w-[10%]",
    cell: (row) => {
      const status = STATUS_PILL[managerStatus(row)];
      return <Pill tone={status.tone}>{status.text}</Pill>;
    },
  },
];

export function ManagerAdminManagersPage() {
  const sectors = useAdminSectors();
  const managers = useAdminManagers();
  const createManager = useCreateManager();
  const updateManager = useUpdateManager();
  const sendSetPasswordEmail = useSendManagerSetPasswordEmail();
  const deleteManager = useDeleteManager();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ManagerRole>("HOSPITAL_ADMIN");
  const [selectedSectorIds, setSelectedSectorIds] = useState<string[]>([]);
  const [inviteSentTo, setInviteSentTo] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingManager, setEditingManager] = useState<ManagerSummary | null>(null);
  const [editRole, setEditRole] = useState<ManagerRole>("SECTOR_MANAGER");
  const [editSectorIds, setEditSectorIds] = useState<string[]>([]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[] } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const sectorList = sectors.data ?? [];
  const managerList = useMemo(() => managers.data ?? [], [managers.data]);

  const filteredManagers = useMemo(() => {
    const query = normalize(debouncedSearch.trim());
    if (query === "") return managerList;
    return managerList.filter((manager) => {
      const haystack = normalize(
        [manager.name, manager.email, roleLabel(manager.role), manager.sectorNames.join(" ")].join(" "),
      );
      return haystack.includes(query);
    });
  }, [managerList, debouncedSearch]);

  const selection = useDataTableSelection(filteredManagers, { singular: "gestor", article: "um" });

  const toggleSector = (id: string) => {
    setSelectedSectorIds((current) => (current.includes(id) ? current.filter((sectorId) => sectorId !== id) : [...current, id]));
  };

  const toggleEditSector = (id: string) => {
    setEditSectorIds((current) => (current.includes(id) ? current.filter((sectorId) => sectorId !== id) : [...current, id]));
  };

  const openCreate = () => {
    setName("");
    setEmail("");
    setRole("HOSPITAL_ADMIN");
    setSelectedSectorIds([]);
    setFormMode("create");
  };

  const openEdit = (manager: ManagerSummary) => {
    setEditingManager(manager);
    setEditRole(manager.role);
    // ManagerSummary carries sector NAMES; map them back to ids via the sector list.
    setEditSectorIds(sectorList.filter((sector) => manager.sectorNames.includes(sector.name)).map((sector) => sector.id));
    setFormMode("edit");
  };

  const closeModal = () => {
    setFormMode(null);
    setEditingManager(null);
  };

  const handleCreateSubmit = () => {
    createManager.mutate(
      { name, email, role, sectorIds: role === "SECTOR_MANAGER" ? selectedSectorIds : undefined },
      {
        onSuccess: (result) => {
          setInviteSentTo(result.manager.email);
          closeModal();
        },
      },
    );
  };

  const handleSaveEdit = () => {
    if (!editingManager) return;
    updateManager.mutate(
      { id: editingManager.id, patch: { role: editRole, sectorIds: editRole === "SECTOR_MANAGER" ? editSectorIds : undefined } },
      { onSuccess: () => closeModal() },
    );
  };

  const handleSendSetPasswordEmail = (manager: ManagerSummary) => {
    sendSetPasswordEmail.mutate(manager.id, { onSuccess: () => setInviteSentTo(manager.email) });
  };

  const handleBulkPause = () => {
    for (const id of selection.selectedIds) {
      updateManager.mutate({ id, patch: { isActive: false } });
    }
    selection.clear();
  };

  const handleBulkActivate = () => {
    for (const id of selection.selectedIds) {
      updateManager.mutate({ id, patch: { isActive: true } });
    }
    selection.clear();
  };

  const openDeleteConfirm = () => {
    setDeleteTarget({ ids: selection.selectedIds });
    setDeleteMessage(null);
  };

  const closeDeleteConfirm = () => {
    setDeleteTarget(null);
    setDeleteMessage(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    const attempted = deleteTarget.ids.length;
    let succeeded = 0;
    const failedIds: string[] = [];
    const refusals = new Set<string>();
    for (const id of deleteTarget.ids) {
      try {
        await deleteManager.mutateAsync(id);
        succeeded += 1;
      } catch (error) {
        failedIds.push(id);
        refusals.add(deleteConflictMessage(error) ?? "Não foi possível excluir. Tente de novo.");
      }
    }
    setDeleteBusy(false);

    if (failedIds.length === 0) {
      selection.clear();
      closeDeleteConfirm();
      return;
    }

    // Only the ones still refused stay on the confirm dialog — retrying
    // should not re-attempt an id that already succeeded.
    const refusalText = [...refusals].join(" ");
    setDeleteTarget({ ids: failedIds });
    setDeleteMessage(succeeded > 0 ? `${succeeded} de ${attempted} excluídos. ${refusalText}` : refusalText);
  };

  const isSubmitDisabled =
    name.trim().length === 0 || email.trim().length === 0 || (role === "SECTOR_MANAGER" && selectedSectorIds.length === 0);

  const renderRowActions = (manager: ManagerSummary) => {
    const status = managerStatus(manager);
    const isInvite = status === "pending" || status === "expired";
    return (
      <>
        <IconButton
          label={`Editar ${manager.name}`}
          icon={<Pencil size={16} />}
          onClick={() => openEdit(manager)}
        />
        <IconButton
          label={isInvite ? `Reenviar convite de ${manager.name}` : `Redefinir senha de ${manager.name}`}
          icon={isInvite ? <Mail size={16} /> : <KeyRound size={16} />}
          onClick={() => handleSendSetPasswordEmail(manager)}
        />
      </>
    );
  };

  const modalTitle = formMode === "create" ? "Adicionar gestor" : editingManager ? `Editar ${editingManager.name}` : "";

  const deleteCount = deleteTarget?.ids.length ?? 0;
  const deleteTitle = deleteCount === 1 ? "Excluir gestor?" : `Excluir ${deleteCount} gestores?`;

  return (
    <div className="flex flex-col gap-5 pt-6">
      {inviteSentTo && (
        <div role="status">
          <Card tone="brand-tint">
            <p className="text-label font-semibold text-ink-2">Convite enviado para {inviteSentTo}.</p>
          </Card>
        </div>
      )}

      <ManagerPageHeader
        title="Gestores"
        intro="Quem tem acesso ao painel e a quais setores. Cadastre um gestor antes de vinculá-lo a um setor."
        actions={
          <Button variant="primary" size="sm" full={false} onClick={openCreate}>
            + Adicionar gestor
          </Button>
        }
      />

      <DataTable
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
            actions={
              <>
                <BulkActionButton
                  label="Editar"
                  state={selection.edit}
                  onClick={() => selection.selectedRows[0] && openEdit(selection.selectedRows[0])}
                />
                <BulkActionButton label="Pausar" state={selection.pause} onClick={handleBulkPause} />
                <BulkActionButton label="Ativar" state={selection.activate} onClick={handleBulkActivate} />
                <BulkActionButton label="Excluir" state={selection.remove} onClick={openDeleteConfirm} />
              </>
            }
          />
        }
        emptyState={
          debouncedSearch.trim().length > 0 ? (
            <DataTableEmpty
              title="Nenhum resultado nos itens carregados"
              hint="A busca ainda percorre apenas a lista já carregada."
            />
          ) : (
            <DataTableEmpty title="Nenhum gestor cadastrado." hint="Adicione o primeiro para dar acesso ao painel." />
          )
        }
      />

      <ul data-testid="manager-card-list" className="flex flex-col gap-2 md:hidden">
        {filteredManagers.map((manager) => {
          const status = STATUS_PILL[managerStatus(manager)];
          const selected = selection.isSelected(manager.id);
          return (
            <li key={manager.id}>
              <button
                type="button"
                aria-label={`${manager.name}, ${status.text}`}
                onClick={() => selection.toggle(manager.id)}
                className={`flex w-full flex-col gap-2 rounded-card border p-4 text-left ${
                  selected ? "border-brand bg-brand/5" : "border-line bg-surface"
                }`}
              >
                <div className="flex justify-between gap-3">
                  <span className="text-caption text-muted">Nome</span>
                  <span className="text-label font-semibold text-ink">{manager.name}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-caption text-muted">Email</span>
                  <span className="text-label text-ink break-all">{manager.email}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-caption text-muted">Papel</span>
                  <span className="text-label text-ink">{roleLabel(manager.role)}</span>
                </div>
                {manager.role === "SECTOR_MANAGER" && (
                  <div className="flex justify-between gap-3">
                    <span className="text-caption text-muted">Setores</span>
                    <span className="text-label text-ink">{manager.sectorNames.join(", ") || "—"}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-caption text-muted">Status</span>
                  <Pill tone={status.tone}>{status.text}</Pill>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <Modal
        isOpen={formMode !== null}
        onClose={closeModal}
        title={modalTitle}
        footer={
          formMode === "create" ? (
            <>
              <Button variant="outline" full={false} onClick={closeModal}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                full={false}
                isLoading={createManager.isPending}
                disabled={isSubmitDisabled}
                onClick={handleCreateSubmit}
              >
                Adicionar gestor
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" full={false} onClick={closeModal}>
                Cancelar
              </Button>
              <Button variant="primary" full={false} isLoading={updateManager.isPending} onClick={handleSaveEdit}>
                Salvar
              </Button>
            </>
          )
        }
      >
        {formMode === "create" ? (
          <>
            <label htmlFor="manager-name-input" className="text-label font-semibold text-ink-2">
              Nome do gestor
            </label>
            <TextField
              id="manager-name-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2"
            />

            <label htmlFor="manager-email-input" className="mt-4 block text-label font-semibold text-ink-2">
              Email do gestor
            </label>
            <TextField
              id="manager-email-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2"
            />

            <RoleAndSectorFields
              idPrefix="create"
              role={role}
              onRoleChange={setRole}
              sectors={sectorList}
              selectedSectorIds={selectedSectorIds}
              onToggleSector={toggleSector}
            />
          </>
        ) : (
          editingManager && (
            <RoleAndSectorFields
              idPrefix={`edit-${editingManager.id}`}
              role={editRole}
              onRoleChange={setEditRole}
              sectors={sectorList}
              selectedSectorIds={editSectorIds}
              onToggleSector={toggleEditSector}
            />
          )
        )}
      </Modal>

      <Modal
        isOpen={deleteTarget !== null}
        onClose={closeDeleteConfirm}
        title={deleteTitle}
        size="sm"
        footer={
          <>
            <Button variant="outline" full={false} onClick={closeDeleteConfirm}>
              Cancelar
            </Button>
            <Button variant="danger" full={false} isLoading={deleteBusy} onClick={confirmDelete}>
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-label text-ink">Esta ação não pode ser desfeita.</p>
        {deleteMessage && (
          <p role="alert" className="mt-3 text-label text-danger">
            {deleteMessage}
          </p>
        )}
      </Modal>
    </div>
  );
}
