import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../ports/manager-repository.port.ts";
import { SendManagerSetPasswordEmailUseCase } from "./send-manager-set-password-email.use-case.ts";

@Injectable()
export class RequestManagerPasswordResetUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(SendManagerSetPasswordEmailUseCase) private readonly sendSetPasswordEmail: SendManagerSetPasswordEmailUseCase,
  ) {}

  // Deliberately silent on every non-happy path (no manager with that email,
  // or a paused one) — the caller must always see the same response either
  // way, or the response itself would leak which emails have an account.
  async execute(email: string): Promise<void> {
    const manager = await this.managerRepository.findByEmail(email);
    if (!manager || !manager.isActive) return;

    await this.sendSetPasswordEmail.execute({ institutionId: manager.institutionId, managerId: manager.id });
  }
}
