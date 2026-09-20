import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listManagerNotificationsUseCase,
  markManagerNotificationReadUseCase,
} from "@/app/container";

const LIST_KEY = "manager-notifications";
const COUNT_KEY = "manager-notifications-unread";

/** The badge lives on every panel screen, so it gets its own light query. */
export function useManagerUnreadCount(): number {
  const { data } = useQuery({
    queryKey: [COUNT_KEY],
    queryFn: () => listManagerNotificationsUseCase.unreadCount(),
    retry: false,
  });

  return data ?? 0;
}

export function useManagerNotifications() {
  const queryClient = useQueryClient();

  const invalidateBoth = () => {
    void queryClient.invalidateQueries({ queryKey: [LIST_KEY] });
    void queryClient.invalidateQueries({ queryKey: [COUNT_KEY] });
  };

  const list = useQuery({
    queryKey: [LIST_KEY],
    queryFn: () => listManagerNotificationsUseCase.execute(),
    retry: false,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => markManagerNotificationReadUseCase.execute(id),
    // Optimistic: the row and the badge both settle before the round trip, and
    // both roll back together if it fails.
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: [LIST_KEY] });
      await queryClient.cancelQueries({ queryKey: [COUNT_KEY] });
      const previousList = queryClient.getQueryData([LIST_KEY]);
      const previousCount = queryClient.getQueryData([COUNT_KEY]);

      const previousItems = (previousList as { items: { id: string; readAt: string | null }[] } | undefined)
        ?.items;
      const wasUnread = previousItems?.some((item) => item.id === id && item.readAt === null) ?? false;

      queryClient.setQueryData([LIST_KEY], (page: unknown) => {
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
        queryClient.setQueryData([COUNT_KEY], (count: unknown) =>
          typeof count === "number" ? Math.max(0, count - 1) : count,
        );
      }

      return { previousList, previousCount };
    },
    onError: (_error, _id, context) => {
      queryClient.setQueryData([LIST_KEY], context?.previousList);
      queryClient.setQueryData([COUNT_KEY], context?.previousCount);
    },
    onSettled: invalidateBoth,
  });

  const markAllRead = useMutation({
    mutationFn: () => markManagerNotificationReadUseCase.executeAll(),
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
