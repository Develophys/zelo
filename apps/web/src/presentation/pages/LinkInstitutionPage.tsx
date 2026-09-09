import { useLinkInstitutionFlow } from '@/presentation/hooks/useLinkInstitutionFlow';
import { LinkInstitutionCodeStep } from '@/presentation/components/LinkInstitutionCodeStep';
import { LinkInstitutionSectorStep } from '@/presentation/components/LinkInstitutionSectorStep';
import { LinkInstitutionConfirmStep } from '@/presentation/components/LinkInstitutionConfirmStep';

export function LinkInstitutionPage() {
  const flow = useLinkInstitutionFlow();

  if (flow.step === 'confirm' && flow.institutionName && flow.confirmSector) {
    return (
      <LinkInstitutionConfirmStep
        institutionName={flow.institutionName}
        sectorName={flow.confirmSector.name}
        onConfirm={flow.handleConfirmSubmit}
        onReject={flow.handleRejectConfirm}
      />
    );
  }
  if (flow.step === 'sector') {
    return <LinkInstitutionSectorStep {...flow} />;
  }
  return <LinkInstitutionCodeStep {...flow} />;
}
