export interface SignalCheckinParams {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
  concerning: boolean;
}

export interface SignalAbandonmentParams {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
}

export interface SignalCheckinPort {
  checkin(params: SignalCheckinParams): Promise<void>;
  abandon(params: SignalAbandonmentParams): Promise<void>;
}
