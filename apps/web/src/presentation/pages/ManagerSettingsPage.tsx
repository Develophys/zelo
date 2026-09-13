import { AppearanceSettings } from "@/presentation/components/settings/AppearanceSettings";
import { InstallAppRow } from "@/presentation/components/settings/InstallAppRow";
import { GuideDownloadsRow } from "@/presentation/components/settings/GuideDownloadsRow";

export function ManagerSettingsPage() {
  return (
    <div className="flex w-full flex-col gap-2 md:max-w-170">
      <p className="max-w-[62ch] text-label text-muted">
        Elas valem só para você, neste dispositivo — não mudam nada para os outros gestores do
        hospital.
      </p>

      <AppearanceSettings includeDensity />
      <InstallAppRow />
      <div className="border-t border-line">
        <GuideDownloadsRow
          pocketHref="/guides/zelo-guia-de-bolso-gestor.pdf"
          completeHref="/guides/zelo-guia-completo-gestor.pdf"
        />
      </div>
    </div>
  );
}
