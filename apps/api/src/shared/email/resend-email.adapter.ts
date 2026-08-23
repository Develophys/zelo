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
    const { subject, html } = renderEmailTemplate(template, params);
    const { error } = await this.client.emails.send({ from: this.from, to, subject, html });
    if (error) {
      throw new EmailDeliveryError(error.message);
    }
  }
}
