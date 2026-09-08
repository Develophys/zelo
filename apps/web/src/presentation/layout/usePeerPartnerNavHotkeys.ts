import { useNavigate } from "react-router";
import { useHotkey } from "@/presentation/hooks/useHotkey";
import { PEER_PARTNER_NAV } from "./peer-partner-nav";

/** Two useHotkey calls, spelled out — same fixed-list reasoning as the médico's and manager's nav hooks. */
export function usePeerPartnerNavHotkeys(): void {
  const navigate = useNavigate();
  const inbox = PEER_PARTNER_NAV[0]!;
  const settings = PEER_PARTNER_NAV[1]!;

  useHotkey(inbox.hotkey, () => navigate(inbox.route), inbox.label, { scope: "global" });
  useHotkey(settings.hotkey, () => navigate(settings.route), settings.label, { scope: "global" });
}
