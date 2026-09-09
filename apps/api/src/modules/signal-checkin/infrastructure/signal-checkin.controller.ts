import { BadRequestException, Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import { RecordSignalCheckinUseCase } from "../application/use-cases/record-signal-checkin.use-case.ts";
import { RecordAssessmentAbandonmentUseCase } from "../application/use-cases/record-assessment-abandonment.use-case.ts";
import { RecordUnsentChatDraftUseCase } from "../application/use-cases/record-unsent-chat-draft.use-case.ts";
import { UnknownInstitutionOrSectorError } from "../application/ports/signal-checkin-repository.port.ts";

const SignalCheckinSchema = z.object({
  institutionId: z.string().min(1),
  sectorId: z.string().min(1),
  concerning: z.boolean(),
  deviceSignalId: z.string().min(1),
});

const SignalAbandonSchema = z.object({
  institutionId: z.string().min(1),
  sectorId: z.string().min(1),
  deviceSignalId: z.string().min(1),
});

const SignalChatDraftSchema = z.object({
  institutionId: z.string().min(1),
  sectorId: z.string().min(1),
  deviceSignalId: z.string().min(1),
});

@Controller("signals")
export class SignalCheckinController {
  constructor(
    @Inject(RecordSignalCheckinUseCase) private readonly recordSignalCheckin: RecordSignalCheckinUseCase,
    @Inject(RecordAssessmentAbandonmentUseCase) private readonly recordAbandonment: RecordAssessmentAbandonmentUseCase,
    @Inject(RecordUnsentChatDraftUseCase) private readonly recordUnsentChatDraft: RecordUnsentChatDraftUseCase,
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

  @Post("abandon")
  @HttpCode(204)
  async abandon(@Body() body: unknown): Promise<void> {
    const parsed = SignalAbandonSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      await this.recordAbandonment.execute(parsed.data);
    } catch (error) {
      if (error instanceof UnknownInstitutionOrSectorError) {
        throw new BadRequestException("Unknown institutionId or sectorId");
      }
      throw error;
    }
  }

  @Post("chat-draft")
  @HttpCode(204)
  async chatDraft(@Body() body: unknown): Promise<void> {
    const parsed = SignalChatDraftSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      await this.recordUnsentChatDraft.execute(parsed.data);
    } catch (error) {
      if (error instanceof UnknownInstitutionOrSectorError) {
        throw new BadRequestException("Unknown institutionId or sectorId");
      }
      throw error;
    }
  }
}
