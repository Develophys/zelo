import type { SignalCheckinPort } from "@/ports/signal-checkin.port";

export interface InstitutionLinkSnapshot {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
}

export interface RecordFollowUpInput {
  link: InstitutionLinkSnapshot | null;
  event: "sent" | "answered";
}

export class RecordFollowUpUseCase {
  constructor(private readonly checkinPort: SignalCheckinPort) {}

  async execute({ link, event }: RecordFollowUpInput): Promise<void> {
    if (link === null) return;

    await this.checkinPort.followUp({
      institutionId: link.institutionId,
      sectorId: link.sectorId,
      deviceSignalId: link.deviceSignalId,
      event,
    });
  }
}
