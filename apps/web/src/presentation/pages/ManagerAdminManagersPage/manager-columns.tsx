import { Pill } from "@/presentation/ui/Pill";
import { accountStatusPill } from "@/presentation/lib/account-status-pill";
import type { DataTableColumn } from "@/presentation/ui/DataTable/DataTable";
import type { ManagerSummary } from "@/ports/manager-admin.port";

export type ManagerRole = "HOSPITAL_ADMIN" | "SECTOR_MANAGER";

export function roleLabel(role: ManagerRole): string {
  return role === "HOSPITAL_ADMIN" ? "Gestor do hospital" : "Gestor de setor";
}

// A SECTOR_MANAGER created with no sector stays a pending registration — no
// invite has gone out, so there's no set-password token to read a
// pending/expired status off of (see account-status-pill). A manager who once
// had a sector and lost it, but was already invited, is not this case — the
// token check is what tells the two apart.
export function withPendingSectorFlag(manager: ManagerSummary) {
  return {
    ...manager,
    isPendingSectorAssignment:
      manager.role === "SECTOR_MANAGER" &&
      manager.sectorIds.length === 0 &&
      manager.setPasswordTokenExpiresAt === null,
  };
}

export const COLUMNS: DataTableColumn<ManagerSummary>[] = [
  { key: "name", header: "Nome", width: "w-[18%]", cell: (row) => row.name },
  { key: "email", header: "Email", width: "w-[23%]", breakAll: true, cell: (row) => row.email },
  { key: "role", header: "Papel", width: "w-[19%]", cell: (row) => roleLabel(row.role) },
  {
    key: "sectors",
    header: "Setores",
    width: "w-[17%]",
    hideBelowLg: true,
    cell: (row) => row.sectorNames.join(", ") || "—",
  },
  {
    key: "status",
    header: "Status",
    width: "w-[23%]",
    cell: (row) => {
      const status = accountStatusPill(withPendingSectorFlag(row));
      return (
        <Pill tone={status.tone} title={status.text}>
          {status.text}
        </Pill>
      );
    },
  },
];
