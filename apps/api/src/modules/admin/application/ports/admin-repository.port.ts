export interface AdminRow {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
}

export interface AdminRepository {
  findByEmail(email: string): Promise<AdminRow | null>;
}

export const ADMIN_REPOSITORY = Symbol("ADMIN_REPOSITORY");
