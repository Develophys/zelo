import { describe, expect, it, afterEach, vi } from 'vitest';
import { accountStatus, accountStatusPill } from './account-status-pill';

function account(overrides: Partial<{ isActive: boolean; hasPassword: boolean; setPasswordTokenExpiresAt: string | null }> = {}) {
  return {
    isActive: true,
    hasPassword: true,
    setPasswordTokenExpiresAt: null,
    ...overrides,
  };
}

describe('accountStatus', () => {
  it('is active when the account has a password and is active', () => {
    expect(accountStatus(account({ hasPassword: true, isActive: true }))).toBe('active');
  });

  it('is inactive when the account has a password but is paused', () => {
    expect(accountStatus(account({ hasPassword: true, isActive: false }))).toBe('inactive');
  });

  it('is pending while the set-password token is still valid', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(accountStatus(account({ hasPassword: false, setPasswordTokenExpiresAt: future }))).toBe('pending');
  });

  it('is expired once the set-password token has lapsed', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(accountStatus(account({ hasPassword: false, setPasswordTokenExpiresAt: past }))).toBe('expired');
  });

  it('is expired when there is no token at all', () => {
    expect(accountStatus(account({ hasPassword: false, setPasswordTokenExpiresAt: null }))).toBe('expired');
  });

  describe('the pending/expired boundary', () => {
    afterEach(() => vi.useRealTimers());

    it('treats a token expiring at exactly now as already expired', () => {
      const now = new Date('2026-08-23T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      expect(accountStatus(account({ hasPassword: false, setPasswordTokenExpiresAt: now.toISOString() }))).toBe(
        'expired',
      );
    });

    it('treats a token expiring one millisecond after now as still pending', () => {
      const now = new Date('2026-08-23T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const oneMsLater = new Date(now.getTime() + 1).toISOString();

      expect(accountStatus(account({ hasPassword: false, setPasswordTokenExpiresAt: oneMsLater }))).toBe('pending');
    });
  });
});

describe('accountStatusPill', () => {
  it('pairs each of the four states with its tone and Portuguese label', () => {
    expect(accountStatusPill(account({ hasPassword: true, isActive: true }))).toEqual({
      status: 'active',
      tone: 'positive',
      text: 'Ativa',
    });
    expect(accountStatusPill(account({ hasPassword: true, isActive: false }))).toEqual({
      status: 'inactive',
      tone: 'neutral',
      text: 'Inativa',
    });
    expect(
      accountStatusPill(account({ hasPassword: false, setPasswordTokenExpiresAt: new Date(Date.now() + 60_000).toISOString() })),
    ).toEqual({ status: 'pending', tone: 'warning', text: 'Convite pendente' });
    expect(accountStatusPill(account({ hasPassword: false, setPasswordTokenExpiresAt: null }))).toEqual({
      status: 'expired',
      tone: 'danger',
      text: 'Convite expirado',
    });
  });
});
