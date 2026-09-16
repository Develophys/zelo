import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router";
import { Pencil, QrCode } from "lucide-react";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { Button } from "@/presentation/ui/Button";
import { IconButton } from "@/presentation/ui/IconButton";
import { Modal } from "@/presentation/ui/Modal";
import { Pill } from "@/presentation/ui/Pill";
import { ThemeSwitchButton } from "@/presentation/ui/ThemeSwitchButton";
import { DataTable, type DataTableColumn } from "@/presentation/ui/DataTable/DataTable";
import { DataTableEmpty } from "@/presentation/ui/DataTable/DataTableEmpty";
import { DataTableError } from "@/presentation/ui/DataTable/DataTableError";
import { DataTableToolbar } from "@/presentation/ui/DataTable/DataTableToolbar";
import { BulkActionButton } from "@/presentation/ui/DataTable/BulkActionButton";
import { DataTableMobileCard } from "@/presentation/ui/DataTable/DataTableMobileCard";
import { useDataTableSelection } from "@/presentation/ui/DataTable/useDataTableSelection";
import { useDebouncedSearch } from "@/presentation/hooks/useDebouncedSearch";
import { routes } from "@/presentation/lib/routes";
import { useAdminInstitutions } from "@/presentation/hooks/useAdminInstitutions";
import { useCreateInstitution } from "@/presentation/hooks/useCreateInstitution";
import { useUpdateInstitution } from "@/presentation/hooks/useUpdateInstitution";
import { useAdminInstitutionSectors } from "@/presentation/hooks/useAdminInstitutionSectors";
import { useHotkey } from "@/presentation/hooks/useHotkey";
import { useAdminSessionStore } from "@/stores/admin-session.store";
import type { AdminInstitutionListItem } from "@/ports/admin-institution.port";
import { DuplicateInstitutionError } from "@/ports/admin-institution.port";
import { TextField } from "@/presentation/ui/TextField";
import { InstitutionQrCodeModal } from "@/presentation/components/InstitutionQrCodeModal";
import { SectorQrCodeModal } from "@/presentation/components/SectorQrCodeModal";
import { toast } from "@/stores/toast.store";
import {
  createInstitutionFormSchema,
  editInstitutionFormSchema,
  type CreateInstitutionFormValues,
  type EditInstitutionFormValues,
} from "./admin-institution-form-schema";

const COLUMNS: DataTableColumn<AdminInstitutionListItem>[] = [
  { key: "name", header: "Nome", width: "w-[32%]", cell: (row) => row.name },
  { key: "inviteCode", header: "Código", width: "w-[22%]", cell: (row) => row.inviteCode },
  {
    key: "hospitalAdminNames",
    header: "Gestores",
    width: "w-[26%]",
    hideBelowLg: true,
    cell: (row) => row.hospitalAdminNames.join(", ") || "—",
  },
  {
    key: "status",
    header: "Status",
    width: "w-[20%]",
    cell: (row) => (
      <Pill tone={row.isActive ? "positive" : "neutral"}>{row.isActive ? "Ativa" : "Inativa"}</Pill>
    ),
  },
];

// useBulkStatusUpdate's toast copy ("ativado"/"pausado") is calibrated for
// gestor/setor/par — masculine nouns pluralising with "+es". "instituição" is
// feminine and pluralises irregularly, so this mirrors that hook's shape with
// grammar that actually fits the noun, rather than bending the shared one.
function institutionStatusMessage(count: number, isActive: boolean, failed: boolean): string {
  const isPlural = count !== 1;
  const participle = isActive ? (isPlural ? "ativadas" : "ativada") : isPlural ? "desativadas" : "desativada";
  const noun = isPlural ? "instituições" : "instituição";
  if (!failed) return `${count} ${noun} ${participle}.`;
  return `Não foi possível ${isActive ? "ativar" : "desativar"} ${isPlural ? "algumas instituições" : "a instituição"}. Tente de novo.`;
}

function InstitutionSectorList({
  isLoading,
  isError,
  sectors,
  onGenerateQr,
}: {
  isLoading: boolean;
  isError: boolean;
  sectors: { id: string; name: string; inviteCode: string | null }[];
  onGenerateQr: (sector: { name: string; inviteCode: string }) => void;
}) {
  if (isLoading) return <p className="text-label text-muted">Carregando setores…</p>;
  if (isError) return <p className="text-label text-danger">Não foi possível carregar os setores.</p>;
  if (sectors.length === 0) return <p className="text-label text-muted">Nenhum setor cadastrado.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {sectors.map((sector) => (
        <li key={sector.id} className="flex items-center justify-between gap-3">
          <span className="text-label text-ink">{sector.name}</span>
          <IconButton
            label={`Ver QR Code de ${sector.name}`}
            icon={<QrCode size={16} aria-hidden="true" />}
            aria-disabled={!sector.inviteCode}
            tooltip={sector.inviteCode ? undefined : "Este setor ainda não tem código de convite"}
            onClick={() => {
              if (!sector.inviteCode) return;
              onGenerateQr({ name: sector.name, inviteCode: sector.inviteCode });
            }}
          />
        </li>
      ))}
    </ul>
  );
}

export function AdminInstitutionsPage() {
  const navigate = useNavigate();
  const clearSession = useAdminSessionStore((state) => state.clearSession);
  const institutions = useAdminInstitutions();
  const createInstitution = useCreateInstitution();
  const updateInstitution = useUpdateInstitution();

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);

  const createForm = useForm<CreateInstitutionFormValues>({
    resolver: zodResolver(createInstitutionFormSchema),
    defaultValues: { institutionName: "", inviteCode: "", hospitalAdminName: "", hospitalAdminEmail: "" },
    mode: "onBlur",
  });

  const [editingInstitution, setEditingInstitution] = useState<AdminInstitutionListItem | null>(null);
  const editForm = useForm<EditInstitutionFormValues>({
    resolver: zodResolver(editInstitutionFormSchema),
    defaultValues: { name: "" },
    mode: "onBlur",
  });
  const [editError, setEditError] = useState<string | null>(null);

  const [qrInstitution, setQrInstitution] = useState<{ name: string; inviteCode: string } | null>(null);
  const [expandedInstitutionId, setExpandedInstitutionId] = useState<string | null>(null);
  const [qrSector, setQrSector] = useState<{ name: string; inviteCode: string } | null>(null);
  const expandedSectors = useAdminInstitutionSectors(expandedInstitutionId);

  const institutionList = useMemo(
    () => institutions.data?.pages.flatMap((page) => page.items) ?? [],
    [institutions.data],
  );

  const { search, setSearch, hasQuery, filtered: filteredInstitutions } = useDebouncedSearch(
    institutionList,
    (institution) =>
      [institution.name, institution.inviteCode, institution.hospitalAdminNames.join(" ")].join(" "),
  );

  const selection = useDataTableSelection(filteredInstitutions, { singular: "instituição", article: "uma" });

  const isAnyModalOpen = formMode !== null || qrInstitution !== null || qrSector !== null;

  const openCreate = () => {
    createForm.reset({ institutionName: "", inviteCode: "", hospitalAdminName: "", hospitalAdminEmail: "" });
    setFormMode("create");
  };

  const openEdit = (institution: AdminInstitutionListItem) => {
    setEditingInstitution(institution);
    editForm.reset({ name: institution.name });
    setEditError(null);
    setFormMode("edit");
  };

  const closeModal = () => {
    setFormMode(null);
    setEditingInstitution(null);
    setEditError(null);
  };

  const handleCreateSubmit = createForm.handleSubmit((values) => {
    createInstitution.mutate(values, {
      onSuccess: (result) => {
        toast.success(`Convite enviado para ${result.hospitalAdmin.email}.`);
        closeModal();
      },
    });
  });

  const handleSaveEdit = editForm.handleSubmit((values) => {
    if (!editingInstitution) return;
    setEditError(null);
    updateInstitution.mutate(
      { id: editingInstitution.id, patch: { name: values.name } },
      {
        onSuccess: closeModal,
        onError: (error) => {
          setEditError(
            error instanceof DuplicateInstitutionError
              ? "Já existe uma instituição com esse nome."
              : "Não foi possível salvar. Tente de novo.",
          );
        },
      },
    );
  });

  const runStatusUpdate = async (ids: string[], isActive: boolean) => {
    let succeeded = 0;
    const failedIds: string[] = [];
    for (const id of ids) {
      try {
        await updateInstitution.mutateAsync({ id, patch: { isActive } });
        succeeded += 1;
      } catch {
        failedIds.push(id);
      }
    }

    if (failedIds.length === 0) {
      toast.success(institutionStatusMessage(succeeded, isActive, false));
    } else {
      toast.error(institutionStatusMessage(failedIds.length, isActive, true));
    }
    return { failedIds };
  };

  const handleBulkDeactivate = async () => {
    const { failedIds } = await runStatusUpdate(selection.selectedIds, false);
    if (failedIds.length === 0) selection.clear();
  };

  const handleBulkActivate = async () => {
    const { failedIds } = await runStatusUpdate(selection.selectedIds, true);
    if (failedIds.length === 0) selection.clear();
  };

  useHotkey("a", openCreate, "Adicionar instituição", { enabled: !isAnyModalOpen });
  useHotkey("e", () => selection.selectedRows[0] && openEdit(selection.selectedRows[0]), "Editar", {
    enabled: !isAnyModalOpen && selection.edit.enabled,
  });
  useHotkey("s", handleSaveEdit, "Salvar", { enabled: formMode === "edit" });
  useHotkey("d", handleBulkDeactivate, "Desativar", { enabled: !isAnyModalOpen && selection.pause.enabled });
  useHotkey("t", handleBulkActivate, "Ativar", { enabled: !isAnyModalOpen && selection.activate.enabled });

  const createValues = createForm.watch();
  const isCreateDisabled = !createInstitutionFormSchema.safeParse(createValues).success;
  const editNameValue = editForm.watch("name");
  const isEditDisabled = !editInstitutionFormSchema.safeParse({ name: editNameValue }).success;

  const renderRowActions = (institution: AdminInstitutionListItem) => (
    <>
      <IconButton
        label={`Editar ${institution.name}`}
        icon={<Pencil size={16} aria-hidden="true" />}
        onClick={() => openEdit(institution)}
      />
      <IconButton
        label={`Ver QR Code de ${institution.name}`}
        icon={<QrCode size={16} aria-hidden="true" />}
        onClick={() => setQrInstitution({ name: institution.name, inviteCode: institution.inviteCode })}
      />
    </>
  );

  const modalTitle =
    formMode === "create" ? "Adicionar instituição" : editingInstitution ? `Editar ${editingInstitution.name}` : "";

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <div className="mt-4 flex items-center justify-between">
          <h1 className="text-h1 text-ink">Instituições</h1>
          <div className="flex items-center gap-1">
            <ThemeSwitchButton />
            <button
              type="button"
              onClick={() => {
                clearSession();
                navigate(routes.home, { replace: true });
              }}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-control text-label font-bold text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Sair
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-caption text-muted">Cadastre e administre os hospitais parceiros.</p>

        <div className="mt-4">
          <DataTable
            fill
            caption="Instituições cadastradas"
            columns={COLUMNS}
            rows={filteredInstitutions}
            selection={selection}
            rowActions={renderRowActions}
            renderExpanded={(_institution) => (
              <InstitutionSectorList
                isLoading={expandedSectors.isLoading}
                isError={expandedSectors.isError}
                sectors={expandedSectors.data ?? []}
                onGenerateQr={setQrSector}
              />
            )}
            isRowExpanded={(institution) => expandedInstitutionId === institution.id}
            onToggleExpand={(institution) =>
              setExpandedInstitutionId((current) => (current === institution.id ? null : institution.id))
            }
            toolbar={
              <DataTableToolbar
                selection={selection}
                search={search}
                onSearchChange={setSearch}
                action={
                  <Button variant="primary" size="sm" full={false} className="max-md:w-full" onClick={openCreate}>
                    + Adicionar instituição
                  </Button>
                }
                actions={
                  <>
                    <BulkActionButton
                      label="Editar"
                      state={selection.edit}
                      onClick={() => selection.selectedRows[0] && openEdit(selection.selectedRows[0])}
                    />
                    <BulkActionButton
                      label="Desativar"
                      state={selection.pause}
                      onClick={handleBulkDeactivate}
                    />
                    <BulkActionButton label="Ativar" state={selection.activate} onClick={handleBulkActivate} />
                  </>
                }
              />
            }
            emptyState={
              institutions.isLoading ? (
                <DataTableEmpty title="Carregando instituições…" hint="Isso deve levar só um instante." />
              ) : institutions.isError ? (
                // A failed load is not an empty register. Rendering both as "no
                // institutions" tells a platform admin the opposite of the truth.
                <DataTableError message="Não foi possível carregar as instituições." onRetry={() => institutions.refetch()} />
              ) : hasQuery ? (
                <DataTableEmpty title="Nada encontrado para esta busca" hint="Tente outro termo ou revise a ortografia." />
              ) : (
                <DataTableEmpty title="Nenhuma instituição cadastrada ainda." hint="Adicione a primeira acima." />
              )
            }
            mobileList={
              <ul data-testid="institution-card-list" className="flex flex-col gap-2 md:hidden">
                {filteredInstitutions.map((institution) => (
                  <DataTableMobileCard
                    key={institution.id}
                    label={`${institution.name}, ${institution.isActive ? "ativa" : "inativa"}`}
                    selected={selection.isSelected(institution.id)}
                    onToggle={() => selection.toggle(institution.id)}
                    status={{
                      tone: institution.isActive ? "positive" : "neutral",
                      text: institution.isActive ? "Ativa" : "Inativa",
                    }}
                    fields={[
                      { label: "Nome", value: institution.name },
                      { label: "Código", value: institution.inviteCode },
                      { label: "Gestores", value: institution.hospitalAdminNames.join(", ") || "—" },
                    ]}
                    actions={renderRowActions(institution)}
                  />
                ))}
              </ul>
            }
          />
          {institutions.hasNextPage && (
            <div className="flex justify-center p-3">
              <Button
                variant="outline"
                size="sm"
                full={false}
                isLoading={institutions.isFetchingNextPage}
                onClick={() => institutions.fetchNextPage()}
              >
                Carregar mais
              </Button>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={formMode !== null}
        onClose={closeModal}
        title={modalTitle}
        size="sm"
        footer={
          formMode === "create" ? (
            <>
              <Button variant="outline" full={false} onClick={closeModal}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                full={false}
                isLoading={createInstitution.isPending}
                disabled={isCreateDisabled}
                onClick={handleCreateSubmit}
              >
                Adicionar instituição
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" full={false} onClick={closeModal}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                full={false}
                isLoading={updateInstitution.isPending}
                disabled={isEditDisabled}
                onClick={handleSaveEdit}
              >
                Salvar
              </Button>
            </>
          )
        }
      >
        {formMode === "create" ? (
          <>
            <label htmlFor="institution-name" className="text-label font-semibold text-ink-2">
              Nome do hospital
            </label>
            <TextField id="institution-name" required className="mt-2" {...createForm.register("institutionName")} />

            <label htmlFor="invite-code-input" className="mt-4 block text-label font-semibold text-ink-2">
              Código de convite
            </label>
            <TextField id="invite-code-input" required className="mt-2" {...createForm.register("inviteCode")} />

            <label htmlFor="hospital-admin-name" className="mt-4 block text-label font-semibold text-ink-2">
              Nome do gestor do hospital
            </label>
            <TextField
              id="hospital-admin-name"
              required
              className="mt-2"
              {...createForm.register("hospitalAdminName")}
            />

            <label htmlFor="hospital-admin-email" className="mt-4 block text-label font-semibold text-ink-2">
              Email do gestor do hospital
            </label>
            <TextField
              id="hospital-admin-email"
              type="email"
              required
              className="mt-2"
              aria-invalid={createForm.formState.errors.hospitalAdminEmail || createInstitution.isError ? true : undefined}
              aria-describedby={
                createForm.formState.errors.hospitalAdminEmail
                  ? "hospital-admin-email-error"
                  : createInstitution.isError
                    ? "create-institution-error"
                    : undefined
              }
              {...createForm.register("hospitalAdminEmail")}
            />
            {createForm.formState.errors.hospitalAdminEmail && (
              <p id="hospital-admin-email-error" role="alert" className="mt-2 text-label text-danger">
                {createForm.formState.errors.hospitalAdminEmail.message}
              </p>
            )}

            {createInstitution.isError && (
              <p id="create-institution-error" role="alert" className="mt-2 text-label text-danger">
                Não foi possível criar a instituição agora. Tente novamente.
              </p>
            )}
          </>
        ) : (
          editingInstitution && (
            <>
              <label htmlFor="institution-edit-name" className="text-label font-semibold text-ink-2">
                Nome do hospital
              </label>
              <TextField id="institution-edit-name" required className="mt-2" {...editForm.register("name")} />
              {editError && (
                <p role="alert" className="mt-2 text-label text-danger">
                  {editError}
                </p>
              )}
            </>
          )
        )}
      </Modal>

      <InstitutionQrCodeModal
        isOpen={qrInstitution !== null}
        onClose={() => setQrInstitution(null)}
        institutionName={qrInstitution?.name ?? ""}
        inviteCode={qrInstitution?.inviteCode ?? ""}
      />

      <SectorQrCodeModal
        isOpen={qrSector !== null}
        onClose={() => setQrSector(null)}
        sectorName={qrSector?.name ?? ""}
        inviteCode={qrSector?.inviteCode ?? ""}
      />
    </PhoneShell>
  );
}
