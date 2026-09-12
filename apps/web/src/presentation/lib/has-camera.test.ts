import { describe, expect, it, vi } from 'vitest';

const { hasCameraMock } = vi.hoisted(() => ({
  hasCameraMock: vi.fn(),
}));

vi.mock('qr-scanner', () => ({
  default: { hasCamera: hasCameraMock },
}));

describe('checkHasCamera', () => {
  it('resolves true when qr-scanner confirms a camera exists', async () => {
    hasCameraMock.mockResolvedValue(true);
    const { checkHasCamera } = await import('./has-camera');

    await expect(checkHasCamera()).resolves.toBe(true);
  });

  it('resolves false when qr-scanner finds no camera', async () => {
    hasCameraMock.mockResolvedValue(false);
    const { checkHasCamera } = await import('./has-camera');

    await expect(checkHasCamera()).resolves.toBe(false);
  });

  it('resolves false rather than throwing when the check itself fails', async () => {
    hasCameraMock.mockRejectedValue(new Error('no navigator.mediaDevices'));
    const { checkHasCamera } = await import('./has-camera');

    await expect(checkHasCamera()).resolves.toBe(false);
  });
});
