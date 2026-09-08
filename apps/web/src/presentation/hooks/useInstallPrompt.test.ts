import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useInstallPrompt } from './useInstallPrompt';

interface FakeBeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', {
    cancelable: true,
  }) as FakeBeforeInstallPromptEvent;
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  window.dispatchEvent(event);
  return event;
}

describe('useInstallPrompt', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts unsupported on a browser with no install hook and no iOS Share sheet', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.status).toBe('unsupported');
  });

  it('becomes installable once Chromium offers beforeinstallprompt', () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      fireBeforeInstallPrompt();
    });

    expect(result.current.status).toBe('installable');
  });

  it('replays the captured prompt and marks the app installed on acceptance', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    let event!: FakeBeforeInstallPromptEvent;
    act(() => {
      event = fireBeforeInstallPrompt('accepted');
    });

    await act(async () => {
      await result.current.promptInstall();
    });

    expect(event.prompt).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('installed');
  });

  it('falls back to unsupported if the user dismisses the native prompt', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      fireBeforeInstallPrompt('dismissed');
    });

    await act(async () => {
      await result.current.promptInstall();
    });

    // Chrome only fires beforeinstallprompt again after real signals of
    // engagement, so a dismissed prompt just drops back to no captured
    // event, not a retryable "installable" state.
    expect(result.current.status).toBe('unsupported');
  });

  it('detects iOS, where Apple exposes no install API at all', () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });

    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.status).toBe('ios');
  });

  it('detects Android before beforeinstallprompt clears Chrome\'s engagement heuristic', () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0',
    });

    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.status).toBe('android');
  });

  it('reports installed when already running in standalone display mode', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);

    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.status).toBe('installed');
  });

  it('marks installed on the appinstalled event, even with no captured prompt', () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(result.current.status).toBe('installed');
  });
});
