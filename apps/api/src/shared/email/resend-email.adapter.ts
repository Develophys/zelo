import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { EmailDeliveryError, type EmailPort, type EmailTemplate, type SendEmailParams } from "./email.port.ts";
import { renderEmailTemplate } from "./email-templates.ts";

@Injectable()
export class ResendEmailAdapter implements EmailPort {
  private readonly client: Resend;
  private readonly from: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.client = new Resend(config.getOrThrow<string>("RESEND_API_KEY"));
    this.from = config.get<string>("EMAIL_FROM") ?? "onboarding@resend.dev";
  }

  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    // Rendered outside the try below: a template bug must throw raw and
    // unwrapped, not get relabeled as a delivery failure.
    const { subject, html } = renderEmailTemplate(template, params);

    // Both failure modes the transport call can produce — a resolved
    // { error } and a thrown network rejection — normalize to the same
    // EmailDeliveryError, so callers only ever need to check one type.
    let error: { message: string } | null;
    try {
      ({ error } = await this.client.emails.send({ from: this.from, to, subject, html }));
    } catch (cause) {
      throw new EmailDeliveryError(cause instanceof Error ? cause.message : "unknown email transport failure");
    }
    if (error) {
      throw new EmailDeliveryError(error.message);
    }
  }
}
