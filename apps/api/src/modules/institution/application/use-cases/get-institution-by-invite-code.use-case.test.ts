import { describe, expect, it } from "vitest";
import { GetInstitutionByInviteCodeUseCase } from "./get-institution-by-invite-code.use-case.ts";
import type { InstitutionRepository, InstitutionRow } from "../ports/institution-repository.port.ts";

class FakeInstitutionRepository implements InstitutionRepository {
  constructor(private readonly rows: InstitutionRow[]) {}
  async findByInviteCode(inviteCode: string): Promise<InstitutionRow | null> {
    return this.rows.find((row) => row.inviteCode === inviteCode) ?? null;
  }
  async findById(id: string): Promise<InstitutionRow | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }
}

describe("GetInstitutionByInviteCodeUseCase", () => {
  it("returns the matching institution", async () => {
    const repository = new FakeInstitutionRepository([
      { id: "inst-1", name: "Hospital São Lucas", inviteCode: "sao-lucas-2026", isActive: true },
    ]);
    const useCase = new GetInstitutionByInviteCodeUseCase(repository);

    const result = await useCase.execute("sao-lucas-2026");

    expect(result).toEqual({ id: "inst-1", name: "Hospital São Lucas", inviteCode: "sao-lucas-2026", isActive: true });
  });

  it("returns null for an unknown code", async () => {
    const repository = new FakeInstitutionRepository([]);
    const useCase = new GetInstitutionByInviteCodeUseCase(repository);

    const result = await useCase.execute("unknown-code");

    expect(result).toBeNull();
  });

  // A deactivated institution is a dead end the same way an unknown code is —
  // returning null instead of a distinct signal keeps a médico from learning
  // "this institution exists but was turned off" from the lookup response.
  it("returns null for a deactivated institution, indistinguishable from an unknown code", async () => {
    const repository = new FakeInstitutionRepository([
      { id: "inst-1", name: "Hospital São Lucas", inviteCode: "sao-lucas-2026", isActive: false },
    ]);
    const useCase = new GetInstitutionByInviteCodeUseCase(repository);

    const result = await useCase.execute("sao-lucas-2026");

    expect(result).toBeNull();
  });
});
