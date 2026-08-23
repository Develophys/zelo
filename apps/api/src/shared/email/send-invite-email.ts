import type { Logger } from "@nestjs/common";
import { EmailDeliveryError } from "./email.port.ts";

export interface SendInviteEmailOptions {
  logger: Logger;
  /** e.g. "invite email failed for manager manager-1" */
  logContext: string;
  /**
   * Runs after a delivery failure is logged. Omit at a call site with no
   * audience to tell yet (there is nowhere else to publish the failure to).
   */
  onDeliveryFailure?: (reason: string) => Promise<void>;
}

/**
 * The shape shared by every call site that sends an invite/reset email
 * after the row it concerns has already been committed: a thrown
 * EmailDeliveryError must not fail the request, because the caller cannot
 * roll back what is already in the database, and a 500 here would just make
 * the inevitable retry collide with a unique constraint. Anything other than
 * EmailDeliveryError (a template bug, a programmer error) still propagates —
 * only the one documented failure mode is treated as recoverable.
 */
export async function sendInviteEmailOrRecord(send: () => Promise<void>, options: SendInviteEmailOptions): Promise<void> {
  try {
    await send();
  } catch (error) {
    if (!(error instanceof EmailDeliveryError)) {
      throw error;
    }
    options.logger.error(options.logContext, error);
    await options.onDeliveryFailure?.(error.message);
  }
}
