export interface AdminRow {
  id: string;
  name: string;
  passwordHash: string;
}

export interface AdminRepository {
  findByName(name: string): Promise<AdminRow | null>;
}

export const ADMIN_REPOSITORY = Symbol("ADMIN_REPOSITORY");
