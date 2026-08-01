export interface ManagerRow {
  id: string;
  name: string;
  passwordHash: string;
}

export interface ManagerRepository {
  findByName(name: string): Promise<ManagerRow | null>;
}

export const MANAGER_REPOSITORY = Symbol("MANAGER_REPOSITORY");
