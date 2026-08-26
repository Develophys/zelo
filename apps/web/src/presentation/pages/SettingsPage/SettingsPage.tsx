import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { AppearanceSettings } from '@/presentation/components/settings/AppearanceSettings';

export function SettingsPage() {
  return (
    <PhoneShell sidebar bottomNav centered>
      <p className="max-w-[62ch] text-label text-muted">
        Valem só para você, neste dispositivo.
      </p>

      <AppearanceSettings />
    </PhoneShell>
  );
}
