import { useEffect } from "react";
import { useNavigate } from "react-router";
import { CheckCheck, RefreshCw } from "lucide-react";
import { Button } from "@/presentation/ui/Button";
import { Pill } from "@/presentation/ui/Pill";
import { ManagerPageHeader } from "@/presentation/layout/ManagerPageHeader";
import { ManagerActionBar } from "@/presentation/layout/ManagerActionBar";
import { useManagerNotifications, useManagerUnreadCount } from "@/presentation/hooks/useManagerNotifications";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { routes } from "@/presentation/lib/routes";
import { notificationCopy } from "./manager-notification-copy";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };

export function ManagerNotificationsPage() {
  const navigate = useNavigate();
  const clearSession = useManagerSessionStore((state) => state.clearSession);
  const { notifications, isLoading, error, refresh, isRefreshing, markRead, markAllRead } =
    useManagerNotifications();
  const unreadCount = useManagerUnreadCount();

  useEffect(() => {
    if (error instanceof UnauthorizedManagerError) {
      clearSession();
      navigate(routes.managerLogin, { replace: true });
    }
  }, [error, clearSession, navigate]);

  return (
    <div className="flex flex-col gap-5 pt-6">
      <ManagerPageHeader
        title="Notificações"
        intro="Alertas do sistema sobre sinais agregados, convites e integrações. Marque como lida para tirar da lista."
      />

      <ManagerActionBar>
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
      </ManagerActionBar>

      {error && !(error instanceof UnauthorizedManagerError) && (
        <p role="alert" className="text-label text-danger">
          Não foi possível carregar as notificações.
        </p>
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
          return (
            <li key={notification.id}>
              <button
                type="button"
                onClick={() => unread && markRead(notification.id)}
                className={`flex w-full flex-col gap-2 rounded-card border px-cell-x py-cell-y text-left motion-safe:transition-colors motion-safe:duration-150 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none md:flex-row md:items-center md:justify-between ${
                  unread ? "border-warn bg-warn-bg/40 cursor-pointer" : "border-line bg-surface"
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-sans text-body-strong text-ink">{evento}</span>
                  <span className="block text-label text-muted">{detalhe}</span>
                </span>
                <span className="flex flex-none items-center gap-3">
                  <span className="font-mono text-mono-data text-muted-2">
                    {new Date(notification.createdAt).toLocaleDateString("pt-BR", DATE_FORMAT)}
                  </span>
                  {unread ? <Pill tone="warning">Não lida</Pill> : <Pill tone="neutral">Lida</Pill>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
