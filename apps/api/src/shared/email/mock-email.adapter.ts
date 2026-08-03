import { Injectable, Logger } from "@nestjs/common";
import type { EmailPort, EmailTemplate, SendEmailParams } from "./email.port.ts";

/**
 * EMAIL_PORT implementation for local/dev testing without a Resend API key or
 * spending real send quota — see EMAIL_PROVIDER=mock in email.module.ts.
 * Logs the recipient and (critically) the setPasswordUrl link so a developer
 * can copy it straight out of the terminal.
 */
@Injectable()
export class MockEmailAdapter implements EmailPort {
  private readonly logger = new Logger(MockEmailAdapter.name);

  async send(to: string, template: EmailTemplate, params: SendEmailParams): Promise<void> {
    this.logger.log(`[mock email] to=${to} template=${template} name="${params.name}"`);
    this.logger.log(`[mock email] setPasswordUrl=${params.setPasswordUrl}`);
  }
}
