import { useNavigate } from "react-router";
import { useHotkey } from "@/presentation/hooks/useHotkey";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import {
  MANAGER_ADMIN_NAV,
  MANAGER_METHODOLOGY_NAV,
  MANAGER_PRIMARY_NAV,
  MANAGER_SETTINGS_NAV,
} from "./manager-nav";

/**
 * One useHotkey call per destination, spelled out rather than looped — same
 * reason as the médico's useNavHotkeys: React's rules of hooks forbid a
 * variable-length loop of hook calls, and this list is fixed at eight
 * entries by hand in manager-nav.ts.
 */
export function useManagerNavHotkeys(): void {
  const navigate = useNavigate();
  const role = useManagerSessionStore((state) => state.role);
  const isHospitalAdmin = role === "HOSPITAL_ADMIN";

  const trends = MANAGER_PRIMARY_NAV[0]!;
  const notifications = MANAGER_PRIMARY_NAV[1]!;
  const insights = MANAGER_PRIMARY_NAV[2]!;
  const managers = MANAGER_ADMIN_NAV[0]!;
  const sectors = MANAGER_ADMIN_NAV[1]!;
  const peers = MANAGER_ADMIN_NAV[2]!;

  useHotkey(trends.hotkey ?? "", () => navigate(trends.route), trends.label, {
    scope: "global",
    enabled: Boolean(trends.hotkey),
  });
  useHotkey(notifications.hotkey ?? "", () => navigate(notifications.route), notifications.label, {
    scope: "global",
    enabled: Boolean(notifications.hotkey),
  });
  useHotkey(insights.hotkey ?? "", () => navigate(insights.route), insights.label, {
    scope: "global",
    enabled: Boolean(insights.hotkey),
  });
  useHotkey(
    MANAGER_METHODOLOGY_NAV.hotkey ?? "",
    () => navigate(MANAGER_METHODOLOGY_NAV.route),
    MANAGER_METHODOLOGY_NAV.label,
    { scope: "global", enabled: Boolean(MANAGER_METHODOLOGY_NAV.hotkey) },
  );
  useHotkey(managers.hotkey ?? "", () => navigate(managers.route), managers.label, {
    scope: "global",
    enabled: isHospitalAdmin && Boolean(managers.hotkey),
  });
  useHotkey(sectors.hotkey ?? "", () => navigate(sectors.route), sectors.label, {
    scope: "global",
    enabled: isHospitalAdmin && Boolean(sectors.hotkey),
  });
  useHotkey(peers.hotkey ?? "", () => navigate(peers.route), peers.label, {
    scope: "global",
    enabled: isHospitalAdmin && Boolean(peers.hotkey),
  });
  useHotkey(
    MANAGER_SETTINGS_NAV.hotkey ?? "",
    () => navigate(MANAGER_SETTINGS_NAV.route),
    MANAGER_SETTINGS_NAV.label,
    { scope: "global", enabled: Boolean(MANAGER_SETTINGS_NAV.hotkey) },
  );
}
