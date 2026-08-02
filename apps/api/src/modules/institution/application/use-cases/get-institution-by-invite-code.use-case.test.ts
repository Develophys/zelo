import { describe, expect, it } from "vitest";
import { GetInstitutionByInviteCodeUseCase } from "./get-institution-by-invite-code.use-case.ts";
import type { InstitutionRepository, InstitutionRow } from "../ports/institution-repository.port.ts";

class FakeInstitutionRepository implements InstitutionRepository {
  constructor(private readonly rows: InstitutionRow[]) {}
  async findByInviteCode(inviteCode: string): Promise<InstitutionRow | null> {
    return this.rows.find((row) => row.inviteCode === inviteCode) ?? null;
  }
}

describe("GetInstitutionByInviteCodeUseCase", () => {
  it("returns the matching institution", async () => {
    const repository = new FakeInstitutionRepository([
      { id: "inst-1", name: "Hospital São Lucas", inviteCode: "sao-lucas-2026" },
    ]);
    const useCase = new GetInstitutionByInviteCodeUseCase(repository);

    const result = await useCase.execute("sao-lucas-2026");

    expect(result).toEqual({ id: "inst-1", name: "Hospital São Lucas", inviteCode: "sao-lucas-2026" });
  });

  it("returns null for an unknown code", async () => {
    const repository = new FakeInstitutionRepository([]);
    const useCase = new GetInstitutionByInviteCodeUseCase(repository);

    const result = await useCase.execute("unknown-code");

    expect(result).toBeNull();
  });
});
