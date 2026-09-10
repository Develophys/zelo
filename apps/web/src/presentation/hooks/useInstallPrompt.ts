import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isAndroid() {
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent);
}

// Every iOS browser embeds its own UA token even though all of them run on
// WebKit and carry a "Safari" token too — that's what makes it possible to
// tell Safari itself apart from Chrome/Firefox/Edge/Opera wearing its skin.
function isIosNonSafariBrowser() {
  if (typeof navigator === 'undefined') return false;
  return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent);
}

export type InstallStatus =
  | 'installed'
  | 'installable'
  | 'ios'
  | 'ios-other-browser'
  | 'android'
  | 'unsupported';

// iOS (Safari, and every other browser there since all run on WebKit) has no
// API to trigger "Add to Home Screen" — Apple only exposes the manual
// Share-sheet flow, and only from Safari's own UI. `status: 'ios'` is a dead
// end for automation, not a gap in this hook; `status: 'ios-other-browser'`
// is worse still — the flow isn't reachable from the current app at all, so
// the caller has to send the user to Safari first. Android browsers do reach
// `beforeinstallprompt`
// eventually, but Chrome gates it behind an engagement heuristic (repeat
// visits, time on site), so a session can sit in `status: 'android'` for a
// while first — that state points at the browser's own menu instead of
// guessing at a button that isn't there yet.
//
// `unsupported` means neither of those applies (desktop Firefox, desktop
// Safari, or a Chromium desktop browser that hasn't offered the prompt) —
// there's no install path we can point to with confidence, so callers
// should render nothing rather than a guess.
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const status: InstallStatus = installed
    ? 'installed'
    : deferredPrompt
      ? 'installable'
      : isIos()
        ? isIosNonSafariBrowser()
          ? 'ios-other-browser'
          : 'ios'
        : isAndroid()
          ? 'android'
          : 'unsupported';

  return { status, promptInstall };
}
