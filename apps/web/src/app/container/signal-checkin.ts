import { RecordSignalCheckinUseCase } from "@/use-cases/record-signal-checkin.usecase";
import { HttpSignalCheckinAdapter } from "@/infrastructure/http/http-signal-checkin.adapter";

export const recordSignalCheckinUseCase = new RecordSignalCheckinUseCase(new HttpSignalCheckinAdapter());
