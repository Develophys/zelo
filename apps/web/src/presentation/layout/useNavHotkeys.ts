import { useNavigate } from "react-router";
import { useHotkey } from "@/presentation/hooks/useHotkey";
import { NAV_TABS, SECONDARY_NAV_ITEMS, type NavDestination } from "./nav-tabs";

function findDestination(id: string, destinations: readonly NavDestination[]): NavDestination {
  const found = destinations.find((destination) => destination.id === id);
  if (!found) throw new Error(`useNavHotkeys: no nav destination with id "${id}"`);
  return found;
}

/**
 * One `useHotkey` call per médico destination, spelled out rather than looped —
 * React's rules of hooks forbid a variable-length loop of hook calls, and this
 * list is fixed at six entries by hand in nav-tabs.ts.
 */
export function useNavHotkeys(): void {
  const navigate = useNavigate();

  const home = findDestination("home", NAV_TABS);
  const checkin = findDestination("checkin", NAV_TABS);
  const chat = findDestination("chat", NAV_TABS);
  const apoio = findDestination("apoio", NAV_TABS);
  const you = findDestination("you", NAV_TABS);
  const settings = findDestination("settings", SECONDARY_NAV_ITEMS);

  useHotkey(home.hotkey ?? "", () => navigate(home.route), home.label, {
    scope: "global",
    enabled: Boolean(home.hotkey),
  });
  useHotkey(checkin.hotkey ?? "", () => navigate(checkin.route), checkin.label, {
    scope: "global",
    enabled: Boolean(checkin.hotkey),
  });
  useHotkey(chat.hotkey ?? "", () => navigate(chat.route), chat.label, {
    scope: "global",
    enabled: Boolean(chat.hotkey),
  });
  useHotkey(apoio.hotkey ?? "", () => navigate(apoio.route), apoio.label, {
    scope: "global",
    enabled: Boolean(apoio.hotkey),
  });
  useHotkey(you.hotkey ?? "", () => navigate(you.route), you.label, {
    scope: "global",
    enabled: Boolean(you.hotkey),
  });
  useHotkey(settings.hotkey ?? "", () => navigate(settings.route), settings.label, {
    scope: "global",
    enabled: Boolean(settings.hotkey),
  });
}
