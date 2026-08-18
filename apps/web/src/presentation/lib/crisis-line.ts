import { requestHumanHandoffUseCase } from '@/app/container';

export interface CrisisLine {
  label: string;
  fullLabel: string;
  phone: string;
  telHref: string;
}

export function getCrisisLine(): CrisisLine {
  const { externalCrisisLine } = requestHumanHandoffUseCase.execute();
  const [shortLabel] = externalCrisisLine.label.split(' - ');

  return {
    label: shortLabel || externalCrisisLine.label,
    fullLabel: externalCrisisLine.label,
    phone: externalCrisisLine.phone,
    telHref: `tel:${externalCrisisLine.phone}`,
  };
}
