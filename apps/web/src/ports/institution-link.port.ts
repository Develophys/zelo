import { z } from "zod";

export const InstitutionLookupResultSchema = z.object({ id: z.string(), name: z.string() });
export type InstitutionLookupResult = z.infer<typeof InstitutionLookupResultSchema>;

export const InstitutionSectorSchema = z.object({ id: z.string(), name: z.string() });
export type InstitutionSector = z.infer<typeof InstitutionSectorSchema>;

export const LinkCodeResultSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  institution: InstitutionLookupResultSchema,
  sector: InstitutionSectorSchema.optional(),
});
export type LinkCodeResult = z.infer<typeof LinkCodeResultSchema>;

export class InstitutionNotFoundError extends Error {}

export interface InstitutionLinkPort {
  lookupByCode(code: string): Promise<LinkCodeResult>;
  listSectors(institutionId: string): Promise<InstitutionSector[]>;
}
