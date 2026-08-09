import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { Button } from '@/presentation/ui/Button';
import { SectionLabel } from '@/presentation/ui/SectionLabel';
import { useConsentStore } from '@/stores/consent.store';
import { routes } from '@/presentation/lib/routes';
import {
  SPLASH_SUBTITLE,
  SPLASH_TYPING_DURATION_MS,
  SPLASH_TYPING_START_DELAY_MS,
} from '@/presentation/lib/splash.constants';
import { useTypewriter } from '@/presentation/hooks/useTypewriter';

export function SplashPage() {
  const navigate = useNavigate();
  const hasConsented = useConsentStore((state) => state.hasConsented);
  const [logoFailed, setLogoFailed] = useState(false);
  const subtitle = useTypewriter(
    SPLASH_SUBTITLE,
    SPLASH_TYPING_START_DELAY_MS,
    SPLASH_TYPING_DURATION_MS,
  );

  // Backup to the router loader on "/" (see router.tsx) — belt-and-suspenders
  // per routing-and-state.md so a warm start never flashes onboarding.
  useEffect(() => {
    if (hasConsented) {
      navigate(routes.home, { replace: true });
    }
  }, [hasConsented, navigate]);

  return (
    <PhoneShell bleed centered>
      <div className="flex min-h-dvh flex-col items-center justify-center bg-linear-to-b from-canvas-alt to-canvas px-8.5 text-center">
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="flex h-36 w-36 items-center justify-center rounded-card-lg bg-brand shadow-hero">
            {logoFailed ? (
              <span
                aria-hidden="true"
                className="animate-grow-in font-serif text-score text-white"
              >
                Z
              </span>
            ) : (
              <picture>
                <source srcSet={`${import.meta.env.BASE_URL}zelo_logo.webp`} type="image/webp" />
                <img
                  alt=""
                  src={`${import.meta.env.BASE_URL}zelo_logo.png`}
                  width={480}
                  height={480}
                  fetchPriority="high"
                  onError={() => setLogoFailed(true)}
                  className="h-full w-full object-contain animate-grow-in"
                />
              </picture>
            )}
          </div>
          <h1 className="animate-focus-in mt-6.5 font-serif text-display text-ink">Zelo</h1>
          <p className="relative mt-3 max-w-62.5 whitespace-pre-line text-body text-ink-2">
            <span className="sr-only">{SPLASH_SUBTITLE}</span>
            <span aria-hidden="true" className="invisible">
              {SPLASH_SUBTITLE}
            </span>
            <span aria-hidden="true" className="absolute inset-x-0 top-0">
              {subtitle}
            </span>
          </p>
        </div>
        <div className="w-full pb-10">
          <Button variant="primary" onClick={() => navigate(routes.privacy)}>
            Começar
          </Button>
          <div className="mt-4.5">
            <SectionLabel tone="muted-strong">anônimo · criptografado · no seu controle</SectionLabel>
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}
