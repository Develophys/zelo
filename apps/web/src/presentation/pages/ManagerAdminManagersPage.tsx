import { useState, type SubmitEvent } from "react";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { useAdminSectors } from "@/presentation/hooks/useAdminSectors";
import { useAdminManagers } from "@/presentation/hooks/useAdminManagers";
import { useCreateManager } from "@/presentation/hooks/useCreateManager";
import { useUpdateManager } from "@/presentation/hooks/useUpdateManager";
import { useSendManagerSetPasswordEmail } from "@/presentation/hooks/useSendManagerSetPasswordEmail";
import type { AdminSector, ManagerSummary } from "@/ports/manager-admin.port";
import { TextField } from "@/presentation/ui/TextField";
import { accountStatusLabel } from '@/presentation/lib/manager-account-status';

type ManagerRole = "HOSPITAL_ADMIN" | "SECTOR_MANAGER";

// Shared by the create form and each row's inline edit form. The idPrefix keeps
// the two sets of inputs from colliding when both are on screen at once.
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
          <div className="mt-2 flex flex-col gap-2">
            {sectors.map((sector) => (
              <div key={sector.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`${idPrefix}-sector-checkbox-${sector.id}`}
                  checked={selectedSectorIds.includes(sector.id)}
                  onChange={() => onToggleSector(sector.id)}
                />
                <label htmlFor={`${idPrefix}-sector-checkbox-${sector.id}`} className="text-label text-ink-2">
                  {sector.name}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function ManagerAdminManagersPage() {
  const sectors = useAdminSectors();
  const managers = useAdminManagers();
  const createManager = useCreateManager();
  const updateManager = useUpdateManager();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const sendSetPasswordEmail = useSendManagerSetPasswordEmail();
  const [role, setRole] = useState<ManagerRole>("HOSPITAL_ADMIN");
  const [selectedSectorIds, setSelectedSectorIds] = useState<string[]>([]);
  const [inviteSentTo, setInviteSentTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<ManagerRole>("SECTOR_MANAGER");
  const [editSectorIds, setEditSectorIds] = useState<string[]>([]);

  const sectorList = sectors.data ?? [];

  const toggleSector = (id: string) => {
    setSelectedSectorIds((current) => (current.includes(id) ? current.filter((sectorId) => sectorId !== id) : [...current, id]));
  };

  const toggleEditSector = (id: string) => {
    setEditSectorIds((current) => (current.includes(id) ? current.filter((sectorId) => sectorId !== id) : [...current, id]));
  };

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    createManager.mutate(
      { name, email, role, sectorIds: role === "SECTOR_MANAGER" ? selectedSectorIds : undefined },
      {
        onSuccess: (result) => {
          setInviteSentTo(result.manager.email);
          setName("");
          setEmail("");
          setRole("HOSPITAL_ADMIN");
          setSelectedSectorIds([]);
        },
      },
    );
  };

  const handleSendSetPasswordEmail = (manager: ManagerSummary) => {
    sendSetPasswordEmail.mutate(manager.id, { onSuccess: () => setInviteSentTo(manager.email) });
  };

  const handleStartEdit = (manager: ManagerSummary) => {
    setEditingId(manager.id);
    setEditRole(manager.role);
    // ManagerSummary carries sector NAMES; map them back to ids via the sector list.
    setEditSectorIds(sectorList.filter((sector) => manager.sectorNames.includes(sector.name)).map((sector) => sector.id));
  };

  const handleSaveEdit = (manager: ManagerSummary) => {
    updateManager.mutate(
      { id: manager.id, patch: { role: editRole, sectorIds: editRole === "SECTOR_MANAGER" ? editSectorIds : undefined } },
      { onSuccess: () => setEditingId(null) },
    );
  };

  const isSubmitDisabled =
    name.trim().length === 0 || email.trim().length === 0 || (role === "SECTOR_MANAGER" && selectedSectorIds.length === 0);

  return (
    <div>
      {inviteSentTo && (
        <div role="status">
          <Card tone="brand-tint" className="mt-4">
            <p className="text-label font-semibold text-ink-2">Convite enviado para {inviteSentTo}.</p>
          </Card>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mt-4">
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
        </Card>
        <div className="mt-3">
          <Button type="submit" variant="primary" isLoading={createManager.isPending} disabled={isSubmitDisabled}>
            Adicionar gestor
          </Button>
        </div>
      </form>

      <div className="mt-5 flex flex-col gap-3">
        {(managers.data ?? []).map((manager) => (
          <Card key={manager.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body font-extrabold text-ink">{manager.name}</p>
                <p className="text-caption text-muted">
                  {manager.role === "HOSPITAL_ADMIN" ? "Gestor do hospital" : `Gestor de setor · ${manager.sectorNames.join(", ") || "sem setor"}`}
                  {" · "}
                  {accountStatusLabel(manager.hasPassword, manager.setPasswordTokenExpiresAt)}
                  {!manager.isActive && " · Inativo"}
                </p>
              </div>
              <Button
                variant="outline"
                full={false}
                onClick={() => updateManager.mutate({ id: manager.id, patch: { isActive: !manager.isActive } })}
              >
                {manager.isActive ? "Desativar" : "Ativar"}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" full={false} aria-label={`Editar ${manager.name}`} onClick={() => handleStartEdit(manager)}>
                Editar
              </Button>
              <Button
                variant="outline"
                full={false}
                aria-label={manager.hasPassword ? `Redefinir senha de ${manager.name}` : `Reenviar convite de ${manager.name}`}
                isLoading={sendSetPasswordEmail.isPending && sendSetPasswordEmail.variables === manager.id}
                onClick={() => handleSendSetPasswordEmail(manager)}
              >
                {manager.hasPassword ? "Redefinir senha" : "Reenviar convite"}
              </Button>
            </div>

            {editingId === manager.id && (
              <div role="group" aria-label={`Editando ${manager.name}`} className="mt-3 border-t border-line pt-3">
                <RoleAndSectorFields
                  idPrefix={`edit-${manager.id}`}
                  role={editRole}
                  onRoleChange={setEditRole}
                  sectors={sectorList}
                  selectedSectorIds={editSectorIds}
                  onToggleSector={toggleEditSector}
                />
                <div className="mt-3 flex gap-2">
                  <Button variant="primary" full={false} isLoading={updateManager.isPending} onClick={() => handleSaveEdit(manager)}>
                    Salvar
                  </Button>
                  <Button variant="outline" full={false} onClick={() => setEditingId(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
