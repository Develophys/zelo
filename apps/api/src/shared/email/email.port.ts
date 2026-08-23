export type EmailTemplate = "invite" | "password-reset";

export interface SendEmailParams {
  name: string;
  setPasswordUrl: string;
}

export interface EmailPort {
  send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void>;
}

export const EMAIL_PORT = Symbol("EMAIL_PORT");

// The Resend SDK resolves with { data, error } instead of rejecting, so an
// API-level rejection — unverified domain, invalid address, rate limit — used
// to look exactly like success. This is the type that makes it visible.
export class EmailDeliveryError extends Error {}
