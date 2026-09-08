import { routes } from "@/presentation/lib/routes";

export interface PeerPartnerNavItem {
  id: string;
  label: string;
  route: string;
  hotkey: string;
}

export const PEER_PARTNER_NAV: readonly PeerPartnerNavItem[] = [
  { id: "inbox", label: "Início", route: routes.peerPartnerInbox, hotkey: "i" },
  { id: "settings", label: "Configurações", route: routes.peerPartnerSettings, hotkey: "c" },
];
