import { useLinkInstitutionFlow } from '@/presentation/hooks/useLinkInstitutionFlow';
import { LinkInstitutionCodeStep } from '@/presentation/components/LinkInstitutionCodeStep';
import { LinkInstitutionSectorStep } from '@/presentation/components/LinkInstitutionSectorStep';

export function LinkInstitutionPage() {
  const flow = useLinkInstitutionFlow();

  if (flow.step === 'sector') {
    return <LinkInstitutionSectorStep {...flow} />;
  }
  return <LinkInstitutionCodeStep {...flow} />;
}
