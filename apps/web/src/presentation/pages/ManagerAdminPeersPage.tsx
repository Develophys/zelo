import { useEffect, useMemo, useState } from "react";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { IconButton } from "@/presentation/ui/IconButton";
import { Modal } from "@/presentation/ui/Modal";
import { Pill } from "@/presentation/ui/Pill";
import { TextField } from "@/presentation/ui/TextField";
import { ManagerPageHeader } from "@/presentation/layout/ManagerPageHeader";
import { DataTable, type DataTableColumn } from "@/presentation/ui/DataTable/DataTable";
import { DataTableEmpty } from "@/presentation/ui/DataTable/DataTableEmpty";
import { DataTableToolbar } from "@/presentation/ui/DataTable/DataTableToolbar";
import { BulkActionButton } from "@/presentation/ui/DataTable/BulkActionButton";
import { useDataTableSelection } from "@/presentation/ui/DataTable/useDataTableSelection";
import { useBulkDelete } from "@/presentation/ui/DataTable/useBulkDelete";
import { normalize } from "@/presentation/lib/normalize-search";
import { useAdminPeerPartners } from "@/presentation/hooks/useAdminPeerPartners";
import { useCreatePeerPartner } from "@/presentation/hooks/useCreatePeerPartner";
import { useUpdatePeerPartner } from "@/presentation/hooks/useUpdatePeerPartner";
import { useSendPeerPartnerSetPasswordEmail } from "@/presentation/hooks/useSendPeerPartnerSetPasswordEmail";
import { useDeletePeerPartner } from "@/presentation/hooks/useDeletePeerPartner";
import type { PeerPartnerSummary } from "@/ports/manager-admin.port";
import { Pencil, Mail, KeyRound } from "lucide-react";

type PeerPartnerStatus = "active" | "inactive" | "pending" | "expired";

const STATUS_PILL: Record<PeerPartnerStatus, { tone: "positive" | "neutral" | "warning" | "danger"; text: string }> = {
  active: { tone: "positive", text: "Ativa" },
  inactive: { tone: "neutral", text: "Inativa" },
  pending: { tone: "warning", text: "Convite pendente" },
  expired: { tone: "danger", text: "Convite expirado" },
};

function peerPartnerStatus(peerPartner: PeerPartnerSummary): PeerPartnerStatus {
  if (peerPartner.hasPassword) return peerPartner.isActive ? "active" : "inactive";
  const tokenValid =
    peerPartner.setPasswordTokenExpiresAt !== null &&
    new Date(peerPartner.setPasswordTokenExpiresAt).getTime() > Date.now();
  return tokenValid ? "pending" : "expired";
}

const COLUMNS: DataTableColumn<PeerPartnerSummary>[] = [
  { key: "name", header: "Nome", width: "w-[26%]", cell: (row) => row.name },
  { key: "email", header: "Email", width: "w-[32%]", breakAll: true, cell: (row) => row.email },
  { key: "specialty", header: "Especialidade", width: "w-[24%]", hideBelowLg: true, cell: (row) => row.specialty },
  {
    key: "status",
    header: "Status",
    width: "w-[18%]",
    cell: (row) => {
      const status = STATUS_PILL[peerPartnerStatus(row)];
      return <Pill tone={status.tone}>{status.text}</Pill>;
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
  const [specialty, setSpecialty] = useState("");
  const [inviteSentTo, setInviteSentTo] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingPeerPartner, setEditingPeerPartner] = useState<PeerPartnerSummary | null>(null);
  const [editSpecialty, setEditSpecialty] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const peerPartnerList = useMemo(() => peerPartners.data ?? [], [peerPartners.data]);

  const filteredPeerPartners = useMemo(() => {
    const query = normalize(debouncedSearch.trim());
    if (query === "") return peerPartnerList;
    return peerPartnerList.filter((peerPartner) => {
      const haystack = normalize([peerPartner.name, peerPartner.email, peerPartner.specialty].join(" "));
      return haystack.includes(query);
    });
  }, [peerPartnerList, debouncedSearch]);

  const selection = useDataTableSelection(filteredPeerPartners, { singular: "par", article: "um" });

  const bulkDelete = useBulkDelete({
    deleteOne: (id) => deletePeerPartner.mutateAsync(id),
    noun: { singular: "par" },
    onSuccess: () => selection.clear(),
  });

  const openCreate = () => {
    setName("");
    setEmail("");
    setSpecialty("");
    setFormMode("create");
  };

  const openEdit = (peerPartner: PeerPartnerSummary) => {
    setEditingPeerPartner(peerPartner);
    setEditSpecialty(peerPartner.specialty);
    setFormMode("edit");
  };

  const closeModal = () => {
    setFormMode(null);
    setEditingPeerPartner(null);
  };

  const handleCreateSubmit = () => {
    createPeerPartner.mutate(
      { name, email, specialty },
      {
        onSuccess: (result) => {
          setInviteSentTo(result.peerPartner.email);
          closeModal();
        },
      },
    );
  };

  const handleSaveEdit = () => {
    if (!editingPeerPartner) return;
    updatePeerPartner.mutate(
      { id: editingPeerPartner.id, patch: { specialty: editSpecialty } },
      { onSuccess: () => closeModal() },
    );
  };

  const handleSendSetPasswordEmail = (peerPartner: PeerPartnerSummary) => {
    sendSetPasswordEmail.mutate(peerPartner.id, { onSuccess: () => setInviteSentTo(peerPartner.email) });
  };

  const handleBulkPause = () => {
    for (const id of selection.selectedIds) {
      updatePeerPartner.mutate({ id, patch: { isActive: false } });
    }
    selection.clear();
  };

  const handleBulkActivate = () => {
    for (const id of selection.selectedIds) {
      updatePeerPartner.mutate({ id, patch: { isActive: true } });
    }
    selection.clear();
  };

  const isSubmitDisabled = name.trim().length === 0 || email.trim().length === 0 || specialty.trim().length === 0;

  const renderRowActions = (peerPartner: PeerPartnerSummary) => {
    const status = peerPartnerStatus(peerPartner);
    const isInvite = status === "pending" || status === "expired";
    return (
      <>
        <IconButton
          label={`Editar ${peerPartner.name}`}
          icon={<Pencil size={16} />}
          onClick={() => openEdit(peerPartner)}
        />
        <IconButton
          label={isInvite ? `Reenviar convite de ${peerPartner.name}` : `Redefinir senha de ${peerPartner.name}`}
          icon={isInvite ? <Mail size={16} /> : <KeyRound size={16} />}
          onClick={() => handleSendSetPasswordEmail(peerPartner)}
        />
      </>
    );
  };

  const modalTitle =
    formMode === "create" ? "Adicionar par" : editingPeerPartner ? `Editar ${editingPeerPartner.name}` : "";

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
        title="Pares anônimos"
        intro="Profissionais disponíveis para acolhimento entre pares. A identidade de quem procura acolhimento nunca é revelada."
        actions={
          <Button variant="primary" size="sm" full={false} onClick={openCreate}>
            + Adicionar par
          </Button>
        }
      />

      <DataTable
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
          debouncedSearch.trim().length > 0 ? (
            <DataTableEmpty
              title="Nenhum resultado nos itens carregados"
              hint="A busca ainda percorre apenas a lista já carregada."
            />
          ) : (
            <DataTableEmpty
              title="Nenhum par cadastrado."
              hint="Adicione o primeiro para oferecer acolhimento entre pares."
            />
          )
        }
      />

      <ul data-testid="peer-partner-card-list" className="flex flex-col gap-2 md:hidden">
        {filteredPeerPartners.map((peerPartner) => {
          const status = STATUS_PILL[peerPartnerStatus(peerPartner)];
          const selected = selection.isSelected(peerPartner.id);
          return (
            <li
              key={peerPartner.id}
              className={`overflow-hidden rounded-card border ${
                selected ? "border-brand bg-brand/5" : "border-line bg-surface"
              }`}
            >
              {/* The selection target is a sibling of the row-action IconButtons
                  below, not their parent — nesting a button inside a button is
                  invalid HTML and breaks both keyboard and screen-reader use. */}
              <button
                type="button"
                aria-label={`${peerPartner.name}, ${status.text}`}
                onClick={() => selection.toggle(peerPartner.id)}
                className="flex w-full flex-col gap-2 p-4 text-left"
              >
                <div className="flex justify-between gap-3">
                  <span className="text-caption text-muted">Nome</span>
                  <span className="text-label font-semibold text-ink">{peerPartner.name}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-caption text-muted">Email</span>
                  <span className="text-label text-ink break-all">{peerPartner.email}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-caption text-muted">Especialidade</span>
                  <span className="text-label text-ink">{peerPartner.specialty}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-caption text-muted">Status</span>
                  <Pill tone={status.tone}>{status.text}</Pill>
                </div>
              </button>
              <div className="flex items-center justify-end gap-1 border-t border-line px-4 py-2">
                {renderRowActions(peerPartner)}
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
              <Button variant="primary" full={false} isLoading={updatePeerPartner.isPending} onClick={handleSaveEdit}>
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2"
            />

            <label htmlFor="peer-partner-specialty-input" className="mt-4 block text-label font-semibold text-ink-2">
              Especialidade
            </label>
            <TextField
              id="peer-partner-specialty-input"
              value={specialty}
              onChange={(event) => setSpecialty(event.target.value)}
              placeholder="Ex: Clínica médica"
              className="mt-2"
            />
          </>
        ) : (
          editingPeerPartner && (
            <>
              <label htmlFor="peer-partner-edit-specialty-input" className="text-label font-semibold text-ink-2">
                Especialidade
              </label>
              <TextField
                id="peer-partner-edit-specialty-input"
                value={editSpecialty}
                onChange={(event) => setEditSpecialty(event.target.value)}
                className="mt-2"
              />
            </>
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
