import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useHasCamera } from './useHasCamera';

const { hasCameraMock } = vi.hoisted(() => ({
  hasCameraMock: vi.fn(),
}));

vi.mock('qr-scanner', () => ({
  default: { hasCamera: hasCameraMock },
}));

describe('useHasCamera', () => {
  it('reports true once qr-scanner confirms a camera exists', async () => {
    hasCameraMock.mockResolvedValue(true);
    const { result } = renderHook(() => useHasCamera());

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('reports false when qr-scanner finds no camera', async () => {
    hasCameraMock.mockResolvedValue(false);
    const { result } = renderHook(() => useHasCamera());

    await waitFor(() => expect(hasCameraMock).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('reports false rather than throwing when the check itself fails', async () => {
    hasCameraMock.mockRejectedValue(new Error('no navigator.mediaDevices'));
    const { result } = renderHook(() => useHasCamera());

    await waitFor(() => expect(hasCameraMock).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });
});
