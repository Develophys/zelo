import type { SignalCheckinPort } from "@/ports/signal-checkin.port";

export interface InstitutionLinkSnapshot {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
}

export interface RecordSignalCheckinInput {
  link: InstitutionLinkSnapshot | null;
  concerning: boolean;
}

export class RecordSignalCheckinUseCase {
  constructor(private readonly checkinPort: SignalCheckinPort) {}

  async execute({ link, concerning }: RecordSignalCheckinInput): Promise<void> {
    if (link === null) return;

    await this.checkinPort.checkin({
      institutionId: link.institutionId,
      sectorId: link.sectorId,
      deviceSignalId: link.deviceSignalId,
      concerning,
    });
  }
}
