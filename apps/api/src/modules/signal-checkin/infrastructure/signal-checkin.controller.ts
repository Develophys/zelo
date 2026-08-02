import { BadRequestException, Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import { RecordSignalCheckinUseCase } from "../application/use-cases/record-signal-checkin.use-case.ts";
import { UnknownInstitutionOrSectorError } from "../application/ports/signal-checkin-repository.port.ts";

const SignalCheckinSchema = z.object({
  institutionId: z.string().min(1),
  sectorId: z.string().min(1),
  concerning: z.boolean(),
  deviceSignalId: z.string().min(1),
});

@Controller("signals")
export class SignalCheckinController {
  constructor(
    @Inject(RecordSignalCheckinUseCase) private readonly recordSignalCheckin: RecordSignalCheckinUseCase,
  ) {}

  @Post("checkin")
  @HttpCode(204)
  async checkin(@Body() body: unknown): Promise<void> {
    const parsed = SignalCheckinSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      await this.recordSignalCheckin.execute(parsed.data);
    } catch (error) {
      if (error instanceof UnknownInstitutionOrSectorError) {
        throw new BadRequestException("Unknown institutionId or sectorId");
      }
      throw error;
    }
  }
}
