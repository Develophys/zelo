import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { createQueryClient } from './query-client';
import { useToastStore } from '@/stores/toast.store';
import { UnauthorizedManagerError } from '@/ports/manager-signals.port';
import { UnauthorizedAdminError } from '@/ports/admin-institution.port';
import { UnauthorizedPeerPartnerError } from '@/ports/peer-partner-auth.port';

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

  it('is built by App with endSession as its session-expired handler and with the session cache clear and reset registered', () => {
    const source = readFileSync(join(__dirname, 'App.tsx'), 'utf8');

    expect(source).toContain('createQueryClient({ onSessionExpired: endSession })');
    expect(source).toContain('clear: () => queryClient.clear()');
    expect(source).toContain('queryClient.resetQueries()');
  });

  it('returns a real QueryClient', () => {
    expect(createQueryClient()).toBeInstanceOf(QueryClient);
  });

  it('gives every query a 30s staleTime, so an alt-tab refocus does not refire it', () => {
    const client = createQueryClient();

    expect(client.getDefaultOptions().queries?.staleTime).toBe(30_000);
  });

  it('reports a manager 401 from a query to onSessionExpired', async () => {
    const onSessionExpired = vi.fn();
    const client = createQueryClient({ onSessionExpired });

    await client.fetchQuery({ queryKey: ['m'], queryFn: () => Promise.reject(new UnauthorizedManagerError()), retry: false }).catch(() => undefined);

    expect(onSessionExpired).toHaveBeenCalledWith('manager');
  });

  it('reports an admin 401 from a mutation to onSessionExpired, and does not toast for it', async () => {
    const onSessionExpired = vi.fn();
    const client = createQueryClient({ onSessionExpired });

    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(new UnauthorizedAdminError()) })
      .execute(undefined)
      .catch(() => undefined);

    expect(onSessionExpired).toHaveBeenCalledWith('admin');
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('reports a peer-partner 401 to onSessionExpired', async () => {
    const onSessionExpired = vi.fn();
    const client = createQueryClient({ onSessionExpired });

    await client.fetchQuery({ queryKey: ['p'], queryFn: () => Promise.reject(new UnauthorizedPeerPartnerError()), retry: false }).catch(() => undefined);

    expect(onSessionExpired).toHaveBeenCalledWith('peerPartner');
  });

  it('does not call onSessionExpired for an ordinary error, and a failing mutation still toasts', async () => {
    const onSessionExpired = vi.fn();
    const client = createQueryClient({ onSessionExpired });

    await client.fetchQuery({ queryKey: ['x'], queryFn: () => Promise.reject(new Error('boom')), retry: false }).catch(() => undefined);
    await client.getMutationCache().build(client, { mutationFn: () => Promise.reject(new Error('boom')) }).execute(undefined).catch(() => undefined);

    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('does not retry a query that failed with a rejected session, so the session ends at once', () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry;

    expect(typeof retry).toBe('function');
    if (typeof retry !== 'function') return;
    expect(retry(0, new UnauthorizedManagerError())).toBe(false);
    expect(retry(0, new UnauthorizedAdminError())).toBe(false);
    expect(retry(0, new UnauthorizedPeerPartnerError())).toBe(false);
  });

  it('keeps the three retries for every other error', () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry;

    expect(typeof retry).toBe('function');
    if (typeof retry !== 'function') return;
    expect(retry(0, new Error('boom'))).toBe(true);
    expect(retry(2, new Error('boom'))).toBe(true);
    expect(retry(3, new Error('boom'))).toBe(false);
  });

  it('still ends the session when a mutation carries its own onError', async () => {
    const onSessionExpired = vi.fn();
    const onError = vi.fn();
    const client = createQueryClient({ onSessionExpired });

    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(new UnauthorizedAdminError()), onError })
      .execute(undefined)
      .catch(() => undefined);

    expect(onSessionExpired).toHaveBeenCalledWith('admin');
    expect(onError).toHaveBeenCalled();
  });
});
