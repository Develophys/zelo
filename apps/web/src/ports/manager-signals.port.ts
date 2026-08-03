import { z } from "zod";

export const ManagerSignalsResponseSchema = z.object({
  overallConcerningRate: z.number(),
  checkInsLast4Weeks: z.number(),
  weeklyTrend: z.array(z.object({ weekStart: z.string(), concerningRate: z.number() })),
  segments: z.array(z.object({ label: z.string(), value: z.number(), n: z.number() })),
  followUpResponseRate: z.number(),
});
export type ManagerSignalsResponse = z.infer<typeof ManagerSignalsResponseSchema>;

export class UnauthorizedManagerError extends Error {}

export interface ManagerSignalsPort {
  fetchSignals(token: string, sectorIds?: string[]): Promise<ManagerSignalsResponse>;
}
