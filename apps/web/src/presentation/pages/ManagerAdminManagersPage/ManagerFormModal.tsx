import { Button } from "@/presentation/ui/Button";
import { Modal } from "@/presentation/ui/Modal";
import { TextField } from "@/presentation/ui/TextField";
import { RoleAndSectorFields } from "./RoleAndSectorFields";
import type { ManagerCreateFlow } from "./useManagerCreateFlow";
import type { ManagerEditFlow } from "./useManagerEditFlow";
import type { AdminSector } from "@/ports/manager-admin.port";

interface ManagerFormModalProps {
  mode: "create" | "edit" | null;
  onClose(): void;
  create: ManagerCreateFlow;
  edit: ManagerEditFlow;
  sectors: AdminSector[];
  sectorsPending: boolean;
  sectorsFailed: boolean;
}

/**
 * One dialog for both "add" and "edit". Adding can detour through two extra
 * steps when a SECTOR_MANAGER has no sector — see useManagerCreateFlow.
 */
export function ManagerFormModal({
  mode,
  onClose,
  create,
  edit,
  sectors,
  sectorsPending,
  sectorsFailed,
}: ManagerFormModalProps) {
  const title =
    mode === "create" ? "Adicionar gestor" : edit.editingManager ? `Editar ${edit.editingManager.name}` : "";

  const footer =
    mode === "create" ? (
      create.step === "confirm-no-sector" ? (
        <>
          <Button variant="outline" full={false} onClick={create.confirmWithoutSector}>
            Não, criar sem setor
          </Button>
          <Button variant="primary" full={false} onClick={create.openCreateSectorStep}>
            Sim, criar setor
          </Button>
        </>
      ) : create.step === "create-sector" ? (
        <>
          <Button variant="outline" full={false} onClick={create.backToForm}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            full={false}
            isLoading={create.isCreatingSector}
            disabled={create.isNewSectorNameEmpty}
            onClick={create.createSectorForManager}
          >
            Criar setor
          </Button>
        </>
      ) : (
        <>
          <Button variant="outline" full={false} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            full={false}
            isLoading={create.isSaving}
            disabled={create.isSubmitDisabled}
            onClick={create.handleSubmit}
          >
            Adicionar gestor
          </Button>
        </>
      )
    ) : (
      <>
        <Button variant="outline" full={false} onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          full={false}
          isLoading={edit.isSaving}
          disabled={edit.isSubmitDisabled}
          onClick={edit.save}
        >
          Salvar
        </Button>
      </>
    );

  return (
    <Modal isOpen={mode !== null} onClose={onClose} title={title} footer={footer}>
      {mode === "create" ? (
        create.step === "confirm-no-sector" ? (
          <>
            <p className="text-label font-semibold text-ink">
              Quer adicionar um setor novo para vincular a esse gestor?
            </p>
            <p className="mt-2 text-label text-muted">
              Sem um setor, o cadastro fica pendente: o convite só é enviado quando um setor for vinculado a ele.
            </p>
          </>
        ) : create.step === "create-sector" ? (
          <>
            <label htmlFor="new-sector-name-input" className="text-label font-semibold text-ink-2">
              Nome do setor
            </label>
            <TextField
              id="new-sector-name-input"
              required
              value={create.newSectorName}
              onChange={(event) => create.setNewSectorName(event.target.value)}
              className="mt-2"
            />

            <label htmlFor="new-sector-invite-code-input" className="mt-4 block text-label font-semibold text-ink-2">
              Código de convite (opcional)
            </label>
            <TextField
              id="new-sector-invite-code-input"
              value={create.newSectorInviteCode}
              onChange={(event) => create.setNewSectorInviteCode(event.target.value)}
              className="mt-2"
            />
          </>
        ) : (
          <>
            <label htmlFor="manager-name-input" className="text-label font-semibold text-ink-2">
              Nome do gestor
            </label>
            <TextField
              id="manager-name-input"
              required
              value={create.name}
              onChange={(event) => create.setName(event.target.value)}
              className="mt-2"
            />

            <label htmlFor="manager-email-input" className="mt-4 block text-label font-semibold text-ink-2">
              Email do gestor
            </label>
            <TextField
              id="manager-email-input"
              type="email"
              required
              value={create.email}
              onChange={(event) => create.setEmail(event.target.value)}
              onBlur={create.markEmailTouched}
              className="mt-2"
              aria-invalid={create.emailFormatError ? true : undefined}
              aria-describedby={create.emailFormatError ? "manager-email-input-error" : undefined}
            />
            {create.emailFormatError && (
              <p id="manager-email-input-error" role="alert" className="mt-2 text-label text-danger">
                {create.emailFormatError}
              </p>
            )}

            <RoleAndSectorFields
              idPrefix="create"
              role={create.role}
              onRoleChange={create.setRole}
              sectors={sectors}
              selectedSectorIds={create.selectedSectorIds}
              onToggleSector={create.toggleSector}
              sectorsPending={sectorsPending}
              sectorsFailed={sectorsFailed}
            />
          </>
        )
      ) : (
        edit.editingManager && (
          <RoleAndSectorFields
            idPrefix={`edit-${edit.editingManager.id}`}
            role={edit.role}
            onRoleChange={edit.setRole}
            sectors={sectors}
            selectedSectorIds={edit.sectorIds}
            onToggleSector={edit.toggleSector}
            sectorsPending={sectorsPending}
            sectorsFailed={sectorsFailed}
          />
        )
      )}
    </Modal>
  );
}
