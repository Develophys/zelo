import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { IconButton } from "@/presentation/ui/IconButton";
import { Modal } from "@/presentation/ui/Modal";
import { Pill } from "@/presentation/ui/Pill";
import { TextField, SelectField } from "@/presentation/ui/TextField";
import { DataTable, type DataTableColumn } from "@/presentation/ui/DataTable/DataTable";
import { DataTableEmpty } from "@/presentation/ui/DataTable/DataTableEmpty";
import { DataTableError } from "@/presentation/ui/DataTable/DataTableError";
import { DataTableToolbar } from "@/presentation/ui/DataTable/DataTableToolbar";
import { BulkActionButton } from "@/presentation/ui/DataTable/BulkActionButton";
import { useDataTableSelection } from "@/presentation/ui/DataTable/useDataTableSelection";
import { useBulkDelete } from "@/presentation/ui/DataTable/useBulkDelete";
import { useBulkStatusUpdate } from "@/presentation/ui/DataTable/useBulkStatusUpdate";
import { normalize } from "@/presentation/lib/normalize-search";
import { useAdminSectors } from "@/presentation/hooks/useAdminSectors";
import { useAdminManagers } from "@/presentation/hooks/useAdminManagers";
import { useCreateSector } from "@/presentation/hooks/useCreateSector";
import { useUpdateSector } from "@/presentation/hooks/useUpdateSector";
import { useDeleteSector } from "@/presentation/hooks/useDeleteSector";
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
        required
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
              className="min-h-11 rounded-status border border-line px-3 py-1.5 text-label text-muted hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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

const COLUMNS: DataTableColumn<AdminSector>[] = [
  { key: "name", header: "Nome", width: "w-[40%]", cell: (row) => row.name },
  { key: "manager", header: "Gestor responsável", width: "w-[35%]", cell: (row) => row.managerName ?? "—" },
  {
    key: "status",
    header: "Status",
    width: "w-[25%]",
    cell: (row) => {
      const status = STATUS_PILL[sectorStatus(row)];
      return (
        <Pill tone={status.tone} title={status.text}>
          {status.text}
        </Pill>
      );
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

  const bulkDelete = useBulkDelete({
    deleteOne: (id) => deleteSector.mutateAsync(id),
    noun: { singular: "setor" },
    onSuccess: () => selection.clear(),
    getName: (id) => sectorList.find((sector) => sector.id === id)?.name,
  });

  const bulkStatus = useBulkStatusUpdate({
    updateOne: (id, isActive) => updateSector.mutateAsync({ id, patch: { isActive } }),
    noun: { singular: "setor" },
  });

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

  const handleBulkPause = async () => {
    const { failedIds } = await bulkStatus.run(selection.selectedIds, false);
    if (failedIds.length === 0) selection.clear();
  };

  const handleBulkActivate = async () => {
    const { failedIds } = await bulkStatus.run(selection.selectedIds, true);
    if (failedIds.length === 0) selection.clear();
  };

  const isSubmitDisabled = name.trim().length === 0;

  const renderRowActions = (sector: AdminSector) => (
    <IconButton label={`Editar ${sector.name}`} icon={<Pencil size={16} aria-hidden="true" />} onClick={() => openEdit(sector)} />
  );

  const modalTitle = formMode === "create" ? "Adicionar setor" : editingSector ? `Editar ${editingSector.name}` : "";

  return (
    <div className="flex flex-col gap-5 md:h-full md:min-h-0">
      {notice && (
        <div role="status">
          <Card tone="brand-tint">
            <p className="text-label font-semibold text-ink-2">{notice}</p>
          </Card>
        </div>
      )}

      <DataTable
        fill
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
            action={
              <Button variant="primary" size="sm" full={false} className="max-md:w-full" onClick={openCreate}>
                + Adicionar setor
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
          sectorsQuery.isLoading ? (
            <DataTableEmpty title="Carregando setores…" hint="Isso deve levar só um instante." />
          ) : sectorsQuery.isError ? (
            <DataTableError message="Não foi possível carregar os setores." onRetry={() => sectorsQuery.refetch()} />
          ) : debouncedSearch.trim().length > 0 ? (
            <DataTableEmpty
              title="Nada encontrado para esta busca"
              hint="Tente outro termo ou revise a ortografia."
            />
          ) : (
            <DataTableEmpty title="Nenhum setor cadastrado." hint="Adicione o primeiro para começar a acompanhar." />
          )
        }
        mobileList={
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
                  <button
                    type="button"
                    aria-label={`${sector.name}, ${status.text}`}
                    aria-pressed={selected}
                    onClick={() => selection.toggle(sector.id)}
                    className="flex w-full flex-col gap-2 rounded-card p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
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
        }
      />

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
        isOpen={bulkDelete.deleteTarget !== null}
        onClose={bulkDelete.closeDeleteConfirm}
        title={bulkDelete.deleteTitle}
        size="sm"
        footer={
          <>
            <Button variant="outline" full={false} onClick={bulkDelete.closeDeleteConfirm}>
              Cancelar
            </Button>
            <Button variant="danger" full={false} isLoading={bulkDelete.deleteBusy} onClick={bulkDelete.confirmDelete}>
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-label text-ink">Esta ação não pode ser desfeita.</p>
        {bulkDelete.deleteMessage && (
          <p role="alert" className="mt-3 text-label text-danger">
            {bulkDelete.deleteMessage}
          </p>
        )}
      </Modal>
    </div>
  );
}
