import type { ManagerNotification } from "@/ports/manager-notifications.port";

const percent = (value: unknown): string =>
  typeof value === "number" ? `${Math.round(value * 100)}%` : "—";

export const NOTIFICATION_TYPE_LABEL: Record<ManagerNotification["type"], string> = {
  INVITE_ACCEPTED: "Convite aceito",
  INVITE_EXPIRED: "Convite expirado",
  INVITE_EMAIL_FAILED: "Falha no envio",
  ACCOUNT_DEACTIVATED: "Conta desativada",
  ACCOUNT_REACTIVATED: "Conta reativada",
  SECTOR_BECAME_VISIBLE: "Setor visível",
  SECTOR_RISK_THRESHOLD: "Risco no setor",
};

export interface NotificationGroup {
  latest: ManagerNotification;
  ids: string[];
  count: number;
  unread: boolean;
}

/**
 * A repeated failure (e.g. the same broken email address rejected on every
 * resend attempt) produces one real, distinct notification per attempt — not
 * a data bug to dedupe. But a run of them reading as identical rows is still
 * clutter, so consecutive notifications with the same type and message
 * collapse into one row with a count, using the most recent one (the list
 * arrives newest-first) as the row's representative for date, unread state
 * and the resend action. A repeat separated by a different notification
 * stays separate: that gap means something else happened in between.
 */
export function groupConsecutiveNotifications(notifications: ManagerNotification[]): NotificationGroup[] {
  const groups: (NotificationGroup & { key: string })[] = [];
  for (const notification of notifications) {
    const key = `${notification.type}:${notificationCopy(notification).detalhe}`;
    const previous = groups.at(-1);
    if (previous && previous.key === key) {
      previous.ids.push(notification.id);
      previous.count += 1;
      if (notification.readAt === null) previous.unread = true;
    } else {
      groups.push({
        key,
        latest: notification,
        ids: [notification.id],
        count: 1,
        unread: notification.readAt === null,
      });
    }
  }
  return groups;
}

export function notificationCopy(notification: ManagerNotification): { evento: string; detalhe: string } {
  const p = notification.payload;
  const name = typeof p.name === "string" ? p.name : "A conta";
  const sector = notification.sectorName ?? "O setor";

  switch (notification.type) {
    case "INVITE_ACCEPTED":
      return { evento: "Convite aceito", detalhe: `${name} concluiu o cadastro e já tem acesso.` };
    case "INVITE_EXPIRED":
      return { evento: "Convite expirado", detalhe: `O convite de ${name} expirou sem ser usado.` };
    case "INVITE_EMAIL_FAILED":
      return {
        evento: "Falha no envio do convite",
        detalhe: `Não foi possível enviar o convite para ${typeof p.email === "string" ? p.email : name}.`,
      };
    case "ACCOUNT_DEACTIVATED":
      return { evento: "Conta desativada", detalhe: `${name} não tem mais acesso ao painel.` };
    case "ACCOUNT_REACTIVATED":
      return { evento: "Conta reativada", detalhe: `${name} voltou a ter acesso ao painel.` };
    case "SECTOR_BECAME_VISIBLE":
      return {
        evento: "Setor com dados visíveis",
        detalhe: `${sector} atingiu respostas suficientes e já pode ser acompanhado.`,
      };
    case "SECTOR_RISK_THRESHOLD":
      return p.trigger === "delta"
        ? {
            evento: "Piora no setor",
            detalhe: `${sector} subiu ${percent(
              typeof p.rate === "number" && typeof p.previousRate === "number" ? p.rate - p.previousRate : null,
            )} em relação à semana anterior.`,
          }
        : {
            evento: "Setor acima do limiar",
            detalhe: `${sector} fechou a semana com ${percent(p.rate)} de respostas preocupantes.`,
          };
  }
}
