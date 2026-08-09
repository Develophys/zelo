import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';
import { SectionLabel } from '@/presentation/ui/SectionLabel';
import { routes } from '@/presentation/lib/routes';
import { PRIVACY_CLAIMS } from '@/presentation/lib/privacy.constants';

export function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <SectionLabel>Privacidade primeiro</SectionLabel>
        <h1 className="mb-5.5 mt-2.5 text-h1 text-ink">Como o Zelo protege você</h1>
        <div className="flex flex-col gap-3.5">
          {PRIVACY_CLAIMS.map((claim, index) => (
            <Card key={claim.title}>
              <div className="flex items-start gap-3">
                <div className="flex h-9.5 w-9.5 flex-none items-center justify-center rounded-icon bg-surface-brand font-serif text-[17px] text-brand">
                  {index + 1}
                </div>
                <div>
                  <p className="text-body font-extrabold text-ink">{claim.title}</p>
                  <p className="text-caption text-muted">{claim.body}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
        <div className="mt-6">
          <Button variant="primary" onClick={() => navigate(routes.consent)}>
            Entendi, continuar
          </Button>
        </div>
      </div>
    </PhoneShell>
  );
}
