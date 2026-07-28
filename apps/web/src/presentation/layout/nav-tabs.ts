import type { ComponentType } from "react";
import { Home, ClipboardCheck, MessageCircle, UserRound } from "lucide-react";
import { routes } from "@/presentation/lib/routes";

export type NavTabId = "home" | "checkin" | "chat" | "you";

export interface NavTab {
  id: NavTabId;
  label: string;
  icon: ComponentType<{ size?: number }>;
  route: string;
}

// Single source of truth for the médico's 4 primary destinations — consumed by
// both BottomNav (mobile, only shown on HomePage) and Sidebar (tablet/desktop,
// persistent) so the two navs can never list different destinations.
export const NAV_TABS: NavTab[] = [
  { id: "home", label: "Início", icon: Home, route: routes.home },
  { id: "checkin", label: "Check-in", icon: ClipboardCheck, route: routes.assessment },
  { id: "chat", label: "Conversar", icon: MessageCircle, route: routes.chat },
  { id: "you", label: "Você", icon: UserRound, route: routes.you },
];
