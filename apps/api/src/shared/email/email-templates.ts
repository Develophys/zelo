import type { EmailTemplate, SendEmailParams } from "./email.port.ts";

export function renderEmailTemplate(template: EmailTemplate, params: SendEmailParams): { subject: string; html: string } {
  if (template === "invite") {
    return {
      subject: "Finalize seu cadastro no Zelo",
      html: `<p>Olá, ${params.name}!</p><p>Uma conta foi criada para você no Zelo. Clique no link abaixo para definir sua senha e finalizar seu cadastro:</p><p><a href="${params.setPasswordUrl}">${params.setPasswordUrl}</a></p><p>Este link expira em 48 horas.</p>`,
    };
  }

  return {
    subject: "Redefinição de senha no Zelo",
    html: `<p>Olá, ${params.name}!</p><p>Recebemos uma solicitação para redefinir sua senha no Zelo. Clique no link abaixo para escolher uma nova senha:</p><p><a href="${params.setPasswordUrl}">${params.setPasswordUrl}</a></p><p>Este link expira em 48 horas. Se você não solicitou isso, ignore este email.</p>`,
  };
}
