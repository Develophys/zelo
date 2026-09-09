import type { SignalCheckinPort } from "@/ports/signal-checkin.port";

export interface InstitutionLinkSnapshot {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
}

export interface RecordAssessmentAbandonmentInput {
  link: InstitutionLinkSnapshot | null;
}

export class RecordAssessmentAbandonmentUseCase {
  constructor(private readonly checkinPort: SignalCheckinPort) {}

  async execute({ link }: RecordAssessmentAbandonmentInput): Promise<void> {
    if (link === null) return;

    await this.checkinPort.abandon({
      institutionId: link.institutionId,
      sectorId: link.sectorId,
      deviceSignalId: link.deviceSignalId,
    });
  }
}
