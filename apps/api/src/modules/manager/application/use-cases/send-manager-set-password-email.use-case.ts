import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../ports/manager-repository.port.ts";
import { EMAIL_PORT, type EmailPort } from "../../../../shared/email/email.port.ts";
import { buildSetPasswordUrl } from "../../../../shared/email/build-set-password-url.ts";
import { ManagerNotFoundError } from "./manager-admin-errors.ts";

const SET_PASSWORD_TOKEN_BYTES = 32;
const SET_PASSWORD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export interface SendManagerSetPasswordEmailInput {
  institutionId: string;
  managerId: string;
}

@Injectable()
export class SendManagerSetPasswordEmailUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
  ) {}

  async execute(input: SendManagerSetPasswordEmailInput): Promise<void> {
    const manager = await this.managerRepository.findById(input.managerId);
    if (!manager || manager.institutionId !== input.institutionId) {
      throw new ManagerNotFoundError();
    }

    const setPasswordToken = randomBytes(SET_PASSWORD_TOKEN_BYTES).toString("hex");
    const setPasswordTokenExpiresAt = new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS);
    await this.managerRepository.update(input.managerId, { setPasswordToken, setPasswordTokenExpiresAt });

    const template = manager.passwordHash ? "password-reset" : "invite";
    await this.emailPort.send(manager.email, template, { name: manager.name, setPasswordUrl: buildSetPasswordUrl("manager", setPasswordToken) });
  }
}
