import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { useConsentStore } from '@/stores/consent.store';
import { InstitutionLinkCard } from '@/presentation/components/InstitutionLinkCard';
import { AppearanceCard } from './AppearanceCard';
import { ConsentStatusCard } from './ConsentStatusCard';
import { RevokeConsentSection } from './RevokeConsentSection';

export function YouPage() {
  const consentedAt = useConsentStore((state) => state.consentedAt);

  return (
    <PhoneShell nav centered>
      <ConsentStatusCard consentedAt={consentedAt} />
      <InstitutionLinkCard className="mt-3.5" showLinked />
      <AppearanceCard />
      <RevokeConsentSection />
    </PhoneShell>
  );
}
