import { useEffect, useState } from 'react';
import { checkHasCamera } from '@/presentation/lib/has-camera';
import { wait } from '@/presentation/lib/abortable-wait';

// iOS/WebKit can report an empty device list on the very first
// `enumerateDevices()` call after a fresh launch (cold start or PWA
// relaunch), even when a camera exists — the media-device registry
// hasn't finished populating yet. It settles on a later call, so we
// retry a couple of times and keep listening for `devicechange` as a
// backstop instead of trusting a single check.
const RETRY_DELAYS_MS = [300, 1000];

export function useHasCamera() {
  const [hasCamera, setHasCamera] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const runCheck = async () => {
      const result = await checkHasCamera();
      if (!signal.aborted) setHasCamera(result);
      return result;
    };

    const runWithRetries = async () => {
      if (await runCheck()) return;
      for (const delay of RETRY_DELAYS_MS) {
        await wait(delay, signal);
        if (signal.aborted) return;
        if (await runCheck()) return;
      }
    };

    runWithRetries();

    const handleDeviceChange = () => runCheck();
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);

    return () => {
      controller.abort();
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
    };
  }, []);

  return hasCamera;
}
