import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@zelo/domain";
import { z } from "zod";

export interface SuperAdminInput {
  name: string;
  email: string;
  password: string;
}

export function parseSuperAdminInput(env: Record<string, string | undefined>): SuperAdminInput {
  const { SUPER_ADMIN_NAME: name, SUPER_ADMIN_EMAIL: email, SUPER_ADMIN_PASSWORD: password } = env;

  if (!name || !email || !password) {
    throw new Error("SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, and SUPER_ADMIN_PASSWORD are all required");
  }
  if (!z.string().email().max(200).safeParse(email).success) {
    throw new Error("SUPER_ADMIN_EMAIL must be a valid e-mail (at most 200 characters)");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`SUPER_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`SUPER_ADMIN_PASSWORD must be at most ${MAX_PASSWORD_LENGTH} characters`);
  }

  return { name, email, password };
}
