import { useMemo, useState } from "react";
import { Button } from "@/presentation/ui/Button";
import { IconButton } from "@/presentation/ui/IconButton";
import { Modal } from "@/presentation/ui/Modal";
import { Pill } from "@/presentation/ui/Pill";
import { TextField } from "@/presentation/ui/TextField";
import { DataTable, type DataTableColumn } from "@/presentation/ui/DataTable/DataTable";
import { DataTableEmpty } from "@/presentation/ui/DataTable/DataTableEmpty";
import { DataTableError } from "@/presentation/ui/DataTable/DataTableError";
import { DataTableToolbar } from "@/presentation/ui/DataTable/DataTableToolbar";
import { BulkActionButton } from "@/presentation/ui/DataTable/BulkActionButton";
import { BulkDeleteConfirmModal } from "@/presentation/ui/DataTable/BulkDeleteConfirmModal";
import { DataTableMobileCard } from "@/presentation/ui/DataTable/DataTableMobileCard";
import { useDataTableSelection } from "@/presentation/ui/DataTable/useDataTableSelection";
import { useBulkDelete } from "@/presentation/ui/DataTable/useBulkDelete";
import { useBulkStatusUpdate } from "@/presentation/ui/DataTable/useBulkStatusUpdate";
import { useDebouncedSearch } from "@/presentation/hooks/useDebouncedSearch";
import { isValidEmail } from "@/presentation/lib/validate-email";
import { accountStatusPill } from "@/presentation/lib/account-status-pill";
import { toast } from "@/stores/toast.store";
import { useAdminPeerPartners } from "@/presentation/hooks/useAdminPeerPartners";
import { useCreatePeerPartner } from "@/presentation/hooks/useCreatePeerPartner";
import { useUpdatePeerPartner } from "@/presentation/hooks/useUpdatePeerPartner";
import { useSendPeerPartnerSetPasswordEmail } from "@/presentation/hooks/useSendPeerPartnerSetPasswordEmail";
import { useDeletePeerPartner } from "@/presentation/hooks/useDeletePeerPartner";
import { useHotkey } from "@/presentation/hooks/useHotkey";
import { updateConflictMessage } from "@/ports/manager-admin.port";
import type { PeerPartnerSummary } from "@/ports/manager-admin.port";
import { Pencil, Mail, KeyRound, Trash2 } from "lucide-react";

const COLUMNS: DataTableColumn<PeerPartnerSummary>[] = [
  { key: "name", header: "Nome", width: "w-[22%]", cell: (row) => row.name },
  { key: "email", header: "Email", width: "w-[32%]", breakAll: true, cell: (row) => row.email },
  { key: "specialty", header: "Especialidade", width: "w-[22%]", hideBelowLg: true, cell: (row) => row.specialty },
  {
    key: "status",
    header: "Status",
    width: "w-[24%]",
    cell: (row) => {
      const status = accountStatusPill(row);
      return (
        <Pill tone={status.tone} title={status.text}>
          {status.text}
        </Pill>
      );
    },
  },
];

export function ManagerAdminPeersPage() {
  const peerPartners = useAdminPeerPartners();
  const createPeerPartner = useCreatePeerPartner();
  const updatePeerPartner = useUpdatePeerPartner();
  const sendSetPasswordEmail = useSendPeerPartnerSetPasswordEmail();
  const deletePeerPartner = useDeletePeerPartner();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [specialty, setSpecialty] = useState("");

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingPeerPartner, setEditingPeerPartner] = useState<PeerPartnerSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editEmailTouched, setEditEmailTouched] = useState(false);
  const [editSpecialty, setEditSpecialty] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const peerPartnerList = useMemo(() => peerPartners.data ?? [], [peerPartners.data]);

  const { search, setSearch, hasQuery, filtered: filteredPeerPartners } = useDebouncedSearch(
    peerPartnerList,
    (peerPartner) => [peerPartner.name, peerPartner.email, peerPartner.specialty].join(" "),
  );

  const selection = useDataTableSelection(filteredPeerPartners, { singular: "par", article: "um" });

  const bulkDelete = useBulkDelete({
    deleteOne: (id) => deletePeerPartner.mutateAsync(id),
    noun: { singular: "par" },
    onSuccess: () => selection.clear(),
    getName: (id) => peerPartnerList.find((peerPartner) => peerPartner.id === id)?.name,
  });

  const bulkStatus = useBulkStatusUpdate({
    updateOne: (id, isActive) => updatePeerPartner.mutateAsync({ id, patch: { isActive } }),
    noun: { singular: "par" },
    onSuccess: () => selection.clear(),
  });

  const [resetPasswordTarget, setResetPasswordTarget] = useState<PeerPartnerSummary | null>(null);

  const isAnyModalOpen = formMode !== null || bulkDelete.deleteTarget !== null || resetPasswordTarget !== null;

  const openCreate = () => {
    setName("");
    setEmail("");
    setEmailTouched(false);
    setSpecialty("");
    setFormMode("create");
  };

  const openEdit = (peerPartner: PeerPartnerSummary) => {
    setEditingPeerPartner(peerPartner);
    setEditName(peerPartner.name);
    setEditEmail(peerPartner.email);
    setEditEmailTouched(false);
    setEditSpecialty(peerPartner.specialty);
    setEditError(null);
    setFormMode("edit");
  };

  const closeModal = () => {
    setFormMode(null);
    setEditingPeerPartner(null);
    setEditError(null);
  };

  const handleCreateSubmit = () => {
    createPeerPartner.mutate(
      { name, email, specialty },
      {
        onSuccess: (result) => {
          toast.success(`Convite enviado para ${result.peerPartner.email}.`);
          closeModal();
        },
      },
    );
  };

  const handleSaveEdit = () => {
    if (!editingPeerPartner) return;
    setEditError(null);
    updatePeerPartner.mutate(
      { id: editingPeerPartner.id, patch: { name: editName, email: editEmail, specialty: editSpecialty } },
      {
        onSuccess: () => closeModal(),
        onError: (error) => setEditError(updateConflictMessage(error) ?? "Não foi possível salvar. Tente de novo."),
      },
    );
  };

  const handleSendSetPasswordEmail = (peerPartner: PeerPartnerSummary) => {
    sendSetPasswordEmail.mutate(peerPartner.id, {
      onSuccess: () => toast.success(`Convite enviado para ${peerPartner.email}.`),
    });
  };

  const closeResetPasswordConfirm = () => setResetPasswordTarget(null);

  const confirmResetPassword = () => {
    if (!resetPasswordTarget) return;
    sendSetPasswordEmail.mutate(resetPasswordTarget.id, {
      onSuccess: () => {
        toast.success(`Convite enviado para ${resetPasswordTarget.email}.`);
        closeResetPasswordConfirm();
      },
    });
  };

  const handleBulkPause = () => bulkStatus.run(selection.selectedIds, false);
  const handleBulkActivate = () => bulkStatus.run(selection.selectedIds, true);

  useHotkey("a", openCreate, "Adicionar par", { enabled: !isAnyModalOpen });
  useHotkey("e", () => selection.selectedRows[0] && openEdit(selection.selectedRows[0]), "Editar", {
    enabled: !isAnyModalOpen && selection.edit.enabled,
  });
  useHotkey("v", handleSaveEdit, "Salvar", { enabled: formMode === "edit" });
  useHotkey("u", handleBulkPause, "Pausar", { enabled: !isAnyModalOpen && selection.pause.enabled });
  useHotkey("i", handleBulkActivate, "Ativar", { enabled: !isAnyModalOpen && selection.activate.enabled });
  useHotkey("x", () => bulkDelete.openDeleteConfirm(selection.selectedIds), "Excluir", {
    enabled: !isAnyModalOpen && selection.remove.enabled,
  });

  const emailFormatError = emailTouched && email.length > 0 && !isValidEmail(email) ? "Digite um email válido." : null;
  const editEmailFormatError =
    editEmailTouched && editEmail.length > 0 && !isValidEmail(editEmail) ? "Digite um email válido." : null;
  const isSubmitDisabled = name.trim().length === 0 || !isValidEmail(email) || specialty.trim().length === 0;
  const isEditSubmitDisabled =
    editName.trim().length === 0 || !isValidEmail(editEmail) || editSpecialty.trim().length === 0;

  const renderRowActions = (peerPartner: PeerPartnerSummary) => {
    const status = accountStatusPill(peerPartner);
    const isInvite = status.status === "pending" || status.status === "expired";
    return (
      <>
        <IconButton
          label={`Editar ${peerPartner.name}`}
          icon={<Pencil size={16} aria-hidden="true" />}
          onClick={() => openEdit(peerPartner)}
        />
        <IconButton
          label={isInvite ? `Reenviar convite de ${peerPartner.name}` : `Redefinir senha de ${peerPartner.name}`}
          icon={isInvite ? <Mail size={16} aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
          onClick={() => (isInvite ? handleSendSetPasswordEmail(peerPartner) : setResetPasswordTarget(peerPartner))}
        />
        <IconButton
          label={`Excluir ${peerPartner.name}`}
          icon={<Trash2 size={16} aria-hidden="true" />}
          variant="danger"
          onClick={() => bulkDelete.openDeleteConfirm([peerPartner.id])}
        />
      </>
    );
  };

  const modalTitle =
    formMode === "create" ? "Adicionar par" : editingPeerPartner ? `Editar ${editingPeerPartner.name}` : "";

  return (
    <div className="flex flex-col gap-5 md:h-full md:min-h-0">
      <p className="max-w-[62ch] text-label text-muted">
        A identidade de quem procura acolhimento nunca é revelada.
      </p>

      <DataTable
        fill
        caption="Pares anônimos do hospital"
        columns={COLUMNS}
        rows={filteredPeerPartners}
        selection={selection}
        rowActions={renderRowActions}
        toolbar={
          <DataTableToolbar
            selection={selection}
            search={search}
            onSearchChange={setSearch}
            action={
              <Button variant="primary" size="sm" full={false} className="max-md:w-full" onClick={openCreate}>
                + Adicionar par
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
          peerPartners.isLoading ? (
            <DataTableEmpty title="Carregando pares…" hint="Isso deve levar só um instante." />
          ) : peerPartners.isError ? (
            <DataTableError message="Não foi possível carregar os pares." onRetry={() => peerPartners.refetch()} />
          ) : hasQuery ? (
            <DataTableEmpty
              title="Nada encontrado para esta busca"
              hint="Tente outro termo ou revise a ortografia."
            />
          ) : (
            <DataTableEmpty
              title="Nenhum par cadastrado."
              hint="Adicione o primeiro para oferecer acolhimento entre pares."
            />
          )
        }
        mobileList={
          <ul data-testid="peer-partner-card-list" className="flex flex-col gap-2 md:hidden">
            {filteredPeerPartners.map((peerPartner) => {
              const status = accountStatusPill(peerPartner);
              return (
                <DataTableMobileCard
                  key={peerPartner.id}
                  label={`${peerPartner.name}, ${status.text}`}
                  selected={selection.isSelected(peerPartner.id)}
                  onToggle={() => selection.toggle(peerPartner.id)}
                  status={status}
                  fields={[
                    { label: "Nome", value: peerPartner.name },
                    { label: "Email", value: peerPartner.email, breakAll: true },
                    { label: "Especialidade", value: peerPartner.specialty },
                  ]}
                  actions={renderRowActions(peerPartner)}
                />
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
                isLoading={createPeerPartner.isPending}
                disabled={isSubmitDisabled}
                onClick={handleCreateSubmit}
              >
                Adicionar par
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
                isLoading={updatePeerPartner.isPending}
                disabled={isEditSubmitDisabled}
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
            <label htmlFor="peer-partner-name-input" className="text-label font-semibold text-ink-2">
              Nome do par
            </label>
            <TextField
              id="peer-partner-name-input"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2"
            />

            <label htmlFor="peer-partner-email-input" className="mt-4 block text-label font-semibold text-ink-2">
              Email do par
            </label>
            <TextField
              id="peer-partner-email-input"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={() => setEmailTouched(true)}
              className="mt-2"
              aria-invalid={emailFormatError ? true : undefined}
              aria-describedby={emailFormatError ? "peer-partner-email-input-error" : undefined}
            />
            {emailFormatError && (
              <p id="peer-partner-email-input-error" role="alert" className="mt-2 text-label text-danger">
                {emailFormatError}
              </p>
            )}

            <label htmlFor="peer-partner-specialty-input" className="mt-4 block text-label font-semibold text-ink-2">
              Especialidade
            </label>
            <TextField
              id="peer-partner-specialty-input"
              required
              value={specialty}
              onChange={(event) => setSpecialty(event.target.value)}
              placeholder="Ex: Clínica médica"
              className="mt-2"
            />
          </>
        ) : (
          editingPeerPartner && (
            <>
              <label htmlFor="peer-partner-edit-name-input" className="text-label font-semibold text-ink-2">
                Nome do par
              </label>
              <TextField
                id="peer-partner-edit-name-input"
                required
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                className="mt-2"
              />

              <label htmlFor="peer-partner-edit-email-input" className="mt-4 block text-label font-semibold text-ink-2">
                Email do par
              </label>
              <TextField
                id="peer-partner-edit-email-input"
                type="email"
                required
                value={editEmail}
                onChange={(event) => setEditEmail(event.target.value)}
                onBlur={() => setEditEmailTouched(true)}
                className="mt-2"
                aria-invalid={editEmailFormatError ? true : undefined}
                aria-describedby={editEmailFormatError ? "peer-partner-edit-email-input-error" : undefined}
              />
              {editEmailFormatError && (
                <p id="peer-partner-edit-email-input-error" role="alert" className="mt-2 text-label text-danger">
                  {editEmailFormatError}
                </p>
              )}

              <label htmlFor="peer-partner-edit-specialty-input" className="mt-4 block text-label font-semibold text-ink-2">
                Especialidade
              </label>
              <TextField
                id="peer-partner-edit-specialty-input"
                required
                value={editSpecialty}
                onChange={(event) => setEditSpecialty(event.target.value)}
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

      <BulkDeleteConfirmModal bulk={bulkDelete} />

      <Modal
        isOpen={resetPasswordTarget !== null}
        onClose={closeResetPasswordConfirm}
        title={resetPasswordTarget ? `Redefinir a senha de ${resetPasswordTarget.name}?` : ""}
        size="sm"
        footer={
          <>
            <Button variant="outline" full={false} onClick={closeResetPasswordConfirm}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              full={false}
              isLoading={sendSetPasswordEmail.isPending}
              onClick={confirmResetPassword}
            >
              Redefinir senha
            </Button>
          </>
        }
      >
        <p className="text-label text-ink">
          A senha atual deixa de funcionar e {resetPasswordTarget?.name} recebe um email para criar uma nova.
        </p>
      </Modal>
    </div>
  );
}
