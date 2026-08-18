import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const AWAY_THRESHOLD_PX = 48;
const SMOOTH_SCROLL_MS = 320;

function easeOutExpo(progress: number) {
  return progress >= 1 ? 1 : 1 - 2 ** (-10 * progress);
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function useStickToBottom<T>(watched: T) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const isFollowingRef = useRef(true);
  const frameRef = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const programmaticTopRef = useRef<number | null>(null);
  const [hasUnseenContent, setHasUnseenContent] = useState(false);

  const stopAnimation = useCallback(() => {
    if (animationRef.current === null) return;
    cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  }, []);

  const snapToBottom = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
    programmaticTopRef.current = scroller.scrollTop;
  }, []);

  const animateToBottom = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      snapToBottom();
      return;
    }

    stopAnimation();
    const from = scroller.scrollTop;
    let startedAt: number | null = null;

    const step = (now: number) => {
      if (startedAt === null) startedAt = now;
      const progress = Math.min((now - startedAt) / SMOOTH_SCROLL_MS, 1);

      if (progress < 1) {
        const target = Math.max(scroller.scrollHeight - scroller.clientHeight, 0);
        scroller.scrollTop = from + (target - from) * easeOutExpo(progress);
        animationRef.current = requestAnimationFrame(step);
        return;
      }

      animationRef.current = null;
      snapToBottom();
    };

    animationRef.current = requestAnimationFrame(step);
  }, [snapToBottom, stopAnimation]);

  const scheduleScrollToBottom = useCallback(() => {
    if (animationRef.current !== null) return;
    if (typeof requestAnimationFrame !== 'function') {
      snapToBottom();
      return;
    }
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      if (!isFollowingRef.current || animationRef.current !== null) return;
      snapToBottom();
    });
  }, [snapToBottom]);

  const handleScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (animationRef.current !== null) return;
    if (programmaticTopRef.current !== null && scroller.scrollTop === programmaticTopRef.current) {
      return;
    }
    programmaticTopRef.current = null;
    const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    isFollowingRef.current = distanceFromBottom <= AWAY_THRESHOLD_PX;
    if (isFollowingRef.current) setHasUnseenContent(false);
  }, []);

  useLayoutEffect(() => {
    if (isFollowingRef.current) {
      scheduleScrollToBottom();
    } else {
      setHasUnseenContent(true);
    }
  }, [watched, scheduleScrollToBottom]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (isFollowingRef.current) scheduleScrollToBottom();
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scheduleScrollToBottom]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const handOverToUser = () => {
      if (animationRef.current === null) return;
      stopAnimation();
      programmaticTopRef.current = null;
    };
    scroller.addEventListener('wheel', handOverToUser, { passive: true });
    scroller.addEventListener('touchstart', handOverToUser, { passive: true });
    scroller.addEventListener('keydown', handOverToUser);
    return () => {
      scroller.removeEventListener('wheel', handOverToUser);
      scroller.removeEventListener('touchstart', handOverToUser);
      scroller.removeEventListener('keydown', handOverToUser);
    };
  }, [stopAnimation]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    },
    [],
  );

  const resumeFollowing = useCallback(() => {
    isFollowingRef.current = true;
    setHasUnseenContent(false);
  }, []);

  const jumpToBottom = useCallback(() => {
    resumeFollowing();
    animateToBottom();
  }, [resumeFollowing, animateToBottom]);

  return { scrollerRef, handleScroll, hasUnseenContent, jumpToBottom, resumeFollowing };
}
