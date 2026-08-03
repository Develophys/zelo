import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";
import { EMAIL_PORT, type EmailPort } from "../../../../shared/email/email.port.ts";
import { buildSetPasswordUrl } from "../../../../shared/email/build-set-password-url.ts";
import { PeerPartnerNotFoundError } from "./manager-admin-errors.ts";

const SET_PASSWORD_TOKEN_BYTES = 32;
const SET_PASSWORD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export interface SendPeerPartnerSetPasswordEmailInput {
  institutionId: string;
  peerPartnerId: string;
}

@Injectable()
export class SendPeerPartnerSetPasswordEmailUseCase {
  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
  ) {}

  async execute(input: SendPeerPartnerSetPasswordEmailInput): Promise<void> {
    const peerPartner = await this.repository.findById(input.peerPartnerId);
    if (!peerPartner || peerPartner.institutionId !== input.institutionId) {
      throw new PeerPartnerNotFoundError();
    }

    const setPasswordToken = randomBytes(SET_PASSWORD_TOKEN_BYTES).toString("hex");
    const setPasswordTokenExpiresAt = new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS);
    await this.repository.update(input.peerPartnerId, { setPasswordToken, setPasswordTokenExpiresAt });

    const template = peerPartner.passwordHash ? "password-reset" : "invite";
    await this.emailPort.send(peerPartner.email, template, { name: peerPartner.name, setPasswordUrl: buildSetPasswordUrl("peer-partner", setPasswordToken) });
  }
}
