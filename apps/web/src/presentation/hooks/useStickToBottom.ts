import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const AWAY_THRESHOLD_PX = 48;

export function useStickToBottom<T>(watched: T) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const isFollowingRef = useRef(true);
  const frameRef = useRef<number | null>(null);
  const programmaticTopRef = useRef<number | null>(null);
  const [hasUnseenContent, setHasUnseenContent] = useState(false);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (smooth && !prefersReducedMotion && typeof scroller.scrollTo === 'function') {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    } else {
      scroller.scrollTop = scroller.scrollHeight;
      programmaticTopRef.current = scroller.scrollTop;
    }
  }, []);

  const scheduleScrollToBottom = useCallback(() => {
    if (typeof requestAnimationFrame !== 'function') {
      scrollToBottom(false);
      return;
    }
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      if (!isFollowingRef.current) return;
      scrollToBottom(false);
    });
  }, [scrollToBottom]);

  const handleScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
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

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const resumeFollowing = useCallback(() => {
    isFollowingRef.current = true;
    setHasUnseenContent(false);
  }, []);

  const jumpToBottom = useCallback(() => {
    resumeFollowing();
    scrollToBottom(true);
  }, [resumeFollowing, scrollToBottom]);

  return { scrollerRef, handleScroll, hasUnseenContent, jumpToBottom, resumeFollowing };
}
