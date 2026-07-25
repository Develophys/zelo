import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { Button } from "@/presentation/ui/Button";
import { SectionLabel } from "@/presentation/ui/SectionLabel";
import { useConsentStore } from "@/stores/consent.store";
import { routes } from "@/presentation/lib/routes";

const SUBTITLE = "Cuidado confidencial\npara quem cuida.";
const TYPING_START_DELAY_MS = 1000;
const TYPING_DURATION_MS = 1000;

function useTypewriter(text: string, startDelayMs: number, durationMs: number) {
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRevealedCount(text.length);
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | undefined;
    const perCharMs = durationMs / text.length;

    const startTimeoutId = setTimeout(() => {
      let charIndex = 0;
      intervalId = setInterval(() => {
        charIndex += 1;
        setRevealedCount(charIndex);
        if (charIndex >= text.length && intervalId) {
          clearInterval(intervalId);
        }
      }, perCharMs);
    }, startDelayMs);

    return () => {
      clearTimeout(startTimeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [text, startDelayMs, durationMs]);

  return text.slice(0, revealedCount);
}

export function SplashPage() {
  const navigate = useNavigate();
  const hasConsented = useConsentStore((state) => state.hasConsented);
  const subtitle = useTypewriter(SUBTITLE, TYPING_START_DELAY_MS, TYPING_DURATION_MS);

  // Backup to the router loader on "/" (see router.tsx) — belt-and-suspenders
  // per routing-and-state.md so a warm start never flashes onboarding.
  useEffect(() => {
    if (hasConsented) {
      navigate(routes.home, { replace: true });
    }
  }, [hasConsented, navigate]);

  return (
    <PhoneShell bleed>
      <div
        className="flex min-h-screen flex-col items-center justify-center px-8.5 text-center"
        style={{ background: "linear-gradient(180deg,#EEF4F1,#F2F5F3)" }}
      >
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className=" flex h-36 w-36 items-center justify-center rounded-card-lg bg-brand shadow-hero">
            <img alt="logo Zelo" src="/zelo_logo.png" className="h-full w-full object-contain animate-grow-in" />
          </div>
          <h1 className="animate-focus-in mt-6.5 font-serif text-display text-ink">Zelo</h1>
          <p className="relative mt-3 max-w-62.5 whitespace-pre-line text-body text-ink-2">
            <span className="sr-only">{SUBTITLE}</span>
            <span aria-hidden="true" className="invisible">
              {SUBTITLE}
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
          <div className="mt-[18px]">
            <SectionLabel>anônimo · criptografado · no seu controle</SectionLabel>
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}
