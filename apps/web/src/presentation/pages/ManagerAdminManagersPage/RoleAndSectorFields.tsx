import { Radio } from "@/presentation/ui/Radio";
import { SectorPillPicker } from "@/presentation/ui/SectorPillPicker";
import type { AdminSector } from "@/ports/manager-admin.port";
import type { ManagerRole } from "./manager-columns";

const ROLE_CHOICES: { value: ManagerRole; label: string; description: string }[] = [
  {
    value: "SECTOR_MANAGER",
    label: "Gestor de setor",
    description: "Vê apenas os setores atribuídos.",
  },
  {
    value: "HOSPITAL_ADMIN",
    label: "Gestor do hospital",
    description: "Vê os indicadores de todos os setores e administra o acesso.",
  },
];

export function RoleAndSectorFields({
  idPrefix,
  role,
  onRoleChange,
  sectors,
  selectedSectorIds,
  onToggleSector,
  sectorsPending,
  sectorsFailed,
}: {
  idPrefix: string;
  role: ManagerRole;
  onRoleChange: (role: ManagerRole) => void;
  sectors: AdminSector[];
  selectedSectorIds: string[];
  onToggleSector: (id: string) => void;
  sectorsPending: boolean;
  sectorsFailed: boolean;
}) {
  return (
    <>
      <fieldset className="mt-3">
        <legend className="text-label font-semibold text-ink-2">Tipo de gestor</legend>
        <div className="mt-2 flex flex-col gap-3">
          {ROLE_CHOICES.map(({ value, label, description }) => (
            <div key={value}>
              <label
                htmlFor={`${idPrefix}-role-${value}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 text-label text-ink-2"
              >
                <Radio
                  id={`${idPrefix}-role-${value}`}
                  name={`${idPrefix}-manager-role`}
                  aria-describedby={`${idPrefix}-role-${value}-description`}
                  checked={role === value}
                  onChange={() => onRoleChange(value)}
                />
                {label}
              </label>
              <p
                id={`${idPrefix}-role-${value}-description`}
                className="ml-8 text-pretty text-caption text-muted"
              >
                {description}
              </p>
            </div>
          ))}
        </div>
      </fieldset>

      {role === "SECTOR_MANAGER" && (
        <div className="mt-3">
          <p className="text-label font-semibold text-ink-2">Setores</p>
          <div className="mt-2">
            {/* "This hospital has registered no sectors" and "we could not
                reach the server" are different facts. Falling through to the
                empty state on either states the first while meaning the
                second — and saving from there replaces the manager's whole
                assignment with nothing. */}
            {sectorsPending ? (
              <p data-testid="sector-picker-loading" className="text-label text-muted">
                Carregando os setores…
              </p>
            ) : sectorsFailed ? (
              <p data-testid="sector-picker-error" role="alert" className="text-label text-danger">
                Não foi possível carregar os setores. Sem eles, salvar removeria os que já estão atribuídos.
              </p>
            ) : (
              <SectorPillPicker
                sectors={sectors}
                selectedIds={selectedSectorIds}
                onToggle={onToggleSector}
                emptyHref="/manager/admin/sectors"
                emptyLabel="Cadastrar um setor"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
