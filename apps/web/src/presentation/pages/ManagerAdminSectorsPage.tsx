import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { IconButton } from "@/presentation/ui/IconButton";
import { Modal } from "@/presentation/ui/Modal";
import { Pill } from "@/presentation/ui/Pill";
import { TextField, SelectField } from "@/presentation/ui/TextField";
import { Tooltip } from "@/presentation/ui/Tooltip";
import { ManagerPageHeader } from "@/presentation/layout/ManagerPageHeader";
import { DataTable, type DataTableColumn } from "@/presentation/ui/DataTable/DataTable";
import { DataTableEmpty } from "@/presentation/ui/DataTable/DataTableEmpty";
import { DataTableToolbar } from "@/presentation/ui/DataTable/DataTableToolbar";
import { useDataTableSelection, type BulkActionState } from "@/presentation/ui/DataTable/useDataTableSelection";
import { useAdminSectors } from "@/presentation/hooks/useAdminSectors";
import { useAdminManagers } from "@/presentation/hooks/useAdminManagers";
import { useCreateSector } from "@/presentation/hooks/useCreateSector";
import { useUpdateSector } from "@/presentation/hooks/useUpdateSector";
import { useDeleteSector } from "@/presentation/hooks/useDeleteSector";
import { deleteConflictMessage } from "@/ports/manager-admin.port";
import type { AdminSector, ManagerSummary } from "@/ports/manager-admin.port";
import { Pencil } from "lucide-react";

const SUGGESTED_SECTOR_NAMES = ["UTI", "Pronto-Socorro", "Clínica Médica", "Centro Cirúrgico", "Pediatria", "Ambulatório", "Plantão Noturno"];

const STATUS_PILL: Record<"active" | "inactive", { tone: "positive" | "neutral"; text: string }> = {
  active: { tone: "positive", text: "Ativa" },
  inactive: { tone: "neutral", text: "Inativa" },
};

function sectorStatus(sector: AdminSector): "active" | "inactive" {
  return sector.isActive ? "active" : "inactive";
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// Shared by the create form and the edit form, both hosted inside the same
// Modal — only one of the two is ever mounted at a time, so a single id
// namespace per field is enough. The name field has no update path (the API
// only supports setting it at creation), so the edit form renders it disabled
// rather than pretending a rename would persist.
function SectorFields({
  idPrefix,
  name,
  onNameChange,
  nameDisabled,
  showSuggestions,
  managers,
  managerId,
  onManagerChange,
}: {
  idPrefix: string;
  name: string;
  onNameChange?: (value: string) => void;
  nameDisabled?: boolean;
  showSuggestions?: boolean;
  managers: ManagerSummary[];
  managerId: string | null;
  onManagerChange: (id: string | null) => void;
}) {
  const nameFieldId = `${idPrefix}-sector-name`;
  const managerFieldId = `${idPrefix}-sector-manager`;

  return (
    <>
      <label htmlFor={nameFieldId} className="text-label font-semibold text-ink-2">
        Nome do setor
      </label>
      <TextField
        id={nameFieldId}
        value={name}
        disabled={nameDisabled}
        onChange={onNameChange ? (event) => onNameChange(event.target.value) : undefined}
        className="mt-2"
      />
      {showSuggestions && (
        <div className="mt-2 flex flex-wrap gap-2">
          {SUGGESTED_SECTOR_NAMES.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onNameChange?.(suggestion)}
              className="min-h-11 rounded-status border border-line px-3 py-1.5 text-label text-muted hover:bg-canvas"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {managers.length === 0 ? (
        <>
          <p className="mt-4 text-label font-semibold text-ink-2">Gestor responsável</p>
          <p className="mt-2 text-label text-muted">
            Nenhum gestor cadastrado ainda.{" "}
            <Link to="/manager/admin/managers" className="font-semibold text-brand underline">
              Cadastrar um gestor
            </Link>
          </p>
        </>
      ) : (
        <>
          <label htmlFor={managerFieldId} className="mt-4 block text-label font-semibold text-ink-2">
            Gestor responsável
          </label>
          <SelectField
            id={managerFieldId}
            value={managerId ?? ""}
            onChange={(event) => onManagerChange(event.target.value || null)}
            className="mt-2"
          >
            <option value="">Sem gestor</option>
            {managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.name}
              </option>
            ))}
          </SelectField>
        </>
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

const COLUMNS: DataTableColumn<AdminSector>[] = [
  { key: "name", header: "Nome", width: "w-[40%]", cell: (row) => row.name },
  { key: "manager", header: "Gestor responsável", width: "w-[35%]", cell: (row) => row.managerName ?? "—" },
  {
    key: "status",
    header: "Status",
    width: "w-[25%]",
    cell: (row) => {
      const status = STATUS_PILL[sectorStatus(row)];
      return <Pill tone={status.tone}>{status.text}</Pill>;
    },
  },
];

export function ManagerAdminSectorsPage() {
  const sectorsQuery = useAdminSectors();
  const managersQuery = useAdminManagers();
  const createSector = useCreateSector();
  const updateSector = useUpdateSector();
  const deleteSector = useDeleteSector();

  const [name, setName] = useState("");
  const [managerId, setManagerId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingSector, setEditingSector] = useState<AdminSector | null>(null);
  const [editManagerId, setEditManagerId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[] } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const managerList = useMemo(() => managersQuery.data ?? [], [managersQuery.data]);
  const sectorList = useMemo(() => sectorsQuery.data ?? [], [sectorsQuery.data]);

  const filteredSectors = useMemo(() => {
    const query = normalize(debouncedSearch.trim());
    if (query === "") return sectorList;
    return sectorList.filter((sector) => {
      const haystack = normalize([sector.name, sector.managerName ?? ""].join(" "));
      return haystack.includes(query);
    });
  }, [sectorList, debouncedSearch]);

  const selection = useDataTableSelection(filteredSectors, { singular: "setor", article: "um" });

  const openCreate = () => {
    setName("");
    setManagerId(null);
    createSector.reset();
    setFormMode("create");
  };

  const openEdit = (sector: AdminSector) => {
    setEditingSector(sector);
    setEditManagerId(sector.managerId);
    setFormMode("edit");
  };

  const closeModal = () => {
    setFormMode(null);
    setEditingSector(null);
  };

  const handleCreateSubmit = () => {
    createSector.mutate(name, {
      onSuccess: (result) => {
        if (managerId === null) {
          closeModal();
          return;
        }
        // createSector's use case only takes a name — assigning the manager
        // is a second mutation. If it fails, the sector still exists
        // (unassigned): closing the modal reflects that rather than telling
        // the manager the whole thing failed.
        updateSector.mutate(
          { id: result.id, patch: { managerId } },
          {
            onSuccess: () => closeModal(),
            onError: () => {
              closeModal();
              setNotice(
                `Setor "${result.name}" criado, mas não foi possível atribuir o gestor. Edite o setor para tentar de novo.`,
              );
            },
          },
        );
      },
    });
  };

  const handleSaveEdit = () => {
    if (!editingSector) return;
    updateSector.mutate(
      { id: editingSector.id, patch: { managerId: editManagerId } },
      { onSuccess: () => closeModal() },
    );
  };

  const handleBulkPause = () => {
    for (const id of selection.selectedIds) {
      updateSector.mutate({ id, patch: { isActive: false } });
    }
    selection.clear();
  };

  const handleBulkActivate = () => {
    for (const id of selection.selectedIds) {
      updateSector.mutate({ id, patch: { isActive: true } });
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
        await deleteSector.mutateAsync(id);
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

  const isSubmitDisabled = name.trim().length === 0;

  const renderRowActions = (sector: AdminSector) => (
    <IconButton label={`Editar ${sector.name}`} icon={<Pencil size={16} />} onClick={() => openEdit(sector)} />
  );

  const modalTitle = formMode === "create" ? "Adicionar setor" : editingSector ? `Editar ${editingSector.name}` : "";

  const deleteCount = deleteTarget?.ids.length ?? 0;
  const deleteTitle = deleteCount === 1 ? "Excluir setor?" : `Excluir ${deleteCount} setores?`;

  return (
    <div className="flex flex-col gap-5 pt-6">
      {notice && (
        <div role="status">
          <Card tone="brand-tint">
            <p className="text-label font-semibold text-ink-2">{notice}</p>
          </Card>
        </div>
      )}

      <ManagerPageHeader
        title="Setores"
        intro="Áreas do hospital acompanhadas pelo Zelo. Cada setor pode ter um gestor responsável."
        actions={
          <Button variant="primary" size="sm" full={false} onClick={openCreate}>
            + Adicionar setor
          </Button>
        }
      />

      <DataTable
        caption="Setores do hospital"
        columns={COLUMNS}
        rows={filteredSectors}
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
            <DataTableEmpty title="Nenhum setor cadastrado." hint="Adicione o primeiro para começar a acompanhar." />
          )
        }
      />

      <ul data-testid="sector-card-list" className="flex flex-col gap-2 md:hidden">
        {filteredSectors.map((sector) => {
          const status = STATUS_PILL[sectorStatus(sector)];
          const selected = selection.isSelected(sector.id);
          return (
            <li
              key={sector.id}
              className={`overflow-hidden rounded-card border ${
                selected ? "border-brand bg-brand/5" : "border-line bg-surface"
              }`}
            >
              {/* The selection target is a sibling of the row-action IconButton
                  below, not its parent — nesting a button inside a button is
                  invalid HTML and breaks both keyboard and screen-reader use. */}
              <button
                type="button"
                aria-label={`${sector.name}, ${status.text}`}
                onClick={() => selection.toggle(sector.id)}
                className="flex w-full flex-col gap-2 p-4 text-left"
              >
                <div className="flex justify-between gap-3">
                  <span className="text-caption text-muted">Nome</span>
                  <span className="text-label font-semibold text-ink">{sector.name}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-caption text-muted">Gestor responsável</span>
                  <span className="text-label text-ink">{sector.managerName ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-caption text-muted">Status</span>
                  <Pill tone={status.tone}>{status.text}</Pill>
                </div>
              </button>
              <div className="flex items-center justify-end gap-1 border-t border-line px-4 py-2">
                {renderRowActions(sector)}
              </div>
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
                isLoading={createSector.isPending || updateSector.isPending}
                disabled={isSubmitDisabled}
                onClick={handleCreateSubmit}
              >
                Salvar
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" full={false} onClick={closeModal}>
                Cancelar
              </Button>
              <Button variant="primary" full={false} isLoading={updateSector.isPending} onClick={handleSaveEdit}>
                Salvar
              </Button>
            </>
          )
        }
      >
        {formMode === "create" ? (
          <>
            <SectorFields
              idPrefix="create"
              name={name}
              onNameChange={setName}
              showSuggestions
              managers={managerList}
              managerId={managerId}
              onManagerChange={setManagerId}
            />
            {createSector.isError && (
              <p role="alert" className="mt-4 text-label text-danger">
                Já existe um setor com esse nome.
              </p>
            )}
          </>
        ) : (
          editingSector && (
            <SectorFields
              idPrefix={`edit-${editingSector.id}`}
              name={editingSector.name}
              nameDisabled
              managers={managerList}
              managerId={editManagerId}
              onManagerChange={setEditManagerId}
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
