import { Check } from 'lucide-react';
import { Card } from '@/presentation/ui/Card';
import { IconBadge } from '@/presentation/ui/IconBadge';
import { formatConsentDate } from '@/presentation/lib/format-consent-date';

interface ConsentStatusCardProps {
  consentedAt: string | null;
}

export function ConsentStatusCard({ consentedAt }: ConsentStatusCardProps) {
  const consentedOn = formatConsentDate(consentedAt);

  return (
    <Card size="md" className="mt-5">
      <div className="flex items-center gap-3">
        <IconBadge icon={Check} tone="brand" />
        <div className="min-w-0">
          <p className="text-body font-extrabold text-ink">Consentimento ativo</p>
          {consentedOn && <p className="text-caption text-muted">Desde {consentedOn}</p>}
        </div>
      </div>
    </Card>
  );
}
