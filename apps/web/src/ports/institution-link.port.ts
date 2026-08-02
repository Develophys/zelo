import { z } from "zod";

export const InstitutionLookupResultSchema = z.object({ id: z.string(), name: z.string() });
export type InstitutionLookupResult = z.infer<typeof InstitutionLookupResultSchema>;

export class InstitutionNotFoundError extends Error {}

export interface InstitutionLinkPort {
  lookupByCode(code: string): Promise<InstitutionLookupResult>;
}
