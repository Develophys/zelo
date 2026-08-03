import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../../../peer-partner/application/ports/peer-partner-repository.port.ts";
import { EMAIL_PORT, type EmailPort } from "../../../../shared/email/email.port.ts";
import { buildSetPasswordUrl } from "../../../../shared/email/build-set-password-url.ts";

const SET_PASSWORD_TOKEN_BYTES = 32;
const SET_PASSWORD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export interface CreatePeerPartnerInput {
  institutionId: string;
  name: string;
  email: string;
  specialty: string;
}

export interface CreatePeerPartnerResult {
  peerPartner: { id: string; name: string; email: string };
}

@Injectable()
export class CreatePeerPartnerUseCase {
  constructor(
    @Inject(PEER_PARTNER_REPOSITORY) private readonly repository: PeerPartnerRepository,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
  ) {}

  async execute(input: CreatePeerPartnerInput): Promise<CreatePeerPartnerResult> {
    const setPasswordToken = randomBytes(SET_PASSWORD_TOKEN_BYTES).toString("hex");
    const setPasswordTokenExpiresAt = new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS);

    const peerPartner = await this.repository.create({
      name: input.name,
      email: input.email,
      institutionId: input.institutionId,
      specialty: input.specialty,
      setPasswordToken,
      setPasswordTokenExpiresAt,
    });

    await this.emailPort.send(peerPartner.email, "invite", { name: peerPartner.name, setPasswordUrl: buildSetPasswordUrl("peer-partner", setPasswordToken) });

    return { peerPartner };
  }
}
