import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);
