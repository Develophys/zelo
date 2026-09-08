import type { EmailTemplate, SendEmailParams } from "./email.port.ts";

// params.name is free-form admin-entered text (validated only as a non-empty
// string, no character restrictions), so it must be escaped before being
// interpolated into HTML — otherwise an admin (accidentally or maliciously)
// entering a name containing HTML/script content would have it rendered as-is
// in the outbound email. setPasswordUrl is a system-generated hex token URL,
// not user input, so it is deliberately left unescaped (and always will be).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emailHeader(): string {
  const baseUrl = process.env.WEB_APP_BASE_URL ?? "http://localhost:5173";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#2f6b5e;"><tr><td style="padding:24px;text-align:center;"><table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="vertical-align:middle;"><img src="${baseUrl}/zelo_logo.png" alt="Zelo" width="48" height="48" style="display:block;" /></td><td style="vertical-align:middle;padding-left:12px;"><span style="color:#ffffff;font-family:Arial,sans-serif;font-size:20px;font-weight:bold;">Zelo Health</span></td></tr></table></td></tr></table>`;
}

export function renderEmailTemplate(template: EmailTemplate, params: SendEmailParams): { subject: string; html: string } {
  const name = escapeHtml(params.name);
  const header = emailHeader();

  if (template === "invite") {
    return {
      subject: "Finalize seu cadastro no Zelo",
      html: `${header}<p>Olá, ${name}!</p><p>Uma conta foi criada para você no Zelo. Clique no link abaixo para definir sua senha e finalizar seu cadastro:</p><p><a href="${params.setPasswordUrl}">${params.setPasswordUrl}</a></p><p>Este link expira em 48 horas.</p>`,
    };
  }

  return {
    subject: "Redefinição de senha no Zelo",
    html: `${header}<p>Olá, ${name}!</p><p>Recebemos uma solicitação para redefinir sua senha no Zelo. Clique no link abaixo para escolher uma nova senha:</p><p><a href="${params.setPasswordUrl}">${params.setPasswordUrl}</a></p><p>Este link expira em 48 horas. Se você não solicitou isso, ignore este email.</p>`,
  };
}
