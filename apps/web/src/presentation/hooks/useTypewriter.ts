import { useEffect, useState } from "react";

export function useTypewriter(text: string, startDelayMs: number, durationMs: number) {
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let startTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const revealInstantly = () => {
      if (startTimeoutId) clearTimeout(startTimeoutId);
      if (intervalId) clearInterval(intervalId);
      setRevealedCount(text.length);
    };

    const startTyping = () => {
      const perCharMs = durationMs / text.length;
      let charIndex = 0;
      intervalId = setInterval(() => {
        charIndex += 1;
        setRevealedCount(charIndex);
        if (charIndex >= text.length && intervalId) {
          clearInterval(intervalId);
        }
      }, perCharMs);
    };

    if (reducedMotionQuery.matches) {
      revealInstantly();
    } else {
      startTimeoutId = setTimeout(startTyping, startDelayMs);
    }

    // Reacts if the user toggles OS-level reduced-motion mid-animation, not
    // just whatever the setting happened to be when this effect first ran.
    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
      if (event.matches) revealInstantly();
    };
    reducedMotionQuery.addEventListener("change", handleReducedMotionChange);

    return () => {
      reducedMotionQuery.removeEventListener("change", handleReducedMotionChange);
      if (startTimeoutId) clearTimeout(startTimeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [text, startDelayMs, durationMs]);

  return text.slice(0, revealedCount);
}
