import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useStickToBottom } from './useStickToBottom';

const CLIENT_HEIGHT = 500;

function makeScroller(initialScrollHeight: number) {
  const element = document.createElement('div');
  let scrollHeight = initialScrollHeight;
  let scrollTop = 0;
  Object.defineProperty(element, 'scrollHeight', { get: () => scrollHeight });
  Object.defineProperty(element, 'clientHeight', { get: () => CLIENT_HEIGHT });
  Object.defineProperty(element, 'scrollTop', {
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = Math.min(value, Math.max(0, scrollHeight - CLIENT_HEIGHT));
    },
  });
  return {
    element,
    grow: (to: number) => {
      scrollHeight = to;
    },
    top: () => scrollTop,
  };
}

function captureFrames() {
  const queued: FrameRequestCallback[] = [];
  const spy = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => queued.push(callback));
  return {
    flush: () => act(() => queued.splice(0).forEach((callback) => callback(0))),
    restore: () => spy.mockRestore(),
  };
}

describe('useStickToBottom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps following when the scroll event is only the late echo of its own write and the content grew in between', () => {
    const frames = captureFrames();
    const scroller = makeScroller(1000);

    const { result, rerender } = renderHook(({ watched }) => useStickToBottom(watched), {
      initialProps: { watched: 0 },
    });
    result.current.scrollerRef.current = scroller.element;

    rerender({ watched: 1 });
    frames.flush();
    expect(scroller.top()).toBe(500);

    // The assistant reply lands, growing the content, before the browser
    // delivers the scroll event caused by the write above. That echo reports a
    // position 1500px from the new bottom even though the user never moved.
    scroller.grow(2000);
    act(() => result.current.handleScroll());

    rerender({ watched: 2 });
    frames.flush();

    expect(scroller.top()).toBe(1500);
    expect(result.current.hasUnseenContent).toBe(false);

    frames.restore();
  });

  it('still stops following when the user genuinely scrolls away from the bottom', () => {
    const frames = captureFrames();
    const scroller = makeScroller(2000);

    const { result, rerender } = renderHook(({ watched }) => useStickToBottom(watched), {
      initialProps: { watched: 0 },
    });
    result.current.scrollerRef.current = scroller.element;

    rerender({ watched: 1 });
    frames.flush();
    expect(scroller.top()).toBe(1500);

    scroller.element.scrollTop = 200;
    act(() => result.current.handleScroll());

    rerender({ watched: 2 });
    frames.flush();

    expect(scroller.top()).toBe(200);
    expect(result.current.hasUnseenContent).toBe(true);
  });
});
