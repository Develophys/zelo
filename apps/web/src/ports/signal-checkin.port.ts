export interface SignalCheckinParams {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
  concerning: boolean;
}

export interface SignalCheckinPort {
  checkin(params: SignalCheckinParams): Promise<void>;
}
