import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../ports/manager-repository.port.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import { ManagerTokenService, type IssuedManagerToken } from "../services/manager-token.service.ts";

export class InvalidManagerCredentialsError extends Error {}

// A syntactically valid but unusable ManagerPasswordService hash (32 hex-char salt :
// 128 hex-char derived key, matching hash()'s output shape). Used to pay the same
// scrypt cost when no manager row is found, so response latency for "unknown email",
// "pending invite" (passwordHash is null), and "wrong password" is indistinguishable.
const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

@Injectable()
export class LoginManagerUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(ManagerPasswordService) private readonly passwordService: ManagerPasswordService,
    @Inject(ManagerTokenService) private readonly tokenService: ManagerTokenService,
  ) {}

  async execute(email: string, password: string): Promise<IssuedManagerToken> {
    const manager = await this.managerRepository.findByEmail(email);

    const isValid = await this.passwordService.verify(password, manager?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!manager || !manager.passwordHash || !isValid || !manager.isActive) {
      throw new InvalidManagerCredentialsError();
    }

    return this.tokenService.issue(manager.id, manager.name, manager.institutionId, manager.role);
  }
}
