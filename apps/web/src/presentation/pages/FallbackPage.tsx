import { useNavigate, useRouteError } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { Button } from '@/presentation/ui/Button';
import { CrisisCallLink } from '@/presentation/components/CrisisCallLink';
import { getCrisisLine } from '@/presentation/lib/crisis-line';
import { routes } from '@/presentation/lib/routes';

interface FallbackPageProps {
  /** `notFound` for an unknown URL; `crashed` when a route threw. */
  reason?: 'notFound' | 'crashed';
}

const COPY = {
  notFound: {
    heading: 'Não encontramos esta página.',
    body: 'O link pode estar desatualizado. Você pode voltar ao início — e a linha de crise continua aqui, sempre.',
  },
  crashed: {
    heading: 'Algo deu errado aqui.',
    body: 'A falha é nossa, não sua. Você pode voltar ao início — e ligar para o CVV não depende desta tela.',
  },
} as const;

/**
 * The last screen between a broken route and a blank page.
 *
 * Without this, an unknown URL or an unhandled render error anywhere outside the
 * chat transcript yields React Router's default: unstyled, in English, with no
 * way home and — the part that matters — no crisis line. This app's one
 * non-negotiable property is that the number is always reachable, so the
 * fallback carries it too.
 */
export function FallbackPage({ reason = 'notFound' }: FallbackPageProps) {
  const navigate = useNavigate();
  const line = getCrisisLine();
  const copy = COPY[reason];

  return (
    <PhoneShell centered headerOverride={{ title: 'Zelo' }}>
      <div className="flex min-h-full flex-col">
        <h2 className="mt-6 font-serif text-h2 text-ink">{copy.heading}</h2>
        <p className="mt-2 text-pretty text-body text-muted">{copy.body}</p>

        <div className="mt-8 flex flex-col gap-3">
          <Button variant="primary" onClick={() => navigate(routes.home)}>
            Voltar ao início
          </Button>
          <CrisisCallLink line={line} className="w-full justify-center text-brand" />
        </div>

        <div className="flex-1" />
      </div>
    </PhoneShell>
  );
}

/**
 * Router `errorElement`. Kept separate so the thrown value is read only where
 * React Router provides it — `FallbackPage` itself stays renderable anywhere.
 */
export function RouteErrorFallback() {
  const error = useRouteError();
  // Surfaced for the console only; the screen never shows a stack to a doctor.
  if (import.meta.env.DEV) console.error('Route error:', error);
  return <FallbackPage reason="crashed" />;
}
