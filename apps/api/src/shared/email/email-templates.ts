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

export function renderEmailTemplate(template: EmailTemplate, params: SendEmailParams): { subject: string; html: string } {
  const name = escapeHtml(params.name);

  if (template === "invite") {
    return {
      subject: "Finalize seu cadastro no Zelo",
      html: `<p>Olá, ${name}!</p><p>Uma conta foi criada para você no Zelo. Clique no link abaixo para definir sua senha e finalizar seu cadastro:</p><p><a href="${params.setPasswordUrl}">${params.setPasswordUrl}</a></p><p>Este link expira em 48 horas.</p>`,
    };
  }

  return {
    subject: "Redefinição de senha no Zelo",
    html: `<p>Olá, ${name}!</p><p>Recebemos uma solicitação para redefinir sua senha no Zelo. Clique no link abaixo para escolher uma nova senha:</p><p><a href="${params.setPasswordUrl}">${params.setPasswordUrl}</a></p><p>Este link expira em 48 horas. Se você não solicitou isso, ignore este email.</p>`,
  };
}
