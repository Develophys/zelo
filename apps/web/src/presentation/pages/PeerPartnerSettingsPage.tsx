import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { PeerPartnerBottomNav } from "@/presentation/layout/PeerPartnerBottomNav";
import { AppearanceSettings } from "@/presentation/components/settings/AppearanceSettings";
import { routes } from "@/presentation/lib/routes";

export function PeerPartnerSettingsPage() {
  return (
    <PhoneShell centered chrome="manager" backTo={routes.peerPartnerInbox} bottomNav={<PeerPartnerBottomNav />}>
      <p className="max-w-[62ch] text-label text-muted">Valem só para você, neste dispositivo.</p>

      <AppearanceSettings />
    </PhoneShell>
  );
}
