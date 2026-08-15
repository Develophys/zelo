import { PrivacyBadge } from '@/presentation/ui/PrivacyBadge';
import { getGreeting } from '@/presentation/lib/get-greeting';

export function HomeGreeting() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-caption text-muted">Bom te ver por aqui</p>
        <h1 className="text-h1 text-ink">{getGreeting(new Date().getHours())}</h1>
      </div>
      <PrivacyBadge />
    </div>
  );
}
