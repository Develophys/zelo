import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { createQueryClient } from './query-client';
import { useToastStore } from '@/stores/toast.store';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [full];
  });
}

describe('the app query client', () => {
  afterEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  /**
   * Error handling was declared per call site, and reached 2 of 18 of them. An
   * admin adding a manager with an email that already exists watched the
   * spinner stop, the modal stay open with the fields filled, and nothing else
   * happen — so the rational next move was to press the button again.
   *
   * A cache-level default makes the guarantee once instead of asking every
   * future call site to remember it.
   */
  it('surfaces a failed mutation even when the call site says nothing about errors', async () => {
    const client = createQueryClient();

    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(new Error('409')) })
      .execute(undefined)
      .catch(() => {});

    const [toast] = useToastStore.getState().toasts;
    expect(toast?.tone).toBe('error');
    expect(toast?.message).toMatch(/não foi possível/i);
  });

  it('lets a call site override the default with its own message', async () => {
    const client = createQueryClient();

    await client
      .getMutationCache()
      .build(client, {
        mutationFn: () => Promise.reject(new Error('409')),
        onError: () => useToastStore.getState().show('error', 'Esse setor já existe.'),
      })
      .execute(undefined)
      .catch(() => {});

    const messages = useToastStore.getState().toasts.map((entry) => entry.message);
    expect(messages).toEqual(['Esse setor já existe.']);
  });

  it('is the only QueryClient the app constructs, so no surface can opt out of the default', () => {
    const offenders = sourceFiles(join(__dirname, '..'))
      .filter((file) => !file.endsWith(join('app', 'query-client.ts')))
      .filter((file) => /new QueryClient\(/.test(readFileSync(file, 'utf8')))
      .map((file) => file.replace(/.*[\\/]src[\\/]/, ''));

    expect(offenders).toEqual([]);
  });

  it('returns a real QueryClient', () => {
    expect(createQueryClient()).toBeInstanceOf(QueryClient);
  });
});
