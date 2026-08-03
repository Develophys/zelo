import { z } from "zod";

export const AccessibleSectorSchema = z.object({ id: z.string(), name: z.string() });
export type AccessibleSector = z.infer<typeof AccessibleSectorSchema>;

export interface ManagerSectorsPort {
  listAccessible(token: string): Promise<AccessibleSector[]>;
}
