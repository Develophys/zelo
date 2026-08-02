import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../ports/manager-repository.port.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import { generateTemporaryPassword } from "../../../../shared/generate-temporary-password.ts";
import { ManagerNotFoundError } from "./manager-admin-errors.ts";

export interface ResetManagerPasswordInput {
  institutionId: string;
  managerId: string;
}

@Injectable()
export class ResetManagerPasswordUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(ManagerPasswordService) private readonly passwordService: ManagerPasswordService,
  ) {}

  async execute(input: ResetManagerPasswordInput): Promise<{ temporaryPassword: string }> {
    const manager = await this.managerRepository.findById(input.managerId);
    if (!manager || manager.institutionId !== input.institutionId) {
      throw new ManagerNotFoundError();
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);
    await this.managerRepository.update(input.managerId, { passwordHash });

    return { temporaryPassword };
  }
}
