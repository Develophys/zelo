import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../ports/manager-repository.port.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";

export class InvalidOrExpiredManagerSetupTokenError extends Error {}

export interface FinishManagerSetupInput {
  token: string;
  password: string;
}

@Injectable()
export class FinishManagerSetupUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(ManagerPasswordService) private readonly passwordService: ManagerPasswordService,
  ) {}

  async execute(input: FinishManagerSetupInput): Promise<void> {
    const manager = await this.managerRepository.findBySetPasswordToken(input.token);
    if (!manager || !manager.setPasswordTokenExpiresAt || manager.setPasswordTokenExpiresAt.getTime() < Date.now()) {
      throw new InvalidOrExpiredManagerSetupTokenError();
    }

    const passwordHash = await this.passwordService.hash(input.password);
    await this.managerRepository.update(manager.id, { passwordHash, setPasswordToken: null, setPasswordTokenExpiresAt: null });
  }
}
