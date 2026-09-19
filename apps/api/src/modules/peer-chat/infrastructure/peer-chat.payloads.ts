import { z } from "zod";

export const MAX_SECTOR_NAME_LENGTH = 100;
export const MAX_MESSAGE_LENGTH = 4000;

export const requestPeerPayloadSchema = z.object({
  institutionId: z.string().min(1).max(64),
  sectorName: z
    .string()
    .max(MAX_SECTOR_NAME_LENGTH)
    .nullish()
    .transform((value) => value ?? undefined),
});

export const requestIdPayloadSchema = z.object({
  requestId: z.string().uuid(),
});

export const messagePayloadSchema = z.object({
  requestId: z.string().uuid(),
  text: z.string().min(1).max(MAX_MESSAGE_LENGTH),
});

export function parsePayload<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, payload: unknown): T | null {
  const parsed = schema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
