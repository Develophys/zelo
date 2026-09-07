import type { ComponentType } from "react";
import { Home, ClipboardCheck, MessageCircle, UserRound, HandHeart, ShieldCheck, SlidersHorizontal, HeartHandshake } from "lucide-react";
import { routes } from "@/presentation/lib/routes";

export type NavTabId = "home" | "checkin" | "chat" | "apoio" | "you";

export interface NavDestination {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  route: string;
}

export interface NavTab extends NavDestination {
  id: NavTabId;
}

// Single source of truth for the médico's primary destinations — consumed by
// both BottomNav (mobile) and Sidebar (tablet/desktop) so the two navs can
// never list different destinations.
//
// "Apoio" is a standing destination rather than something the app offers once
// it decides you need it. Every other route to the crisis line is conditional
// on already being in trouble — a bad score, a chat classifier firing, a peer
// search failing — which left someone who opens Zelo *because* they are in
// crisis with no route at all. It sits before "Você" so it is not the edge tab
// a thumb hits by accident.
export const NAV_TABS: NavTab[] = [
  { id: "home", label: "Início", icon: Home, route: routes.home },
  { id: "checkin", label: "Check-in", icon: ClipboardCheck, route: routes.assessment },
  { id: "chat", label: "Conversar", icon: MessageCircle, route: routes.chat },
  { id: "apoio", label: "Apoio", icon: HandHeart, route: routes.crisis },
  { id: "you", label: "Você", icon: UserRound, route: routes.you },
];

// Secondary destinations, deliberately outside NAV_TABS: neither is one of the
// medico's primary tabs, and both navs render them in their own ruled-off
// section, Configurações above Administração.
export const SETTINGS_NAV_ITEM: NavDestination = {
  id: "settings",
  label: "Configurações",
  icon: SlidersHorizontal,
  route: routes.settings,
};

export const ADMIN_NAV_ITEM: NavDestination = {
  id: "admin",
  label: "Administração",
  icon: ShieldCheck,
  route: routes.manager,
};

// The médico's app has no other route to it: without this, a peer partner has
// to already know the /peer/login URL by heart.
export const PEER_PARTNER_NAV_ITEM: NavDestination = {
  id: "peer-partner",
  label: "Par anônimo",
  icon: HeartHandshake,
  route: routes.peerPartnerLogin,
};

// Administração and Par anônimo used to live here too. Both are now grouped
// under a "Sou gestor ou par voluntário" section on the Configurações screen
// instead of sitting permanently in the anonymous médico's own nav.
export const SECONDARY_NAV_ITEMS: readonly NavDestination[] = [SETTINGS_NAV_ITEM];

export const STAFF_NAV_ITEMS: readonly NavDestination[] = [ADMIN_NAV_ITEM, PEER_PARTNER_NAV_ITEM];
