import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { useAdminSectors } from "@/presentation/hooks/useAdminSectors";
import { useCreateSector } from "@/presentation/hooks/useCreateSector";
import { useUpdateSector } from "@/presentation/hooks/useUpdateSector";
import { useAdminManagers } from "@/presentation/hooks/useAdminManagers";
import { useCreateManager } from "@/presentation/hooks/useCreateManager";
import { useUpdateManager } from "@/presentation/hooks/useUpdateManager";
import { useResetManagerPassword } from "@/presentation/hooks/useResetManagerPassword";
import type { AdminSector, ManagerSummary } from "@/ports/manager-admin.port";

const SUGGESTED_SECTOR_NAMES = ["UTI", "Pronto-Socorro", "Clínica Médica", "Centro Cirúrgico", "Pediatria", "Ambulatório", "Plantão Noturno"];

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

function SectorsTab() {
  const sectors = useAdminSectors();
  const managers = useAdminManagers();
  const createSector = useCreateSector();
  const updateSector = useUpdateSector();
  const [name, setName] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createSector.mutate(name, { onSuccess: () => setName("") });
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <Card className="mt-4">
          <label htmlFor="sector-name" className="text-label font-semibold text-ink-2">
            Nome do setor
          </label>
          <input
            id="sector-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTED_SECTOR_NAMES.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setName(suggestion)}
                className="rounded-pill border border-line px-3 py-1 text-label text-muted"
              >
                {suggestion}
              </button>
            ))}
          </div>
          {createSector.isError && (
            <p role="alert" className="mt-2 text-label text-danger">
              Já existe um setor com esse nome.
            </p>
          )}
        </Card>
        <div className="mt-3">
          <Button type="submit" variant="primary" loading={createSector.isPending} disabled={name.trim().length === 0}>
            Adicionar setor
          </Button>
        </div>
      </form>

      <div className="mt-5 flex flex-col gap-3">
        {(sectors.data ?? []).map((sector) => (
          <Card key={sector.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body font-extrabold text-ink">{sector.name}</p>
                <p className="text-caption text-muted">
                  {sector.managerName ?? "Sem gestor"} · {sector.isActive ? "Ativo" : "Inativo"}
                </p>
              </div>
              <Button
                variant="outline"
                full={false}
                onClick={() => updateSector.mutate({ id: sector.id, patch: { isActive: !sector.isActive } })}
              >
                {sector.isActive ? "Desativar" : "Ativar"}
              </Button>
            </div>

            <select
              aria-label={`Gestor de ${sector.name}`}
              value={sector.managerId ?? ""}
              onChange={(event) => updateSector.mutate({ id: sector.id, patch: { managerId: event.target.value || null } })}
              className="mt-3 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
            >
              <option value="">Sem gestor</option>
              {(managers.data ?? []).map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.name}
                </option>
              ))}
            </select>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ManagersTab() {
  const sectors = useAdminSectors();
  const managers = useAdminManagers();
  const createManager = useCreateManager();
  const updateManager = useUpdateManager();
  const [name, setName] = useState("");
  const resetPassword = useResetManagerPassword();
  const [role, setRole] = useState<ManagerRole>("HOSPITAL_ADMIN");
  const [selectedSectorIds, setSelectedSectorIds] = useState<string[]>([]);
  // One-time password display, shared by creation and by a password reset.
  const [revealedPassword, setRevealedPassword] = useState<{ managerName: string; temporaryPassword: string } | null>(null);
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

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createManager.mutate(
      { name, role, sectorIds: role === "SECTOR_MANAGER" ? selectedSectorIds : undefined },
      {
        onSuccess: (result) => {
          setRevealedPassword({ managerName: result.manager.name, temporaryPassword: result.temporaryPassword });
          setName("");
          setRole("HOSPITAL_ADMIN");
          setSelectedSectorIds([]);
        },
      },
    );
  };

  const handleResetPassword = (manager: ManagerSummary) => {
    resetPassword.mutate(manager.id, {
      onSuccess: (result) => setRevealedPassword({ managerName: manager.name, temporaryPassword: result.temporaryPassword }),
    });
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

  const isSubmitDisabled = name.trim().length === 0 || (role === "SECTOR_MANAGER" && selectedSectorIds.length === 0);

  return (
    <div>
      {revealedPassword && (
        <Card tone="brand-tint" className="mt-4">
          <p className="text-label font-semibold text-ink-2">
            Senha temporária de {revealedPassword.managerName}: <span className="font-mono">{revealedPassword.temporaryPassword}</span>
          </p>
        </Card>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mt-4">
          <label htmlFor="manager-name-input" className="text-label font-semibold text-ink-2">
            Nome do gestor
          </label>
          <input
            id="manager-name-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
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
          <Button type="submit" variant="primary" loading={createManager.isPending} disabled={isSubmitDisabled}>
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
                  {manager.isActive ? "Ativo" : "Inativo"}
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
                aria-label={`Redefinir senha de ${manager.name}`}
                loading={resetPassword.isPending && resetPassword.variables === manager.id}
                onClick={() => handleResetPassword(manager)}
              >
                Redefinir senha
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
                  <Button variant="primary" full={false} loading={updateManager.isPending} onClick={() => handleSaveEdit(manager)}>
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

export function ManagerAdminPage() {
  const navigate = useNavigate();
  const clearSession = useManagerSessionStore((state) => state.clearSession);
  const [tab, setTab] = useState<"sectors" | "managers">("sectors");

  return (
    <PhoneShell bg="canvas-alt">
      <div className="pt-6.5">
        <div className="flex items-center justify-between">
          <BackButton label="Painel" onClick={() => navigate(routes.manager)} />
          <button
            type="button"
            onClick={() => {
              clearSession();
              navigate(routes.managerLogin, { replace: true });
            }}
            className="text-label font-bold text-danger"
          >
            Sair
          </button>
        </div>
        <h1 className="mt-4 text-h2 text-ink">Administração</h1>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("sectors")}
            className={["rounded-pill px-4 py-2 text-label font-semibold", tab === "sectors" ? "bg-brand text-white" : "bg-surface text-ink"].join(" ")}
          >
            Setores
          </button>
          <button
            type="button"
            onClick={() => setTab("managers")}
            className={["rounded-pill px-4 py-2 text-label font-semibold", tab === "managers" ? "bg-brand text-white" : "bg-surface text-ink"].join(" ")}
          >
            Gestores
          </button>
        </div>

        {tab === "sectors" ? <SectorsTab /> : <ManagersTab />}
      </div>
    </PhoneShell>
  );
}
