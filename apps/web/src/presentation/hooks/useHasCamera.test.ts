import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useHasCamera } from './useHasCamera';

const { checkHasCameraMock } = vi.hoisted(() => ({
  checkHasCameraMock: vi.fn(),
}));

vi.mock('@/presentation/lib/has-camera', () => ({
  checkHasCamera: checkHasCameraMock,
}));

function stubMediaDevices() {
  const listeners = new Set<() => void>();
  const mediaDevices = {
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    dispatchDeviceChange: () => listeners.forEach((listener) => listener()),
  };
  vi.stubGlobal('navigator', { ...navigator, mediaDevices });
  return mediaDevices;
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useHasCamera', () => {
  beforeEach(() => {
    checkHasCameraMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reports true once the first check confirms a camera exists', async () => {
    checkHasCameraMock.mockResolvedValue(true);
    const { result } = renderHook(() => useHasCamera());

    await flush();

    expect(result.current).toBe(true);
    expect(checkHasCameraMock).toHaveBeenCalledTimes(1);
  });

  it('retries past the WebKit cold-start race and reports true once a later check succeeds', async () => {
    checkHasCameraMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const { result } = renderHook(() => useHasCamera());

    await flush();
    expect(result.current).toBe(false);
    expect(checkHasCameraMock).toHaveBeenCalledTimes(1);

    await flush(300);
    expect(result.current).toBe(false);
    expect(checkHasCameraMock).toHaveBeenCalledTimes(2);

    await flush(1000);
    expect(result.current).toBe(true);
    expect(checkHasCameraMock).toHaveBeenCalledTimes(3);
  });

  it('gives up and stays false once every retry reports no camera', async () => {
    checkHasCameraMock.mockResolvedValue(false);
    const { result } = renderHook(() => useHasCamera());

    await flush();
    await flush(300);
    await flush(1000);

    expect(result.current).toBe(false);
    expect(checkHasCameraMock).toHaveBeenCalledTimes(3);
  });

  it('re-checks when the browser fires devicechange', async () => {
    const mediaDevices = stubMediaDevices();
    checkHasCameraMock.mockResolvedValue(false);
    const { result } = renderHook(() => useHasCamera());

    await flush();
    await flush(300);
    await flush(1000);
    expect(result.current).toBe(false);

    checkHasCameraMock.mockResolvedValue(true);
    await act(async () => {
      mediaDevices.dispatchDeviceChange();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current).toBe(true);
  });

  it('does not update state after unmount', async () => {
    let resolveCheck!: (value: boolean) => void;
    checkHasCameraMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveCheck = resolve;
      }),
    );
    const { unmount } = renderHook(() => useHasCamera());

    unmount();

    await expect(
      act(async () => {
        resolveCheck(true);
        await Promise.resolve();
      }),
    ).resolves.not.toThrow();
  });
});
