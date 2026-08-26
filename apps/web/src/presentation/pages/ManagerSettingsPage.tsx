import { AppearanceSettings } from "@/presentation/components/settings/AppearanceSettings";

export function ManagerSettingsPage() {
  return (
    <div className="flex w-full flex-col gap-2 md:max-w-170">
      <p className="max-w-[62ch] text-label text-muted">
        Elas valem só para você, neste dispositivo — não mudam nada para os outros gestores do
        hospital.
      </p>

      <AppearanceSettings includeDensity />
    </div>
  );
}
