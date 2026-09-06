import { CheckCheck, RefreshCw } from "lucide-react";
import { Button } from "@/presentation/ui/Button";
import { Skeleton } from "@/presentation/ui/Skeleton";
import { Pill } from "@/presentation/ui/Pill";
import { useManagerNotifications, useManagerUnreadCount } from "@/presentation/hooks/useManagerNotifications";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { notificationCopy } from "./manager-notification-copy";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };

const GOOD_NEWS_TYPES = new Set(["INVITE_ACCEPTED", "ACCOUNT_REACTIVATED", "SECTOR_BECAME_VISIBLE"]);

export function ManagerNotificationsPage() {
  const { notifications, isLoading, error, refresh, isRefreshing, markRead, markAllRead } =
    useManagerNotifications();
  const unreadCount = useManagerUnreadCount();

  return (
    <div className="flex flex-col gap-5">
      <div data-testid="notifications-action-row" className="flex flex-wrap items-center gap-2">
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" full={false} onClick={markAllRead}>
            <CheckCheck size={16} aria-hidden="true" />
            Marcar todas como lidas
          </Button>
        )}
        <Button variant="outline" size="sm" full={false} onClick={refresh} isLoading={isRefreshing}>
          <RefreshCw size={16} aria-hidden="true" />
          Atualizar
        </Button>
      </div>

      {error && !(error instanceof UnauthorizedManagerError) && (
        <p role="alert" className="text-label text-danger">
          Não foi possível carregar as notificações.
        </p>
      )}

      {isLoading && !error && (
        <ul data-testid="notifications-loading" aria-hidden="true" className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="rounded-card border border-line bg-surface px-cell-x py-cell-y">
              <Skeleton className="h-3.5 w-48 rounded-md" />
              <Skeleton className="mt-2 h-3 w-64 rounded-md" />
            </li>
          ))}
        </ul>
      )}

      {!isLoading && !error && notifications.length === 0 && (
        <div className="rounded-card border border-line bg-surface p-6 text-center">
          <p className="text-body text-ink">Nenhuma notificação por aqui.</p>
          <p className="mt-1 text-label text-muted">
            Avisamos assim que algo precisar da sua atenção.
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {notifications.map((notification) => {
          const { evento, detalhe } = notificationCopy(notification);
          const unread = notification.readAt === null;
          const goodNews = GOOD_NEWS_TYPES.has(notification.type);
          const rowClass = `flex w-full flex-col gap-2 rounded-card border px-cell-x py-cell-y text-left motion-safe:transition-colors motion-safe:duration-150 md:flex-row md:items-center md:justify-between ${
            unread
              ? goodNews
                ? "cursor-pointer border-brand bg-brand/5 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                : "cursor-pointer border-warn bg-warn-bg/40 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
              : "border-line bg-surface"
          }`;

          const body = (
            <>
              <span className="min-w-0">
                <span className="block font-sans text-body-strong text-ink">{evento}</span>
                <span className="block text-label text-muted">{detalhe}</span>
              </span>
              <span className="flex flex-none items-center gap-3">
                <span className="font-mono text-mono-data text-muted">
                  {new Date(notification.createdAt).toLocaleDateString("pt-BR", DATE_FORMAT)}
                </span>
                {unread ? <Pill tone="warning">Não lida</Pill> : <Pill tone="neutral">Lida</Pill>}
              </span>
            </>
          );

          return (
            <li key={notification.id}>
              {/* Only an unread row does anything, so only an unread row is a
                  button. Leaving read ones focusable made a keyboard user tab
                  through every archived notification to reach what is below. */}
              {unread ? (
                <button type="button" onClick={() => markRead(notification.id)} className={rowClass}>
                  {body}
                </button>
              ) : (
                <div className={rowClass}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
