import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository } from "../ports/manager-repository.port.ts";
import { ManagerPasswordService } from "../services/manager-password.service.ts";
import { ManagerTokenService, type IssuedManagerToken } from "../services/manager-token.service.ts";

export class InvalidManagerCredentialsError extends Error {}

// A syntactically valid but unusable ManagerPasswordService hash (32 hex-char salt :
// 128 hex-char derived key, matching hash()'s output shape). Used to pay the same
// scrypt cost when no manager row is found, so response latency for "unknown name"
// and "wrong password" is indistinguishable — otherwise an attacker could enumerate
// valid manager names purely from timing, even though the response body/status never
// differ.
const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

@Injectable()
export class LoginManagerUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(ManagerPasswordService) private readonly passwordService: ManagerPasswordService,
    @Inject(ManagerTokenService) private readonly tokenService: ManagerTokenService,
  ) {}

  async execute(name: string, password: string): Promise<IssuedManagerToken> {
    const manager = await this.managerRepository.findByName(name);

    const isValid = await this.passwordService.verify(password, manager?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!manager || !isValid) {
      throw new InvalidManagerCredentialsError();
    }

    return this.tokenService.issue(manager.id, manager.name, manager.institutionId);
  }
}
