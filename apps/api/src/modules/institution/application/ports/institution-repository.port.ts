export interface InstitutionRow {
  id: string;
  name: string;
  inviteCode: string;
}

export interface InstitutionRepository {
  findByInviteCode(inviteCode: string): Promise<InstitutionRow | null>;
}

export const INSTITUTION_REPOSITORY = Symbol("INSTITUTION_REPOSITORY");
