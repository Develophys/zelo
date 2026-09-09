import { RecordSignalCheckinUseCase } from "@/use-cases/record-signal-checkin.usecase";
import { RecordAssessmentAbandonmentUseCase } from "@/use-cases/record-assessment-abandonment.usecase";
import { RecordUnsentChatDraftUseCase } from "@/use-cases/record-unsent-chat-draft.usecase";
import { HttpSignalCheckinAdapter } from "@/infrastructure/http/http-signal-checkin.adapter";

const signalCheckinAdapter = new HttpSignalCheckinAdapter();

export const recordSignalCheckinUseCase = new RecordSignalCheckinUseCase(signalCheckinAdapter);
export const recordAssessmentAbandonmentUseCase = new RecordAssessmentAbandonmentUseCase(signalCheckinAdapter);
export const recordUnsentChatDraftUseCase = new RecordUnsentChatDraftUseCase(signalCheckinAdapter);
