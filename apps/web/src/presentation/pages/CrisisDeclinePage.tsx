import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';
import { getCrisisLine } from '@/presentation/lib/crisis-line';
import { routes } from '@/presentation/lib/routes';

export function CrisisDeclinePage() {
  const navigate = useNavigate();
  const line = getCrisisLine();

  return (
    <PhoneShell bottomNav centered>
      <div className="flex min-h-full flex-col gap-3">
        <h2 className="font-serif text-h2 text-ink">Tudo bem. A escolha é sua.</h2>
        <p className="text-body text-muted">
          A oferta continua aberta a qualquer momento — sem pressa e sem penalidade.
        </p>

        <div className="mt-6">
          <Card size="lg" tone="brand">
            <p className="font-mono text-eyebrow uppercase text-on-fill-2">linha de crise · 24h</p>
            <p className="mt-2 font-serif text-[40px]">
              {line.label} {line.phone}
            </p>
            <p className="mt-2 text-label text-on-fill-2">
              Gratuita, sigilosa e disponível a qualquer hora. Você pode ligar agora.
            </p>
            <a
              href={line.telHref}
              className="mt-4 flex min-h-13 w-full items-center justify-center rounded-control bg-on-fill px-4 font-sans text-[16px] font-bold text-brand-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-fill focus-visible:ring-offset-2 focus-visible:ring-offset-brand-fill"
            >
              Ligar para o {line.label}
            </a>
          </Card>
        </div>

        <div className="flex-1" />

        <Button variant="outline" onClick={() => navigate(routes.home)}>
          Voltar ao início
        </Button>
      </div>
    </PhoneShell>
  );
}
