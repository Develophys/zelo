import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listManagerNotificationsUseCase,
  markManagerNotificationReadUseCase,
} from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

const LIST_KEY = "manager-notifications";
const COUNT_KEY = "manager-notifications-unread";

/** The badge lives on every panel screen, so it gets its own light query. */
export function useManagerUnreadCount(): number {
  const token = useManagerSessionStore((state) => state.token);

  const { data } = useQuery({
    queryKey: [COUNT_KEY, token],
    queryFn: () => listManagerNotificationsUseCase.unreadCount(token!),
    enabled: token !== null,
    retry: false,
  });

  return data ?? 0;
}

export function useManagerNotifications() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();

  const invalidateBoth = () => {
    void queryClient.invalidateQueries({ queryKey: [LIST_KEY, token] });
    void queryClient.invalidateQueries({ queryKey: [COUNT_KEY, token] });
  };

  const list = useQuery({
    queryKey: [LIST_KEY, token],
    queryFn: () => listManagerNotificationsUseCase.execute(token!),
    enabled: token !== null,
    retry: false,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => markManagerNotificationReadUseCase.execute(token!, id),
    // Optimistic: the row and the badge both settle before the round trip, and
    // both roll back together if it fails.
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: [LIST_KEY, token] });
      await queryClient.cancelQueries({ queryKey: [COUNT_KEY, token] });
      const previousList = queryClient.getQueryData([LIST_KEY, token]);
      const previousCount = queryClient.getQueryData([COUNT_KEY, token]);

      const previousItems = (previousList as { items: { id: string; readAt: string | null }[] } | undefined)
        ?.items;
      const wasUnread = previousItems?.some((item) => item.id === id && item.readAt === null) ?? false;

      queryClient.setQueryData([LIST_KEY, token], (page: unknown) => {
        const typed = page as { items: { id: string; readAt: string | null }[] } | undefined;
        if (!typed) return page;
        return {
          ...typed,
          items: typed.items.map((item) =>
            item.id === id && item.readAt === null ? { ...item, readAt: new Date().toISOString() } : item,
          ),
        };
      });
      if (wasUnread) {
        queryClient.setQueryData([COUNT_KEY, token], (count: unknown) =>
          typeof count === "number" ? Math.max(0, count - 1) : count,
        );
      }

      return { previousList, previousCount };
    },
    onError: (_error, _id, context) => {
      queryClient.setQueryData([LIST_KEY, token], context?.previousList);
      queryClient.setQueryData([COUNT_KEY, token], context?.previousCount);
    },
    onSettled: invalidateBoth,
  });

  const markAllRead = useMutation({
    mutationFn: () => markManagerNotificationReadUseCase.executeAll(token!),
    onSettled: invalidateBoth,
  });

  return {
    notifications: list.data?.items ?? [],
    total: list.data?.total ?? null,
    isLoading: list.isLoading,
    error: list.error,
    isRefreshing: list.isFetching && !list.isLoading,
    refresh: invalidateBoth,
    markRead: (id: string) => markRead.mutate(id),
    markAllRead: () => markAllRead.mutate(),
  };
}
