import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_REPOSITORY, type ManagerRepository, type ManagerRole } from "../ports/manager-repository.port.ts";
import { SECTOR_REPOSITORY, type SectorRepository } from "../../../sector/application/ports/sector-repository.port.ts";
import { EMAIL_PORT, type EmailPort } from "../../../../shared/email/email.port.ts";
import { buildSetPasswordUrl } from "../../../../shared/email/build-set-password-url.ts";
import { SectorNotInInstitutionError } from "./manager-admin-errors.ts";

const SET_PASSWORD_TOKEN_BYTES = 32;
const SET_PASSWORD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export interface CreateManagerInput {
  institutionId: string;
  name: string;
  email: string;
  role: ManagerRole;
  sectorIds?: string[];
}

export interface CreateManagerResult {
  manager: { id: string; name: string; email: string };
}

@Injectable()
export class CreateManagerUseCase {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly managerRepository: ManagerRepository,
    @Inject(SECTOR_REPOSITORY) private readonly sectorRepository: SectorRepository,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
  ) {}

  async execute(input: CreateManagerInput): Promise<CreateManagerResult> {
    const sectorIds = input.sectorIds ?? [];

    if (input.role === "SECTOR_MANAGER" && sectorIds.length > 0) {
      const owned = await this.sectorRepository.findByIdsInInstitution(input.institutionId, sectorIds);
      if (owned.length !== sectorIds.length) {
        throw new SectorNotInInstitutionError();
      }
    }

    const setPasswordToken = randomBytes(SET_PASSWORD_TOKEN_BYTES).toString("hex");
    const setPasswordTokenExpiresAt = new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS);

    const manager = await this.managerRepository.create({
      name: input.name,
      email: input.email,
      institutionId: input.institutionId,
      role: input.role,
      setPasswordToken,
      setPasswordTokenExpiresAt,
    });

    if (input.role === "SECTOR_MANAGER" && sectorIds.length > 0) {
      await this.sectorRepository.reassignManagerSectors(input.institutionId, manager.id, sectorIds);
    }

    await this.emailPort.send(manager.email, "invite", { name: manager.name, setPasswordUrl: buildSetPasswordUrl("manager", setPasswordToken) });

    return { manager };
  }
}
