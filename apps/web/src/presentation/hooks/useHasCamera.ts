import { useEffect, useState } from 'react';

// Checked once per mount rather than assumed: offering a scan button with no
// camera behind it is a dead end, not a graceful degradation.
export function useHasCamera() {
  const [hasCamera, setHasCamera] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { default: QrScanner } = await import('qr-scanner');
      const result = await QrScanner.hasCamera().catch(() => false);
      if (!cancelled) setHasCamera(result);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return hasCamera;
}
