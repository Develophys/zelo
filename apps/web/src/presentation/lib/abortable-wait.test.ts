import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wait } from './abortable-wait';

describe('wait', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after the given delay', async () => {
    const controller = new AbortController();
    const settled = vi.fn();

    wait(1000, controller.signal).then(settled);
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalled();
  });

  it('resolves early when the signal aborts before the delay elapses', async () => {
    const controller = new AbortController();
    const settled = vi.fn();

    wait(1000, controller.signal).then(settled);
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await Promise.resolve();

    expect(settled).toHaveBeenCalled();
  });

  it('resolves immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(wait(1000, controller.signal)).resolves.toBeUndefined();
  });
});
