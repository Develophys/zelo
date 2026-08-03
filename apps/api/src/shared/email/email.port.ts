export type EmailTemplate = "invite" | "password-reset";

export interface SendEmailParams {
  name: string;
  setPasswordUrl: string;
}

export interface EmailPort {
  send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void>;
}

export const EMAIL_PORT = Symbol("EMAIL_PORT");
