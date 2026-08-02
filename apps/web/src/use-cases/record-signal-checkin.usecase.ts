import type { SignalCheckinPort } from "@/ports/signal-checkin.port";

export interface InstitutionLinkSnapshot {
  institutionId: string;
  department: string;
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
      department: link.department,
      deviceSignalId: link.deviceSignalId,
      concerning,
    });
  }
}
