import type { SignalCheckinPort } from "@/ports/signal-checkin.port";

export interface InstitutionLinkSnapshot {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
}

export interface RecordUnsentChatDraftInput {
  link: InstitutionLinkSnapshot | null;
}

export class RecordUnsentChatDraftUseCase {
  constructor(private readonly checkinPort: SignalCheckinPort) {}

  async execute({ link }: RecordUnsentChatDraftInput): Promise<void> {
    if (link === null) return;

    await this.checkinPort.chatDraft({
      institutionId: link.institutionId,
      sectorId: link.sectorId,
      deviceSignalId: link.deviceSignalId,
    });
  }
}
