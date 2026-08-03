import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EMAIL_PORT } from "./email.port.ts";
import { MockEmailAdapter } from "./mock-email.adapter.ts";
import { ResendEmailAdapter } from "./resend-email.adapter.ts";

// Read directly from process.env (not ConfigService) so that only the
// selected adapter is ever instantiated — EMAIL_PROVIDER=mock (the default)
// must not require a RESEND_API_KEY, but ResendEmailAdapter's constructor
// calls config.getOrThrow for it. Mirrors chat.module.ts's AI_PROVIDER pattern.
const emailPortProvider =
  process.env.EMAIL_PROVIDER === "resend"
    ? { provide: EMAIL_PORT, useClass: ResendEmailAdapter }
    : { provide: EMAIL_PORT, useClass: MockEmailAdapter };

@Module({
  imports: [ConfigModule],
  providers: [emailPortProvider],
  exports: [EMAIL_PORT],
})
export class EmailModule {}
