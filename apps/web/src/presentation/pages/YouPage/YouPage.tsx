import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { BackButton } from '@/presentation/ui/BackButton';
import { PrivacyBadge } from '@/presentation/ui/PrivacyBadge';
import { useConsentStore } from '@/stores/consent.store';
import { routes } from '@/presentation/lib/routes';
import { InstitutionLinkCard } from '@/presentation/components/InstitutionLinkCard';
import { ConsentStatusCard } from './ConsentStatusCard';
import { RevokeConsentSection } from './RevokeConsentSection';

export function YouPage() {
  const navigate = useNavigate();
  const consentedAt = useConsentStore((state) => state.consentedAt);

  return (
    <PhoneShell nav centered>
      <div className="pt-7.5">
        <div className="flex items-center justify-between">
          <BackButton label="Início" onClick={() => navigate(routes.home)} />
          <PrivacyBadge />
        </div>
        <h1 className="mt-4 text-h1 text-ink">Você</h1>
        <p className="mt-1 text-caption text-muted">Seu consentimento e sua privacidade.</p>

        <ConsentStatusCard consentedAt={consentedAt} />
        <InstitutionLinkCard className="mt-3.5" showLinked />
        <RevokeConsentSection />
      </div>
    </PhoneShell>
  );
}
