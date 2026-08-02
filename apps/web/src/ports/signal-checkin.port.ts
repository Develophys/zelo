export interface SignalCheckinParams {
  institutionId: string;
  department: string;
  deviceSignalId: string;
  concerning: boolean;
}

export interface SignalCheckinPort {
  checkin(params: SignalCheckinParams): Promise<void>;
}
