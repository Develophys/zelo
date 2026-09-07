import { describe, expect, it } from 'vitest';
import { groupConsecutiveNotifications, NOTIFICATION_TYPE_LABEL } from './manager-notification-copy';
import type { ManagerNotification } from '@/ports/manager-notifications.port';

function notification(overrides: Partial<ManagerNotification> & { id: string }): ManagerNotification {
  return {
    type: 'INVITE_EMAIL_FAILED',
    payload: { email: 'x@zelo-demo.local' },
    sectorName: null,
    readAt: null,
    createdAt: '2026-08-20T10:00:00.000Z',
    ...overrides,
  } as ManagerNotification;
}

describe('groupConsecutiveNotifications', () => {
  it('leaves distinct notifications ungrouped, one group per item', () => {
    const groups = groupConsecutiveNotifications([
      notification({ id: 'a', payload: { email: 'a@zelo-demo.local' } }),
      notification({ id: 'b', type: 'INVITE_ACCEPTED', payload: { name: 'Marta' } }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.count).toBe(1);
    expect(groups[1]!.count).toBe(1);
  });

  it('collapses consecutive notifications sharing the same type and message into one group', () => {
    const repeated = Array.from({ length: 4 }, (_, index) =>
      notification({ id: `n-${index}`, payload: { email: 'paulo@zelo-demo.local' } }),
    );
    const groups = groupConsecutiveNotifications(repeated);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.count).toBe(4);
    expect(groups[0]!.ids).toEqual(['n-0', 'n-1', 'n-2', 'n-3']);
  });

  it('does not collapse the same type when the message differs, since that is a different failure', () => {
    const groups = groupConsecutiveNotifications([
      notification({ id: 'a', payload: { email: 'paulo@zelo-demo.local' } }),
      notification({ id: 'b', payload: { email: 'marta@zelo-demo.local' } }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('does not collapse across a different notification in between, even if the type repeats later', () => {
    const groups = groupConsecutiveNotifications([
      notification({ id: 'a', payload: { email: 'paulo@zelo-demo.local' } }),
      notification({ id: 'mid', type: 'INVITE_ACCEPTED', payload: { name: 'Marta' } }),
      notification({ id: 'c', payload: { email: 'paulo@zelo-demo.local' } }),
    ]);
    expect(groups).toHaveLength(3);
  });

  it('keeps the first (most recent, since the list is newest-first) notification as the group representative', () => {
    const groups = groupConsecutiveNotifications([
      notification({ id: 'newest', payload: { email: 'paulo@zelo-demo.local' }, readAt: null }),
      notification({
        id: 'oldest',
        payload: { email: 'paulo@zelo-demo.local' },
        readAt: '2026-08-19T00:00:00.000Z',
      }),
    ]);
    expect(groups[0]!.latest.id).toBe('newest');
  });

  it('marks the group unread when any notification in it is unread, even if the representative is read', () => {
    const groups = groupConsecutiveNotifications([
      notification({ id: 'newest', payload: { email: 'x@zelo-demo.local' }, readAt: '2026-08-21T00:00:00.000Z' }),
      notification({ id: 'oldest', payload: { email: 'x@zelo-demo.local' }, readAt: null }),
    ]);
    expect(groups[0]!.unread).toBe(true);
  });
});

describe('NOTIFICATION_TYPE_LABEL', () => {
  it('has a short PT-BR label for every notification type', () => {
    const types: ManagerNotification['type'][] = [
      'INVITE_ACCEPTED',
      'INVITE_EXPIRED',
      'INVITE_EMAIL_FAILED',
      'ACCOUNT_DEACTIVATED',
      'ACCOUNT_REACTIVATED',
      'SECTOR_BECAME_VISIBLE',
      'SECTOR_RISK_THRESHOLD',
    ];
    for (const type of types) {
      expect(NOTIFICATION_TYPE_LABEL[type]).toEqual(expect.any(String));
      expect(NOTIFICATION_TYPE_LABEL[type]!.length).toBeGreaterThan(0);
    }
  });
});
