import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { AppearanceSettings } from '@/presentation/components/settings/AppearanceSettings';
import { STAFF_NAV_ITEMS } from '@/presentation/layout/nav-tabs';

export function SettingsPage() {
  return (
    <PhoneShell sidebar bottomNav centered>
      <p className="max-w-[62ch] text-label text-muted">
        Valem só para você, neste dispositivo.
      </p>

      <AppearanceSettings />

      <div className="mt-8 border-t border-line pt-6">
        <p className="text-label font-extrabold text-ink">Sou gestor ou par voluntário</p>
        <p className="mt-1 text-caption text-muted">Acesso separado, fora da sua conta anônima.</p>
        <div className="mt-3 flex flex-col gap-2">
          {STAFF_NAV_ITEMS.map((item) => (
            <Link
              key={item.id}
              to={item.route}
              className="flex items-center gap-3 rounded-control border border-line bg-surface px-4 py-3 text-label font-semibold text-ink hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <item.icon size={20} aria-hidden="true" />
              {item.label}
              <ChevronRight size={16} className="ml-auto text-muted" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    </PhoneShell>
  );
}
