export interface AdminRow {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
}

export interface AdminRepository {
  findByEmail(email: string): Promise<AdminRow | null>;
  findById(id: string): Promise<AdminRow | null>;
}

export const ADMIN_REPOSITORY = Symbol("ADMIN_REPOSITORY");
