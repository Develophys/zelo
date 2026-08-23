import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ManagerNotification {
  id: string;
  event: string;
  detail: string;
  createdAt: string;
  read: boolean;
}

interface ManagerNotificationsState {
  items: ManagerNotification[];
  receive: (notification: ManagerNotification) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

// Client-side only, and deliberately so: there is no notifications endpoint yet
// and this pass does not invent one. The panel ships the real surface — badge,
// list, read state — over whatever `receive` is eventually fed, and shows the
// empty state until then.
export const useManagerNotificationsStore = create<ManagerNotificationsState>()(
  persist(
    (set) => ({
      items: [],
      receive: (notification) =>
        set((state) =>
          state.items.some((item) => item.id === notification.id)
            ? state
            : { items: [notification, ...state.items] },
        ),
      markRead: (id) =>
        set((state) => ({
          items: state.items.map((item) => (item.id === id ? { ...item, read: true } : item)),
        })),
      markAllRead: () =>
        set((state) => ({ items: state.items.map((item) => ({ ...item, read: true })) })),
    }),
    { name: 'zelo.manager.notifications' },
  ),
);

export function useManagerUnreadCount(): number {
  return useManagerNotificationsStore((state) => state.items.filter((item) => !item.read).length);
}
