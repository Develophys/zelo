import { RefreshCw } from "lucide-react";
import { Button } from "@/presentation/ui/Button";
import { Pill } from "@/presentation/ui/Pill";
import { useManagerNotifications } from "@/presentation/hooks/useManagerNotifications";
import { notificationCopy } from "./manager-notification-copy";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };

export function ManagerNotificationsPage() {
  const { notifications, isLoading, error, refresh, isRefreshing, markRead } = useManagerNotifications();

  return (
    <div className="flex flex-col gap-5 pt-6">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-eyebrow text-muted uppercase">Painel do gestor</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-h2 text-ink lg:text-h1">Notificações</h1>
          <Button variant="outline" size="sm" full={false} onClick={refresh} isLoading={isRefreshing}>
            <RefreshCw size={16} aria-hidden="true" />
            Atualizar
          </Button>
        </div>
        <p className="max-w-[62ch] text-label text-muted">
          Alertas do sistema sobre sinais agregados, convites e integrações. Marque como lida para
          tirar da lista.
        </p>
      </header>

      {error && (
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
