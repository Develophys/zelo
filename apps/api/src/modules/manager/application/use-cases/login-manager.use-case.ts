import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../ports/manager-repository.port.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import { ManagerTokenService, type IssuedManagerToken } from "../services/manager-token.service.ts";

export class InvalidManagerCredentialsError extends Error {}

@Injectable()
export class LoginManagerUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(ManagerPasswordService) private readonly passwordService: ManagerPasswordService,
    @Inject(ManagerTokenService) private readonly tokenService: ManagerTokenService,
  ) {}

  async execute(name: string, password: string): Promise<IssuedManagerToken> {
    const manager = await this.managerRepository.findByName(name);
    if (!manager) {
      throw new InvalidManagerCredentialsError();
    }

    const isValid = await this.passwordService.verify(password, manager.passwordHash);
    if (!isValid) {
      throw new InvalidManagerCredentialsError();
    }

    return this.tokenService.issue(manager.id, manager.name);
  }
}
