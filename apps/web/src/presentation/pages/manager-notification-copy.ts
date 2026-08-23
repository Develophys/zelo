import type { ManagerNotification } from "@/ports/manager-notifications.port";

const percent = (value: unknown): string =>
  typeof value === "number" ? `${Math.round(value * 100)}%` : "—";

// The API stores structured facts, not sentences, so the wording lives here and
// a copy fix never needs a migration.
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
