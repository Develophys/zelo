import { useEffect, useMemo, useState } from "react";
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
import { useDataTableSelection } from "@/presentation/ui/DataTable/useDataTableSelection";
import { normalize } from "@/presentation/lib/normalize-search";
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
import { isValidEmail } from "@/presentation/lib/validate-email";
import { InstitutionQrCodeModal } from "@/presentation/components/InstitutionQrCodeModal";
import { SectorQrCodeModal } from "@/presentation/components/SectorQrCodeModal";
import { toast } from "@/stores/toast.store";

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
            disabled={!sector.inviteCode}
            tooltip={sector.inviteCode ? undefined : "Este setor ainda não tem código de convite"}
            onClick={() => onGenerateQr({ name: sector.name, inviteCode: sector.inviteCode! })}
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

  const [institutionName, setInstitutionName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [hospitalAdminName, setHospitalAdminName] = useState("");
  const [hospitalAdminEmail, setHospitalAdminEmail] = useState("");
  const [hospitalAdminEmailTouched, setHospitalAdminEmailTouched] = useState(false);

  const [editingInstitution, setEditingInstitution] = useState<AdminInstitutionListItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [qrInstitution, setQrInstitution] = useState<{ name: string; inviteCode: string } | null>(null);
  const [expandedInstitutionId, setExpandedInstitutionId] = useState<string | null>(null);
  const [qrSector, setQrSector] = useState<{ name: string; inviteCode: string } | null>(null);
  const expandedSectors = useAdminInstitutionSectors(expandedInstitutionId);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const institutionList = useMemo(
    () => institutions.data?.pages.flatMap((page) => page.items) ?? [],
    [institutions.data],
  );

  const filteredInstitutions = useMemo(() => {
    const query = normalize(debouncedSearch.trim());
    if (query === "") return institutionList;
    return institutionList.filter((institution) => {
      const haystack = normalize(
        [institution.name, institution.inviteCode, institution.hospitalAdminNames.join(" ")].join(" "),
      );
      return haystack.includes(query);
    });
  }, [institutionList, debouncedSearch]);

  const selection = useDataTableSelection(filteredInstitutions, { singular: "instituição", article: "uma" });

  const isAnyModalOpen = formMode !== null || qrInstitution !== null || qrSector !== null;

  const openCreate = () => {
    setInstitutionName("");
    setInviteCode("");
    setHospitalAdminName("");
    setHospitalAdminEmail("");
    setHospitalAdminEmailTouched(false);
    setFormMode("create");
  };

  const openEdit = (institution: AdminInstitutionListItem) => {
    setEditingInstitution(institution);
    setEditName(institution.name);
    setEditError(null);
    setFormMode("edit");
  };

  const closeModal = () => {
    setFormMode(null);
    setEditingInstitution(null);
    setEditError(null);
  };

  const handleCreateSubmit = () => {
    createInstitution.mutate(
      { institutionName, inviteCode, hospitalAdminName, hospitalAdminEmail },
      {
        onSuccess: (result) => {
          toast.success(`Convite enviado para ${result.hospitalAdmin.email}.`);
          closeModal();
        },
      },
    );
  };

  const handleSaveEdit = () => {
    if (!editingInstitution) return;
    setEditError(null);
    updateInstitution.mutate(
      { id: editingInstitution.id, patch: { name: editName } },
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
  };

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

  const hospitalAdminEmailError =
    hospitalAdminEmailTouched && hospitalAdminEmail.length > 0 && !isValidEmail(hospitalAdminEmail)
      ? "Digite um email válido."
      : null;

  const isCreateDisabled =
    institutionName.trim().length === 0 ||
    inviteCode.trim().length === 0 ||
    hospitalAdminName.trim().length === 0 ||
    !isValidEmail(hospitalAdminEmail);

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
              ) : debouncedSearch.trim().length > 0 ? (
                <DataTableEmpty title="Nada encontrado para esta busca" hint="Tente outro termo ou revise a ortografia." />
              ) : (
                <DataTableEmpty title="Nenhuma instituição cadastrada ainda." hint="Adicione a primeira acima." />
              )
            }
            mobileList={
              <ul data-testid="institution-card-list" className="flex flex-col gap-2 md:hidden">
                {filteredInstitutions.map((institution) => {
                  const selected = selection.isSelected(institution.id);
                  return (
                    <li
                      key={institution.id}
                      className={`overflow-hidden rounded-card border ${
                        selected ? "border-brand bg-brand/5" : "border-line bg-surface"
                      }`}
                    >
                      <button
                        type="button"
                        aria-label={`${institution.name}, ${institution.isActive ? "ativa" : "inativa"}`}
                        aria-pressed={selected}
                        onClick={() => selection.toggle(institution.id)}
                        className="flex w-full flex-col gap-2 rounded-card p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
                      >
                        <div className="flex justify-between gap-3">
                          <span className="text-caption text-muted">Nome</span>
                          <span className="text-label font-semibold text-ink">{institution.name}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-caption text-muted">Código</span>
                          <span className="text-label text-ink">{institution.inviteCode}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-caption text-muted">Gestores</span>
                          <span className="text-label text-ink">{institution.hospitalAdminNames.join(", ") || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-caption text-muted">Status</span>
                          <Pill tone={institution.isActive ? "positive" : "neutral"}>
                            {institution.isActive ? "Ativa" : "Inativa"}
                          </Pill>
                        </div>
                      </button>
                      <div className="flex items-center justify-end gap-1 border-t border-line px-4 py-2">
                        {renderRowActions(institution)}
                      </div>
                    </li>
                  );
                })}
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
                disabled={editName.trim().length === 0}
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
            <TextField
              id="institution-name"
              required
              value={institutionName}
              onChange={(event) => setInstitutionName(event.target.value)}
              className="mt-2"
            />

            <label htmlFor="invite-code-input" className="mt-4 block text-label font-semibold text-ink-2">
              Código de convite
            </label>
            <TextField
              id="invite-code-input"
              required
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              className="mt-2"
            />

            <label htmlFor="hospital-admin-name" className="mt-4 block text-label font-semibold text-ink-2">
              Nome do gestor do hospital
            </label>
            <TextField
              id="hospital-admin-name"
              required
              value={hospitalAdminName}
              onChange={(event) => setHospitalAdminName(event.target.value)}
              className="mt-2"
            />

            <label htmlFor="hospital-admin-email" className="mt-4 block text-label font-semibold text-ink-2">
              Email do gestor do hospital
            </label>
            <TextField
              id="hospital-admin-email"
              type="email"
              required
              value={hospitalAdminEmail}
              onChange={(event) => setHospitalAdminEmail(event.target.value)}
              onBlur={() => setHospitalAdminEmailTouched(true)}
              className="mt-2"
              aria-invalid={hospitalAdminEmailError || createInstitution.isError ? true : undefined}
              aria-describedby={
                hospitalAdminEmailError
                  ? "hospital-admin-email-error"
                  : createInstitution.isError
                    ? "create-institution-error"
                    : undefined
              }
            />
            {hospitalAdminEmailError && (
              <p id="hospital-admin-email-error" role="alert" className="mt-2 text-label text-danger">
                {hospitalAdminEmailError}
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
              <TextField
                id="institution-edit-name"
                required
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                className="mt-2"
              />
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
