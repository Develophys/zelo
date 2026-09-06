import { Home, LogOut, Settings } from "lucide-react";
import { NavLink, useNavigate } from "react-router";
import { routes } from "@/presentation/lib/routes";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";

const SLOT_CLASS =
  "flex min-h-11 min-w-11 flex-col items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

/**
 * Three slots, mirroring the médico's own BottomNav's non-fixed placement
 * (it sits inside PhoneShell's scroll column, not pinned as an outer sibling
 * like the manager panel's), but pared down to what a peer partner needs.
 * Início has to be here, not just Configurações and Sair: without it,
 * leaving the inbox for settings was a one-way trip on a phone, since
 * nothing else on that screen points back.
 */
export function PeerPartnerBottomNav() {
  const navigate = useNavigate();
  const clearSession = usePeerPartnerSessionStore((state) => state.clearSession);

  const handleLogout = () => {
    clearSession();
    navigate(routes.peerPartnerLogin, { replace: true });
  };

  return (
    <nav
      data-testid="peer-partner-bottom-nav"
      aria-label="Navegação do parceiro no celular"
      className="flex flex-none justify-around border-t border-surface-brand bg-surface px-2 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] md:hidden"
    >
      <NavLink
        to={routes.peerPartnerInbox}
        end
        className={({ isActive }) => `${SLOT_CLASS} ${isActive ? "text-brand" : "text-muted"}`}
      >
        <Home size={22} aria-hidden="true" />
        <span className="font-sans text-nav font-semibold">Início</span>
      </NavLink>

      <NavLink
        to={routes.peerPartnerSettings}
        className={({ isActive }) => `${SLOT_CLASS} ${isActive ? "text-brand" : "text-muted"}`}
      >
        <Settings size={22} aria-hidden="true" />
        <span className="font-sans text-nav font-semibold">Configurações</span>
      </NavLink>

      <button
        type="button"
        onClick={handleLogout}
        className={`${SLOT_CLASS} text-muted`}
      >
        <LogOut size={22} aria-hidden="true" />
        <span className="font-sans text-nav font-semibold">Sair</span>
      </button>
    </nav>
  );
}
