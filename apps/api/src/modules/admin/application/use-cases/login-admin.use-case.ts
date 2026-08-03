import { Inject, Injectable } from "@nestjs/common";
import { ADMIN_REPOSITORY, type AdminRepository } from "../ports/admin-repository.port.ts";
import { AdminPasswordService } from "../services/admin-password.service.ts";
import { AdminTokenService, type IssuedAdminToken } from "../services/admin-token.service.ts";

export class InvalidAdminCredentialsError extends Error {}

const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

@Injectable()
export class LoginAdminUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly adminRepository: AdminRepository,
    @Inject(AdminPasswordService) private readonly passwordService: AdminPasswordService,
    @Inject(AdminTokenService) private readonly tokenService: AdminTokenService,
  ) {}

  async execute(name: string, password: string): Promise<IssuedAdminToken> {
    const admin = await this.adminRepository.findByName(name);

    const isValid = await this.passwordService.verify(password, admin?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!admin || !isValid) {
      throw new InvalidAdminCredentialsError();
    }

    return this.tokenService.issue(admin.id, admin.name);
  }
}
